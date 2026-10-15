import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

/* ------------------------------------------------------------------ *
 *  PowerShell 可执行文件解析：优先 pwsh(7+)，退回 Windows PowerShell
 * ------------------------------------------------------------------ */

let psExe = null
function resolvePowerShell() {
  if (psExe) return psExe
  for (const candidate of ['pwsh.exe', 'pwsh']) {
    const r = spawnSync(candidate, ['-NoProfile', '-Command', 'exit 0'], { windowsHide: true })
    if (r.status === 0) {
      psExe = candidate
      return psExe
    }
  }
  psExe = 'powershell.exe'
  return psExe
}

/* ------------------------------------------------------------------ *
 *  运行中的任务
 * ------------------------------------------------------------------ */

const runs = new Map()

export function listRuns() {
  return [...runs.values()].map((r) => ({
    id: r.id,
    label: r.label,
    script: r.script,
    startedAt: r.startedAt,
    lines: r.lines.length
  }))
}

export function isRunning(id) {
  return runs.has(id)
}

export function sendInput(id, text) {
  const r = runs.get(id)
  if (!r || !r.child.stdin.writable) return { ok: false, error: '该任务没有可写入的 stdin' }
  r.child.stdin.write(String(text).replace(/\r?\n$/, '') + '\n')
  r.askedGuard = true
  return { ok: true }
}

export function killRun(id) {
  const r = runs.get(id)
  if (!r) return { ok: false, error: '任务不存在或已结束' }
  // pwsh 会再拉起 steamcmd，必须整棵进程树一起杀
  const pid = r.child.pid
  try {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
  } catch {
    try {
      r.child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 *  启动一个 PowerShell 脚本，实时流式回报输出
 * ------------------------------------------------------------------ */

/**
 * @param {object} o
 * @param {string} o.script      要执行的 .ps1 绝对路径
 * @param {string[]} [o.args]    传给脚本的参数
 * @param {string} [o.cwd]       工作目录
 * @param {string} [o.label]     界面上显示的名字
 * @param {string} [o.password]  仅用于日志脱敏；真正的密码由 build.ps1 从环境变量读取
 * @param {object} [o.env]       额外注入的环境变量
 * @param {(e:{stream:string,line:string,raw:string})=>void} [o.onData]
 * @param {(e:{kind:string,hint:string})=>void} [o.onPrompt]
 * @param {(e:{code:number|null,runId:string})=>void} [o.onExit]
 */
export function runScript({
  script,
  args = [],
  cwd,
  label = '',
  password = '',
  env = {},
  onData,
  onPrompt,
  onExit
}) {
  if (!fs.existsSync(script)) {
    onExit?.({ code: -1, runId: null, error: `脚本不存在：${script}` })
    return null
  }

  const id = randomUUID()
  const exe = resolvePowerShell()

  // 用 -File 而不是 -Command 拼接字符串：
  //   * 参数作为真正的 argv 传进去，不会出现 '-App' 被当成位置参数的引号陷阱
  //   * pwsh 7 管道输出默认就是 UTF-8，不需要再塞 OutputEncoding 前置语句，
  //     否则参数绑定阶段的报错还是会以 OEM 代码页输出、中文变乱码
  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args]

  const child = spawn(exe, psArgs, {
    cwd: cwd || undefined,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...env }
  })

  const record = {
    id,
    label,
    script,
    startedAt: Date.now(),
    lines: [],
    child
  }
  runs.set(id, record)

  let bufOut = ''
  let bufErr = ''

  // 万一密码以任何形式回显到输出里，这里兜底抹掉，绝不进界面
  const scrub = (s) => (password ? String(s).split(password).join('********') : String(s))

  const emit = (stream, raw) => {
    const text = scrub(raw.toString('utf8'))
    const key = stream === 'stderr' ? 'bufErr' : 'bufOut'
    let buf = (key === 'bufErr' ? bufErr : bufOut) + text
    const parts = buf.split(/\r?\n/)
    buf = parts.pop() ?? ''
    if (key === 'bufErr') bufErr = buf
    else bufOut = buf

    for (const line of parts) {
      if (line === '' && stream === 'stderr') continue
      record.lines.push({ stream, line, t: Date.now() })
      onData?.({ stream, line, raw: line })
    }

    // Steam Guard / 两步验证：stdout 被块缓冲时看不到提示，属于尽力而为
    if (!record.askedGuard && /two-?factor|guard code|verification code|验证码/i.test(text)) {
      record.askedGuard = true
      onPrompt?.({
        kind: 'steamguard',
        hint: 'Steam 要求两步验证码，请输入后回车'
      })
    }
  }

  child.stdout.on('data', (d) => emit('stdout', d))
  child.stderr.on('data', (d) => emit('stderr', d))

  child.on('error', (err) => {
    onData?.({ stream: 'stderr', line: `无法启动 ${exe}：${err.message}`, raw: '' })
  })

  child.on('close', (code) => {
    if (bufOut) emit('stdout', Buffer.from(bufOut))
    if (bufErr) emit('stderr', Buffer.from(bufErr))
    runs.delete(id)
    onExit?.({ code, runId: id, lines: record.lines })
  })

  return { id, pid: child.pid }
}
