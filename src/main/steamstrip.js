import fs from 'node:fs'
import path from 'node:path'

/**
 * 剥离 Steam 运行库。
 *
 * 干什么：把内容目录里的 steam_api64.dll / steam_api.dll / libsteam_api.so /
 * libsteam_api.dylib（可选再加 steam_appid.txt）挪到**内容目录外面**的备份文件夹，
 * 游戏启动时就加载不到 Steam 的 DLL，不会再连 Steam。
 *
 * 为什么不删：挪走能一键还原，而且备份在内容目录外（同级 `.steam-strip` 目录），
 * 不会被 SteamPipe 当内容上传。
 *
 * 为什么保留托管 DLL：com.rlabrecque.steamworks.net.dll / FizzySteamworks.dll 是
 * 游戏程序集引用的，删了会在启动加载程序集时就报错；原生 DLL 挪走后游戏代码里
 * 那次 P/Invoke 抛 DllNotFoundException，游戏自己会记日志并继续跑（Loopstructor
 * 的 SteamManager.Awake 就是这种结构），保留托管 DLL 才是安全的做法。
 */

/** 原生 Steam 运行库：挪走这些，启动就不再绑定 Steam */
const NATIVE = new Set([
  'steam_api64.dll',
  'steam_api.dll',
  'libsteam_api.so',
  'libsteam_api.dylib'
])

/** steam_appid.txt：有它时 SteamAPI_Init 会拿它写死的 AppID 绑 Steam */
const CONFIG = new Set(['steam_appid.txt'])

/** 托管 DLL：只报告，不碰 */
const MANAGED = new Set([
  'com.rlabrecque.steamworks.net.dll',
  'steamworks.net.dll',
  'fizzysteamworks.dll'
])

/** 扫描时不下钻的目录：备份、源码管理、依赖 */
const SKIP_DIRS = new Set(['.steam-strip', '.git', 'node_modules'])

const MAX_ENTRIES = 400000
const BACKUP_DIR_NAME = '.steam-strip'

function kindOf(name) {
  const lower = String(name || '').toLowerCase()
  if (NATIVE.has(lower)) return 'native'
  if (CONFIG.has(lower)) return 'config'
  if (MANAGED.has(lower)) return 'managed'
  return null
}

/** 绝对路径 + 基本安全检查：必须是已存在的文件夹，且不能是盘符根目录 */
function checkedRoot(root) {
  const abs = path.resolve(String(root || '').trim())
  if (!abs) throw new Error('没有内容目录')
  if (path.dirname(abs) === abs) throw new Error('不能对整个盘符做剥离，请指定具体的内容目录')
  let st
  try {
    st = fs.statSync(abs)
  } catch {
    throw new Error(`目录不存在：${abs}`)
  }
  if (!st.isDirectory()) throw new Error(`不是文件夹：${abs}`)
  return abs
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

/** 递归找 steam 相关文件。跳过符号链接，避免扫到目录外面去 */
function walkSteamFiles(root) {
  const out = { files: [], links: 0, scanned: 0, truncated: false, errors: [] }
  const stack = [{ dir: root, rel: '' }]
  while (stack.length) {
    const { dir, rel } = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      out.errors.push({ rel: rel || '.', error: e.message })
      continue
    }
    for (const ent of entries) {
      const relPath = rel ? `${rel}/${ent.name}` : ent.name
      const full = path.join(dir, ent.name)
      if (ent.isSymbolicLink()) {
        out.links++
        continue
      }
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name.toLowerCase())) stack.push({ dir: full, rel: relPath })
        continue
      }
      if (!ent.isFile()) continue
      out.scanned++
      if (out.scanned > MAX_ENTRIES) {
        out.truncated = true
        return out
      }
      const kind = kindOf(ent.name)
      if (!kind) continue
      let size = 0
      try {
        size = fs.statSync(full).size
      } catch {
        /* 读不到大小不影响剥离，按 0 记 */
      }
      out.files.push({ rel: relPath, size, kind, name: ent.name })
    }
  }
  return out
}

function backupRootFor(root) {
  // 放在内容目录的同级，不进内容目录 —— 不然会被 run_app_build 当内容上传
  return path.join(path.dirname(root), BACKUP_DIR_NAME)
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json')
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  try {
    const m = JSON.parse(text)
    if (!m || typeof m !== 'object') return null
    if (typeof m.originalRoot !== 'string' || !m.originalRoot) return null
    if (!Array.isArray(m.files)) return null
    return m
  } catch {
    return null
  }
}

