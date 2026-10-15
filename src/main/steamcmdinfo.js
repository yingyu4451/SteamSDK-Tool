import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseVdf, getBlock, getString, getAllStrings } from './vdf.js'

/**
 * 用 steamcmd 自己读某个 App 的 Depot 列表 —— 不需要 Steamworks partner 密钥。
 *
 *   steamcmd +login <账号> +app_info_print <AppID> +quit
 *
 * 为什么走这条路：读后台 Depot 的 Web API（partner.steam-api.com 的
 * ISteamApps/GetAppDepotVersions）需要发布商密钥，而合作方成员往往不是管理员、
 * 拿不到密钥。但**上传构建用的那个 steamcmd 账号本来就有这个 App 的权限**，
 * `app_info_print` 打出来的就是后台的真实配置。
 *
 * 匿名也能跑，但只能看公开 App；未发布的 App 必须用有权限的账号登录。
 */

const TIMEOUT_MS = 90_000

/** steamcmd 在正式 VDF 之前会打一堆横幅和进度行 */
const LEADING_NOISE = [
  /^Steam Console Client/i,
  /^--\s*type 'quit'/i,
  /^Loading Steam API/i,
  /^Connecting /i,
  /^Waiting for /i,
  /^Redirecting stderr/i,
  /^Logging directory/i,
  /^\[.*%\]/,
  /^\[----\]/,
  /^\s*$/
]

/** 从整段 stdout 里切出以 `"<appid>"` 开头的那段 VDF */
export function extractAppVdf(stdout, appId) {
  const lines = String(stdout ?? '').split(/\r?\n/)
  const marker = `"${appId}"`
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === marker) {
      start = i
      break
    }
  }
  if (start < 0) return null

  // 一直取到配平为止，避免后面还跟着别的输出
  let depth = 0
  let begun = false
  const out = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)
    for (const ch of line) {
      if (ch === '{') {
        depth++
        begun = true
      } else if (ch === '}') depth--
    }
    if (begun && depth <= 0) break
  }
  return out.join('\n')
}

/**
 * 从 appinfo 的 VDF 文本里抽 depot 列表。
 *
 * 输出刻意做成 `steamapi.js` 的 `summarizeAppDepots()` 能吃的那种形状，
 * 这样 Web API 和 steamcmd 两条路最后汇到同一个归一化函数里。
 *
 * appinfo 的真实结构（对着 TF2 的 app_info_print 实测）：
 *   * `depots` 块里混着标量元数据（`overridescddb` / `baselanguages` /
 *     `workshopdepot` / `hasdepotsindlc`），只有数字键才是 depot
 *   * `manifests` 的**键是分支名**（`public` / `prerelease` / …），不是 manifestid；
 *     里面的字段是 `gid` / `size` / `download`，**没有 buildid**
 *   * `name` / `maxsize` 不是每个 depot 都有
 *   * 平台在 depot 自己的 `config.oslist` 里，不在 manifest 上
 */
export function parseDepotsFromAppInfo(text) {
  const root = parseVdf(text)
  const depotsBlock = getBlock(root, 'depots')
  if (!depotsBlock) return []

  return (depotsBlock.entries || [])
    .filter((e) => /^\d+$/.test(e.key) && e.value && e.value.type === 'object')
    .map((e) => {
      const d = e.value
      const cfg = getBlock(d, 'config')
      // 平台线索：depot 的 config.oslist 为主，有的实现放在 depot 顶层
      const oslist = [...getAllStrings(cfg, 'oslist'), ...getAllStrings(d, 'oslist')]

      const manBlock = getBlock(d, 'manifests')
      const manifests = (manBlock?.entries || [])
        .filter((m) => m.value && m.value.type === 'object')
        .map((m) => ({
          manifestid: getString(m.value, 'gid', ''), // appinfo 里这个字段叫 gid
          buildid: getString(m.value, 'buildid', ''),
          branch: m.key, // ← 键就是分支名
          size: Number(getString(m.value, 'size', '0')) || 0,
          downloadsize: Number(getString(m.value, 'download', '0')) || 0,
          os: getString(m.value, 'os', ''),
          osarch: getString(m.value, 'osarch', ''),
          timeupdated: getString(m.value, 'timeupdated', '') || null
        }))

      return {
        depotid: e.key,
        name: getString(d, 'name', ''),
        maxsize: Number(getString(d, 'maxsize', '0')) || 0,
        oslist,
        systemdefined: getString(d, 'systemdefined', '') === '1',
        sharedinstall: getString(d, 'sharedinstall', '') === '1',
        depotfromapp: getString(d, 'depotfromapp', ''),
        manifests
      }
    })
}

/** Steam 的 oslist / os 值 -> 本地平台 id */
export function oslistToPlatform(oslist, osarch = '') {
  const list = Array.isArray(oslist) ? oslist : [oslist]
  const flat = list.map((x) => String(x || '').toLowerCase().trim())
  const arch = String(osarch || '').toLowerCase()
  if (flat.includes('windows')) return arch === '32' ? 'win32' : 'win64'
  if (flat.includes('macos') || flat.includes('osx')) return 'macos'
  if (flat.includes('linux')) return arch.includes('arm') ? 'linuxarm64' : 'linux'
  return ''
}

