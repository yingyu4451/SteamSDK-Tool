import fs from 'node:fs'
import path from 'node:path'
import { readApp, globMatch } from './sdk.js'

/* ------------------------------------------------------------------ *
 *  上传前预检
 *
 *  SteamPipe 是在上传过程中才报这些错的：非法字符、超长路径、大小写冲突、
 *  符号链接。传了 20 分钟才炸掉很难受，所以在上传前先在本地扫一遍。
 *
 *  这里算的是「真的会被上传的文件」——先按 depot 自己的 FileExclusion
 *  过一遍，被排除的文件不参与检查（它们根本不上去）。
 * ------------------------------------------------------------------ */

// Windows 文件名里就不允许这些；从 macOS/Linux 拷过来的包会带着它们。
// ASCII 控制字符同理。SteamPipe 遇到会在打包阶段报错。
const BAD_CHARS = /[<>:"|?*\u0000-\u001f]/

// Windows MAX_PATH 是 260。Steam 客户端在 Linux/macOS 上也要能解出这个
// 路径，而且安装目录本身还会占掉一截，所以卡得比 260 紧一些。
const MAX_REL = 200
const MAX_SEGMENT = 120

// macOS 在文件系统里塞的东西，不该出现在 depot 里。
const MAC_JUNK = /(^|[\\/])(\.DS_Store|__MACOSX|\._[^\\/]*)$/

function mk(level, code, title, text, hint = '') {
  return { level, code, title, text, hint }
}

/** 走一遍目录：要拿到符号链接和空目录，所以不能用 sdk.js 里那个简化版 walk */
function scanTree(root) {
  const files = []
  const dirs = []
  const links = []

  const visit = (dir, relBase) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      return
    }
    let fileHere = 0
    for (const e of entries) {
      const full = path.join(dir, e.name)
      const rel = relBase ? `${relBase}/${e.name}` : e.name
      // 符号链接和 junction：readlink 能读出来就说明是链接（Windows 的
      // junction lstat 不算 isSymbolicLink，但 readlink 读得出来）
      let isLink = e.isSymbolicLink()
      if (!isLink) {
        try {
          fs.readlinkSync(full)
          isLink = true
        } catch {
          /* 不是链接 */
        }
      }
      if (isLink) {
        links.push({ full, rel })
        continue
      }
      if (e.isDirectory()) {
        dirs.push({ full, rel })
        visit(full, rel)
      } else if (e.isFile()) {
        let size = 0
        try {
          size = fs.lstatSync(full).size
        } catch {
          /* 被占用 */
        }
        files.push({ full, rel, size })
        fileHere++
      }
    }
    return fileHere
  }

  visit(root, '')
  return { files, dirs, links }
}

