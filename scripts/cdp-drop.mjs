/**
 * 用 CDP 的 Input.dispatchDragEvent 真模拟一次「从资源管理器拖文件进来」。
 * Runtime.evaluate 造不出能过 webUtils.getPathForFile 的 File，只有这条能。
 *
 * 用法: node scripts/cdp-drop.mjs <port> <绝对路径>
 */
const [, , portArg, targetPath] = process.argv
const port = portArg || '9222'
if (!targetPath) {
  console.error('用法: node scripts/cdp-drop.mjs <port> <绝对路径>')
  process.exit(1)
}

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) {
  console.error('没找到页面 target')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

function send(method, params) {
  return new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
})

await new Promise((r) => ws.addEventListener('open', r, { once: true }))

const data = { items: [], files: [targetPath], dragOperationsMask: 1 }
const at = { x: 700, y: 400 }

for (const type of ['dragEnter', 'dragOver', 'drop']) {
  await send('Input.dispatchDragEvent', { type, ...at, data })
  await new Promise((r) => setTimeout(r, 220))
}

console.log(`已模拟拖入: ${targetPath}`)
ws.close()
