import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { getPaths } from './sdk.js'

/* ------------------------------------------------------------------ *
 *  本地内容服务器（Steam Local Content Server）
 *
 *  把 app 脚本里的 "Local" 指向 ContentServer\htdocs，run_app_build 就会把
 *  内容写进那个目录而不是上传 Steam；客户端在 Steam.exe 旁边读一行
 *      @localcontentserver 127.0.0.1
 *  就能像下载正式版一样从本机下载来测 —— 1 GB 的包这么迭代省很多时间。
 *
 *  为什么不用 SDK 自带的 mongoose-3.1.exe：
 *  它是 2013 年的二进制，在这台机器上进程能起来、但**一个端口都不监听**
 *  （netstat 查不到，error.log 也不生成），HTTP 一律拒绝连接。之前那版
 *  只看「进程还在不在」，于是界面报「已启动」而浏览器打开是错误页。
 *  这件事本身只是 HTTP 静态文件服务，用 Node 自带的 http 做完全等价、而且
 *  任何机器上都能跑，所以这里自己实现，不再依赖那个 exe。
 *
 *  客户端默认连 80 端口，所以默认还是开 80（要管理员）。
 * ------------------------------------------------------------------ */

const DEFAULT_PORT = 80

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip'
}

let server = null
let serverPort = 0
let serveRoot = ''

export function localPaths(settings) {
  const p = getPaths(settings)
  const dir = path.join(p.sdkRoot, 'tools', 'ContentServer')
  return {
    dir,
    exe: path.join(dir, 'mongoose-3.1.exe'),
    htdocs: path.join(dir, 'htdocs'),
    conf: path.join(dir, 'mongoose.conf')
  }
}

const url = (port) => `http://localhost:${port}/`

/* ---------------- 端口占用 / 活着与否 ---------------- */

/** 这个端口现在能不能监听（能 = 空闲） */
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, '0.0.0.0')
  })
}

/** 谁占着这个端口 —— 报错时得说清楚，不然用户只能猜 */
function whoHolds(port) {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true })
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line)
      if (m && Number(m[1]) === Number(port)) pids.add(m[2])
    }
    if (!pids.size) return ''
    const names = []
    for (const pid of pids) {
      let name = '进程'
      try {
        const t = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
          encoding: 'utf8',
          windowsHide: true
        })
        const n = /^"([^"]+)"/.exec(t.trim())
        if (n) name = n[1]
      } catch {
        /* 拿不到名字就算了 */
      }
      names.push(`${name} (PID ${pid})`)
    }
    return names.join('、')
  } catch {
    return ''
  }
}

/** 真的发一个 HTTP 请求看看有没有人应答 —— 状态必须量出来，不能靠推断 */
export function probePort(port, timeout = 2500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout }, (res) => {
      res.resume()
      resolve(res.statusCode > 0 && res.statusCode < 500)
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
  })
}

/* ---------------- 静态文件服务 ---------------- */

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8')
  try {
    res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' })
    res.end(buf)
  } catch {
    /* 客户端提前断开 */
  }
}

