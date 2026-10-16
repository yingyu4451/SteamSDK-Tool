/**
 * 「忘记账号」—— 把工具链上留下的登录痕迹一次清干净。
 *
 * 登录信息散在两个程序里，缺一个都会「清了个寂寞」：
 *   1) steamcmd 自己缓存的：builder\config\config.vdf 的 ConnectCache（刷新过的登录令牌）
 *      和 Accounts（记住的账号名），以及 userdata\<id>\ 这个用户档案
 *   2) 我们应用自己存的：credentials.bin（DPAPI 加密的密码）、settings.json 里的 account
 *
 * 清之前整份备份到 SDK 根目录下，后悔了能把目录拷回去。
 */

import fs from 'node:fs'
import path from 'node:path'
import { loadSettings, saveSettings, credentialsPath, settingsFileDir } from './store.js'
import { getPaths, readSteamLogin } from './sdk.js'

/**
 * 从文本里删掉一个 "KEY" { ... } 块。
 * 必须靠数花括号 —— 用 [^}]* 这种正则会停在第一个内层 } 上，
 * 结果是块没删干净、还留下一个孤立的 }，整个 vdf 就废了。
 */
function dropBlock(text, key) {
  const re = new RegExp(`^[ \\t]*"${key}"[ \\t]*\\r?\\n[ \\t]*\\{`, 'm')
  const m = re.exec(text)
  if (!m) return text
  const open = text.indexOf('{', m.index)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        let end = i + 1
        while (end < text.length && (text[end] === '\r' || text[end] === '\n')) end++
        return text.slice(0, m.index) + text.slice(end)
      }
    }
  }
  return text
}

const countBraces = (t) => {
  let open = 0
  let close = 0
  for (const ch of t) {
    if (ch === '{') open++
    else if (ch === '}') close++
  }
  return open === close
}

/** 日志里出现过的账号名，config.vdf 已经清掉时也能捞出来 */
function namesInLog(logText) {
  const out = new Set()
  const re = /Logging in user '([^']+)'/g
  let m
  while ((m = re.exec(logText))) out.add(m[1])
  return [...out]
}

/** 看一眼现在都有哪些登录痕迹 —— 界面拿它显示清单、决定要不要弹确认 */
export function describeLogin(settings) {
  const s = settings || loadSettings()
  const p = getPaths(s)
  const sc = readSteamLogin(s)
  const configPath = path.join(p.builderDir, 'config', 'config.vdf')
  const userdataDir = path.join(p.builderDir, 'userdata')
  const logPath = path.join(p.builderDir, 'logs', 'console_log.txt')
  const credPath = credentialsPath()

  let users = []
  try {
    // anonymous 是匿名拉公开 App 信息留下的，跟账号无关，不算登录痕迹
    users = fs.readdirSync(userdataDir).filter((n) => n !== 'anonymous')
  } catch {
    /* 没有就算了 */
  }

  let logNames = []
  try {
    logNames = namesInLog(fs.readFileSync(logPath, 'utf8'))
  } catch {
    /* 没有就算了 */
  }

  const items = [
    {
      key: 'token',
      label: 'steamcmd 缓存的登录令牌',
      detail: sc.cached ? '有（下次构建可以免密）' : '没有',
      present: sc.cached,
      where: configPath
    },
    {
      key: 'account',
      label: 'steamcmd 记住的账号名',
      detail: sc.account || s.account || '没有',
      present: !!(sc.account || s.account),
      where: configPath
    },
    {
      key: 'profile',
      label: 'steamcmd 的用户档案',
      detail: users.length ? users.join('、') : '没有',
      present: users.length > 0,
      where: userdataDir
    },
    {
      key: 'password',
      label: '本机保存的密码',
      detail: fs.existsSync(credPath) ? '已加密存盘' : '没有',
      present: fs.existsSync(credPath),
      where: credPath
    },
    {
      key: 'log',
      label: '构建日志里的账号名',
      detail: logNames.length ? logNames.join('、') : '没有',
      present: logNames.length > 0,
      where: logPath
    }
  ]

  return {
    ok: true,
    items,
    any: items.some((x) => x.present),
    account: sc.account || s.account || logNames[0] || ''
  }
}

/**
 * 真清。先整份备份，再逐项处理。
 * 每一项独立 try —— 某一项失败不该把其余项也带崩。
 */
