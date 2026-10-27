#!/usr/bin/env node
/**
 * 每次改代码自动构建 release/win-unpacked（不打包安装包，只更新解包目录）。
 *
 * 用法：
 *   pnpm watch:unpacked                     # 常驻监听：改 src/ resources/ build/ package.json 等就重建
 *   node scripts/watch-unpacked.mjs --once  # 只构建一次（手动验证 / CI 用）
 *
 * 流程：electron-vite build → electron-builder --dir。
 * release/win-unpacked 里的应用正在运行时，会等它关闭后再继续（不会强杀应用），
 * 其余占用（杀毒、资源管理器预览）失败会 3 秒后重试。
 */
import { spawn } from 'node:child_process'
import { watch, watchFile } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const once = process.argv.includes('--once')

const WATCH_DIRS = ['src', 'resources', 'build']
const WATCH_FILES = ['package.json', 'electron-builder.yml']
const IGNORE = [/[\\/]node_modules[\\/]/, /[\\/]release[\\/]/, /[\\/]out[\\/]/, /[\\/]\.git[\\/]/, /\.(log|tmp)$/]

let building = false
let dirty = false
let retryTimer = null
let retries = 0
let waitingAnnounced = false

const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const log = (msg) => console.log(`[watch ${stamp()}] ${msg}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function spawnNode(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules', script), ...args], {
      cwd: root,
      stdio: 'inherit'
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

/** release/win-unpacked 里的应用是否正在运行（exe 名字来自 productName） */
function appRunning() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false)
    const child = spawn('tasklist', ['/FI', 'IMAGENAME eq SteamSDK Tool.exe', '/NH'], {
      windowsHide: true
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('close', () => resolve(/SteamSDK Tool\,?exe/i.test(out) || /SteamSDK Tool\.exe/i.test(out)))
    child.on('error', () => resolve(false))
  })
}

/** 等 win-unpacked 里的应用关掉（不强杀，用户自己关） */
async function waitForAppClosed() {
  let first = true
  while (await appRunning()) {
    if (first) {
      log('release/win-unpacked 里的应用正在运行，等它关闭后自动继续构建（不会强杀应用）…')
      first = false
      waitingAnnounced = true
    }
    if (dirty) {
      // 用户还在改代码，边等边继续
    }
    await sleep(1500)
  }
  if (waitingAnnounced) {
    log('应用已关闭，继续构建')
    waitingAnnounced = false
  }
}

async function build() {
  if (building) {
    dirty = true
    return 1
  }
  building = true
  dirty = false
  retries = 0
  const t0 = Date.now()
  log('开始构建 win-unpacked …')

  let code = await spawnNode('electron-vite/bin/electron-vite.js', ['build'])
  if (code === 0) {
    await waitForAppClosed()
    code = await spawnNode('electron-builder/cli.js', ['--dir', '--publish', 'never'])
  }

  building = false
  if (code === 0) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1)
    log(`✔ win-unpacked 已更新（${sec}s）→ release/win-unpacked/SteamSDK Tool.exe`)
    if (dirty) return build()
    return 0
  }

  retries += 1
  if (!once && retries <= 40) {
    log(`✘ 构建失败（exit ${code}），3 秒后重试（第 ${retries} 次）。`)
    retryTimer = setTimeout(() => {
      retryTimer = null
      build()
    }, 3000)
  } else {
    log(`✘ 构建失败（exit ${code}）`)
  }
  return code
}

let debounceTimer = null
function schedule(reason) {
  if (once) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    log(`检测到改动${reason ? `（${reason}）` : ''}，构建中…`)
    build()
  }, 350)
}

for (const dir of WATCH_DIRS) {
  const abs = path.join(root, dir)
  try {
    watch(abs, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = path.join(dir, filename)
      if (IGNORE.some((re) => re.test(rel))) return
      schedule(rel)
    })
    log(`监听 ${dir}/`)
  } catch (e) {
    log(`监听 ${dir}/ 失败：${e.message}`)
  }
}
for (const file of WATCH_FILES) {
  try {
    watchFile(path.join(root, file), { interval: 400 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs) schedule(file)
    })
    log(`监听 ${file}`)
  } catch (e) {
    log(`监听 ${file} 失败：${e.message}`)
  }
}

log(`工作目录：${root}`)
log(`提示：正在跑 release/win-unpacked 的应用时，构建会等它关闭；不想等就关掉应用。`)

const firstCode = await build()
if (once) process.exit(firstCode)
process.on('SIGINT', () => {
  log('退出监听')
  process.exit(0)
})