function scanDepot(depot, root, platform) {
  const problems = []
  const label = `${depot.id}${platform ? ` (${platform})` : ''}`

  if (!root || !fs.existsSync(root)) {
    problems.push(
      mk('error', 'no-root', `Depot ${label} 没有内容目录`, `内容目录不存在：${root || '(空)'}`, '先把游戏打出来，或者改内容目录。')
    )
    return { depotId: depot.id, platform, root, problems, stats: null }
  }

  const { files, dirs, links } = scanTree(root)
  const exclusions = depot.exclusions || []
  const included = []
  let excludedCount = 0
  for (const f of files) {
    if (exclusions.find((p) => globMatch(f.rel, p))) excludedCount++
    else included.push(f)
  }

  // --- 1. 非法字符 ---------------------------------------------------------
  const badChars = included.filter((f) => BAD_CHARS.test(f.rel))
  for (const f of badChars.slice(0, 12)) {
    problems.push(
      mk('error', 'bad-char', `文件名里有非法字符（Depot ${label}）`, f.rel, 'Windows 上 < > : " | ? * 不能出现在文件名里，SteamPipe 打包时会失败。改名后重试。')
    )
  }
  if (badChars.length > 12) {
    problems.push(mk('error', 'bad-char-more', `还有 ${badChars.length - 12} 个非法字符路径`, '同上', '先修前面列出的，改完再跑一次。'))
  }

  // --- 2. 超长路径 ---------------------------------------------------------
  const longRel = included.filter((f) => f.rel.length > MAX_REL)
  const longSeg = included.filter((f) => f.rel.split('/').some((s) => s.length > MAX_SEGMENT))
  for (const f of longRel.slice(0, 8)) {
    problems.push(
      mk('error', 'path-too-long', `路径太长（Depot ${label}）`, `${f.rel.length} 字符：${f.rel}`, `超过 ${MAX_REL} 字符。Steam 客户端在各平台上都要解出这个路径，装到深层目录时会失败。`)
    )
  }
  for (const f of longSeg.slice(0, 8)) {
    problems.push(
      mk('error', 'segment-too-long', `单个文件名太长（Depot ${label}）`, f.rel, `某一段超过 ${MAX_SEGMENT} 字符。`)
    )
  }

  // --- 3. 大小写冲突 -------------------------------------------------------
  // Windows 上不可能出现，但从 macOS/Linux 拷过来的包里很常见。
  // Steam 的 depot 是大小写敏感的，两个只差大小写的文件会互相覆盖。
  const byLower = new Map()
  for (const f of included) {
    const k = f.rel.toLowerCase()
    if (!byLower.has(k)) byLower.set(k, [])
    byLower.get(k).push(f.rel)
  }
  const collisions = [...byLower.values()].filter((v) => v.length > 1)
  for (const c of collisions.slice(0, 8)) {
    problems.push(
      mk('error', 'case-collision', `大小写冲突（Depot ${label}）`, c.join('  /  '), 'Steam 的 depot 区分大小写，但 Windows 下载下来会撞成一个文件。留一个就行。')
    )
  }

  // --- 4. 符号链接 ---------------------------------------------------------
  const linkTargets = links.filter((l) => !exclusions.find((p) => globMatch(l.rel, p)))
  if (linkTargets.length) {
    for (const l of linkTargets.slice(0, 8)) {
      problems.push(
        mk('warn', 'symlink', `符号链接（Depot ${label}）`, l.rel, 'SteamPipe 不会保留符号链接 —— 上传后它会变成普通文件或者丢失。macOS 的 .app / Framework 里很常见。')
      )
    }
    if (linkTargets.length > 8) {
      problems.push(mk('warn', 'symlink-more', `还有 ${linkTargets.length - 8} 个符号链接`, '同上', ''))
    }
  }

  // --- 5. macOS 垃圾文件 ---------------------------------------------------
  const macJunk = included.filter((f) => MAC_JUNK.test(f.rel))
  if (macJunk.length) {
    problems.push(
      mk('warn', 'mac-junk', `macOS 元数据文件（Depot ${label}）`, `${macJunk.length} 个：${macJunk.slice(0, 5).map((f) => f.rel).join('、')}${macJunk.length > 5 ? ' …' : ''}`, '这些不该进 depot。在 depot 脚本的 FileExclusion 里加 .DS_Store / ._* / __MACOSX 就能挡掉。')
    )
  }

  // --- 6. .app bundle（macOS）---------------------------------------------
  const apps = dirs.filter((d) => d.rel.toLowerCase().endsWith('.app'))
  for (const a of apps) {
    const inside = included.filter((f) => f.rel.startsWith(a.rel + '/'))
    const sym = links.filter((l) => l.rel.startsWith(a.rel + '/'))
    const exec = inside.filter((f) => /\/Contents\/MacOS\//.test(f.rel))
    const bits = []
    if (!exec.length) bits.push('没有 Contents/MacOS/ 里的可执行文件 —— 这个 .app 可能不完整')
    if (sym.length) bits.push(`里面有 ${sym.length} 个符号链接，SteamPipe 不会保留`)
    bits.push('Valve 的 tools\\ContentPrep 是专门处理这件事的（macOS 上运行）')
    problems.push(
      mk(exec.length ? 'warn' : 'error', 'app-bundle', `.app bundle：${a.rel}`, `${inside.length} 个文件`, bits.join('；'))
    )
  }

  // --- 7. 空目录 -----------------------------------------------------------
  // 空目录不会被上传（Steam 只有文件，没有目录概念）。列出来免得用户以为传了。
  const usedDirs = new Set()
  for (const f of included) {
    const parts = f.rel.split('/')
    for (let i = 1; i < parts.length; i++) usedDirs.add(parts.slice(0, i).join('/'))
  }
  const emptyDirs = dirs.filter((d) => !usedDirs.has(d.rel))
  if (emptyDirs.length) {
    problems.push(
      mk('info', 'empty-dir', `空目录（Depot ${label}）`, `${emptyDirs.length} 个：${emptyDirs.slice(0, 5).map((d) => d.rel).join('、')}${emptyDirs.length > 5 ? ' …' : ''}`, 'Steam 只传文件，空目录不会出现在玩家那边。')
    )
  }

  const uploadBytes = included.reduce((a, f) => a + f.size, 0)
  const stats = {
    diskFiles: files.length,
    uploadFiles: included.length,
    excludedFiles: excludedCount,
    links: linkTargets.length,
    emptyDirs: emptyDirs.length,
    uploadBytes,
    bytes: included.reduce((a, f) => a + f.size, 0)
  }

  return { depotId: depot.id, platform, root, problems, stats }
}

const PLATFORM_OF = (d) => d.platform || ''

export function preflightApp(appDirName, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const problems = []
  const depots = []

  for (const d of app.depots) {
    if (d.missing) {
      problems.push(mk('error', 'missing-depot-script', `Depot ${d.id} 的脚本不存在`, d.file, 'app 脚本里引用了它，但文件不在。'))
      continue
    }
    const root = d.contentRoot || app.contentRoot
    const r = scanDepot(d, root, PLATFORM_OF(d))
    depots.push(r)
    problems.push(...r.problems)
  }

  const errors = problems.filter((p) => p.level === 'error').length
  const warns = problems.filter((p) => p.level === 'warn').length

  // 排序：error → warn → info，同级别按 depot 排
  const rank = { error: 0, warn: 1, info: 2 }
  problems.sort((a, b) => rank[a.level] - rank[b.level])

  return {
    ok: errors === 0,
    dirName: app.dirName,
    appId: app.appId,
    depots,
    problems,
    errors,
    warns,
    infos: problems.length - errors - warns
  }
}
