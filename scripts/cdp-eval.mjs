/**
 * 通过 CDP 在渲染进程里执行一段 JS，用来测量真实 DOM。
 *
 *   node scripts/cdp-eval.mjs <port> <js文件>
 *
 * 需要先带 --remote-debugging-port=<port> 启动 Electron：
 *   node_modules\electron\dist\electron.exe . --remote-debugging-port=9222
 */
import fs from 'node:fs'

const port = process.argv[2] || '9222'
const file = process.argv[3]

if (!file) {
  console.error('用法: node scripts/cdp-eval.mjs <port> <js文件>')
  process.exit(1)
}

const expression = fs.readFileSync(file, 'utf8')

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('没找到 page target，targets =', targets.map((t) => t.type).join(','))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

const id = 1
ws.send(
  JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true }
  })
)

const msg = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id === id) resolve(m)
  })
})

ws.close()

if (msg.result?.exceptionDetails) {
  console.error('渲染进程抛错:', JSON.stringify(msg.result.exceptionDetails, null, 2))
  process.exit(1)
}

const value = msg.result?.result?.value
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