function sendFile(req, res, file) {
  let st
  try {
    st = fs.statSync(file)
  } catch {
    return send(res, 404, 'not found')
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  let start = 0
  let end = st.size - 1
  let code = 200

  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
    if (m && (m[1] || m[2])) {
      if (m[1] && m[2]) {
        start = Number(m[1])
        end = Number(m[2])
      } else if (m[1]) {
        start = Number(m[1])
      } else {
        start = Math.max(0, st.size - Number(m[2]))
      }
      if (Number.isFinite(start) && Number.isFinite(end) && start < st.size && start <= end) {
        end = Math.min(end, st.size - 1)
        code = 206
      } else {
        start = 0
        end = st.size - 1
      }
    }
  }

  const len = Math.max(0, end - start + 1)
  const headers = { 'Content-Type': type, 'Content-Length': len, 'Accept-Ranges': 'bytes' }
  if (code === 206) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`
  try {
    res.writeHead(code, headers)
  } catch {
    return
  }
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file, { start, end })
    .on('error', () => res.destroy())
    .pipe(res)
}

function listing(base, dir, rel) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const rows = []
  if (rel !== '/') rows.push('<li><a href="../">../</a></li>')
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = e.name + (e.isDirectory() ? '/' : '')
    const href = encodeURIComponent(e.name) + (e.isDirectory() ? '/' : '')
    rows.push(`<li><a href="${href}">${esc(name)}</a></li>`)
  }
  return `<!doctype html><meta charset="utf-8"><title>${esc(rel)}</title>
<style>body{font:13px/1.7 ui-monospace,Consolas,monospace;background:#111;color:#ddd;padding:24px}
a{color:#66c0f4;text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:14px;color:#8f98a0;font-weight:600}</style>
<h1>${esc(rel)}</h1><ul>${rows.join('')}</ul>`
}

function makeHandler(root) {
  const base = path.resolve(root)
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed')
    let rel = '/'
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      return send(res, 400, 'bad path')
    }
    const full = path.resolve(base, '.' + rel)
    // 不许跳出 htdocs
    if (full !== base && !full.startsWith(base + path.sep)) return send(res, 403, 'forbidden')
    let st
    try {
      st = fs.statSync(full)
    } catch {
      return send(res, 404, 'not found')
    }
    if (st.isDirectory()) {
      const idx = path.join(full, 'index.html')
      if (fs.existsSync(idx)) return sendFile(req, res, idx)
      return send(res, 200, listing(base, full, rel), 'text/html; charset=utf-8')
    }
    return sendFile(req, res, full)
  }
}

/* ---------------- 对外 ---------------- */

export function localStatus(settings) {
  const L = localPaths(settings)
  const running = !!server && server.listening
  const port = running ? serverPort : DEFAULT_PORT
  return {
    ok: true,
    running,
    serving: running,
    pid: running ? process.pid : 0,
    port,
    htdocs: L.htdocs,
    htdocsExists: fs.existsSync(L.htdocs),
    root: serveRoot || L.htdocs,
    url: url(port),
    kind: 'builtin'
  }
}

export async function startLocal(settings, port = DEFAULT_PORT) {
  const L = localPaths(settings)
  const p = Number(port) || DEFAULT_PORT
  if (!fs.existsSync(L.htdocs)) {
    return { ok: false, error: `找不到 ${L.htdocs} —— 先在「构建目录」里跑一次带本地服务器的构建。` }
  }

  if (server && server.listening && serverPort === p) {
    const serving = await probePort(p)
    return { ok: true, already: true, port: p, url: url(p), serving }
  }
  if (server && server.listening) await stopLocal()

  if (!(await portFree(p))) {
    const holder = whoHolds(p)
    return {
      ok: false,
      portBusy: true,
      error:
        `端口 ${p} 已经被占用${holder ? `：${holder}` : ''}。\n` +
        (p === 80
          ? 'Steam 客户端默认只连 80 端口，所以要么把占用它的程序关掉，要么换个端口（换端口后客户端那边多半连不上）。'
          : '换一个端口再试。')
    }
  }

  const s = http.createServer(makeHandler(L.htdocs))
  s.on('clientError', (_err, sock) => {
    try {
      sock.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    } catch {
      /* 已经断了 */
    }
  })

  const bound = await new Promise((resolve) => {
    let done = false
    s.once('error', (e) => {
      if (done) return
      done = true
      resolve({
        ok: false,
        code: e.code,
        error:
          e.code === 'EACCES'
            ? `没有权限监听 ${p} 端口 —— 1024 以下的端口要管理员身份运行。`
            : `监听 ${p} 端口失败：${e.message}`
      })
    })
    s.listen(p, '0.0.0.0', () => {
      if (done) return
      done = true
      resolve({ ok: true })
    })
  })
  if (!bound.ok) {
    try {
      s.close()
    } catch {
      /* ignore */
    }
    return bound
  }

  server = s
  serverPort = p
  serveRoot = L.htdocs

  // 起来了不等于能访问 —— 真发一个请求确认，别让界面说了算
  const serving = await probePort(p)
  if (!serving) {
    await stopLocal()
    return { ok: false, error: `服务器起来了但 http://127.0.0.1:${p}/ 没有应答，已经停掉。` }
  }
  return { ok: true, pid: process.pid, port: p, url: url(p), serving: true, htdocs: L.htdocs }
}

export async function stopLocal() {
  if (!server) return { ok: true, already: true }
  const port = serverPort
  const s = server
  server = null
  serverPort = 0
  await new Promise((resolve) => {
    try {
      s.close(() => resolve())
    } catch {
      resolve()
    }
    // 有 keep-alive 连接挂着时 close 不回调，兜一下
    setTimeout(resolve, 800)
  })
  try {
    s.closeAllConnections?.()
  } catch {
    /* 老版本没有这个方法 */
  }
  return { ok: true, port }
}

/* ---------------- 客户端那边的 steam_dev.cfg ---------------- */

function findSteamPath() {
  const tries = [
    () =>
      execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
        encoding: 'utf8',
        windowsHide: true
      }),
    () =>
      execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', '/v', 'InstallPath'], {
        encoding: 'utf8',
        windowsHide: true
      })
  ]
  for (const t of tries) {
    try {
      const out = t()
      const m = /REG_SZ\s+(.+?)\s*$/m.exec(out)
      if (m) {
        const p = m[1].trim()
        if (fs.existsSync(p)) return p
      }
    } catch {
      /* 试下一个 */
    }
  }
  for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) {
    if (fs.existsSync(p)) return p
  }
  return ''
}

export function steamDevCfg(settings, port = DEFAULT_PORT) {
  const steamPath = findSteamPath()
  const host = '127.0.0.1'
  const line = `@localcontentserver ${host}`
  if (!steamPath) {
    return { ok: false, error: '找不到 Steam 安装目录（注册表里没有）', line }
  }
  const file = path.join(steamPath, 'steam_dev.cfg')
  let content = ''
  try {
    content = fs.readFileSync(file, 'utf8')
  } catch {
    /* 还没有这个文件 */
  }
  return {
    ok: true,
    steamPath,
    file,
    exists: fs.existsSync(file),
    content,
    line,
    has: content.split(/\r?\n/).some((l) => l.trim().toLowerCase().startsWith('@localcontentserver')),
    port
  }
}

/** 写入/更新 steam_dev.cfg 里的那一行。会先把原内容备份成 .bak。 */
export function writeSteamDevCfg(settings, port = DEFAULT_PORT) {
  const info = steamDevCfg(settings, port)
  if (!info.ok) return info

  const lines = info.content ? info.content.split(/\r?\n/) : []
  const idx = lines.findIndex((l) => l.trim().toLowerCase().startsWith('@localcontentserver'))
  const payload = info.line
  if (idx >= 0) lines[idx] = payload
  else lines.push(payload)

  const text = lines.filter((l, i) => l.trim() !== '' || i < lines.length - 1).join('\r\n') + '\r\n'
  try {
    if (info.exists) fs.writeFileSync(info.file + '.bak', info.content, 'utf8')
    fs.writeFileSync(info.file, text, 'utf8')
  } catch (e) {
    return { ok: false, error: `写入失败：${e.message}`, file: info.file }
  }
  return { ok: true, file: info.file, line: payload, backedUp: info.exists }
}
