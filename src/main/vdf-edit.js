/**
 * VDF 的行级编辑 + 新脚本生成。
 *
 * 为什么不做「解析成对象再序列化」：那会把文件里的注释和排版全部抹掉，
 * 而这些 vdf 的注释本身就是文档（每条排除规则为什么存在都写在里面）。
 * 所以读取用 vdf.js 的解析器，写回一律走这里的定点行替换。
 */

/* ------------------------------------------------------------------ *
 *  工具
 * ------------------------------------------------------------------ */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** VDF 字符串字面量。注意不能把反斜杠转义掉——Valve 自己的路径就是单反斜杠。 */
function q(s) {
  return `"${String(s ?? '').replace(/"/g, '\\"')}"`
}

function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

/* ------------------------------------------------------------------ *
 *  改单个字段
 *  已有活动行 -> 替换值
 *  只有被注释掉的行 -> 取消注释并写入（值为空时保持注释）
 *  都没有 -> 插到根块第一行之后
 * ------------------------------------------------------------------ */

export function setField(text, key, value) {
  const original = text
  const k = escapeRe(key)
  const activeRe = new RegExp(`^(\\s*)"${k}"(\\s+)"[^"]*"(\\s*)$`, 'im')
  const commentRe = new RegExp(`^(\\s*)(//\\s*)"${k}"(\\s+)"[^"]*"(.*)$`, 'im')

  const hasValue = value !== '' && value != null
  let out = text
  let mode = 'unchanged'

  if (activeRe.test(out)) {
    if (hasValue) {
      out = out.replace(activeRe, (...m) => `${m[1]}${q(key)}${m[2]}${q(value)}${m[3]}`)
      mode = 'updated'
    } else {
      // 置空 = 注释掉，避免留下 "SetLive" "" 这种半吊子状态
      out = out.replace(activeRe, (...m) => `${m[1]}// ${q(key)}${m[2]}""${m[3]}`)
      mode = 'commented'
    }
  } else if (commentRe.test(out)) {
    out = out.replace(commentRe, (...m) =>
      hasValue ? `${m[1]}${q(key)}${m[3]}${q(value)}${m[4]}` : `${m[1]}${m[2]}${q(key)}${m[3]}""${m[4]}`
    )
    mode = hasValue ? 'uncommented' : 'unchanged'
  } else if (hasValue) {
    const idx = out.indexOf('{')
    if (idx === -1) return { text: original, changed: false, mode: 'no-root-block' }
    const nl = out.indexOf('\n', idx)
    const at = nl === -1 ? out.length : nl + 1
    out = `${out.slice(0, at)}\t${q(key)}\t\t${q(value)}\n${out.slice(at)}`
    mode = 'inserted'
  }

  return { text: out, changed: out !== original, mode }
}

/* ------------------------------------------------------------------ *
 *  改一组同名 key（FileExclusion 这种会重复出现的）
 *  整组替换；一个都没有时插到根块收尾大括号之前
 * ------------------------------------------------------------------ */

export function setList(text, key, values) {
  const original = text
  const eol = eolOf(text)
  const re = new RegExp(`^[ \\t]*"${escapeRe(key)}"[ \\t]+"[^"]*"[ \\t]*\\r?\\n?`, 'gim')
  const matches = [...text.matchAll(re)]
  const rendered = values.map((v) => `\t${q(key)}\t${q(v)}`).join(eol)

  let out
  if (matches.length) {
    const start = matches[0].index
    const last = matches[matches.length - 1]
    const end = last.index + last[0].length
    const body = values.length ? `${rendered}${eol}` : ''
    out = text.slice(0, start) + body + text.slice(end)
  } else if (values.length) {
    const close = text.lastIndexOf('}')
    if (close === -1) return { text: original, changed: false, mode: 'no-root-block' }
    const nl = text.lastIndexOf('\n', close)
    const at = nl === -1 ? close : nl + 1
    out = `${text.slice(0, at)}${rendered}${eol}${text.slice(at)}`
  } else {
    return { text: original, changed: false, mode: 'nothing-to-do' }
  }

  return { text: out, changed: out !== original, mode: matches.length ? 'replaced' : 'inserted' }
}

