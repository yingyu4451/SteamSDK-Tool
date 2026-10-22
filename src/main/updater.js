/**
 * 工具自己的更新检查 —— 走 GitHub Releases。
 *
 * 两条路并存：
 *
 * A) **查版本 / 显示更新说明**：自己走网页端点。
 *    刻意**不走 api.github.com**：匿名 API 是 60 次/小时/IP，用的人一多
 *    （同一个办公室/学校出口 IP 下几十个人）就会被限流，更新检查直接失效。
 *      1. GET /releases.atom                    → tag + 发布时间 + 更新说明
 *      2. GET /releases/expanded_assets/<tag>   → 一小段 HTML，里面有资产的真实地址
 *
 * B) **下载**：装在系统里的那份走 electron-updater 的增量下载
 *    （latest.yml + .blockmap，只下改动的块）；便携版 / 没有 latest.yml 的
 *    旧版本退回整包下载。详见文件末尾「增量更新」那段。
 */
import { app, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const FALLBACK_OWNER = 'yingyu4451'
const FALLBACK_REPO = 'SteamSDK-Tool'
const UA = 'SteamSDK-Tool-Updater'
const TIMEOUT = 20000

/**
 * 仓库地址从 package.json 的 repository 推，不写死在源码里 ——
 * 别人 fork 之后改一下 package.json 就能用自己的 Releases，不用动代码。
 * 读不到（package.json 被改坏、asar 里没有）就回落到内置的那份。
 */
let _slug = null
function slug() {
  if (_slug) return _slug
  _slug = { owner: FALLBACK_OWNER, repo: FALLBACK_REPO }
  try {
    const raw = fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')
    const r = JSON.parse(raw).repository
    const url = typeof r === 'string' ? r : (r && r.url) || ''
    const m = /github\.com[/:]([^/\s]+)\/([^/.#\s]+)/i.exec(url)
    if (m) _slug = { owner: m[1], repo: m[2].replace(/\.git$/i, '') }
  } catch {
    /* 用回落值 */
  }
  return _slug
}

export function repoUrl() {
  const s = slug()
  return `https://github.com/${s.owner}/${s.repo}`
}

export function releasesPage() {
  return `${repoUrl()}/releases`
}

export function currentVersion() {
  return app.getVersion()
}

/**
 * 是不是便携版。
 * electron-builder 的 portable 启动器会设这两个变量，安装版没有。
 *
 * 为什么要区分：便携版没有安装目录，而且 exe 正被自己占着，
 * **没法自己覆盖自己** —— 所以它的「装更新」只能是帮你把文件夹打开，
 * 让你关掉程序自己替换。
 */
export function isPortable() {
  return !!(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR)
}

/** 数字段逐个比：0.10.0 > 0.9.1，忽略 v 前缀和 -beta 这类后缀 */
export function compareVersions(a, b) {
  const norm = (v) =>
    String(v || '')
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((x) => parseInt(x, 10) || 0)
  const x = norm(a)
  const y = norm(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/**
 * 走 Chromium 的网络栈（electron 的 net），**不用 node:https**。
 *
 * 原因是实测出来的：node:https 不认系统代理。机器上挂着 127.0.0.1:7897 这类
 * 本地代理时，浏览器和 Electron 自己的请求都出得去，
 * node:https 会直连 github.com:443 然后 20 秒超时 —— 同一个 URL：
 *   .NET / Chromium  → 302，秒回
 *   node:https       → 连续 5 次全部 timeout after 20000ms
 * 用户机器上装代理的比例不低，所以这条必须走 Chromium。
 */
function netRequest(url, { method = 'GET', headers = {}, timeout = TIMEOUT, follow = true } = {}) {
  return new Promise((resolve, reject) => {
    let req
    try {
      req = net.request({ method, url, redirect: follow ? 'follow' : 'manual' })
    } catch (e) {
      reject(e)
      return
    }
    try {
      req.setHeader('User-Agent', UA)
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    } catch {
      /* 个别头不允许设，忽略 */
    }

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        req.abort()
      } catch {
        /* ignore */
      }
      reject(new Error('请求超时'))
    }, timeout)
    const done = (fn) => (arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(arg)
    }

    req.on('response', (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', done(() => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })))
      res.on('error', done(reject))
    })
    req.on('error', done(reject))
    req.end()
  })
}

/** Electron 的 net 把头都做成数组，取第一个 */
function h1(headers, name) {
  const v = headers?.[name] ?? headers?.[name.toLowerCase()]
  return Array.isArray(v) ? v[0] || '' : String(v || '')
}

/**
 * HEAD 并跟着跳转走 —— 只为了拿资产的准确字节数，不会真下文件。
 * （Electron 的 net 在 redirect:'manual' 下会直接报 "Redirect was cancelled"，
 *  所以这里让 Chromium 自己跟，拿最终的 content-length。）
 */
async function headFollow(url) {
  return netRequest(url, { method: 'HEAD', headers: { Accept: '*/*' }, follow: true })
}

/** GET 一段文本（自己跟跳转） */
async function getText(url, accept = 'text/html') {
  const res = await netRequest(url, { headers: { Accept: accept } })
  return { statusCode: res.statusCode, text: res.body.toString('utf8') }
}

const SIZE_UNITS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
function parseSize(t) {
  const m = /([\d.]+)\s*(B|KB|MB|GB)/i.exec(String(t || ''))
  return m ? Math.round(parseFloat(m[1]) * (SIZE_UNITS[m[2].toUpperCase()] || 1)) : 0
}

/** 从 expanded_assets 片段里抠出资产列表（名字 / 地址 / 体积） */
function parseAssets(html) {
  const out = []
  const seen = new Set()
  const re = /href="(\/[^"]*\/releases\/download\/([^/"]+)\/([^"]+))"/g
  let m
  while ((m = re.exec(html))) {
    let name
    try {
      name = decodeURIComponent(m[3])
    } catch {
      name = m[3]
    }
    if (seen.has(name)) continue
    seen.add(name)
    // 体积紧跟在链接元素后面
    const sz = /([\d.]+\s*(?:B|KB|MB|GB))\s*</i.exec(html.slice(m.index, m.index + 700))
    out.push({ name, url: `https://github.com${m[1]}`, size: parseSize(sz && sz[1]), tag: m[2] })
  }
  return out
}

