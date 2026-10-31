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
 *
 * 两种跑法（返回结构完全一样，界面不用改）：
 *   ① 伪终端（node-pty，装上了就用这个）：steamcmd 以为自己在控制台里，
 *      输出是行缓冲 ——「请在手机 Steam App 里点确认」这句会随打随出，
 *      我们能立刻把界面切成「打开手机点确认」。
 *   ② 管道（node-pty 加载失败时兜底）：stdout 是块缓冲，那句常常刷不出来，
 *      只能靠「卡住了 30 秒」去猜。功能不变，就是慢。
 */

/* 手机确认那条路要留够时间：用户得先看到提示、掏手机、解锁、点确认。
 * 150 秒对「盯着屏幕点一下」够，对「手机在另一个房间」就不够了。 */
const TIMEOUT_MS = 240000

let pty = null
try {
  // node-pty 1.1 自带 win32 预编译产物（N-API），Electron 下可直接加载。
  // 加载失败不能让登录整个不可用 —— 退回上面的管道模式就行。
  pty = require('node-pty')
} catch {
  pty = null
}

// 去掉 ANSI 控制序列（颜色、光标、窗口标题），只留下能读的文本
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[@-_]/g
// 只留最近这么多字符做实时判定，防止一直挂着把内存吃满
const MAX_STREAM = 200000

function stripAnsi(text) {
  return String(text).replace(ANSI_RE, '')
}

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
 * guardCode 非空时会作为第二行喂给 steamcmd（先 password:、再 Steam Guard code:）。
 *
 * onWait({kind:'mobile'}) 会在「去手机上确认」那句出现时回调一次 ——
 * 这时候进程还在跑、还在等你，界面应该切成「打开手机 Steam App 点确认」。
 * 装了 node-pty 时这个回调是实时的（毫秒级）。
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
  const ctx = { p, user, password, guardCode, file, from, onWait }

  if (pty) return runPtyLogin(ctx)
  return runPipeLogin(ctx)
}

/** 伪终端模式：输出是行缓冲的，手机确认提示能立刻读到 */
function runPtyLogin({ p, user, password, guardCode, file, from, onWait }) {
  return new Promise((resolve) => {
    let term
    try {
      term = pty.spawn(p.steamcmd, ['+login', user, '+quit'], {
        name: 'xterm-256color',
        cols: 200,
        rows: 40,
        cwd: p.builderDir,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      })
    } catch {
      // 伪终端起不来就退回管道模式，别让登录直接不可用
      runPipeLogin({ p, user, password, guardCode, file, from, onWait }).then(resolve)
      return
    }

    let done = false
    let toldMobile = false
    let wrotePassword = false
    let wroteGuard = false
    let streamed = ''
    let ticker = null

    const finish = (extra) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearInterval(ticker)
      try {
        term.kill()
      } catch {
        /* 进程可能已经自己退了 */
      }
      resolve({ ...classifyLogin(newLines(file, from), extra.exitCode ?? null), ...extra })
    }

    const write = (value) => {
      try {
        term.write(value)
      } catch {
        /* 会话已经结束 */
      }
    }

    /* 只在看到提示符时才输入。提前打字会被 ConPTY 排在输入队列里，
     * 很可能落到下一个提示上（比如把验证码当密码喂进去）。 */
    const feedPrompts = () => {
      const tail = streamed.slice(-4000)
      if (!wrotePassword && /password:\s*$/im.test(tail)) {
        wrotePassword = true
        write(String(password || '') + '\r')
        return
      }
      if (!wroteGuard && /(Steam Guard code|Two-factor code):\s*$/im.test(tail)) {
        wroteGuard = true
        if (guardCode) {
          write(String(guardCode).trim() + '\r')
        } else {
          // 还没拿到验证码就先收工，让界面去要码（不然只能干等超时）
          setTimeout(() => finish({ exitCode: null, guardAsked: true }), 600)
        }
      }
    }

    /* 实时判定：拿到一块输出就查一遍。
     * 这是「最快知道要去看手机」的关键 —— 伪终端下这句不会被块缓冲吃掉。 */
    const onData = (raw) => {
      const text = stripAnsi(raw)
      if (!text) return
      streamed = (streamed + text).slice(-MAX_STREAM)
      if (!toldMobile && MOBILE_RE.test(streamed.slice(-4000))) {
        toldMobile = true
        onWait?.({ kind: 'mobile' })
      }
      feedPrompts()
    }

    term.onData(onData)
    term.onExit(({ exitCode }) => finish({ exitCode }))

    // 日志文件兜底（有些提示只写日志、不走控制台） + 老版本的「卡住了」兜底
    const watch = () => {
      if (done || toldMobile) return
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
      // 已经 Logging in 了，30 秒既不出错也不 OK —— 那就是在等人。
      if (!/Logging in user/i.test(text)) return
      if (/ERROR|Retrying|Logged in OK/i.test(text)) return
      const m = /\[([\d-]+ [\d:]+)\] Logging in user/.exec(text)
      const since = m ? Date.parse(m[1].replace(' ', 'T') + '+08:00') : NaN
      const waited = Number.isFinite(since) ? Date.now() - since : 0
      if (waited > 30000) {
        toldMobile = true
        onWait?.({ kind: 'mobile' })
      }
    }
    ticker = setInterval(watch, 1000)

    const timer = setTimeout(() => {
      finish({ timedOut: true, exitCode: null })
    }, TIMEOUT_MS)
  })
}

/** 管道模式（node-pty 不可用时的兜底，行为跟旧版完全一致） */
function runPipeLogin({ p, user, password, guardCode, file, from, onWait }) {
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

    /* 管道模式下 steamcmd 的 stdout 是块缓冲：让它停在提示上干等，
     * 20 秒只收到 92 字节的横幅，手机确认那句一个字都不刷出来。
     * 所以只能两条路一起看：stdout 抓到最好，抓不到就靠「卡住了」兜底。 */
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

      // ② 兜底：已经 Logging in 了，半分钟既不出错也不 OK —— 那就是在等人。
      //
      // 30 秒这个数是量出来的：
      //   密码错     → 5 秒（我这边的实测）到 22 秒（用户日志里最慢那次）
      //   等手机确认 → 60 秒起步（用户日志里卡了 69 秒才出 Retrying）
      // 取中间，两边都留出余量。
      if (!/Logging in user/i.test(text)) return
      if (/ERROR|Retrying|Logged in OK/i.test(text)) return
      const m = /\[([\d-]+ [\d:]+)\] Logging in user/.exec(text)
      const since = m ? Date.parse(m[1].replace(' ', 'T') + '+08:00') : NaN
      const waited = Number.isFinite(since) ? Date.now() - since : 0
      if (waited > 30000) {
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
