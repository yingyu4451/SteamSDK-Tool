import fs from 'node:fs'
import path from 'node:path'
import { parseVdf, getString, getBlock, getAllStrings, pairs } from './vdf.js'
import {
  setField,
  setList,
  insertIntoBlock,
  removeLine,
  renderAppVdf,
  renderDepotVdf,
  refreshAppNotes,
  defaultExclusionsFor,
  platformById,
  guessPlatform,
  osArchFromPlatform,
  platformFromOsArch,
  languageLabel,
  DEPOT_OS,
  DEPOT_ARCH,
  DEPOT_LANGUAGES,
  readUserConfig,
  setUserConfig
} from './vdf-edit.js'
import { readDepotMeta, setDepotMeta, readIgnoredProblems } from './store.js'

/* ------------------------------------------------------------------ *
 *  路径
 * ------------------------------------------------------------------ */

export function getPaths(settings) {
  const sdkRoot = settings.sdkRoot
  const cb = path.join(sdkRoot, 'tools', 'ContentBuilder')
  return {
    sdkRoot,
    contentBuilder: cb,
    scriptsDir: path.join(cb, 'scripts'),
    builderDir: path.join(cb, 'builder'),
    outputDir: path.join(cb, 'output'),
    steamcmd: path.join(cb, 'builder', 'steamcmd.exe'),
    checkScript: path.join(cb, 'check.ps1'),
    buildScript: path.join(cb, 'build.ps1')
  }
}

export function sdkStatus(settings) {
  const p = getPaths(settings)
  return {
    ...p,
    sdkRootExists: fs.existsSync(p.sdkRoot),
    contentBuilderExists: fs.existsSync(p.contentBuilder),
    scriptsDirExists: fs.existsSync(p.scriptsDir),
    steamcmdExists: fs.existsSync(p.steamcmd),
    checkScriptExists: fs.existsSync(p.checkScript),
    buildScriptExists: fs.existsSync(p.buildScript),
    outputDirExists: fs.existsSync(p.outputDir)
  }
}

/* ------------------------------------------------------------------ *
 *  通配符匹配（VDF 的 FileExclusion / LocalPath 用 * 和 ?）
 *  Windows 路径统一用反斜杠，* 跨目录分隔符匹配，和 PowerShell -like 一致。
 * ------------------------------------------------------------------ */

function globToRegExp(pattern) {
  let re = ''
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i')
}

const globCache = new Map()
export function globMatch(rel, pattern) {
  let re = globCache.get(pattern)
  if (!re) {
    re = globToRegExp(pattern)
    globCache.set(pattern, re)
  }
  return re.test(rel)
}

/* ------------------------------------------------------------------ *
 *  目录遍历
 * ------------------------------------------------------------------ */

