/**
 * 内置 Steam 登录控制台（node-pty）
 *
 * 为什么不用管道：steamcmd 接管道时 stdout 是块缓冲，「等你手机上确认」那句
 * 经常一整个缓冲区都刷不出来（实测连 console_log.txt 里都没有），只能靠 30 秒
 * 兜底去猜。换成伪终端（ConPTY）后 steamcmd 以为自己在控制台里，输出是行缓冲，
 * 那句话会立刻出来 —— 登录流程就能实时提示「打开手机 Steam App 点确认」。
 *
 * 这个模块只负责进程和 I/O；提示判定、界面展示放在 index.js / LoginConsole.vue。
 */
import path from 'node:path'

let pty = null
try {
  // node-pty 1.1 自带 win32-x64 预编译产物（N-API），Electron 下可直接加载。
  // 加载失败时退回外置登录窗口，不能让整个应用起不来。
  pty = require('node-pty')
} catch {
  pty = null
}

const MOBILE_RE =
  /Steam Guard mobile authenticator|confirm the login in the Steam Mobile app|Open the Steam Mobile app/i

// 去掉 ANSI 控制序列（颜色、光标、窗口标题），保留 \r\n 交给渲染层归一化
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\u001b[@-_]/g

const MAX_TAIL = 4000
const MAX_CHUNK = 20000

let session = null
let seq = 0

export function available() {
  return !!pty
}

function stripAnsi(text) {
  return String(text).replace(ANSI_RE, '')
}

/**
 * 打开一个 steamcmd 伪终端。
 * @param {object} opts
 * @param {string} opts.cwd        steamcmd 所在目录（builderDir）
 * @param {string} [opts.steamcmd] steamcmd.exe 路径
 * @param {string} [opts.account]  已保存的账号：自动发一条 login 命令
 * @param {(evt:object)=>void} opts.emit 把事件转给渲染层
 */
export function open(opts = {}) {
  if (!pty) {
    return { ok: false, error: 'node-pty 没有加载成功（预编译产物缺失），只能用外置登录窗口' }
  }
  if (!opts.steamcmd) return { ok: false, error: '没有找到 steamcmd.exe' }
  close()

  let term
  try {
    term = pty.spawn(opts.steamcmd, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: opts.cwd || path.dirname(opts.steamcmd),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })
  } catch (e) {
    return { ok: false, error: `启动伪终端失败：${e.message}` }
  }

  const id = ++seq
  session = {
    id,
    term,
    emit: opts.emit || (() => {}),
    tail: '',
    toldMobile: false,
    exited: false
  }

  term.onData((data) => {
    if (!session || session.id !== id) return
    const text = stripAnsi(data).slice(0, MAX_CHUNK)
    if (!text) return
    session.emit({ type: 'data', id, text })
    if (session.toldMobile) return
    session.tail = (session.tail + text).slice(-MAX_TAIL)
    if (MOBILE_RE.test(session.tail)) {
      session.toldMobile = true
      session.emit({ type: 'mobile', id })
    }
  })

  term.onExit(({ exitCode }) => {
    if (!session || session.id !== id) return
    session.exited = true
    session.emit({ type: 'exit', id, code: exitCode })
    session = null
  })

  // 已保存过账号的话，直接替用户敲 login（密码/验证码还是要他自己输）
  if (opts.account) {
    const account = String(opts.account).trim().replace(/[\r\n]/g, '')
    if (account) {
      setTimeout(() => {
        if (session && session.id === id) term.write(`login ${account}\r`)
      }, 900)
    }
  }

  return { ok: true, id }
}

export function write(id, data) {
  if (!session || session.id !== id) return { ok: false, error: '会话已结束' }
  session.term.write(String(data ?? ''))
  return { ok: true }
}

export function resize(id, cols, rows) {
  if (!session || session.id !== id) return { ok: false }
  try {
    session.term.resize(Math.max(20, Number(cols) || 120), Math.max(8, Number(rows) || 30))
  } catch {
    /* 尺寸不合法就忽略 */
  }
  return { ok: true }
}

export function close() {
  if (!session) return
  const old = session
  session = null
  try {
    old.term.kill()
  } catch {
    /* 进程可能已经自己退了 */
  }
}

export function isOpen() {
  return !!session
}
