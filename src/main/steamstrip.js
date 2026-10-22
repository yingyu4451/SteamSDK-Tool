import fs from 'node:fs'
import path from 'node:path'

/**
 * 剥离 Steam：把一个打包好的游戏文件夹**复制**一份，副本里去掉 Steam 运行库。
 *
 * 复制而不是原地挪：原文件夹一个字节都不动，副本坏了直接删掉重来；
 * 副本里只少了 steam_api64.dll 这类原生运行库（可选再少 steam_appid.txt），
 * 游戏启动时 P/Invoke 抛 DllNotFoundException，Steam 初始化那段就中断了，
 * 不会再去连 Steam（Loopstructor 的 SteamManager.Awake 就是这种结构）。
 *
 * 托管 DLL（com.rlabrecque.steamworks.net.dll 等）要留着：游戏程序集还引用它们，
 * 删了会在加载程序集时就报错，那是启动失败，不是「不绑 Steam」。
 */

/** 原生 Steam 运行库：副本里去掉这些，启动就加载不到 Steam */
const NATIVE = new Set([
  'steam_api64.dll',
  'steam_api.dll',
  'libsteam_api.so',
  'libsteam_api.dylib'
])

/** steam_appid.txt：有它时 SteamAPI_Init 会拿它写死的 AppID 绑 Steam */
const CONFIG = new Set(['steam_appid.txt'])

/** 托管 DLL：保留，只做说明 */
const MANAGED = new Set([
  'com.rlabrecque.steamworks.net.dll',
  'steamworks.net.dll',
  'fizzysteamworks.dll'
])

/** 不复制、也不扫描的目录：旧备份目录、源码管理、依赖 */
const SKIP_DIRS = new Set(['.steam-strip', '.git', 'node_modules'])

const MAX_ENTRIES = 400000
const DEST_SUFFIX = '_NoSteam'

function kindOf(name) {
  const lower = String(name || '').toLowerCase()
  if (NATIVE.has(lower)) return 'native'
  if (CONFIG.has(lower)) return 'config'
  if (MANAGED.has(lower)) return 'managed'
  return null
}

/** 绝对路径 + 基本安全检查：必须是已存在的文件夹，且不能是盘符根目录 */
function checkedDir(dir, label = '文件夹') {
  const abs = path.resolve(String(dir || '').trim())
  if (!abs) throw new Error(`没有指定${label}`)
  if (path.dirname(abs) === abs) throw new Error(`${label}不能是整个盘符：${abs}`)
  let st
  try {
    st = fs.statSync(abs)
  } catch {
    throw new Error(`${label}不存在：${abs}`)
  }
  if (!st.isDirectory()) throw new Error(`不是文件夹：${abs}`)
  return abs
}

/** b 是否在 a 里面（含相等） */
function isInside(a, b) {
  const na = path.resolve(a)
  const nb = path.resolve(b)
  if (na === nb) return true
  return na.startsWith(nb.endsWith(path.sep) ? nb : nb + path.sep)
}

function sumBytes(list) {
  return list.reduce((n, f) => n + (Number(f.size) || 0), 0)
}

/** 目标文件夹默认放在源文件夹旁边：<名字>_NoSteam；重名就 -2、-3 */
function uniqueDest(base) {
  let dir = base
  let i = 1
  while (fs.existsSync(dir)) {
    i++
    dir = `${base}-${i}`
  }
  return dir
}

function defaultDestFor(root) {
  return uniqueDest(path.join(path.dirname(root), `${path.basename(root)}${DEST_SUFFIX}`))
}
/**
 * 给「选择副本位置」用：把副本放到用户选的父文件夹下，重名自动 -2、-3。
 * 父文件夹允许是盘符根目录（副本本身不能是）。
 */
export function suggestDest(parentDir, name) {
  const parent = path.resolve(String(parentDir || "").trim())
  if (!parent) throw new Error("没有指定父文件夹")
  let st
  try {
    st = fs.statSync(parent)
  } catch {
    throw new Error(`文件夹不存在：${parent}`)
  }
  if (!st.isDirectory()) throw new Error(`不是文件夹：${parent}`)
  const label = String(name || "").trim() || "Game"
  return uniqueDest(path.join(parent, `${label}${DEST_SUFFIX}`))
}

/**
 * 扫一遍：要复制的目录 / 文件、要剥掉的文件、要保留的托管 DLL。
 * 符号链接跳过（列在 links 里）—— 游戏包里基本不会有，跟着链接跑出去反而危险。
 */
function walkTree(root, removeConfig) {
  const dirs = []
  const files = []
  const stripped = []
  const managed = []
  const warnings = []
  let links = 0
  let scanned = 0
  let truncated = false
  const stack = [{ dir: root, rel: '' }]

  while (stack.length) {
    const { dir, rel } = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      warnings.push(`${rel || '.'}：${e.message}`)
      continue
    }
    for (const ent of entries) {
      const relPath = rel ? `${rel}/${ent.name}` : ent.name
      const full = path.join(dir, ent.name)
      if (ent.isSymbolicLink()) {
        links++
        continue
      }
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name.toLowerCase())) continue
        dirs.push({ rel: relPath })
        stack.push({ dir: full, rel: relPath })
        continue
      }
      if (!ent.isFile()) continue
      scanned++
      if (scanned > MAX_ENTRIES) {
        truncated = true
        break
      }
      const kind = kindOf(ent.name)
      let st
      try {
        st = fs.statSync(full)
      } catch (e) {
        warnings.push(`${relPath}：${e.message}`)
        continue
      }
      const item = { rel: relPath, size: st.size, kind, name: ent.name, mtimeMs: st.mtimeMs, atimeMs: st.atimeMs }
      if (kind === 'native') {
        stripped.push(item)
      } else if (kind === 'config') {
        if (removeConfig) stripped.push(item)
        else files.push(item)
      } else {
        if (kind === 'managed') managed.push(item)
        files.push(item)
      }
    }
    if (truncated) break
  }

  return { dirs, files, stripped, managed, warnings, links, truncated, totalBytes: sumBytes(files) }
}