function walk(dir, base = dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue // 避免 junction 造成的死循环
    if (e.isDirectory()) walk(full, base, out)
    else if (e.isFile()) {
      let size = 0
      try {
        size = fs.statSync(full).size
      } catch {
        /* 文件被占用，忽略 */
      }
      out.push({ full, rel: path.relative(base, full), size })
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 *  内容体检
 * ------------------------------------------------------------------ */

const SUSPICIOUS_EXT = new Set([
  '.log', '.pdb', '.ps1', '.bat', '.cmd', '.ilk', '.exp', '.iobj', '.ipdb', '.tmp'
])
const SUSPICIOUS_PARTS = ['doNotShip', 'PlayerLogs', 'mem-diag', 'CrashDump', 'Crash_']

/**
 * 按排除规则算出「到底哪些文件会被上传」，并把看起来是调试垃圾却仍然会被
 * 上传的文件单独标出来 —— 和 ContentBuilder\check.ps1 的判断保持同一套逻辑。
 */
export function analyzeContent(contentRoot, exclusions = []) {
  const exists = !!contentRoot && fs.existsSync(contentRoot)
  if (!exists) {
    return {
      contentRoot,
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      excludedCount: 0,
      excludedBytes: 0,
      uploadCount: 0,
      uploadBytes: 0,
      excluded: [],
      suspicious: []
    }
  }

  const files = walk(contentRoot)
  const excluded = []
  const included = []

  for (const f of files) {
    const hit = exclusions.find((p) => globMatch(f.rel, p))
    if (hit) excluded.push({ ...f, rule: hit })
    else included.push(f)
  }

  const suspicious = included.filter((f) => {
    const ext = path.extname(f.rel).toLowerCase()
    if (SUSPICIOUS_EXT.has(ext)) return true
    return SUSPICIOUS_PARTS.some((p) => f.rel.toLowerCase().includes(p.toLowerCase()))
  })

  const sum = (arr) => arr.reduce((a, b) => a + b.size, 0)

  return {
    contentRoot,
    exists: true,
    fileCount: files.length,
    totalBytes: sum(files),
    excludedCount: excluded.length,
    excludedBytes: sum(excluded),
    uploadCount: included.length,
    uploadBytes: sum(included),
    // 只回传前 200 条明细，避免 IPC 载荷过大；计数仍然是全量的
    excluded: excluded.slice(0, 200).map((f) => ({ rel: f.rel, size: f.size, rule: f.rule })),
    suspicious: suspicious.slice(0, 200).map((f) => ({ rel: f.rel, size: f.size }))
  }
}

/* ------------------------------------------------------------------ *
 *  读取 vdf
 * ------------------------------------------------------------------ */

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * 从 vdf 文本里抠一个标量值，键名大小写不敏感。
 * 用在「还不确定这个文件是不是合法 vdf」的场合 —— 走完整解析器会因为
 * 手写的脚本少个括号就直接抛错，而这里只想知道它自称是哪个 ID。
 */
function extractScalar(text, key) {
  const re = new RegExp(`"${key}"\\s+"([^"]*)"`, 'i')
  const m = String(text).match(re)
  return m ? m[1] : null
}

/** app vdf 的 depots 块里引用了哪些 DepotID（值形如 "...\depot_3036851_win64.vdf"） */
function referencedDepotIds(appText) {
  const ids = new Set()
  const re = /"(?:\d+)"\s+"([^"]*depot[^"]*\.vdf)"/gi
  let m
  while ((m = re.exec(String(appText)))) {
    const hit = String(m[1]).match(/depot[_\-]?(\d+)/i)
    if (hit) ids.add(hit[1])
  }
  return [...ids]
}

function depotPlatformFromName(name) {
  const n = name.toLowerCase()
  if (n.includes('win64') || n.includes('windows')) return 'Windows 64'
  if (n.includes('win32')) return 'Windows 32'
  if (n.includes('macos') || n.includes('osx')) return 'macOS'
  if (n.includes('linuxarm64')) return 'Linux ARM64'
  if (n.includes('linux')) return 'Linux'
  return '未知'
}

/** 读取单个 App 的全部信息（app vdf + 它引用的每个 depot vdf） */
export function readApp(appDirName, settings) {
  const p = getPaths(settings)
  const dir = path.join(p.scriptsDir, appDirName)

  let appFile = null
  try {
    appFile = fs
      .readdirSync(dir)
      .filter((f) => /^app_.*\.vdf$/i.test(f) && !f.startsWith('_preview_'))
      .sort()[0]
  } catch {
    return { error: `找不到目录 ${dir}` }
  }
  if (!appFile) return { error: `目录 ${dir} 里没有 app_*.vdf` }

  const appPath = path.join(dir, appFile)
  const appText = readText(appPath)
  if (appText == null) return { error: `读取失败 ${appPath}` }

  const root = parseVdf(appText)
  const appId = getString(root, 'AppID')
  const desc = getString(root, 'Desc', '')
  const contentRoot = getString(root, 'ContentRoot')
  const buildOutput = getString(root, 'BuildOutput')
  const preview = getString(root, 'preview', '0')
  const setLive = getString(root, 'SetLive', '')
  const verbose = getString(root, 'verbose', '0') === '1'
  // "Local" 一旦有值，run_app_build 会把内容丢进本地内容服务器而不是上传 Steam。
  const local = getString(root, 'Local', '')

  const depotsBlock = getBlock(root, 'Depots')
  const depotRefs = pairs(depotsBlock)
  const metaMap = readDepotMeta()

  const depots = depotRefs.map((ref) => {
    // app vdf 里 depot 的路径两种写法都有：相对本目录的文件名（我们生成的），
    // 或者绝对路径（Valve 模板和手写的都是这种）。
    // 注意不能用 path.join —— 它不像 path.resolve 那样会被绝对路径重置，
    // path.join('D:\\a', 'D:\\b\\x.vdf') 会拼出 'D:\\a\\D:\\b\\x.vdf'。
    const depotFile = path.isAbsolute(ref.value) ? ref.value : path.join(dir, ref.value)
    const platformId0 = guessPlatform(ref.value) || 'win64'
    // 后台那几项（名称/语言/系统/架构）本地 vdf 没有，从 settings 里带出来
    const meta = metaMap[ref.key] || null
    const fallback = osArchFromPlatform(meta?.os ? platformFromOsArch(meta.os, meta.arch) || platformId0 : platformId0)
    const depotText = readText(depotFile)
    if (depotText == null) {
      return {
        id: ref.key,
        file: ref.value,
        missing: true,
        platform: depotPlatformFromName(ref.value),
        platformId: platformId0,
        meta: meta || { name: '', language: 'all', ...fallback }
      }
    }
    const droot = parseVdf(depotText)
    const depotId = getString(droot, 'DepotID')
    const depotContentRoot = getString(droot, 'contentroot') || contentRoot
    const exclusions = getAllStrings(droot, 'FileExclusion')
    return {
      id: ref.key,
      file: ref.value,
      depotId,
      idMatches: depotId === ref.key,
      contentRoot: depotContentRoot,
      exclusions,
      userConfig: readUserConfig(depotText),
      hasFileMapping: !!getBlock(droot, 'FileMapping'),
      platform: depotPlatformFromName(ref.value),
      platformId: platformId0,
      meta: meta || { name: '', language: 'all', ...fallback },
      metaSaved: !!meta,
      analysis: analyzeContent(depotContentRoot, exclusions)
    }
  })

  const primary = depots[0]

  return {
    dirName: appDirName,
    dir,
    appFile,
    appPath,
    appId,
    desc,
    contentRoot,
    // App 层 ContentRoot 就是项目文件夹：各平台构建的父目录。
    // 界面上要显示「项目文件夹」时读这个，别让人以为它是上传目录。
    projectDir: contentRoot,
    buildOutput,
    preview,
    setLive,
    verbose,
    local,
    depots,
    // 概览用第一个 depot 的数据；多平台时界面上按 depot 分开看
    analysis: primary?.analysis ?? analyzeContent(null, []),
    ...splitProblems(collectProblems({ appId, contentRoot, depots, appText }), appDirName)
  }
}

/**
 * 把待处理清单拆成「还该提示的」和「用户说过本次忽略的」。
 *
 * 原文完全一样才算同一条 —— 所以路径变了会自动重新报出来，
 * 这正是想要的：忽略的是那次的具体情况，不是这一类问题。
 */
function splitProblems(all, dirName) {
  const ignoredList = readIgnoredProblems(dirName)
  if (!ignoredList.length) return { problems: all, problemsIgnored: [] }
  const set = new Set(ignoredList)
  return {
    problems: all.filter((t) => !set.has(t)),
    problemsIgnored: all.filter((t) => set.has(t))
  }
}

function collectProblems({ appId, contentRoot, depots, appText }) {
  const problems = []
  if (!appId) problems.push('app vdf 里没有 AppID')
  // App 层的 ContentRoot 是**项目文件夹**（各平台构建的父目录）。
  // 一个 App 管多平台时每个 depot 都有自己的 contentroot，这里只要有一个位置就行，
  // 只有「App 没写、某个 depot 也没写」才是真问题。
  const needAppRoot = depots.some((d) => !d.missing && !d.contentRoot)
  if (!contentRoot && needAppRoot) problems.push('app vdf 和 depot 脚本里都没有 ContentRoot')
  if (contentRoot && !fs.existsSync(contentRoot)) problems.push(`项目文件夹不存在：${contentRoot}`)

  // 两个 Depot 的内容目录重叠 = 同一批文件被传进两个 Depot。
  // 更常见也更危险的是「一个是另一个的父目录」—— 父目录那个 depot 会把子平台的构建
  // 一起传上去（比如 win64 的 depot 写成项目文件夹本身，macOS 的构建也跟着上）。
  const norm = (s) => path.resolve(String(s)).replace(/[\\/]+$/, '').toLowerCase()
  const roots = depots
    .filter((d) => !d.missing && d.contentRoot)
    .map((d) => ({ d, r: norm(d.contentRoot) }))
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const a = roots[i]
      const b = roots[j]
      if (a.r === b.r) {
        problems.push(`Depot ${a.d.id} 和 ${b.d.id} 的内容目录是同一个：${a.d.contentRoot}`)
      } else if (a.r.startsWith(b.r + path.sep) || b.r.startsWith(a.r + path.sep)) {
        const outer = a.r.startsWith(b.r + path.sep) ? b : a
        const inner = outer === a ? b : a
        problems.push(
          `Depot ${outer.d.id} 的内容目录 ${outer.d.contentRoot} 套着 Depot ${inner.d.id} 的 ` +
            `${inner.d.contentRoot} —— 构建时会把对方的文件一起传上去`
        )
      }
    }
  }

  // Depot 的内容目录不在项目文件夹里 —— 拖进 Downloads 里的现成构建时会这样。
  // 不报的话界面头部显示的是项目文件夹，真正上传的是另一处，两者看不出区别。
  if (contentRoot) {
    const base = norm(contentRoot)
    for (const { d, r } of roots) {
      if (r !== base && !r.startsWith(base + path.sep)) {
        problems.push(
          `Depot ${d.id} 上传的是 ${d.contentRoot}，不在项目文件夹 ${contentRoot} 里`
        )
      }
    }
  }

  const open = (appText.match(/\{/g) || []).length
  const close = (appText.match(/\}/g) || []).length
  if (open !== close) problems.push(`app vdf 花括号不配对：${open} 个 { / ${close} 个 }`)

  if (depots.length === 0) problems.push('没有列出任何 Depot')

  for (const d of depots) {
    if (d.missing) {
      problems.push(`Depot ${d.id} 引用的脚本不存在：${d.file}`)
      continue
    }
    if (!d.idMatches) problems.push(`DepotID 不一致：app 写 ${d.id}，${d.file} 写 ${d.depotId}`)
    if (!d.hasFileMapping) problems.push(`${d.file} 缺少 FileMapping 块`)
    if (d.analysis.exists && d.analysis.suspicious.length) {
      problems.push(`${d.file}：还有 ${d.analysis.suspicious.length} 个疑似调试文件会被上传`)
    }
  }
  return problems
}

