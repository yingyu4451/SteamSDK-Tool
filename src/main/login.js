import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { getPaths } from './sdk.js'

/**
 * 拿用户填的账号密码，真的去 steamcmd 登录一次。
 *
 * 为什么非真登一次不可：跟「steamcmd 有没有缓存凭据」是两回事。
 * 读 config.vdf 只能告诉你「这台机器以前登录过」，你刚在框里敲的
 * 账号密码对不对，它一无所知 —— 所以乱填也能「通过」。
 *
 * 密码只从 stdin 喂进去，绝不进命令行：argv 是能被别的进程读到的。
 */

/* 手机确认那条路要留够时间：用户得先看到提示、掏手机、解锁、点确认。
 * 150 秒对「盯着屏幕点一下」够，对「手机在另一个房间」就不够了。 */
const TIMEOUT_MS = 240000

function logFile(settings) {
  const p = getPaths(settings || {})
  return path.join(p.builderDir, 'logs', 'console_log.txt')
}

/** console_log.txt 是追加写的，所以只认「这次跑之前不存在」的那些行 */
function lineCount(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).length
  } catch {
    return 0
  }
}

function newLines(file, from) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(from)
  } catch {
    return []
  }
}

/**
 * 手机令牌那条路：steamcmd 会打
 *   This account is protected by a Steam Guard mobile authenticator.
 *   Please confirm the login in the Steam Mobile app on your phone.
 * 然后**停在那儿等你在手机上点确认** —— 不需要输任何码。
 * 所以这不是失败，是「等你」。
 */
const MOBILE_RE =
  /Steam Guard mobile authenticator|confirm the login in the Steam Mobile app|Open the Steam Mobile app/i

/** 把一次登录的日志翻成人话 */
export function classifyLogin(lines = [], exitCode = null) {
  const text = lines.join('\n')
  const usedAccount = (/Logging in user '([^']+)'/i.exec(text) || [])[1] || ''

  // steamcmd 是先看缓存：有令牌就直接用，压根不会走到 password: 那一步。
  // 这种情况即使返回成功，也**不能**说密码是对的 —— 它根本没验。
  const askedForPassword = /^\s*password:\s*$/im.test(text) && /Cached credentials not found/i.test(text)
  // 机器没被授权过 → steamcmd 会要一个 Steam Guard 码。
  // 它那句提示写的是「check your email」，但绑了手机令牌的账号会走上面那条手机确认。
  const askedForGuard = /has not been authenticated for your account|Steam Guard code|Two-factor code/i.test(text)
  const askedMobile = MOBILE_RE.test(text)

  const base = {
    usedAccount,
    passwordChecked: askedForPassword,
    guardAsked: askedForGuard,
    mobileAsked: askedMobile,
    exitCode
  }

  if (/Account Logon Denied|Invalid Login Auth Code/i.test(text)) {
    return { ...base, ok: false, reason: 'steam-guard' }
  }
  if (/Invalid Password/i.test(text)) return { ...base, ok: false, reason: 'bad-password' }
  if (/Rate Limit|too many/i.test(text)) return { ...base, ok: false, reason: 'rate-limit' }
  if (exitCode === 0) return { ...base, ok: true, reason: 'ok' }
  // 手机确认这条路：等超时了也不能说人家密码错 —— 就是没人去点
  if (askedMobile) return { ...base, ok: false, reason: 'mobile-timeout' }
  if (/FAILED|Login Failure/i.test(text)) return { ...base, ok: false, reason: 'failed' }
  return { ...base, ok: false, reason: 'unknown' }
}

/**
 * 异步跑一次 steamcmd 登录，返回 { ok, reason, usedAccount, passwordChecked, exitCode }
 *
 * guardCode 非空时会作为第二行喂给 stdin。steamcmd 是先读 password:、
 * 再读 Steam Guard code:，所以两行按顺序写进去就行 —— 比去解析它被块缓冲
 * 卡住的提示靠谱得多（接管道时那个提示常常刷不出来）。
 *
 * onWait({kind:'mobile'}) 会在日志里出现「去手机上确认」时回调一次 ——
 * 这时候进程还在跑、还在等你，界面应该切成「打开手机 Steam App 点确认」。
 */
