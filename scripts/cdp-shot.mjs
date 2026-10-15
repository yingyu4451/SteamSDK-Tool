/**
 * 通过 CDP 抓取渲染进程视口的真实像素（不含窗口边框）。
 *
 *   node scripts/cdp-shot.mjs <port> <输出png>
 */
import fs from 'node:fs'

const port = process.argv[2] || '9222'
const out = process.argv[3] || 'viewport.png'

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('没找到 page target')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let id = 0
function call(method, params = {}) {
  const myId = ++id
  ws.send(JSON.stringify({ id: myId, method, params }))
  return new Promise((resolve) => {
    const onMsg = (e) => {
      const m = JSON.parse(e.data)
      if (m.id === myId) {
        ws.removeEventListener('message', onMsg)
        resolve(m.result)
      }
    }
    ws.addEventListener('message', onMsg)
  })
}

// 先量一下视口
const metrics = await call('Runtime.evaluate', {
  expression: 'JSON.stringify({w: innerWidth, h: innerHeight, dpr: devicePixelRatio})',
  returnByValue: true
})
console.log('视口:', metrics.result.value)

const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('已保存:', out, fs.statSync(out).size, 'bytes')

ws.close()
