/**
 * 把文件夹 / 压缩包拖到窗口里，先看它是什么，再决定塞进哪个 Depot。
 *
 * 这里只做「看」和「放」，不猜用户想干什么 —— 平台的判断都给出依据，
 * 用户可以在弹窗里改。
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { platformById, platformFromOsArch } from './vdf-edit.js'
import { addDepot, updateDepotFields } from './sdk.js'

const ZIP_EXT = ['.zip']
const ARCHIVE_EXT = ['.zip', '.7z', '.rar', '.tar', '.gz', '.xz', '.tar.gz']

/** 走目录时最多看这么多项 —— 一个 Unity 包一万多个文件，全统计会很慢 */
const MAX_ENTRIES = 30000

const JUNK = [
  { re: /_BurstDebugInformation_DoNotShip$/i, label: 'Burst 调试信息目录', rule: '*BurstDebugInformation_DoNotShip\\*' },
  { re: /\.pdb$/i, label: '符号文件 .pdb', rule: '*.pdb' },
  { re: /\.dSYM$/i, label: '符号目录 .dSYM', rule: '*.dSYM\\*' },
  { re: /\.log$/i, label: '日志 .log', rule: '*.log' },
  { re: /^steam_appid\.txt$/i, label: 'steam_appid.txt', rule: 'steam_appid.txt' },
  { re: /^(logs|tools|CrashReports|Crashes)$/i, label: '调试目录', rule: null }
]

function extOf(p) {
  const b = path.basename(p).toLowerCase()
  if (b.endsWith('.tar.gz')) return '.tar.gz'
  return path.extname(b)
}

export function isArchive(p) {
  return ARCHIVE_EXT.includes(extOf(p))
}

/** 从 Unity 自动生成的文件夹名里抠 AppID：MyGame Steam(Body-1234567) B0.7.9 20260429 */
export function guessAppIdFromName(name) {
  const m = String(name).match(/Steam\([A-Za-z]*-(\d{3,})\)/)
  return m ? m[1] : ''
}

/** 从名字里猜平台：.../win64、.../macos、MyGame_Win64 之类 */
function platformFromName(name) {
  const n = String(name).toLowerCase()
  if (/mac|osx|darwin/.test(n)) return 'macos'
  if (/linuxarm|arm64/.test(n)) return 'linuxarm64'
  if (/linux/.test(n)) return 'linux'
  if (/win32|x86(?!_64)|32bit/.test(n)) return 'win32'
  if (/win64|win|x64/.test(n)) return 'win64'
  return ''
}

/**
 * 看一个目录：什么平台、多少文件、有没有 Unity 特征、有没有该排除的垃圾。
 * 只看两层深，够判断了。
 */