/** 出错时给用户看几行有意义的原始输出，屏蔽掉横幅和进度行 */
function firstLines(text, n = 6) {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !LEADING_NOISE.some((re) => re.test(l)))
    .slice(0, n)
    .map((l) => '  ' + l.trim())
    .join('\n')
}

function runSteamcmd({ steamcmd, args, password, cwd, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(steamcmd, args, { cwd, windowsHide: true })
    } catch (e) {
      resolve({ ok: false, error: `无法启动 steamcmd：${e.message}` })
      return
    }

    let out = ''
    let err = ''
    let done = false
    let answered = false

    const finish = (r) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(r)
    }

    const timer = setTimeout(() => {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        error: `steamcmd 超时（${Math.round(timeoutMs / 1000)} 秒）。可能是登录卡住了 —— 密码不对、或者账号开了两步验证需要验证码。`,
        stdout: out
      })
    }, timeoutMs)

    // steamcmd 没有缓存凭据时会提示 password:，但它接管道时是块缓冲的，
    // 提示刷不出来，所以只能提前把密码写进 stdin（和 build.ps1 一个套路）。
    const feed = () => {
      if (!password || answered) return
      answered = true
      try {
        child.stdin.write(password.replace(/\r?\n$/, '') + '\n')
      } catch {
        /* ignore */
      }
    }

    child.stdout.on('data', (d) => {
      out += d.toString('utf8')
      feed()
    })
    child.stderr.on('data', (d) => (err += d.toString('utf8')))

    child.on('error', (e) => finish({ ok: false, error: `steamcmd 启动失败：${e.message}` }))
    child.on('close', (code) => finish({ ok: true, code, stdout: out, stderr: err }))

    // 登录提示可能在 stdout 第一次输出之前就出现，先喂一次更稳
    setTimeout(feed, 300)
  })
}

/**
 * 查一个 App 的 Depot 列表。
 * @param {object} o
 * @param {string} o.appId
 * @param {string} [o.steamcmd]   steamcmd.exe 绝对路径
 * @param {string} [o.username]   不给就用 anonymous（只能看公开 App）
 * @param {string} [o.password]
 * @param {string} [o.cwd]        steamcmd 的工作目录（默认它自己所在目录）
 */
export async function fetchAppDepotsViaSteamcmd({ appId, steamcmd, username = '', password = '', cwd }) {
  if (!steamcmd || !fs.existsSync(steamcmd)) {
    return { ok: false, error: `找不到 steamcmd：${steamcmd}` }
  }
  const id = String(appId ?? '').trim()
  if (!/^\d+$/.test(id)) return { ok: false, error: 'AppID 必须是数字' }

  const loginArgs = username ? ['+login', username] : ['+login', 'anonymous']
  const args = [...loginArgs, '+app_info_print', id, '+quit']

  const r = await runSteamcmd({
    steamcmd,
    args,
    password: username ? password : '',
    cwd: cwd || path.dirname(steamcmd)
  })
  if (!r.ok) return r

  const text = r.stdout || ''

  if (/ERROR \(Invalid Password\)|FAILED TO LOGIN|Invalid Login Auth Code|Two-factor/i.test(text)) {
    return {
      ok: false,
      needsCredentials: true,
      error:
        'steamcmd 登录失败。检查账号密码；如果账号开了 Steam Guard，这个功能用不了（steamcmd 拿不到验证码）—— 可以改从 Web API 密钥读。'
    }
  }

  const vdf = extractAppVdf(text, id)
  if (!vdf) {
    return { ok: false, error: `steamcmd 没有返回 AppID ${id} 的任何内容。\n` + firstLines(text) }
  }

  const root = parseVdf(vdf)

  // AppID 不存在、或者当前账号没权限时，steamcmd 会打一个**空块**：
  //   AppID : 999999999, change number : ..., last change : Thu Jan  1 08:00:00 1970
  //   "999999999"
  //   {
  //   }
  // 空块绝不能当成「这个 App 有 0 个 Depot」—— 那会让向导以为后面没东西可配。
  if (!root.entries || root.entries.length === 0) {
    return {
      ok: false,
      emptyInfo: true,
      error:
        `steamcmd 读不到 AppID ${id} 的信息（返回了空块）。两种可能：\n` +
        `  ① 这个 AppID 不存在或写错了；\n` +
        `  ② 当前 steamcmd 账号没有这个 App 的权限 —— 用上传构建的那个账号登录才行` +
        (username ? '' : '（现在用的是 anonymous，只能看已公开的 App）') +
        '。'
    }
  }

  const common = getBlock(root, 'common')
  const depots = parseDepotsFromAppInfo(vdf)
  return {
    ok: true,
    appId: id,
    appName: common ? getString(common, 'name', '') : '',
    anonymous: !username,
    depots
  }
}