/** 把转义过的 HTML 还原回标签（atom 的 <content> 里是转义过的） */
function unescapeHtml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|li|h[1-6]|div|tr|ul|ol|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 兜底：expanded_assets 片段读不到时（刚发版那几分钟会这样），
 * 直接按 tag 拉 latest.yml —— 里面写着安装包文件名和字节数，拼出下载地址。
 */
async function assetFromLatestYml(tag) {
  try {
    const y = await getText(`${repoUrl()}/releases/download/${encodeURIComponent(tag)}/latest.yml`, 'text/yaml')
    if (y.statusCode !== 200) return null
    const m = /(?:^|\n)\s*-\s*url:\s*"?([^"\r\n]+?\.exe)"?\s*(?:\n|$)/i.exec(y.text)
    if (!m) return null
    const setupName = m[1].trim()
    const sizeM = /(?:^|\n)\s*size:\s*(\d+)/.exec(y.text)
    const size = Number(sizeM && sizeM[1]) || 0
    const urlOf = (name) => `${repoUrl()}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`

    // latest.yml 永远指向安装包；便携版用户要换成 -portable.exe，先探一下有没有
    let name = setupName
    if (isPortable()) {
      const portableName = setupName.replace(/-setup\.exe$/i, '-portable.exe')
      if (portableName !== setupName) {
        try {
          const h = await headFollow(urlOf(portableName))
          if (h.statusCode === 200) name = portableName
        } catch {
          /* 探测失败就用安装包 */
        }
      }
    }
    return { name, url: urlOf(name), size, tag }
  } catch {
    return null
  }
}

/**
 * 查最新版。全程走网页端点，不碰 api.github.com。
 * @returns {Promise<{ok:boolean, hasUpdate?:boolean, current:string, latest?:string,
 *   notes?:string, publishedAt?:string, asset?:object, htmlUrl?:string, error?:string}>}
 */