/** 扫描 scripts 目录下所有 App */
export function scanApps(settings) {
  const p = getPaths(settings)
  if (!fs.existsSync(p.scriptsDir)) {
    return { apps: [], error: `scripts 目录不存在：${p.scriptsDir}` }
  }

  const dirNames = fs
    .readdirSync(p.scriptsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort()

  // 顺手清掉上次被中止的 preview 遗留（build.ps1 的 finally 在硬杀时不会执行）
  for (const name of dirNames) cleanupPreviewArtifacts(name, settings)

  const apps = dirNames.map((name) => readApp(name, settings))
  const ok = apps.filter((a) => !a.error)

  // 同一个 AppID 出现在两个本地 App 上是危险的：给其中一个跑构建，
  // 内容会传到另一个对应的 Steam App 上。这里跨 App 查一遍。
  const byAppId = new Map()
  for (const a of ok) {
    if (!a.appId) continue
    if (!byAppId.has(a.appId)) byAppId.set(a.appId, [])
    byAppId.get(a.appId).push(a.dirName)
  }
  const duplicates = [...byAppId.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([appId, list]) => ({ appId, apps: list }))

  return { apps: ok, errors: apps.filter((a) => a.error), duplicates, orphans: scanOrphans(settings) }
}

/**
 * scripts 根目录下「游离」的 vdf 文件。
 *
 * 它们不属于任何 App 文件夹，所以既不会被构建，也不会出现在左侧列表里 ——
 * 但里面往往是真的配置（手写的、或者从别处拖出来的）。
 * 静默忽略它们是最容易让人踩坑的行为，这里显式报出来。
 */
export function scanOrphans(settings) {
  const p = getPaths(settings)
  let entries = []
  try {
    entries = fs.readdirSync(p.scriptsDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.vdf'))
    .map((e) => {
      const full = path.join(p.scriptsDir, e.name)
      let stat = null
      try {
        stat = fs.statSync(full)
      } catch {
        /* 忽略 */
      }
      const text = readText(full) || ''
      const isApp = /^\s*"appbuild"/i.test(text)
      const depotId = isApp ? null : extractScalar(text, 'DepotID')
      const appId = isApp ? extractScalar(text, 'appid') : null
      return {
        file: e.name,
        path: full,
        kind: isApp ? 'app' : 'depot',
        appId: appId || null,
        depotId: depotId || null,
        bytes: stat ? stat.size : 0,
        mtime: stat ? stat.mtime.toISOString() : null
      }
    })
    .sort((a, b) => (a.kind === b.kind ? a.file.localeCompare(b.file) : a.kind === 'app' ? -1 : 1))
}

/** 把 scripts 根目录下的游离 vdf 收进一个正经的 App 文件夹 */
export function adoptOrphans(spec, settings) {
  const p = getPaths(settings)
  const check = validateAppName(spec?.name)
  if (!check.ok) return { ok: false, error: check.error }
  const name = check.name

  const orphans = scanOrphans(settings)
  if (!orphans.length) return { ok: false, error: 'scripts 根目录下没有游离的 vdf 文件' }

  const dir = path.join(p.scriptsDir, name)
  if (fs.existsSync(dir)) return { ok: false, error: `已经存在同名的 App：${name}` }

  const appFiles = orphans.filter((o) => o.kind === 'app')
  if (appFiles.length > 1) {
    return {
      ok: false,
      error: `根目录下有 ${appFiles.length} 个 app_*.vdf，一次只能收一个（先手动挑一个）`
    }
  }

  // 目标文件名：depot 统一改成 depot_<id>_<平台>.vdf，app 保持 app_<appid>.vdf
  const plan = []
  const depotOnly = orphans.filter((o) => o.kind === 'depot')

  const appFile = appFiles[0] || null
  let referenced = []
  if (appFile) {
    const appText = readText(appFile.path) || ''
    referenced = referencedDepotIds(appText)
  }

  // 只有被 app 引用、或者根目录下就是游离的 depot，才一起搬
  const wantedDepotIds = new Set([
    ...referenced,
    ...depotOnly.map((d) => String(d.depotId || '')).filter(Boolean)
  ])

  const usedNames = new Set()
  for (const o of orphans) {
    if (o.kind === 'app') {
      const id = o.appId || 'unknown'
      plan.push({ from: o.path, to: `app_${id}.vdf`, kind: 'app', id })
      continue
    }
    const id = String(o.depotId || '')
    if (!id) continue
    if (!wantedDepotIds.has(id)) continue

    const text = readText(o.path) || ''
    const root = extractScalar(text, 'contentroot') || ''
    const platform = guessPlatform(root) || guessPlatform(o.file) || 'win64'
    let fileName = `depot_${id}_${platform}.vdf`
    // 极端情况：两个文件同一个 DepotID
    if (usedNames.has(fileName)) fileName = `depot_${id}_${platform}_dup.vdf`
    usedNames.add(fileName)
    plan.push({ from: o.path, to: fileName, kind: 'depot', id, platform })
  }

  if (!plan.length) return { ok: false, error: '没有可收拢的文件' }

  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e) {
    return { ok: false, error: `建目录失败：${e.message}` }
  }

  const moved = []
  try {
    for (const item of plan) {
      fs.renameSync(item.from, path.join(dir, item.to))
      moved.push(item)
    }
  } catch (e) {
    // 搬到一半失败：把已经搬进去的搬回去，别留下半拉状态
    for (const item of moved) {
      try {
        fs.renameSync(path.join(dir, item.to), item.from)
      } catch {
        /* 尽力而为 */
      }
    }
    try {
      fs.rmdirSync(dir)
    } catch {
      /* 忽略 */
    }
    return { ok: false, error: `搬文件失败：${e.message}` }
  }

  // app vdf 里引用 depot 的写法有三种：裸文件名、绝对路径、正斜杠绝对路径。
  // 三种都要改，而且统一改成「裸文件名」—— Valve 自己的模板就是这么写的，
  // depot 脚本路径按 app vdf 所在目录解析，将来整个 scripts 目录搬走也不会失效。
  let rewritten = null
  const appIn = plan.find((x) => x.kind === 'app')
  if (appIn) {
    const appPath = path.join(dir, appIn.to)
    try {
      let text = readText(appPath) || ''
      for (const item of plan) {
        if (item.kind !== 'depot') continue
        const oldName = orphans.find((o) => o.path === item.from).file
        const abs = path.join(p.scriptsDir, oldName)
        text = text.split(abs).join(item.to)
        text = text.split(abs.replace(/\\/g, '/')).join(item.to)
        text = text.split(oldName).join(item.to)
      }
      fs.writeFileSync(appPath, text, 'utf8')
      rewritten = appIn.to
    } catch (e) {
      return {
        ok: true,
        dirName: name,
        moved,
        warning: `文件已搬好，但 app vdf 里的引用没改成功：${e.message}`
      }
    }
  }

  return {
    ok: true,
    dirName: name,
    moved: moved.map((m) => ({ file: m.to, kind: m.kind, id: m.id })),
    rewritten,
    leftBehind: scanOrphans(settings).map((o) => o.file)
  }
}

/** 删除 scripts\<App>\_preview_*.vdf 临时文件 */
export function cleanupPreviewArtifacts(appDirName, settings) {
  const dir = path.join(getPaths(settings).scriptsDir, appDirName)
  let removed = 0
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('_preview_') && f.toLowerCase().endsWith('.vdf')) {
        fs.unlinkSync(path.join(dir, f))
        removed++
      }
    }
  } catch {
    /* 目录不存在等，忽略 */
  }
  return removed
}