/** 删掉某个 key 的所有行 */
export function removeField(text, key) {
  const re = new RegExp(`^[ \\t]*"${escapeRe(key)}"[ \\t]+"[^"]*"[ \\t]*\\r?\\n?`, 'gim')
  const out = text.replace(re, '')
  return { text: out, changed: out !== text }
}

/** 往某个块的 { 之后插一行 */
export function insertIntoBlock(text, blockKey, line) {
  // 键和 `{` 之间的空白可能是换行 —— Valve 模板、renderAppVdf、手写脚本
  // 都是 "Depots" 换行再 `{`。只允许 [ \t] 的话这里永远匹配不到，
  // 表现就是「app 脚本里找不到 Depots 块」，加 Depot 直接失败。
  const re = new RegExp(`"${escapeRe(blockKey)}"[ \\t\\r\\n]*\\{`, 'i')
  const m = re.exec(text)
  if (!m) return { text, changed: false, mode: 'no-block' }
  let at = m.index + m[0].length
  const nl = text.indexOf('\n', at)
  let insertAt = nl === -1 ? text.length : nl + 1

  // 跳过块开头的说明性注释，让新条目排在注释后面而不是插到注释上面
  for (;;) {
    const rest = text.slice(insertAt)
    const cm = /^[ \t]*\/\/[^\n]*\r?\n/.exec(rest)
    if (!cm) break
    insertAt += cm[0].length
  }

  return {
    text: text.slice(0, insertAt) + line + '\n' + text.slice(insertAt),
    changed: true,
    mode: 'inserted'
  }
}

/** 删掉某个块里的某一行（按行内容精确匹配） */
export function removeLine(text, line) {
  const out = text.replace(
    new RegExp(`^[ \\t]*${escapeRe(line)}[ \\t]*\\r?\\n?`, 'm'),
    ''
  )
  return { text: out, changed: out !== text }
}

/* ------------------------------------------------------------------ *
 *  默认排除规则（新建 depot 时预填）
 * ------------------------------------------------------------------ */

export const DEFAULT_EXCLUSIONS = [
  '*.pdb',
  '*.log',
  '*.ps1',
  '*.bat',
  '*.cmd',
  'logs\\*',
  'tools\\*',
  'steam_appid.txt',
  '*BurstDebugInformation_DoNotShip\\*'
]

/** 根据平台给一份更贴合的默认排除列表 */
export function defaultExclusionsFor(platform = '') {
  const p = String(platform).toLowerCase()
  const base = [...DEFAULT_EXCLUSIONS]
  if (p.includes('macos') || p.includes('osx')) base.push('*.dSYM\\*', '*.sym')
  if (p.includes('linux')) base.push('*.debug', '*.sym')
  return base
}

/* ------------------------------------------------------------------ *
 *  平台
 * ------------------------------------------------------------------ */

export const PLATFORMS = [
  { id: 'win64', label: 'Windows 64', suffix: 'win64', steaminstall: 'windows' },
  { id: 'win32', label: 'Windows 32', suffix: 'win32', steaminstall: 'windows' },
  { id: 'macos', label: 'macOS', suffix: 'macos', steaminstall: 'macos' },
  { id: 'linux', label: 'Linux', suffix: 'linux', steaminstall: 'linux' },
  { id: 'linuxarm64', label: 'Linux ARM64', suffix: 'linuxarm64', steaminstall: 'linux' }
]

export function platformById(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[0]
}

/* ------------------------------------------------------------------ *
 *  Steamworks 新建 Depot 要填的字段（后台的 Depot 配置页就是这几项）
 *  名称 / DepotID / 语言 / 操作系统 / 架构
 *  本地 vdf 只需要 DepotID + ContentRoot，其余几项存 settings.depotMeta
 * ------------------------------------------------------------------ */

export const DEPOT_OS = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' }
]

export const DEPOT_ARCH = [
  { id: '64', label: '64 位' },
  { id: '32', label: '32 位' },
  { id: 'arm64', label: 'ARM64' }
]

/** 后台常用的语言项，够覆盖绝大多数情况 */
export const DEPOT_LANGUAGES = [
  { id: 'all', label: '所有语言' },
  { id: 'schinese', label: '简体中文' },
  { id: 'tchinese', label: '繁体中文' },
  { id: 'english', label: '英语' },
  { id: 'japanese', label: '日语' },
  { id: 'koreana', label: '韩语' },
  { id: 'russian', label: '俄语' },
  { id: 'french', label: '法语' },
  { id: 'german', label: '德语' },
  { id: 'spanish', label: '西班牙语' },
  { id: 'portuguese', label: '葡萄牙语' },
  { id: 'italian', label: '意大利语' }
]

