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

const TIMEOUT_MS = 150000

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

/** 把一次登录的日志翻成人话 */
export function classifyLogin(lines = [], exitCode = null) {
  const text = lines.join('\n')
  const usedAccount = (/Logging in user '([^']+)'/i.exec(text) || [])[1] || ''

  // steamcmd 是先看缓存：有令牌就直接用，压根不会走到 password: 那一步。
  // 这种情况即使返回成功，也**不能**说密码是对的 —— 它根本没验。
  const askedForPassword = /^\s*password:\s*$/im.test(text) && /Cached credentials not found/i.test(text)

  const base = { usedAccount, passwordChecked: askedForPassword, exitCode }

  if (/Invalid Password/i.test(text)) return { ...base, ok: false, reason: 'bad-password' }
  if (/Steam Guard|Two-factor/i.test(text)) return { ...base, ok: false, reason: 'steam-guard' }
  if (/Rate Limit|too many/i.test(text)) return { ...base, ok: false, reason: 'rate-limit' }
  if (/FAILED|Login Failure/i.test(text)) return { ...base, ok: false, reason: 'failed' }
  if (exitCode === 0) return { ...base, ok: true, reason: 'ok' }
  return { ...base, ok: false, reason: 'unknown' }
}

/** 异步跑一次 steamcmd 登录，返回 { ok, reason, usedAccount, passwordChecked, exitCode } */
export function loginTest(account, password, settings) {
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
    const finish = (extra) => {
      if (done) return
      done = true
      clearTimeout(timer)
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

    // 密码走 stdin —— build.ps1 里也是这么做的，原因一样
    if (password) {
      child.stdin.write(String(password) + '\n')
    }
    child.stdin.end()
    child.on('error', () => finish({ spawnError: true, exitCode: null }))
    child.on('close', (code) => finish({ exitCode: code }))
  })
}