/** 只接受备份里相对、正常、不越狱的路径 */
function safeRel(rel) {
  const s = String(rel || '').replace(/\\/g, '/')
  if (!s || path.isAbsolute(s)) return null
  const parts = s.split('/')
  if (parts.some((x) => !x || x === '.' || x === '..')) return null
  if (parts[0].toLowerCase() === BACKUP_DIR_NAME) return null
  return s
}

function moveFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try {
    fs.renameSync(from, to)
  } catch (e) {
    // 备份目录和内容目录不在同一个盘时 rename 会失败
    if (e.code === 'EXDEV') {
      fs.copyFileSync(from, to)
      fs.unlinkSync(from)
      return
    }
    throw e
  }
}

function uniqueDir(base) {
  let dir = base
  let i = 1
  while (fs.existsSync(dir)) {
    i++
    dir = `${base}-${i}`
  }
  return dir
}

/**
 * 扫描一个内容目录里的 Steam 相关文件（只看不动），并且列出这个目录已有的备份。
 */
export function scanSteamFiles(root) {
  const abs = checkedRoot(root)
  const found = walkSteamFiles(abs)
  const native = found.files.filter((f) => f.kind === 'native')
  const config = found.files.filter((f) => f.kind === 'config')
  const managed = found.files.filter((f) => f.kind === 'managed')
  const sum = (list) => list.reduce((n, f) => n + (Number(f.size) || 0), 0)
  return {
    ok: true,
    root: abs,
    exists: true,
    native,
    config,
    managed,
    nativeBytes: sum(native),
    configBytes: sum(config),
    managedBytes: sum(managed),
    totalFiles: found.files.length,
    scannedFiles: found.scanned,
    links: found.links,
    truncated: found.truncated,
    errors: found.errors,
    backupRoot: backupRootFor(abs),
    backups: listBackupsFor(abs)
  }
}

function listBackupsFor(root) {
  const dir = backupRootFor(root)
  let names
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const ent of names) {
    if (!ent.isDirectory()) continue
    const full = path.join(dir, ent.name)
    const m = readManifest(full)
    if (!m) continue
    if (path.resolve(m.originalRoot) !== root) continue
    const files = m.files
      .map((f) => ({ ...f, rel: safeRel(f.rel) }))
      .filter((f) => f.rel)
    const bytes = files.reduce((n, f) => n + (Number(f.size) || 0), 0)
    out.push({
      backupDir: full,
      name: ent.name,
      createdAt: m.createdAt || '',
      stamp: m.stamp || '',
      files: files.length,
      bytes,
      removeConfig: m.removeConfig !== false,
      appId: m.appId || '',
      depotId: m.depotId || '',
      depotFile: m.depotFile || ''
    })
  }
  out.sort((a, b) => String(b.stamp || b.createdAt).localeCompare(String(a.stamp || a.createdAt)))
  return out
}

/**
 * 执行剥离：把原生 Steam 运行库（可选 steam_appid.txt）挪到备份目录。
 * removeConfig 默认 true —— 只挪 dll 也能不绑 Steam，但留着 steam_appid.txt
 * 没有意义，还会让人以为这个包「还是要 Steam」。
 */
export function stripSteamFiles({ root, removeConfig = true, meta = {} } = {}) {
  const abs = checkedRoot(root)
  const scan = scanSteamFiles(abs)
  const candidates = [...scan.native, ...(removeConfig ? scan.config : [])]
  if (!candidates.length) {
    return {
      ok: true,
      root: abs,
      moved: [],
      failed: [],
      totalBytes: 0,
      keptManaged: scan.managed.length,
      alreadyStripped: true,
      backupDir: '',
      backups: scan.backups,
      message: scan.backups.length
        ? '这个目录里已经没有 Steam 运行库了（之前剥离过，可以还原）'
        : '这个目录里没有 Steam 运行库（steam_api64.dll / steam_api.dll / libsteam_api.so / libsteam_api.dylib）'
    }
  }

  const base = path.join(
    backupRootFor(abs),
    `${path.basename(abs)}-${stamp(new Date())}`
  )
  const backupDir = uniqueDir(base)
  fs.mkdirSync(backupDir, { recursive: true })

  const moved = []
  const failed = []
  for (const f of candidates) {
    try {
      moveFile(path.join(abs, f.rel), path.join(backupDir, f.rel))
      moved.push(f)
    } catch (e) {
      failed.push({ rel: f.rel, error: e.message })
    }
  }

  const createdAt = new Date().toISOString()
  const manifest = {
    version: 1,
    originalRoot: abs,
    createdAt,
    stamp: path.basename(backupDir),
    removeConfig: !!removeConfig,
    appId: meta.appId ? String(meta.appId) : '',
    appDirName: meta.appDirName ? String(meta.appDirName) : '',
    depotId: meta.depotId ? String(meta.depotId) : '',
    depotFile: meta.depotFile ? String(meta.depotFile) : '',
    files: moved.map((f) => ({ rel: f.rel, size: f.size, kind: f.kind })),
    keptManaged: scan.managed.map((f) => f.rel),
    failed
  }
  try {
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  } catch (e) {
    failed.push({ rel: 'manifest.json', error: e.message })
  }

  return {
    ok: true,
    root: abs,
    backupDir,
    moved,
    failed,
    totalBytes: moved.reduce((n, f) => n + (Number(f.size) || 0), 0),
    keptManaged: scan.managed.length,
    keptManagedFiles: scan.managed,
    removeConfig: !!removeConfig,
    createdAt,
    alreadyStripped: false,
    backups: listBackupsFor(abs)
  }
}