function inspectDir(dir) {
  const out = {
    files: 0,
    bytes: 0,
    truncated: false,
    top: [], // 根下的条目名
    markers: [],
    junk: [],
    hasAppBundle: false,
    appBundles: [],
    exeNames: [],
    hasDataDir: false,
    hasUnityPlayerDll: false,
    hasUnityPlayerSo: false,
    hasMacUnity: false,
    executableLinux: []
  }

  const walk = (d, depth) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.files >= MAX_ENTRIES) {
        out.truncated = true
        return
      }
      const full = path.join(d, e.name)
      const rel = path.relative(dir, full)
      if (depth === 0) out.top.push(e.name)

      // 垃圾特征只看目录名和文件名，不看内容
      if (depth <= 3) {
        for (const j of JUNK) {
          if (j.re.test(e.name) && !out.junk.some((x) => x.label === j.label)) {
            out.junk.push({ label: j.label, sample: rel, rule: j.rule })
          }
        }
      }

      if (e.isDirectory()) {
        if (e.name.toLowerCase().endsWith('.app')) {
          out.hasAppBundle = true
          if (out.appBundles.length < 8) out.appBundles.push(rel)
          // .app 里面的文件一样会被传上去，所以照样数进去
        }
        if (depth === 0 && e.name.endsWith('_Data')) out.hasDataDir = true
        if (depth < 6) walk(full, depth + 1)
        continue
      }

      let st = null
      try {
        st = fs.statSync(full)
      } catch {
        /* 读不到就不算 */
      }
      out.files++
      if (st) out.bytes += st.size

      const low = e.name.toLowerCase()
      if (low === 'unityplayer.dll') out.hasUnityPlayerDll = true
      if (low === 'unityplayer.so') out.hasUnityPlayerSo = true
      if (/unityplayer.*\.dylib$/i.test(e.name)) out.hasMacUnity = true
      if (low.endsWith('.exe') && out.exeNames.length < 8) out.exeNames.push(e.name)
      // Linux 构建的启动器通常没有扩展名、且带执行位
      if (depth === 0 && !path.extname(e.name) && st && (st.mode & 0o111)) {
        if (out.executableLinux.length < 8) out.executableLinux.push(e.name)
      }
    }
  }

  walk(dir, 0)

  // ---- 判断平台，并记下依据 ----
  const why = []
  let platform = ''
  if (out.hasAppBundle || out.hasMacUnity) {
    platform = 'macos'
    why.push(out.hasAppBundle ? '根下有 .app bundle' : '有 UnityPlayer 的 .dylib')
  } else if (out.hasUnityPlayerSo || out.executableLinux.length) {
    platform = 'linux'
    why.push(out.hasUnityPlayerSo ? '有 UnityPlayer.so' : `有可执行的 ${out.executableLinux[0]}`)
  } else if (out.hasUnityPlayerDll || out.exeNames.length || out.hasDataDir) {
    platform = 'win64'
    why.push(
      out.hasUnityPlayerDll
        ? '有 UnityPlayer.dll'
        : out.exeNames.length
          ? `有 ${out.exeNames[0]}`
          : '有 *_Data 目录'
    )
  }

  if (out.hasDataDir) out.markers.push('Unity 构建（*_Data 目录）')
  if (out.hasUnityPlayerDll) out.markers.push('UnityPlayer.dll → Windows')
  if (out.hasUnityPlayerSo) out.markers.push('UnityPlayer.so → Linux')
  if (out.hasMacUnity) out.markers.push('UnityPlayer dylib → macOS')
  if (out.hasAppBundle) out.markers.push(`${out.appBundles.length} 个 .app bundle`)

  const nameGuess = platformFromName(path.basename(dir))
  if (nameGuess && !platform) {
    platform = nameGuess
    why.push(`文件夹名里有「${nameGuess}」`)
  }

  return { ...out, platform, why }
}

/** 粗略数一下目录里有多少东西 —— 只用来报进度，够用就行 */
function quickStats(dir, cap = 200000) {
  let files = 0
  let bytes = 0
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (files >= cap) return
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        walk(full)
        continue
      }
      files++
      try {
        bytes += fs.statSync(full).size
      } catch {
        /* 读不到就不算 */
      }
    }
  }
  walk(dir)
  return { files, bytes }
}

