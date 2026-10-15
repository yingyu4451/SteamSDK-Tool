/**
 * 验证 PowerShell 管道 "值" | & <原生exe> 能否把内容送进那个独立进程的 stdin。
 *
 * 关键：消费方必须是**独立进程**（steamcmd.exe 就是）。同进程的 & script.ps1
 * 不会经过 stdin，用那种写法测会得出错误结论。
 *
 *   node scripts/test-pipeline.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-test-'))

// 独立进程里的读取端：模拟 steamcmd 的密码提示
const reader = path.join(dir, 'reader.ps1')
fs.writeFileSync(
  reader,
  `Write-Output "password: "
$pw = [Console]::In.ReadLine()
if ($null -eq $pw) { $pw = '<EOF>' }
Write-Output ("GOT_LEN=" + $pw.Length)
Write-Output ("GOT_VALUE_OK=" + ($pw -eq 'SuperSecret123'))
`
)

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function caseRun(label, command) {
  console.log(`\n=== ${label} ===`)
  const r = spawnSync('pwsh', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000
  })
  console.log('exit:', r.status)
  console.log((r.stdout || '').trim())
  if (r.stderr?.trim()) console.log('stderr:', r.stderr.trim().slice(0, 300))
}

// 1) 字面量管道 -> 独立 pwsh 进程
caseRun(
  '字面量管道 -> 独立进程',
  `'SuperSecret123' | & pwsh -NoProfile -File ${q(reader)}`
)

// 2) 环境变量 + 管道（build.ps1 里真正要用的形式）
caseRun(
  '环境变量 + 管道 -> 独立进程',
  `$env:STEAMSDK_BUILD_PASSWORD='SuperSecret123'; $env:STEAMSDK_BUILD_PASSWORD | & pwsh -NoProfile -File ${q(reader)}`
)

// 3) 变量 + 管道
caseRun(
  '变量 + 管道 -> 独立进程',
  `$pw='SuperSecret123'; $pw | & pwsh -NoProfile -File ${q(reader)}`
)

fs.rmSync(dir, { recursive: true, force: true })