/* ------------------------------------------------------------------ *
 *  修改 / 新建 vdf
 *  写回一律走 vdf-edit.js 的行级替换，注释和排版都保留。
 * ------------------------------------------------------------------ */

/** 把值包成 VDF 字面量并转义成正则，用来在文本里精确找一行 */
function lit(s) {
  return `"${String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
}

/** scripts 目录下的路径安全检查 */
function safeInScripts(file, settings) {
  const root = path.resolve(getPaths(settings).scriptsDir)
  const target = path.resolve(file)
  if (!target.startsWith(root + path.sep)) throw new Error(`拒绝访问 scripts 之外的路径：${target}`)
  return target
}

/**
 * 这个目录是不是在 buildsRoot 里面。
 * 删内容目录之前必须过这一关 —— 万一 vdf 里的 contentroot 被填成 C:\ 之类，
 * 没有这道检查就会把整个盘删掉。
 */
function isInsideBuildsRoot(dir, settings) {
  const base = settings?.buildsRoot
  if (!base || !dir) return false
  const b = path.resolve(base)
  const t = path.resolve(dir)
  return t !== b && t.startsWith(b + path.sep)
}

/**
 * 真正把内容目录建出来。
 * 建了之后 check.ps1 就不会再报 ContentRoot 不存在，而且 Unity 打包面板
 * 可以直接把 -outputDirectory 指向这里（模式选 DirectFolder）。
 * 故意不往里放任何占位文件 —— 放了就会被当成内容上传到 Steam。
 */
function ensureContentDir(dir) {
  if (!dir) return { path: dir, created: false }
  if (fs.existsSync(dir)) return { path: dir, created: false }
  try {
    fs.mkdirSync(dir, { recursive: true })
    return { path: dir, created: true }
  } catch (e) {
    return { path: dir, created: false, error: e.message }
  }
}

/**
 * 把一个 App 下每个 Depot 的内容目录重排成「项目文件夹\<平台后缀>」。
 *
 * 一个 App 一个项目文件夹、各平台在它下面分子目录（AbyaDemo\win64、AbyaDemo\macos…），
 * 这是 Steam 的原生玩法。换了项目文件夹之后各 Depot 的路径必须跟着走，
 * 否则它们还指着旧地方，构建时读到的是过期的内容。
 */
export function syncDepotRoots(appDirName, projectDir, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const base = String(projectDir ?? app.contentRoot ?? '').trim()
  if (!base) return { ok: false, error: '项目文件夹是空的' }

  const same = (a, b) =>
    path.resolve(String(a || '')).replace(/[\\/]+$/, '').toLowerCase() ===
    path.resolve(String(b || '')).replace(/[\\/]+$/, '').toLowerCase()

  const changed = []
  const dirsCreated = []
  // 项目文件夹本身也要落进 app vdf —— 界面上那一格读的就是它。
  // 不写的话用户点完「重排」再打开编辑，项目文件夹还是空的。
  if (!same(app.contentRoot, base)) {
    const ra = updateAppFields(appDirName, { contentRoot: base }, settings)
    if (!ra.ok) return { ok: false, error: ra.error }
  }
  for (const d of app.depots) {
    if (d.missing) continue
    const want = path.join(base, platformById(d.platform).suffix)
    if (same(d.contentRoot, want)) continue
    const r = updateDepotFields(appDirName, d.file, { contentRoot: want }, settings)
    if (!r.ok) return { ok: false, error: r.error }
    const m = ensureContentDir(want)
    if (m.created) dirsCreated.push(want)
    changed.push({ depotId: d.id, platform: d.platform, from: d.contentRoot, to: want })
  }
  ensureContentDir(base)
  return { ok: true, projectDir: base, changed, dirsCreated }
}

export function suggestDepotId(appId) {
  const n = Number(appId)
  return Number.isFinite(n) && n > 0 ? String(n + 1) : ''}

export function defaultContentRoot(name, platform, settings) {
  const base = settings?.buildsRoot || 'D:\\SteamBuilds'
  return path.join(base, name, platformById(platform).suffix)
}

/**
 * App 的项目文件夹：一个 App 一个，各平台的构建都在它下面。
 *   D:\SteamBuilds\AbyaDemo          ← 项目文件夹（app vdf 的 ContentRoot）
 *   D:\SteamBuilds\AbyaDemo\win64    ← depot 3036851 的 contentroot
 *   D:\SteamBuilds\AbyaDemo\macos    ← depot 3036853 的 contentroot
 * 这就是 Steam 的原生玩法：一个 App 挂多个平台 Depot，一次 run_app_build 全传。
 */
export function defaultProjectDir(name, settings) {
  const base = settings?.buildsRoot || 'D:\\SteamBuilds'
  return path.join(base, name)
}

/** 改 app vdf 的字段：appId / desc / contentRoot / buildOutput / setLive / verbose / local */
export function updateAppFields(appDirName, patch, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  let text = readText(app.appPath)
  if (text == null) return { ok: false, error: `读取失败 ${app.appPath}` }

  const changed = []
  for (const [field, key] of [
    ['appId', 'AppID'],
    ['desc', 'Desc'],
    ['contentRoot', 'ContentRoot'],
    ['buildOutput', 'BuildOutput'],
    ['setLive', 'SetLive']
  ]) {
    if (!(field in patch)) continue
    const r = setField(text, key, patch[field] == null ? '' : String(patch[field]))
    text = r.text
    if (r.changed) changed.push(key)
  }
  if ('verbose' in patch) {
    const r = setField(text, 'verbose', patch.verbose ? '1' : '0')
    text = r.text
    if (r.changed) changed.push('verbose')
  }
  if ('local' in patch) {
    // 传空 = 把这一行注释回去。绝不能留下 "Local" "" —— 那会让 run_app_build
    // 以为要往空路径的本地服务器上传。
    const r = setField(text, 'Local', patch.local ? String(patch.local) : '')
    text = r.text
    if (r.changed) changed.push('Local')
  }

  // 注释是自愈的：就算字段没变，只要注释和当前 depot 列表对不上就顺手修掉
  const noted = refreshAppNotes(text, depotNotes(app))
  if (!changed.length && noted === text) return { ok: true, changed: false, changedKeys: [] }
  text = noted
  fs.writeFileSync(safeInScripts(app.appPath, settings), text, 'utf8')
  return { ok: true, changed: true, changedKeys: changed }
}

/** 给 refreshAppNotes 用的「当前 depot 列表」摘要 */
function depotNotes(app, extra = [], drop = []) {
  const dropSet = new Set(drop)
  const files = [
    ...app.depots.map((d) => d.file),
    ...extra.map((e) => e.file)
  ].filter((f) => f && !dropSet.has(f))
  return {
    depotCount: files.length,
    platforms: files.map((f) => guessPlatform(f)).filter(Boolean)
  }
}

/**
 * 改 depot vdf 的字段：depotId / contentRoot / platform / exclusions
 * depotId 或平台变了会连带重命名文件，并同步 app vdf 里的 Depots 映射。
 */
export function updateDepotFields(appDirName, depotFile, patch, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const depot = app.depots.find((d) => d.file === depotFile)
  if (!depot) return { ok: false, error: `找不到 depot 脚本 ${depotFile}` }
  if (depot.missing) return { ok: false, error: `${depotFile} 不存在` }

  const srcPath = safeInScripts(path.join(app.dir, depotFile), settings)
  let text = readText(srcPath)
  if (text == null) return { ok: false, error: `读取失败 ${srcPath}` }

  const newId = patch.depotId != null ? String(patch.depotId).trim() : depot.id
  if (patch.depotId != null) {
    if (!/^\d+$/.test(newId)) return { ok: false, error: 'DepotID 必须是数字' }
    text = setField(text, 'DepotID', newId).text
  }
  if (patch.contentRoot != null) {
    text = setField(text, 'contentroot', String(patch.contentRoot)).text
  }
  if (Array.isArray(patch.exclusions)) {
    text = setList(text, 'FileExclusion', patch.exclusions).text
  }
  if (Array.isArray(patch.userConfig)) {
    text = setUserConfig(text, patch.userConfig).text
  }

  const platform = patch.platform || guessPlatform(depotFile) || 'win64'
  const newFile = `depot_${newId}_${platformById(platform).suffix}.vdf`
  const renamed = newFile !== depotFile

  fs.writeFileSync(renamed ? safeInScripts(path.join(app.dir, newFile), settings) : srcPath, text, 'utf8')
  if (renamed) {
    try {
      fs.unlinkSync(srcPath)
    } catch {
      /* ignore */
    }
  }

  if (renamed || newId !== depot.id) {
    let appText = readText(app.appPath)
    const re = new RegExp(`^([ \\t]*)${lit(depot.id)}([ \\t]+)${lit(depotFile)}([ \\t]*)$`, 'm')
    if (re.test(appText)) {
      appText = appText.replace(re, (...m) => `${m[1]}"${newId}"${m[2]}"${newFile}"${m[3]}`)
      fs.writeFileSync(safeInScripts(app.appPath, settings), appText, 'utf8')
    } else {
      return { ok: false, error: `app 脚本里找不到 depot 映射行，文件已改名但引用没更新` }
    }
  }

  return { ok: true, changed: true, file: newFile, renamed }
}

/** 给已有 App 加一个 depot（多平台就是这么加的） */
export function addDepot(appDirName, spec, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const depotId = String(spec.depotId ?? '').trim()
  if (!/^\d+$/.test(depotId)) return { ok: false, error: 'DepotID 必须是数字' }
  if (app.depots.some((d) => d.id === depotId)) {
    return { ok: false, error: `Depot ${depotId} 已经在这个 App 里了` }
  }

  // 后台新建 Depot 时选的是「操作系统 + 架构」，本地平台 id 由这两项推出来
  const fromOs = spec.os ? platformFromOsArch(spec.os, spec.arch) : null
  const platform = fromOs || spec.platform || 'win64'
  if (!spec.allowDuplicatePlatform && app.depots.some((d) => d.platformId === platform)) {
    const label = platformById(platform).label
    return { ok: false, error: `这个 App 已经有 ${label} 的 Depot 了`, duplicatePlatform: true, platform }
  }
  const file = `depot_${depotId}_${platformById(platform).suffix}.vdf`
  const full = safeInScripts(path.join(app.dir, file), settings)
  if (fs.existsSync(full)) return { ok: false, error: `文件已存在：${file}` }

  const contentRoot = spec.contentRoot || defaultContentRoot(appDirName, platform, settings)
  fs.writeFileSync(
    full,
    renderDepotVdf({
      depotId,
      platform,
      contentRoot,
      playerName: spec.playerName || '',
      exclusions: spec.exclusions || defaultExclusionsFor(platform)
    }),
    'utf8'
  )

  const appText = readText(app.appPath)
  const r = insertIntoBlock(appText, 'Depots', `\t\t"${depotId}"\t"${file}"`)
  if (!r.changed) {
    try {
      fs.unlinkSync(full)
    } catch {
      /* ignore */
    }
    return { ok: false, error: 'app 脚本里找不到 Depots 块，已回滚' }
  }
  fs.writeFileSync(
    safeInScripts(app.appPath, settings),
    refreshAppNotes(r.text, depotNotes(app, [{ file }])),
    'utf8'
  )

  // 后台那几项存进 settings（vdf 里没有对应字段），界面靠它显示名称/语言
  const oa = osArchFromPlatform(platform)
  setDepotMeta(depotId, {
    name: spec.name || '',
    language: spec.language || 'all',
    os: spec.os || oa.os,
    arch: spec.arch || oa.arch
  })

  // 内容目录也一并建出来，不要留一个「配好了但目录不存在」的状态
  const made = ensureContentDir(contentRoot)

  return { ok: true, file, contentRoot, platform, contentDirCreated: made.created, contentDirError: made.error }
}

/** 从 App 里移除一个 depot */
export function removeDepot(appDirName, depotFile, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const depot = app.depots.find((d) => d.file === depotFile)
  if (!depot) return { ok: false, error: `找不到 depot ${depotFile}` }
  if (app.depots.length <= 1) return { ok: false, error: '至少要保留一个 depot' }

  let appText = readText(app.appPath)
  const line = `"${depot.id}"\t"${depotFile}"`
  const r = removeLine(appText, line)
  if (!r.changed) {
    // 缩进可能不同，退一步按正则删
    const re = new RegExp(`^[ \\t]*${lit(depot.id)}[ \\t]+${lit(depotFile)}[ \\t]*\\r?\\n?`, 'm')
    const out = appText.replace(re, '')
    if (out === appText) return { ok: false, error: 'app 脚本里找不到这行 depot 映射' }
    appText = out
  } else {
    appText = r.text
  }
  fs.writeFileSync(
    safeInScripts(app.appPath, settings),
    refreshAppNotes(appText, depotNotes(app, [], [depotFile])),
    'utf8'
  )

  try {
    fs.unlinkSync(safeInScripts(path.join(app.dir, depotFile), settings))
  } catch {
    /* ignore */
  }
  return { ok: true }
}

/** App 名字 = scripts 下的文件夹名。校验规则两处共用（新建 / 改名）。 */
export function validateAppName(name) {
  const n = String(name || '').trim()
  if (!n) return { ok: false, error: '名字不能为空' }
  if (n.startsWith('_')) return { ok: false, error: '名字不能以下划线开头（_ 开头的目录会被扫描跳过）' }
  if (/[\\/:*?"<>|]/.test(n)) return { ok: false, error: '名字里不能有 \\ / : * ? " < > | 这些字符' }
  if (!/^[\w\u4e00-\u9fa5.-]+$/.test(n)) {
    return { ok: false, error: '名字只能用字母、数字、下划线、点、横线或中文' }
  }
  if (n === '.' || n === '..') return { ok: false, error: '名字不合法' }
  if (n.length > 64) return { ok: false, error: '名字太长了（最多 64 字）' }
  return { ok: true, name: n }
}

/** 给 App 改名：scripts 下的文件夹跟着一起改。 */
export function renameApp(appDirName, newName, settings) {
  const p = getPaths(settings)
  const oldDir = path.join(p.scriptsDir, appDirName)
  if (!fs.existsSync(oldDir)) return { ok: false, error: `找不到 ${appDirName}` }

  const check = validateAppName(newName)
  if (!check.ok) return { ok: false, error: check.error }
  const name = check.name

  if (name === appDirName) return { ok: true, changed: false, dirName: name }

  const newDir = path.join(p.scriptsDir, name)
  if (fs.existsSync(newDir)) return { ok: false, error: `已经存在同名的 App：${name}` }

  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  try {
    fs.renameSync(oldDir, newDir)
  } catch (e) {
    return { ok: false, error: `重命名失败：${e.message}` }
  }

  // 内容目录不受影响：vdf 里写的是绝对路径，跟文件夹名无关。
  // Steam 那边更不关心本地文件夹叫什么 —— 只有 AppID 有意义。
  return { ok: true, changed: true, dirName: name, oldDirName: appDirName, appId: app.appId }
}

/** 新建一个 App（向导背后就是它） */
export function createApp(spec, settings) {
  const p = getPaths(settings)

  const nameCheck = validateAppName(spec.name)
  if (!nameCheck.ok) return { ok: false, error: nameCheck.error }
  const name = nameCheck.name

  const appId = String(spec.appId ?? '').trim()
  if (!/^\d+$/.test(appId)) return { ok: false, error: 'AppID 必须是数字' }

  const dir = path.join(p.scriptsDir, name)
  if (fs.existsSync(dir)) return { ok: false, error: `已经存在同名的 App：${name}` }

  const specs = Array.isArray(spec.depots) && spec.depots.length ? spec.depots : [{ platform: 'win64' }]
  // 项目文件夹：各平台构建的父目录。默认 D:\SteamBuilds\<App名>，
  // 各 depot 默认取它下面的平台子目录（\win64、\macos …）。
  const projectDir =
    String(spec.projectDir ?? spec.contentRoot ?? '').trim() || defaultProjectDir(name, settings)
  const depots = []
  for (const d of specs) {
    const depotId = String(d.depotId ?? '').trim()
    if (!/^\d+$/.test(depotId)) return { ok: false, error: 'DepotID 必须是数字' }
    if (depots.some((x) => x.id === depotId)) return { ok: false, error: `DepotID 重复：${depotId}` }
    const platform = d.platform || 'win64'
    if (depots.some((x) => x.platform === platform)) {
      return { ok: false, error: `同一个 App 里 ${platformById(platform).label} 只能有一个 Depot` }
    }
    depots.push({
      id: depotId,
      platform,
      file: `depot_${depotId}_${platformById(platform).suffix}.vdf`,
      contentRoot:
        String(d.contentRoot ?? '').trim() || path.join(projectDir, platformById(platform).suffix)
    })
  }

  try {
    fs.mkdirSync(dir, { recursive: true })
    for (const d of depots) {
      fs.writeFileSync(
        path.join(dir, d.file),
        renderDepotVdf({
          depotId: d.id,
          platform: d.platform,
          contentRoot: d.contentRoot,
          playerName: spec.playerName || '',
          exclusions: defaultExclusionsFor(d.platform),
          userConfig: Array.isArray(d.userConfig) ? d.userConfig : []
        }),
        'utf8'
      )
    }
    fs.writeFileSync(
      path.join(dir, `app_${appId}.vdf`),
      renderAppVdf({
        appId,
        name,
        desc: spec.desc || '',
        contentRoot: projectDir,
        // 构建缓存按 App 分开：共用一个目录时，两个 App 的缓存会互相干扰，
        // 增量上传也会算错。Valve 模板的注释也提到缓存分开能更快。
        buildOutput: String(spec.buildOutput ?? '').trim() || path.join(p.outputDir, name),
        setLive: spec.setLive || '',
        verbose: !!spec.verbose,
        depots
      }),
      'utf8'
    )
  } catch (e) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    return { ok: false, error: `创建失败：${e.message}` }
  }

  // 项目文件夹和各平台子目录都建出来。用户要的就是「新建 App 的时候把对应文件夹
  // 也建好」，不然建完立刻显示目录不存在。
  const projectMade = ensureContentDir(projectDir)
  const contentDirs = depots.map((d) => {
    const made = ensureContentDir(d.contentRoot)
    return { depotId: d.id, platform: d.platform, ...made }
  })

  return {
    ok: true,
    dirName: name,
    appId,
    scriptsDir: dir,
    projectDir,
    projectDirCreated: projectMade.created,
    depots,
    contentDirs
  }
}

/**
 * 给已经存在的 App 补建内容目录。
 * 新建流程本来就会建，这个是给「早先建的、目录还不存在」的配置用的，
 * 免得用户非得手改 vdf 或者去资源管理器里手动 mkdir。
 */
export function ensureDepotContentDir(appDirName, depotFile, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const depot = app.depots.find((d) => d.file === depotFile)
  if (!depot) return { ok: false, error: `找不到 depot ${depotFile}` }
  if (!depot.contentRoot) return { ok: false, error: '这个 depot 没有设置内容目录' }

  const made = ensureContentDir(depot.contentRoot)
  if (made.error) return { ok: false, error: made.error }
  return { ok: true, contentRoot: made.path, created: made.created }
}

/* ------------------------------------------------------------------ *
 *  删除 App
 * ------------------------------------------------------------------ */
/** 先算清楚会删掉什么，让确认框能显示真实数字 */
export function describeDelete(appDirName, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  let scriptFiles = 0
  let scriptBytes = 0
  try {
    for (const f of walk(app.dir)) {
      scriptFiles++
      scriptBytes += f.size
    }
  } catch {
    /* ignore */
  }

  const content = app.depots.map((d) => {
    const cr = d.contentRoot
    const exists = !!cr && fs.existsSync(cr)
    const a = d.analysis || {}
    return {
      depotId: d.id,
      platform: d.platform,
      path: cr,
      exists,
      files: a.fileCount || 0,
      bytes: a.totalBytes || 0,
      // 只有位于 buildsRoot 里面的目录才允许删
      deletable: exists && isInsideBuildsRoot(cr, settings)
    }
  })

  return {
    ok: true,
    dirName: app.dirName,
    appId: app.appId,
    scripts: { path: app.dir, files: scriptFiles, bytes: scriptBytes },
    content
  }
}

/**
 * 删掉一个 App。
 * 默认只删 scripts 下的脚本目录；内容目录要显式 deleteContent 才动，
 * 而且必须位于 buildsRoot 之内 —— 构建产物是最贵的东西，不能手滑删掉。
 */
export function deleteApp(appDirName, { deleteContent = false } = {}, settings) {
  const app = readApp(appDirName, settings)
  if (app.error) return { ok: false, error: app.error }

  const removed = { scripts: [], content: [], skipped: [] }

  if (deleteContent) {
    for (const d of app.depots) {
      const cr = d.contentRoot
      if (!cr || !fs.existsSync(cr)) continue
      if (!isInsideBuildsRoot(cr, settings)) {
        removed.skipped.push(cr)
        continue
      }
      try {
        fs.rmSync(cr, { recursive: true, force: true })
        removed.content.push(cr)
      } catch (e) {
        removed.skipped.push(`${cr}（${e.message}）`)
      }
    }
  }

  try {
    removed.scripts = fs.readdirSync(app.dir)
    fs.rmSync(app.dir, { recursive: true, force: true })
  } catch (e) {
    return { ok: false, error: `删除脚本目录失败：${e.message}` }
  }

  return { ok: true, dirName: appDirName, appId: app.appId, removed }
}

/* --- BranchPanel 用的两个薄封装 --- */

export function setAppBranch(appDirName, branch, settings) {
  return updateAppFields(appDirName, { setLive: branch || '' }, settings)
}

/* ------------------------------------------------------------------ *
 *  构建历史
 * ------------------------------------------------------------------ */

export function listHistory(settings) {
  const p = getPaths(settings)
  const items = []
  if (!fs.existsSync(p.outputDir)) return items

  const dirs = [p.outputDir]
  for (const e of fs.readdirSync(p.outputDir, { withFileTypes: true })) {
    if (e.isDirectory()) dirs.push(path.join(p.outputDir, e.name))
  }

  for (const dir of dirs) {
    let files = []
    try {
      files = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.toLowerCase().endsWith('.log')) continue
      const full = path.join(dir, f.name)
      let st
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      items.push({
        file: full,
        name: f.name,
        group: path.basename(dir) === 'output' ? '最近' : path.basename(dir),
        size: st.size,
        mtime: st.mtimeMs
      })
    }
  }

  return items.sort((a, b) => b.mtime - a.mtime)
}

export function readLog(file, maxBytes = 512 * 1024) {
  try {
    const st = fs.statSync(file)
    if (st.size <= maxBytes) return fs.readFileSync(file, 'utf8')
    // 只读尾部，避免几 MB 的日志把渲染进程卡住
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(maxBytes)
    fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes)
    fs.closeSync(fd)
    return `…（仅显示最后 ${Math.round(maxBytes / 1024)} KB）…\n` + buf.toString('utf8')
  } catch (e) {
    return `读取日志失败：${e.message}`
  }
}