export function loginTest(account, password, guardCode = '', settings, onWait) {
  const user = String(account || '').trim()
  if (!user) return Promise.resolve({ ok: false, reason: 'no-account', usedAccount: '', passwordChecked: false })
  const p = getPaths(settings || {})
  if (!fs.existsSync(p.steamcmd)) {
    return Promise.resolve({ ok: false, reason: 'no-steamcmd', usedAccount: '', passwordChecked: false })
  }

  const file = logFile(settings)
  const from = lineCount(file)

  return new Promise((resolve) => {
    const child = spawn(p.steamcmd, ['+login', user, '+quit'], {
      cwd: p.builderDir,
      windowsHide: true
    })

    let done = false
    let toldMobile = false
    let ticker = null
    /** steamcmd 打在控制台上的原文。有些提示只走 stdout，不写日志文件 */
    let streamed = ''

    /* 为什么不能只盯日志文件：
     * 实测过 —— 用户屏幕上明明出现了
     *   ...to Steam Public...This account is protected by a Steam Guard mobile authenticator.
     *   Please confirm the login in the Steam Mobile app on your phone.
     * 但 console_log.txt 里 `mobile authenticator` 出现 0 次：那句只打在控制台上，
     * 日志文件只记到 "...to Steam Public..." 就断了。
     * 所以两条路一起看：stdout 抓到最好，抓不到就靠「卡住了」这个行为兜底。 */
    const watch = () => {
      if (done || toldMobile) return

      // ① stdout / stderr 里直接看到那句
      if (MOBILE_RE.test(streamed)) {
        toldMobile = true
        onWait?.({ kind: 'mobile' })
        return
      }

      let text = ''
      try {
        text = newLines(file, from).join('\n')
      } catch {
        return
      }
      if (MOBILE_RE.test(text)) {
        toldMobile = true
        onWait?.({ kind: 'mobile' })
        return
      }

      // ② 兜底：已经 Logging in 了，十几秒既不出错也不 OK —— 那多半就是在等人。
      //    绑了手机令牌的账号，Steam 会一直挂到你在 App 里点确认为止。
      if (!/Logging in user/i.test(text)) return
      if (/ERROR|Retrying|Logged in OK/i.test(text)) return
      const m = /\[([\d-]+ [\d:]+)\] Logging in user/.exec(text)
      const since = m ? Date.parse(m[1].replace(' ', 'T') + '+08:00') : NaN
      const waited = Number.isFinite(since) ? Date.now() - since : 0
      if (waited > 15000) {
        toldMobile = true
        onWait?.({ kind: 'mobile' })
      }
    }
    ticker = setInterval(watch, 1200)

    child.stdout?.on('data', (d) => {
      streamed += d.toString('utf8')
      watch()
    })
    child.stderr?.on('data', (d) => {
      streamed += d.toString('utf8')
      watch()
    })

    const finish = (extra) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearInterval(ticker)
      const lines = newLines(file, from)
      resolve({ ...classifyLogin(lines, extra.exitCode ?? null), ...extra })
    }

    const timer = setTimeout(() => {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      } catch {
        /* ignore */
      }
      finish({ timedOut: true, exitCode: null })
    }, TIMEOUT_MS)

    // 密码（和可选的验证码）走 stdin —— build.ps1 里也是这么做的，原因一样
    const input = [String(password || '')]
    if (guardCode) input.push(String(guardCode).trim())
    child.stdin.write(input.join('\n') + '\n')
    child.stdin.end()
    child.on('error', () => finish({ spawnError: true, exitCode: null }))
    child.on('close', (code) => finish({ exitCode: code }))
  })
}