/** 目标路径校验：不能和源一样、不能互相包含、不能已经存在 */
function checkedDest(srcAbs, dest) {
  const abs = path.resolve(String(dest || '').trim())
  if (!abs) throw new Error('没有指定副本位置')
  if (path.dirname(abs) === abs) throw new Error('副本位置不能是整个盘符')
  if (abs === srcAbs) throw new Error('副本位置不能和原文件夹一样')
  if (isInside(abs, srcAbs)) throw new Error('副本位置不能放在原文件夹里面')
  if (isInside(srcAbs, abs)) throw new Error('原文件夹不能放在副本位置里面')
  if (fs.existsSync(abs)) throw new Error(`副本位置已经存在：${abs}`)
  return abs
}

/**
 * 只看不动：这个文件夹里有什么、能剥掉什么、默认复制到哪。
 */
export function inspectFolder(root) {
  try {
    const abs = checkedDir(root)
    const probe = walkTree(abs, true)
    const native = probe.stripped.filter((f) => f.kind === 'native')
    const config = probe.stripped.filter((f) => f.kind === 'config')
    const managed = probe.managed
    return {
      ok: true,
      root: abs,
      name: path.basename(abs),
      native,
      config,
      managed,
      totalFiles: probe.files.length + probe.stripped.length,
      totalBytes: probe.totalBytes + sumBytes(probe.stripped),
      // 按「默认连 steam_appid.txt 一起剥」算的副本大小；不勾时再加上 config 的大小
      copyFiles: probe.files.length,
      copyBytes: probe.totalBytes,
      links: probe.links,
      warnings: probe.warnings,
      truncated: probe.truncated,
      defaultDest: defaultDestFor(abs),
      destSuffix: DEST_SUFFIX
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 复制 + 剥离。原文件夹完全不动；复制失败会把半成品副本删掉，不留不完整的包。
 *
 * onProgress({ copiedFiles, totalFiles, copiedBytes, totalBytes, rel }) 用来驱动进度条，
 * 主进程会把它转成 strip:progress 事件发回渲染层。
 */
export function copyAndStripFolder({ src, dest, removeConfig = true, onProgress } = {}) {
  const t0 = Date.now()
  let srcAbs
  let destAbs
  try {
    srcAbs = checkedDir(src, '原文件夹')
    destAbs = checkedDest(srcAbs, dest)
  } catch (e) {
    return { ok: false, error: e.message }
  }

  const plan = walkTree(srcAbs, removeConfig !== false)
  if (!plan.files.length && !plan.dirs.length) {
    return { ok: false, error: '原文件夹是空的，没什么可复制的' }
  }

  const totalFiles = plan.files.length
  const totalBytes = plan.totalBytes
  let created = false
  try {
    fs.mkdirSync(destAbs, { recursive: true })
    created = true
    for (const d of plan.dirs) fs.mkdirSync(path.join(destAbs, d.rel), { recursive: true })

    let copiedBytes = 0
    let lastEmit = 0
    for (let i = 0; i < plan.files.length; i++) {
      const f = plan.files[i]
      const from = path.join(srcAbs, f.rel)
      const to = path.join(destAbs, f.rel)
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      if (f.mtimeMs) {
        try {
          fs.utimesSync(to, new Date(f.atimeMs || f.mtimeMs), new Date(f.mtimeMs))
        } catch {
          /* 时间戳不是关键，失败就按现在的时间 */
        }
      }
      copiedBytes += Number(f.size) || 0
      const now = Date.now()
      if (now - lastEmit > 80 || i === plan.files.length - 1) {
        lastEmit = now
        try {
          onProgress?.({
            copiedFiles: i + 1,
            totalFiles,
            copiedBytes,
            totalBytes,
            rel: f.rel
          })
        } catch {
          /* 进度事件发不出去不影响复制 */
        }
      }
    }
  } catch (e) {
    // 复制到一半失败：把半成品删掉，别让用户以为副本是完整的
    let cleaned = false
    if (created) {
      try {
        fs.rmSync(destAbs, { recursive: true, force: true })
        cleaned = true
      } catch {
        /* 删不掉就留着，至少报出原始错误 */
      }
    }
    return {
      ok: false,
      error: `复制失败：${e.message}${cleaned ? '（半成品副本已删除）' : ''}`,
      src: srcAbs,
      dest: destAbs
    }
  }

  const stripped = plan.stripped
  const warning = stripped.length
    ? ''
    : '这个文件夹里没找到 Steam 运行库，副本内容和原文件夹一样（可能本来就不绑 Steam）'

  return {
    ok: true,
    src: srcAbs,
    dest: destAbs,
    name: path.basename(destAbs),
    copiedFiles: totalFiles,
    copiedBytes: totalBytes,
    stripped,
    strippedBytes: sumBytes(stripped),
    strippedNative: stripped.filter((f) => f.kind === 'native').length,
    strippedConfig: stripped.filter((f) => f.kind === 'config').length,
    keptManaged: plan.managed,
    links: plan.links,
    warnings: plan.warnings,
    truncated: plan.truncated,
    removeConfig: removeConfig !== false,
    warning,
    elapsedMs: Date.now() - t0
  }
}
