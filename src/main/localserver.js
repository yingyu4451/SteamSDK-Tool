import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { getPaths } from './sdk.js'

/* ------------------------------------------------------------------ *
 *  本地内容服务器（Steam Local Content Server）
 *
 *  SDK 自带 tools\ContentServer（mongoose）。把 app 脚本里的 "Local" 指向
 *  它的 htdocs，run_app_build 就会把内容写进本地目录，而不是上传 Steam。
 *  客户端那边要在 Steam.exe 旁边放一个 steam_dev.cfg，写一行
 *      @localcontentserver <主机名>
 *  之后它就能像下载正式版一样从本地下载来测 —— 1 GB 的包这么迭代省很多时间。
 *
 *  注意：客户端默认连 80 端口，所以服务器基本得开在 80 上（要管理员）。
 * ------------------------------------------------------------------ */

const DEFAULT_PORT = 80

let child = null

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

export function localStatus(settings) {
  const L = localPaths(settings)
  return {
    ok: true,
    running: !!child && !child.killed,
    pid: child?.pid || 0,
    port: child?.__port || DEFAULT_PORT,
    installed: fs.existsSync(L.exe),
    htdocs: L.htdocs,
    htdocsExists: fs.existsSync(L.htdocs),
    url: `http://localhost:${child?.__port || DEFAULT_PORT}/`
  }
}

/** 起服务器。mongoose 用 `-选项 值` 覆盖配置文件里的同名项。 */
export function startLocal(settings, port = DEFAULT_PORT) {
  const L = localPaths(settings)
  if (!fs.existsSync(L.exe)) return { ok: false, error: `找不到 ${L.exe}` }
  if (!fs.existsSync(L.htdocs)) return { ok: false, error: `找不到 ${L.htdocs}` }
  if (child && !child.killed) return { ok: true, already: true, pid: child.pid, port: child.__port }

  let c = null
  try {
    c = spawn(
      L.exe,
      [
        '-document_root', L.htdocs,
        '-listening_ports', String(port),
        '-enable_directory_listing', 'yes'
      ],
      { cwd: L.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch (e) {
    return { ok: false, error: `启动失败：${e.message}` }
  }

  c.__port = port
  child = c

  return new Promise((resolve) => {
    let out = ''
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      resolve(v)
    }

    c.stdout.on('data', (d) => {
      out += String(d)
    })
    c.stderr.on('data', (d) => {
      out += String(d)
    })
    c.on('error', (e) => {
      child = null
      done({ ok: false, error: `启动失败：${e.message}` })
    })
    c.on('exit', (code) => {
      if (child === c) child = null
      done({ ok: false, error: `服务器退出了（退出码 ${code}）。\n${out.trim()}` })
    })

    // mongoose 启动很快；1.2 秒后看进程还在不在
    setTimeout(() => {
      if (c.exitCode != null) return
      done({ ok: true, pid: c.pid, port, url: `http://localhost:${port}/`, log: out.trim() })
    }, 1200)
  })
}

export function stopLocal() {
  if (!child) return { ok: true, already: true }
  const pid = child.pid
  try {
    child.kill()
  } catch {
    /* ignore */
  }
  // mongoose 是原生 exe，kill() 不一定收得干净
  try {
    execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* 已经没了 */
  }
  child = null
  return { ok: true, pid }
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