/** 压缩包：先解出来再看。zip 用系统自带的 Expand-Archive，其它格式得装 7-Zip */
async function extractArchive(archive, destRoot, onProgress) {
  const ext = extOf(archive)
  if (!ZIP_EXT.includes(ext)) {
    return { ok: false, error: `只能自动解 .zip。${ext} 请先用 7-Zip 解开，再把文件夹拖进来。` }
  }
  const base = path.basename(archive, path.extname(archive)).replace(/[\\/:*?"<>|]/g, '_').trim()
  const dest = path.join(destRoot, base)
  if (fs.existsSync(dest)) {
    // 上一次拖同一个包留下的探测目录。那是我们自己的暂存区，直接清掉重来 ——
    // 不清的话第二次拖同一个包会报「已经存在而且不是空的」，很莫名其妙。
    try {
      fs.rmSync(dest, { recursive: true, force: true })
    } catch {
      /* 删不掉就交给 Expand-Archive 自己覆盖 */
    }
  }
  fs.mkdirSync(dest, { recursive: true })

  const ps = [
    '$ErrorActionPreference = "Stop"',
    `Expand-Archive -LiteralPath ${JSON.stringify(archive)} -DestinationPath ${JSON.stringify(dest)} -Force`
  ].join('\n')

  // 用异步 spawn 而不是 spawnSync：同步版本会把主进程整段堵死，
  // 那样连「解压到哪儿了」这种进度都送不出去，界面只能干等。
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let out = ''
  child.stdout.on('data', (b) => {
    out += b.toString()
  })
  child.stderr.on('data', (b) => {
    out += b.toString()
  })

  const poll = setInterval(() => {
    try {
      onProgress?.({ phase: 'extract', text: '正在解压…', ...quickStats(dest) })
    } catch {
      /* 报进度失败不影响解压 */
    }
  }, 700)

  const killTimer = setTimeout(() => {
    try {
      child.kill()
    } catch {
      /* 已经退了 */
    }
  }, 20 * 60 * 1000)

  const code = await new Promise((resolve) => child.on('close', resolve))
  clearInterval(poll)
  clearTimeout(killTimer)

  if (code !== 0) {
    return { ok: false, error: out.trim().split('\n').slice(-4).join('\n') || '解压失败' }
  }
  return { ok: true, dir: dest, extracted: true }
}

/** 解压出来的如果是「一个文件夹套着所有东西」，就往下钻一层 */
function unwrapSingleDir(dir) {
  let cur = dir
  for (let i = 0; i < 3; i++) {
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      return cur
    }
    const dirs = entries.filter((e) => e.isDirectory())
    const files = entries.filter((e) => !e.isDirectory())
    if (dirs.length === 1 && files.length === 0 && !dirs[0].name.toLowerCase().endsWith('.app')) {
      cur = path.join(cur, dirs[0].name)
      continue
    }
    return cur
  }
  return cur
}

/**
 * 第一步：看。压缩包只解压到临时位置看内容，真正的解压留到 apply 的时候。
 */
export async function analyzeTarget(target, settings, onProgress) {
  const say = (o) => {
    try {
      onProgress?.(o)
    } catch {
      /* 报进度失败不该影响正事 */
    }
  }
  const p = String(target || '').trim()
  if (!p) return { ok: false, error: '没拿到路径' }
  if (!fs.existsSync(p)) return { ok: false, error: `找不到：${p}` }

  let st
  try {
    st = fs.statSync(p)
  } catch (e) {
    return { ok: false, error: `读不了：${e.message}` }
  }

  const name = path.basename(p)
  const base = {
    ok: true,
    target: p,
    name,
    appIdGuess: guessAppIdFromName(name)
  }

  if (st.isDirectory()) {
    say({ phase: 'scan', text: '正在统计文件…', files: 0, bytes: 0 })
    const info = inspectDir(p)
    return {
      ...base,
      kind: 'folder',
      dir: p,
      files: info.files,
      bytes: info.bytes,
      truncated: info.truncated,
      platform: info.platform,
      platformLabel: info.platform ? platformById(info.platform).label : '',
      why: info.why,
      markers: info.markers,
      junk: info.junk,
      hasAppBundle: info.hasAppBundle,
      appBundles: info.appBundles,
      top: info.top.slice(0, 12)
    }
  }

  if (!st.isFile()) return { ok: false, error: '只能拖文件夹或者 .zip' }

  if (!isArchive(p)) {
    return { ok: false, error: `${name} 不是压缩包。拖文件夹，或者 .zip。` }
  }

  // 先解到临时目录看，apply 的时候再决定最终落在哪
  const tmpRoot = path.join(settings?.buildsRoot || path.dirname(p), '.drop-probe')
  let probe
  try {
    say({ phase: 'extract', text: '正在解压…', files: 0, bytes: 0 })
    probe = await extractArchive(p, tmpRoot, say)
  } catch (e) {
    return { ok: false, error: `解压失败：${e.message}` }
  }
  if (!probe.ok) return { ok: false, error: probe.error }

  const inner = unwrapSingleDir(probe.dir)
  say({ phase: 'scan', text: '正在统计文件…', files: 0, bytes: 0 })
  const info = inspectDir(inner)
  return {
    ...base,
    kind: 'archive',
    archive: p,
    probeDir: probe.dir,
    dir: inner,
    files: info.files,
    bytes: info.bytes,
    truncated: info.truncated,
    platform: info.platform || platformFromName(name),
    platformLabel: info.platform ? platformById(info.platform).label : '',
    why: info.why,
    markers: info.markers,
    junk: info.junk,
    hasAppBundle: info.hasAppBundle,
    appBundles: info.appBundles,
    top: info.top.slice(0, 12)
  }
}

/**
 * 第二步：放。
 *
 * mode:
 *   bind —— 把这个文件夹直接当作 Depot 的内容目录（不复制，推荐）
 *   copy —— 把里面的东西复制进 Depot 现有的内容目录
 *
 * depotFile 为空表示要新建一个 Depot。
 */
export function applyDrop(spec, settings) {
  const appDirName = String(spec?.appDirName || '').trim()
  if (!appDirName) return { ok: false, error: '先选一个 App' }

  const mode = spec?.mode === 'copy' ? 'copy' : 'bind'

  // ---- 1. 先把东西落到磁盘上 ----
  let srcDir = ''
  let extractedTo = ''
  if (spec?.kind === 'archive') {
    const destRoot = String(spec?.extractTo || settings?.buildsRoot || path.dirname(spec.archive)).trim()
    if (!fs.existsSync(destRoot)) fs.mkdirSync(destRoot, { recursive: true })
    const r = extractArchive(spec.archive, destRoot)
    if (!r.ok) return { ok: false, error: r.error }
    srcDir = unwrapSingleDir(r.dir)
    extractedTo = srcDir
  } else {
    srcDir = String(spec?.dir || spec?.target || '').trim()
  }
  if (!srcDir || !fs.existsSync(srcDir)) return { ok: false, error: `找不到要导入的文件夹：${srcDir}` }

  const platform = String(spec?.platform || '').trim() || 'win64'
  const plat = platformById(platform)

  // ---- 2. 找到（或新建）目标 Depot ----
  let depotFile = String(spec?.depotFile || '').trim()
  let contentRoot = String(spec?.contentRoot || '').trim()
  let created = null

  if (!depotFile) {
    const depotId = String(spec?.depotId || '').trim()
    if (!/^\d+$/.test(depotId)) return { ok: false, error: 'DepotID 必须是数字' }
    const osArch = spec?.os && spec?.arch ? platformFromOsArch(spec.os, spec.arch) : null
    if (osArch && osArch !== platform) {
      return { ok: false, error: `系统 + 架构组合出来是 ${platformById(osArch).label}，和选的 ${plat.label} 不一致` }
    }
    const res = addDepot(
      appDirName,
      {
        depotId,
        platform,
        contentRoot: mode === 'bind' ? srcDir : contentRoot || '',
        name: String(spec?.depotName || '').trim() || `${appDirName} ${plat.label}`,
        os: spec?.os || '',
        arch: spec?.arch || '',
        language: spec?.language || 'all',
        allowDuplicatePlatform: !!spec?.allowDuplicatePlatform
      },
      settings
    )
    if (!res || res.ok === false) return { ok: false, error: res?.error || '新建 Depot 失败' }
    created = res
    depotFile = res.file || ''
    contentRoot = res.contentRoot || srcDir
  }

  if (mode === 'bind') {
    if (!depotFile) return { ok: false, error: '没定位到 Depot 脚本' }
    const r = updateDepotFields(appDirName, depotFile, { contentRoot: srcDir }, settings)
    if (r && r.ok === false) return { ok: false, error: r.error }
    contentRoot = srcDir
  } else {
    if (!contentRoot) return { ok: false, error: '这个 Depot 还没有内容目录 —— 换成「直接指过去」或者先在抽屉里填一个' }
    const abs = path.resolve(contentRoot)
    if (path.resolve(srcDir) === abs) {
      return { ok: false, error: '要复制的文件夹就是内容目录本身' }
    }
    fs.mkdirSync(contentRoot, { recursive: true })
    try {
      fs.cpSync(srcDir, contentRoot, { recursive: true, force: true })
    } catch (e) {
      return { ok: false, error: `复制失败：${e.message}` }
    }
  }

  return {
    ok: true,
    mode,
    platform,
    depotFile,
    contentRoot,
    srcDir,
    extractedTo,
    created: created ? { depotId: spec.depotId, depotFile: created.file } : null
  }
}

/** 解压出来的探测目录用完就删 */
export function cleanupProbe(settings) {
  const root = path.join(settings?.buildsRoot || 'D:\\SteamBuilds', '.drop-probe')
  try {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true })
    return { ok: true, removed: root }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
