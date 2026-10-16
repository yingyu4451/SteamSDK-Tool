/**
 * 验证 runner 的两种调用方式，重点看：
 *  1) 参数能不能正确传给脚本（引号问题）
 *  2) 中文输出经管道传回 Node 后编码是否正确
 *
 *   node scripts/test-runner.mjs
 */
import { spawn } from 'node:child_process'

const SCRIPT = 'D:\\SteamSDK\\tools\\ContentBuilder\\check.ps1'
const CWD = 'D:\\SteamSDK\\tools\\ContentBuilder'

function run(label, exe, args) {
  return new Promise((resolve) => {
    console.log(`\n=========== ${label} ===========`)
    console.log('argv:', JSON.stringify(args.slice(0, 8)))
    const child = spawn(exe, args, { cwd: CWD, windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString('utf8')))
    child.stderr.on('data', (d) => (err += d.toString('utf8')))
    child.on('close', (code) => {
      console.log('exit code:', code)
      console.log('--- stdout ---')
      console.log(out.trim().split('\n').slice(0, 18).join('\n'))
      if (err.trim()) {
        console.log('--- stderr ---')
        console.log(err.trim().split('\n').slice(0, 6).join('\n'))
      }
      const mojibake = /\uFFFD/.test(out)
      console.log('编码有乱码:', mojibake)
      resolve({ code, mojibake })
    })
  })
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`

// A：当前 runner 的做法 —— 所有 token 都被引号包起来
await run('A: -Command + 全部加引号（当前实现，预期失败）', 'pwsh', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `& ${psQuote(SCRIPT)} ${psQuote('-App')} ${psQuote('MyGameTest')}`
])

// B：-File 传参
await run('B: -File 传参', 'pwsh', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  SCRIPT,
  '-App',
  'MyGameTest'
])

// C：-Command 但只给值加引号
await run('C: -Command + 只给值加引号', 'pwsh', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  `& ${psQuote(SCRIPT)} -App ${psQuote('MyGameTest')}`
])