export async function checkUpdate() {
  const current = currentVersion()

  // 1) releases.atom —— 不跳转、无额度，一次就拿到 tag / 发布时间 / 更新说明。
  //    （原来用 HEAD /releases/latest 拿 302 的 Location，但 Electron 的 net
  //     在 redirect:'manual' 下会直接抛 "Redirect was cancelled"，索性换成 feed。）
  let feed
  try {
    feed = await getText(`${repoUrl()}/releases.atom`, 'application/atom+xml')
  } catch (e) {
    return { ok: false, current, error: `连不上 GitHub：${e.message}` }
  }
  if (feed.statusCode === 404) {
    return { ok: false, current, error: '仓库里还没有发布过 release。' }
  }
  if (feed.statusCode !== 200) {
    return { ok: false, current, error: `GitHub 返回 ${feed.statusCode}` }
  }

  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(feed.text)
  if (!entry) {
    return { ok: false, current, error: '仓库里还没有发布过 release。' }
  }
  const tagM = /\/releases\/tag\/([^"<]+)/.exec(entry[1])
  if (!tagM) {
    return { ok: false, current, error: 'feed 里没找到 release 地址。' }
  }

  const tag = decodeURIComponent(tagM[1])
  const latest = tag.replace(/^v/i, '')
  const hasUpdate = compareVersions(latest, current) > 0
  const htmlUrl = `${repoUrl()}/releases/tag/${encodeURIComponent(tag)}`
  const publishedAt = (/<updated>([^<]+)<\/updated>/.exec(entry[1]) || [])[1] || ''

  // 更新说明在 <content> 里，是转义过的 HTML
  let notes = ''
  const cm = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry[1])
  if (cm) notes = htmlToText(unescapeHtml(cm[1])).slice(0, 2000)

  // 2) 资产列表 —— 拿不到也不算什么，用户还能点「在 GitHub 上看」
  //    名字不能自己拼：本地是 "SteamSDK Tool-0.1.1-setup.exe"（带空格），
  //    gh 上传之后 GitHub 会把它变成 "SteamSDK.Tool-0.1.1-setup.exe"
  //    刚发版那几分钟 expanded_assets 有时返回空片段，所以重试两次再兜底读 latest.yml。
  let asset = null
  let assetError = ''
  const pickExe = (html) => {
    const exes = parseAssets(html).filter((a) => /\.exe$/i.test(a.name))
    // 装的是哪个版本，就给哪个版本的包：
    // 便携版用户拿安装包去「重启并安装」是说不通的 —— 他没有安装目录
    const preferred = isPortable() ? /portable/i : /setup/i
    return exes.find((a) => preferred.test(a.name)) || exes.find((a) => /setup/i.test(a.name)) || exes[0] || null
  }
  for (let i = 0; i < 2 && !asset; i++) {
    if (i) await new Promise((r) => setTimeout(r, 400))
    try {
      const frag = await getText(`${repoUrl()}/releases/expanded_assets/${encodeURIComponent(tag)}`)
      asset = pickExe(frag.text)
    } catch (e) {
      assetError = e.message
    }
  }
  if (!asset && hasUpdate) {
    asset = await assetFromLatestYml(tag)
    if (!asset) assetError = assetError || '资产列表里没找到 .exe'
  }

  // 3) 体积：expanded_assets 片段里只有 sha256，没有字节数，单独 HEAD 一下。
  //    只有真有新版才做 —— 界面只在有新版时显示体积。
  if (hasUpdate && asset && !asset.size) {
    try {
      const h = await headFollow(asset.url)
      const len = Number(h1(h.headers, 'content-length') || 0)
      if (len > 0) asset.size = len
    } catch {
      /* 拿不到就不显示体积 */
    }
  }

  return { ok: true, current, latest, hasUpdate, notes, publishedAt, htmlUrl, asset, assetError, via: 'web' }
}

/**
 * 下载安装包。
 * @param {{url:string, name:string, onProgress?:(got:number,total:number)=>void}} o
 */
export async function downloadUpdate({ url, name, onProgress } = {}) {
  if (!url) return { ok: false, error: '没读到安装包地址（GitHub 的资产列表当时没返回）。过一会儿再点一次「检查更新」。' }
  const dir = path.join(app.getPath('userData'), 'updates')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, String(name || 'SteamSDK-Tool-setup.exe').replace(/[\\/:*?"<>|]/g, '_'))

  let req
  try {
    req = net.request({ method: 'GET', url, redirect: 'follow' })
    req.setHeader('User-Agent', UA)
    req.setHeader('Accept', 'application/octet-stream')
  } catch (e) {
    return { ok: false, error: `下载失败：${e.message}` }
  }

  return new Promise((resolve) => {
    let settled = false
    let timer = null
    const done = (v) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(v)
    }
    // 这个超时只管「连上」这一段；开始收数据之后不再限时（100MB 的包要几分钟）
    timer = setTimeout(() => {
      try {
        req.abort()
      } catch {
        /* ignore */
      }
      done({ ok: false, error: '下载超时（20 秒内没连上）' })
    }, TIMEOUT)

    req.on('response', (res) => {
      if (timer) clearTimeout(timer)
      if (res.statusCode !== 200) {
        res.resume()
        done({ ok: false, error: `下载失败：GitHub 返回 ${res.statusCode}` })
        return
      }

      const total = Number(h1(res.headers, 'content-length') || 0)
      let got = 0
      const out = fs.createWriteStream(dest)

      res.on('data', (chunk) => {
        got += chunk.length
        try {
          onProgress?.(got, total)
        } catch {
          /* 进度回调不该影响下载 */
        }
      })
      res.pipe(out)
      out.on('finish', () => {
        out.close(() => {
          if (total && got < total) {
            fs.rmSync(dest, { force: true })
            done({ ok: false, error: `下载不完整（${got}/${total} 字节）` })
            return
          }
          done({ ok: true, path: dest, bytes: got })
        })
      })
      out.on('error', (e) => done({ ok: false, error: `写文件失败：${e.message}` }))
      res.on('error', (e) => done({ ok: false, error: `下载中断：${e.message}` }))
    })
    req.on('error', (e) => done({ ok: false, error: `下载失败：${e.message}` }))
    req.end()
  })
}

/** 起安装程序，然后退出自己 —— 不退出的话文件被占着，装不进去 */
export function installUpdate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: '安装包已经不在了，重新下载一次' }

  // 便携版没有安装目录，而且自己的 exe 正被占用，覆盖不了 —— 只把文件夹打开
  if (isPortable()) {
    shell.showItemInFolder(filePath)
    return { ok: true, manual: true, path: filePath }
  }

  try {
    const child = spawn(filePath, [], { detached: true, stdio: 'ignore' })
    child.unref()
    setTimeout(() => app.quit(), 700)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `起不来安装程序：${e.message}` }
  }
}