/** (系统, 架构) -> 内部平台 id */
export function platformFromOsArch(os, arch) {
  const o = String(os || '').toLowerCase()
  const a = String(arch || '').toLowerCase()
  if (o === 'windows') return a === '32' ? 'win32' : 'win64'
  if (o === 'macos' || o === 'osx') return 'macos'
  if (o === 'linux') return a === 'arm64' ? 'linuxarm64' : 'linux'
  return null
}

/** 内部平台 id -> { os, arch } */
export function osArchFromPlatform(id) {
  const p = String(id || '').toLowerCase()
  if (p === 'win32') return { os: 'windows', arch: '32' }
  if (p === 'win64') return { os: 'windows', arch: '64' }
  if (p === 'macos') return { os: 'macos', arch: '64' }
  if (p === 'linux') return { os: 'linux', arch: '64' }
  if (p === 'linuxarm64') return { os: 'linux', arch: 'arm64' }
  return { os: '', arch: '' }
}

export function languageLabel(id) {
  return DEPOT_LANGUAGES.find((l) => l.id === id)?.label || (id ? id : '所有语言')
}

/** 从 depot 文件名后缀猜平台 */
export function guessPlatform(fileName = '') {
  const n = String(fileName).toLowerCase()
  if (n.includes('linuxarm64')) return 'linuxarm64'
  if (n.includes('linux')) return 'linux'
  if (n.includes('macos') || n.includes('osx')) return 'macos'
  if (n.includes('win32')) return 'win32'
  if (n.includes('win64') || n.includes('windows')) return 'win64'
  return null
}

/* ------------------------------------------------------------------ *
 *  生成新脚本
 * ------------------------------------------------------------------ */

/**
 * 重写 app vdf 里那两段「随 Depot 数量变化」的说明文字。
 *
 * 它们是我自己生成的注释，但注释不会自己更新 —— 用户删掉一个 Depot 之后，
 * 文件头还写着「这个 App 管 3 个 Depot」，Depots 块里却只剩 1 条；
 * 多 Depot 时代那句「所以这里不设 App 层默认值」也会和上面真写着的
 * ContentRoot 自相矛盾。改完 depot 列表必须重新刷一遍。
 */
const NOTE_HEADER_RE = /^\/\/  这个 App 管 .*\r?\n(?:^\/\/  一次 run_app_build .*\r?\n)?/gm

// 体注换过写法，两代都要能删掉 —— 只删当代的话，旧的那行会永远留在文件里，
// 而且每保存一次就多叠一行。
const NOTE_BODY_RES = [
  /^[ \t]*\/\/ 这个 App (?:有多个|只有一个) Depot[^\n]*\r?\n(?:[ \t]*\/\/[^\n]*\r?\n)?/gm,
  /^[ \t]*\/\/ 这里的 ContentRoot[^\n]*\r?\n(?:[ \t]*\/\/ 每个 Depot 在各自的脚本里用[^\n]*\r?\n)?/gm
]

