/**
 * 工具自己的更新检查 —— 走 GitHub Releases。
 *
 * 为什么不引 electron-updater：那套要求 electron-builder 的 publish 配置、
 * latest.yml、还有它自己的一套事件模型；我们只要「查一下有没有新版 →
 * 下载那个 .exe → 起安装程序」这三步，自己写反而更好控（进度、错误文案都能自己定）。
 *
 * 仓库是公开的，所以匿名读 releases 就行，不需要 token。
 */
import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const OWNER = 'yingyu4451'
const REPO = 'SteamSDK-Tool'
const API = 'https://api.github.com'
const UA = 'SteamSDK-Tool-Updater'
const TIMEOUT = 20000

export function repoUrl() {
  return `https://github.com/${OWNER}/${REPO}`
}

export function releasesPage() {
  return `${repoUrl()}/releases`
}

export function currentVersion() {
  return app.getVersion()
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

/** GET，自己跟 302（release asset 会跳到 objects.githubusercontent.com） */
function get(url, hdrs = {}, { maxRedirect = 6 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: hdrs, timeout: TIMEOUT }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirect > 0) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        resolve(get(next, { 'User-Agent': UA, Accept: hdrs.Accept || '*/*' }, { maxRedirect: maxRedirect - 1 }))
        return
      }
      resolve(res)
    })
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
  })
}

function readJson(res) {
  return new Promise((resolve) => {
    let body = ''
    res.setEncoding('utf8')
    res.on('data', (c) => (body += c))
    res.on('end', () => {
      try {
        resolve({ status: res.statusCode, json: body ? JSON.parse(body) : null })
      } catch {
        resolve({ status: res.statusCode, json: null })
      }
    })
    res.on('error', () => resolve({ status: res.statusCode, json: null }))
  })
}

/** 从 release 里挑安装包：优先名字里带 setup 的 .exe */
function pickAsset(assets = []) {
  const exe = assets.filter((a) => /\.exe$/i.test(a.name || ''))
  return exe.find((a) => /setup/i.test(a.name)) || exe[0] || null
}

/**
 * 查最新版。
 * @returns {Promise<{ok:boolean, hasUpdate?:boolean, current:string, latest?:string,
 *   notes?:string, publishedAt?:string, asset?:object, htmlUrl?:string, error?:string}>}
 */
export async function checkUpdate() {
  const current = currentVersion()
  let res
  try {
    res = await get(`${API}/repos/${OWNER}/${REPO}/releases/latest`, {
      'User-Agent': UA,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    })
  } catch (e) {
    return { ok: false, current, error: `连不上 GitHub：${e.message}` }
  }

  if (res.statusCode === 404) {
    res.resume()
    return { ok: false, current, error: '仓库里还没有发布过 release。' }
  }
  if (res.statusCode === 403 || res.statusCode === 429) {
    res.resume()
    return { ok: false, current, error: `GitHub 限流了（${res.statusCode}），过一会儿再试。` }
  }
  if (res.statusCode !== 200) {
    res.resume()
    return { ok: false, current, error: `GitHub 返回 ${res.statusCode}` }
  }

  const { json } = await readJson(res)
  if (!json) return { ok: false, current, error: 'GitHub 返回的内容看不懂' }

  const latest = String(json.tag_name || json.name || '').replace(/^v/i, '')
  const asset = pickAsset(json.assets)

  return {
    ok: true,
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    notes: String(json.body || '').slice(0, 2000),
    publishedAt: json.published_at || '',
    htmlUrl: json.html_url || releasesPage(),
    asset: asset
      ? { name: asset.name, size: asset.size, url: asset.browser_download_url || asset.url }
      : null
  }
}

/**
 * 下载安装包。
 * @param {{url:string, name:string, onProgress?:(got:number,total:number)=>void}} o
 */
export async function downloadUpdate({ url, name, onProgress } = {}) {
  if (!url) return { ok: false, error: '这个 release 里没有 .exe 安装包' }
  const dir = path.join(app.getPath('userData'), 'updates')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, String(name || 'SteamSDK-Tool-setup.exe').replace(/[\\/:*?"<>|]/g, '_'))

  let res
  try {
    res = await get(url, { 'User-Agent': UA, Accept: 'application/octet-stream' })
  } catch (e) {
    return { ok: false, error: `下载失败：${e.message}` }
  }
  if (res.statusCode !== 200) {
    res.resume()
    return { ok: false, error: `下载失败：GitHub 返回 ${res.statusCode}` }
  }

  const total = Number(res.headers['content-length'] || 0)
  let got = 0
  const out = fs.createWriteStream(dest)

  return new Promise((resolve) => {
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
          resolve({ ok: false, error: `下载不完整（${got}/${total} 字节）` })
          return
        }
        resolve({ ok: true, path: dest, bytes: got })
      })
    })
    out.on('error', (e) => resolve({ ok: false, error: `写文件失败：${e.message}` }))
    res.on('error', (e) => resolve({ ok: false, error: `下载中断：${e.message}` }))
  })
}

/** 起安装程序，然后退出自己 —— 不退出的话文件被占着，装不进去 */
export function installUpdate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: '安装包已经不在了，重新下载一次' }
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
