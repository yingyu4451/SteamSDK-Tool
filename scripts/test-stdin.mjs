/**
 * 验证 -File 模式下 stdin 能不能转发到脚本里的原生进程。
 * 密码自动应答依赖这个行为（不把密码放进命令行）。
 *
 *   node scripts/test-stdin.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stdin-fwd-'))

// 内层：一个真正从 stdin 读一行的原生行为
const inner = path.join(dir, 'native-reader.ps1')
fs.writeFileSync(inner, '$line = [Console]::In.ReadLine()\nWrite-Output "GOT:[$line]"\n')

// 外层：一个会转手调用内层的脚本，模拟 build.ps1 调用 steamcmd
const outer = path.join(dir, 'outer.ps1')
fs.writeFileSync(
  outer,
  `param([string]$App)
Write-Output "outer started, App=$App"
Write-Output "prompt: password:"
& '${inner.replace(/'/g, "''")}'
Write-Output "outer done"
`
)

console.log('-File 调用:', JSON.stringify(['-NoProfile', '-File', outer, '-App', 'X']))

const child = spawn('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', outer, '-App', 'X'], {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe']
})

let out = ''
child.stdout.on('data', (d) => {
  const text = d.toString('utf8')
  out += text
  process.stdout.write(text)
  // 看到密码提示就把密码写进 stdin
  if (/password\s*:/i.test(text)) {
    console.log('>>> 检测到 password: 提示，写入密码')
    child.stdin.write('SUPER_SECRET\n')
  }
})
child.stderr.on('data', (d) => process.stderr.write(d.toString('utf8')))

child.on('close', (code) => {
  console.log('exit code:', code)
  console.log('stdin 转发成功:', /GOT:\[SUPER_SECRET\]/.test(out))
  fs.rmSync(dir, { recursive: true, force: true })
})