export function forgetLogin(settings, { backup = true } = {}) {
  const s = settings || loadSettings()
  const p = getPaths(s)
  const before = describeLogin(s)
  const removed = []
  const skipped = []
  const stamp = new Date()
    .toLocaleString('sv-SE')
    .replace(/[: ]/g, '-')
    .replace(/-(\d{2})$/, '$1')
  let backupDir = ''

  const pick = (k) => before.items.find((x) => x.key === k) || {}

  // ---- 备份 ----
  if (backup && before.any) {
    try {
      backupDir = path.join(p.sdkRoot || s.sdkRoot, `_login-backup-${stamp}`)
      fs.mkdirSync(path.join(backupDir, 'config'), { recursive: true })
      fs.mkdirSync(path.join(backupDir, 'logs'), { recursive: true })
      fs.mkdirSync(path.join(backupDir, 'appdata'), { recursive: true })
      if (fs.existsSync(pick('token').where)) fs.copyFileSync(pick('token').where, path.join(backupDir, 'config', 'config.vdf'))
      const ud = pick('profile').where
      if (fs.existsSync(ud)) fs.cpSync(ud, path.join(backupDir, 'userdata'), { recursive: true })
      const lp = pick('log').where
      if (fs.existsSync(lp)) fs.copyFileSync(lp, path.join(backupDir, 'logs', 'console_log.txt'))
      const cp = pick('password').where
      if (fs.existsSync(cp)) fs.copyFileSync(cp, path.join(backupDir, 'appdata', 'credentials.bin'))
      fs.copyFileSync(path.join(settingsFileDir(), 'settings.json'), path.join(backupDir, 'appdata', 'settings.json'))
    } catch {
      backupDir = ''
    }
  }

  // ---- 1) steamcmd：令牌 + 账号名 ----
  const configPath = pick('token').where
  if (fs.existsSync(configPath)) {
    try {
      const orig = fs.readFileSync(configPath, 'utf8')
      let next = dropBlock(orig, 'ConnectCache')
      next = dropBlock(next, 'Accounts')
      if (!countBraces(next)) throw new Error('花括号不配平，没敢写回去')
      fs.writeFileSync(configPath, next, 'utf8')
      removed.push('steamcmd 的登录令牌和账号名')
    } catch (e) {
      skipped.push(`config.vdf 没清掉：${e.message}`)
    }
  }

  // ---- 2) steamcmd：用户档案 ----
  const ud = pick('profile').where
  if (fs.existsSync(ud)) {
    try {
      for (const n of fs.readdirSync(ud)) {
        if (n === 'anonymous') continue
        fs.rmSync(path.join(ud, n), { recursive: true, force: true })
      }
      removed.push('steamcmd 的用户档案')
    } catch (e) {
      skipped.push(`用户档案没删掉：${e.message}`)
    }
  }

  // ---- 3) 我们自己的密码 + 账号名 ----
  try {
    const cp = credentialsPath()
    if (fs.existsSync(cp)) {
      fs.unlinkSync(cp)
      removed.push('本机保存的密码')
    }
    saveSettings({ account: '', rememberPassword: false })
    removed.push('设置里记住的账号名')
  } catch (e) {
    skipped.push(`本地凭据没清掉：${e.message}`)
  }

  // ---- 4) 日志里的账号名（只把名字换成 ***，不动日志本身）----
  // steamcmd 开着的时候会一直占着这个文件，重写会 EBUSY —— 所以重试几次再放弃。
  const logPath = pick('log').where
  if (fs.existsSync(logPath)) {
    let done = false
    let lastErr = null
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      try {
        const text = fs.readFileSync(logPath, 'utf8')
        const names = new Set([...namesInLog(text), pick('account').detail, s.account].filter(Boolean))
        let next = text
        for (const n of names) {
          if (n && n !== '没有' && n !== '***') next = next.split(n).join('***')
        }
        if (next !== text) {
          fs.writeFileSync(logPath, next, 'utf8')
          removed.push('构建日志里的账号名')
        }
        done = true
      } catch (e) {
        lastErr = e
        if (attempt < 3) {
          const end = Date.now() + 400
          while (Date.now() < end) {
            /* 短暂等一下再试 —— steamcmd 可能正好在写 */
          }
        }
      }
    }
    if (!done) {
      skipped.push(
        `构建日志里的账号名没清掉 —— steamcmd 正占着这个日志文件。` +
          `把它的控制台窗口关掉再点一次「忘记账号」就行。（${lastErr?.code || lastErr?.message}）`
      )
    }
  }

  return { ok: true, removed, skipped, backupDir, before, after: describeLogin(loadSettings()) }
}