export function refreshAppNotes(text, { depotCount = 0, platforms = [] } = {}) {
  const names = platforms.filter(Boolean)
  const list = names.length ? `（${names.join(' + ')}）` : ''

  const header =
    depotCount <= 1
      ? `//  这个 App 管 1 个 Depot${list}。一次 run_app_build 会构建并上传它。\n`
      : `//  这个 App 管 ${depotCount} 个 Depot${list}：\n//  一次 run_app_build 会把它们全部构建并上传。\n`

  const body =
    depotCount <= 1
      ? "\t// 这里的 ContentRoot 是项目文件夹；这个 Depot 自己的 contentroot 优先。\n"
      : '\t// 这里的 ContentRoot 是「项目文件夹」—— 各平台构建的父目录。\n' +
        '\t// 每个 Depot 在各自的脚本里用 <项目文件夹>\\<平台> 覆盖它。\n'

  let out = text.replace(NOTE_HEADER_RE, '')
  for (const re of NOTE_BODY_RES) out = out.replace(re, '')

  // 头注放在 "AppBuild" 之前；体注紧跟 App 层 ContentRoot
  return out
    .replace(/^("AppBuild"\s*\{)/m, `\n${header}\n$1`)
    .replace(/^([ \t]*"ContentRoot"[^\n]*\r?\n)/m, `$1${body}`)
    .replace(/\n{3,}/g, '\n\n') // 删掉注释留下的空行空洞
}

export function renderAppVdf({
  appId,
  name = '',
  desc = '',
  contentRoot = '',
  buildOutput = '',
  preview = false,
  setLive = '',
  depots = []
}) {
  const depotLines = depots
    .map((d) => `\t\t${q(d.id)}\t${q(d.file)}`)
    .join('\n')

  const setLiveLine = setLive ? `\t"SetLive"\t\t${q(setLive)}` : `//\t"SetLive"\t"beta_branch_name"`

  // App 层 ContentRoot 在 Valve 的语义里是「自己没写 contentroot 的 depot」的默认值。
  // 这里把它当成**项目文件夹**用：一个 App 一个项目文件夹（D:\SteamBuilds\AbyaDemo），
  // 各平台真正要上传的内容在各 depot 的 contentroot（项目文件夹\win64、\macos、\linux）。
  // 所以这一行**无论几个 Depot 都写**—— 多 Depot 时它的含义是「项目文件夹在哪」，
  // 不是「内容都从这一个目录传」。留空会让界面上的「项目文件夹」格子看着像坏了。
  // 安全阀在 collectProblems / build.ps1：某个 depot 直接把项目文件夹当内容目录会被拦下，
  // 那等于把别的平台的构建一起传上去。
  const contentRootBlock = `\t"ContentRoot"\t${q(contentRoot)}\n`

  const vdf = `// ============================================================================
//  ${name || 'App ' + appId}  --  AppID ${appId}
//
//  由 SteamSDK 上传工作台生成。内容目录放在 SDK 外面，一份 SDK 可以管所有
//  App / Depot / 版本，不需要复制 SDK，也不需要复制文件夹。
//
//  这个 App 管 ${depots.length} 个 Depot（${depots.map((d) => d.platform || d.id).join(' + ')}）：
//  一次 run_app_build 会把它们全部构建并上传。
// ============================================================================

"AppBuild"
{
\t"AppID"\t\t\t${q(appId)}
\t"Desc"\t\t\t${q(desc)}
\t"verbose"\t\t"0"
\t"preview"\t\t${q(preview ? '1' : '0')}

${contentRootBlock}
\t// 构建缓存和日志。别删，删了下次要整包重算。
\t"BuildOutput"\t${q(buildOutput)}

\t// 发布到哪个 beta 分支；留空 = 默认分支。
${setLiveLine}

\t"Depots"
\t{
\t\t// depot 的文件映射规则在各自的脚本里（同目录）
${depotLines}
\t}
}
`

  // 注释只有一处来源：refreshAppNotes。这里让它跑一遍，
  // 免得 renderAppVdf 和自己生成的说明各写一份、越叠越多。
  return refreshAppNotes(vdf, {
    depotCount: depots.length,
    platforms: depots.map((d) => d.platform).filter(Boolean)
  })
}

export function renderDepotVdf({
  depotId,
  playerName = '',
  platform = 'win64',
  contentRoot = '',
  exclusions = DEFAULT_EXCLUSIONS
}) {
  const plat = platformById(platform)
  const exLines = exclusions.map((e) => `\t"FileExclusion"\t${q(e)}`).join('\n')

  return `// ============================================================================
//  Depot ${depotId}  --  ${plat.label}
//
//  FileExclusion 决定哪些东西永远不会被传上去。默认这份是按「Unity 构建输出」
//  预填的：日志、符号文件、QA 脚本、Burst 调试信息都不应该出现在玩家手里。
// ============================================================================

"DepotBuildConfig"
{
\t"DepotID"\t\t${q(depotId)}

\t// 覆盖 AppBuild 里的 ContentRoot
\t"contentroot"\t${q(contentRoot)}

\t"FileMapping"
\t{
\t\t"LocalPath"\t\t"*"
\t\t"DepotPath"\t\t"."
\t\t"recursive"\t\t"1"
\t}

\t// --- 调试 / 诊断产物，永远不上传 ---
${exLines}

}
`
}
