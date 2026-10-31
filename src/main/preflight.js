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
      mk(
        'error',
        'no-root',
        `这个 Depot 没有内容目录`,
        `配置里写的内容目录不存在：${root || '(空)'}`,
        '把游戏构建输出到这个目录，或者在「编辑」里改成现有目录。没有内容目录就没法检查文件，也没法上传。'
      )
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
      mk(
        'error',
        'bad-char',
        `文件名里有 Windows 不允许的字符`,
        f.rel,
        '文件名不能带 < > : " | ? *，Steam 打包会直接失败。改名后重新检查；不想改名就把这个文件加到 Depot 的排除规则里。'
      )
    )
  }
  if (badChars.length > 12) {
    problems.push(
      mk('error', 'bad-char-more', `还有 ${badChars.length - 12} 个文件名的字符不合法`, '前面只列了前 12 个', '按同样的方式改名后，再点一次「检查文件」。')
    )
  }

  // --- 2. 超长路径 ---------------------------------------------------------
  const longRel = included.filter((f) => f.rel.length > MAX_REL)
  const longSeg = included.filter((f) => f.rel.split('/').some((s) => s.length > MAX_SEGMENT))
  for (const f of longRel.slice(0, 8)) {
    problems.push(
      mk(
        'error',
        'path-too-long',
        `文件路径太长`,
        `${f.rel.length} 个字符：${f.rel}`,
        `超过 ${MAX_REL} 个字符，玩家在 Windows 上解压会失败。把目录层级缩短一层，或者换个更浅的目录。`
      )
    )
  }
  for (const f of longSeg.slice(0, 8)) {
    problems.push(
      mk(
        'error',
        'segment-too-long',
        `单个文件名太长`,
        f.rel,
        `其中一段名字超过 ${MAX_SEGMENT} 个字符。改短这个名字后重新检查。`
      )
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
      mk(
        'error',
        'case-collision',
        `有两个文件只是大小写不同`,
        c.join('  /  '),
        'Steam 区分大小写，但玩家在 Windows 上下载会撞成同一个文件，只剩一个。删掉或改名其中一个。'
      )
    )
  }

  // --- 4. 符号链接 ---------------------------------------------------------
  const linkTargets = links.filter((l) => !exclusions.find((p) => globMatch(l.rel, p)))
  if (linkTargets.length) {
    for (const l of linkTargets.slice(0, 8)) {
      problems.push(
        mk(
          'warn',
          'symlink',
          `有一个快捷方式式的文件（符号链接）`,
          l.rel,
          'Steam 上传时不保留符号链接，玩家下载到的可能是坏的或空文件。macOS 的 .app 里出现属正常结构，要按 .app 流程打包；其它位置建议删掉或换成真实文件。'
        )
      )
    }
    if (linkTargets.length > 8) {
      problems.push(
        mk('warn', 'symlink-more', `还有 ${linkTargets.length - 8} 个符号链接`, '前面只列了前 8 个', '处理方式同上；如果都在 .app 里，按 .app 打包流程处理即可。')
      )
    }
  }

  // --- 5. macOS 垃圾文件 ---------------------------------------------------
  const macJunk = included.filter((f) => MAC_JUNK.test(f.rel))
  if (macJunk.length) {
    problems.push(
      mk(
        'warn',
        'mac-junk',
        `有 macOS 自动生成的垃圾文件`,
        `${macJunk.length} 个，例如：${macJunk.slice(0, 5).map((f) => f.rel).join('、')}${macJunk.length > 5 ? ' …' : ''}`,
        '像 .DS_Store、._xxx、__MACOSX 这些是 macOS 顺手生成的，不属于游戏文件。在 Depot 的排除规则里加上 .DS_Store / ._* / __MACOSX 就能挡掉。'
      )
    )
  }

  // --- 6. .app bundle（macOS）---------------------------------------------
  const apps = dirs.filter((d) => d.rel.toLowerCase().endsWith('.app'))
  for (const a of apps) {
    const inside = included.filter((f) => f.rel.startsWith(a.rel + '/'))
    const sym = links.filter((l) => l.rel.startsWith(a.rel + '/'))
    const exec = inside.filter((f) => /\/Contents\/MacOS\//.test(f.rel))
    if (!exec.length) {
      problems.push(
        mk(
          'error',
          'app-bundle-broken',
          `这个 macOS 程序包看起来不完整`,
          `${a.rel}（${inside.length} 个文件，但找不到 Contents/MacOS 里的可执行文件）`,
          '可能是打包方式不对。确认这个 .app 是完整的 macOS 程序，或者从 Depot 里去把它排除掉。'
        )
      )
      continue
    }
    const extra = sym.length ? `，里面有 ${sym.length} 个符号链接（Steam 不会保留）` : ''
    problems.push(
      mk(
        'warn',
        'app-bundle',
        `检测到 macOS 程序包（.app）`,
        `${a.rel}（${inside.length} 个文件${extra}）`,
        'macOS 程序是 .app 目录结构，直接上传玩家那边可能打不开。Valve 的做法是先在 macOS 上用 tools\\ContentPrep 把它处理成 .app bundle 再上传；在 Windows 上一般不会传 macOS 包，需要的话让 Mac 同事处理这一步。'
      )
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
      mk(
        'info',
        'empty-dir',
        `有不会被上传的空目录`,
        `${emptyDirs.length} 个：${emptyDirs.slice(0, 5).map((d) => d.rel).join('、')}${emptyDirs.length > 5 ? ' …' : ''}`,
        'Steam 只上传文件，空目录不会出现在玩家那边。这条只是说明，不影响上传，可以忽略。'
      )
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

/**
 * 检查真正会被上传的文件。
 * opts.depotId 传了的话只扫这一个 Depot（「检查文件」是按 Depot 单独检查的）。
 */
export function preflightApp(appDirName, settings, opts = {}) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const only = opts.depotId != null && opts.depotId !== '' ? String(opts.depotId) : ''
  const problems = []
  const depots = []

  for (const d of app.depots) {
    if (only && String(d.id) !== only) continue
    if (d.missing) {
      problems.push(
        mk(
          'error',
          'missing-depot-script',
          `这个 Depot 的脚本文件不存在`,
          d.file,
          'app 的 vdf 里引用了这个 depot 脚本，但 scripts 目录里没有它。补上脚本，或者从 app vdf 里删掉这一行。'
        )
      )
      continue
    }
    const root = d.contentRoot || app.contentRoot
    const r = scanDepot(d, root, PLATFORM_OF(d))
    depots.push(r)
    problems.push(...r.problems)
  }

  if (only && !depots.length && !problems.length) {
    return { ok: false, error: `找不到 Depot ${only}` }
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