/**
 * 还原一个备份：把备份里的文件搬回原内容目录。
 * 原位置已经有同名文件时不动它们，列在 conflicts 里（不覆盖）。
 */
export function restoreSteamBackup({ backupDir } = {}) {
  const dir = path.resolve(String(backupDir || '').trim())
  let st
  try {
    st = fs.statSync(dir)
  } catch {
    return { ok: false, error: `备份目录不存在：${dir}` }
  }
  if (!st.isDirectory()) return { ok: false, error: `不是文件夹：${dir}` }

  const manifest = readManifest(dir)
  if (!manifest) return { ok: false, error: '这个备份里没有 manifest.json，不像是本工具做的备份' }

  const originalRoot = path.resolve(manifest.originalRoot)
  if (!fs.existsSync(originalRoot)) {
    return { ok: false, error: `原内容目录已经不在了：${originalRoot}` }
  }

  const restored = []
  const conflicts = []
  const failed = []
  for (const f of manifest.files) {
    const rel = safeRel(f.rel)
    if (!rel) {
      failed.push({ rel: f.rel, error: '路径不合法' })
      continue
    }
    const from = path.join(dir, rel)
    const to = path.join(originalRoot, rel)
    if (!fs.existsSync(from)) {
      failed.push({ rel, error: '备份里这个文件不见了' })
      continue
    }
    if (fs.existsSync(to)) {
      conflicts.push(rel)
      continue
    }
    try {
      moveFile(from, to)
      restored.push(rel)
    } catch (e) {
      failed.push({ rel, error: e.message })
    }
  }

  let removedBackup = false
  if (!conflicts.length && !failed.length) {
    try {
      fs.unlinkSync(path.join(dir, 'manifest.json'))
    } catch {
      /* 已经没了就不用管 */
    }
    // backupDir 剩下的空目录一并清掉；.steam-strip 空了也一起删
    removeEmptyDirs(dir)
    removedBackup = !fs.existsSync(dir)
    if (removedBackup) removeEmptyDirs(path.dirname(dir))
  }

  return {
    ok: true,
    restored: restored.length,
    restoredFiles: restored,
    conflicts,
    failed,
    originalRoot,
    backupDir: dir,
    removedBackup
  }
}

function removeEmptyDirs(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const full = path.join(dir, ent.name)
    removeEmptyDirs(full)
    try {
      if (!fs.readdirSync(full).length) fs.rmdirSync(full)
    } catch {
      /* 删不掉就留着 */
    }
  }
  try {
    if (!fs.readdirSync(dir).length) fs.rmdirSync(dir)
  } catch {
    /* 删不掉就留着 */
  }
}

/** 给「已有备份」列表用：直接按内容目录列 */
export function listSteamBackups({ root } = {}) {
  try {
    const abs = checkedRoot(root)
    return { ok: true, root: abs, backupRoot: backupRootFor(abs), backups: listBackupsFor(abs) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 显示用：备份目录里的文件清单（给「查看备份里有什么」） */
export function readSteamBackup({ backupDir } = {}) {
  const dir = path.resolve(String(backupDir || '').trim())
  const manifest = readManifest(dir)
  if (!manifest) return { ok: false, error: '这个备份里没有 manifest.json' }
  const files = []
  for (const f of manifest.files) {
    const rel = safeRel(f.rel)
    if (!rel) continue
    let exists = false
    let size = 0
    try {
      size = fs.statSync(path.join(dir, rel)).size
      exists = true
    } catch {
      /* 备份文件被手动挪走时按不存在显示 */
    }
    files.push({ rel, size, kind: f.kind, exists })
  }
  return { ok: true, backupDir: dir, originalRoot: manifest.originalRoot, createdAt: manifest.createdAt, removeConfig: manifest.removeConfig !== false, files }
}