export function openReleases() {
  shell.openExternal(releasesPage())
  return { ok: true }
}

/** 装完之后把下载下来的安装包清掉 */
export function cleanupDownloads() {
  try {
    const dir = path.join(app.getPath('userData'), 'updates')
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 启动时清掉放了很久没装的安装包 —— 一个安装包一百多 MB，不能一直堆着 */
export function pruneOldDownloads(maxAgeDays = 3) {
  try {
    const dir = path.join(app.getPath('userData'), 'updates')
    if (!fs.existsSync(dir)) return
    const cutoff = Date.now() - maxAgeDays * 86400000
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true })
      } catch {
        /* 单个文件删不掉不影响别的 */
      }
    }
  } catch {
    /* 清理失败不该拦住启动 */
  }
}

/* ───────────────────────── 增量更新（electron-updater） ─────────────────────────
 *
 * 整包 106 MB，但每次发版真正改的只有 app.asar 那不到 1 MB。electron-updater
 * 会拿新旧两版的 .blockmap 对比，只下改动的块 —— 这就是「增量」。
 *
 * 它读的资源是：
 *   resources\app-update.yml   electron-builder 打包时写进去的（provider 见
 *                              electron-builder.yml 的 publish 段）
 *   <url>/latest.yml           版本号 + 文件名 + sha512 + 发布日期
 *   <新>.<exe>.blockmap        新版的块表
 *   <旧>.<exe>.blockmap        （缓存里有上一版安装包时才拿得到）
 *
 * 有几件事它做不了，所以只在「装在系统里的版本」上用它：
 *   · 便携版没有安装目录，quitAndInstall 无处可装
 *   · 没打过 latest.yml 的旧 release 会让它 404
 *   · 缓存里没有上一版安装包时它会自动退回整包下载（不是错误）
 */

let updaterWired = false

/** 这个版本有没有资格走增量（装出来的、不是便携版、并且确实是打包产物） */
export function canIncremental() {
  return app.isPackaged && !isPortable()
}

function wireUpdater(ctx = {}) {
  if (updaterWired) return
  updaterWired = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null
  autoUpdater.on('download-progress', (p) => {
    ctx.onProgress?.({
      got: p.transferred,
      total: p.total,
      percent: Math.round(p.percent || 0),
      bytesPerSecond: p.bytesPerSecond || 0
    })
  })
}

/**
 * 走 electron-updater 下载（能增量就增量）。
 * 返回 `{ ok, version, upToDate }`；抛错由调用方决定要不要退回整包。
 */
export async function incrementalDownload(onProgress) {
  wireUpdater({ onProgress })

  const r = await autoUpdater.checkForUpdates()
  const latest = String(r?.updateInfo?.version || '')
  if (!latest) throw new Error('没读到 latest.yml 里的版本号')
  if (compareVersions(latest, currentVersion()) <= 0) {
    return { ok: true, upToDate: true, version: latest }
  }

  await autoUpdater.downloadUpdate()
  return { ok: true, upToDate: false, version: latest }
}

/** 关掉自己、装掉刚下好的那份、再起来 */
export function incrementalInstall() {
  autoUpdater.quitAndInstall(false, true)
  return { ok: true }
}
