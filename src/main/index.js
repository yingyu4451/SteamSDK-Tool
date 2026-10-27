import { app, BrowserWindow, ipcMain, shell, dialog, Notification } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

import {
  loadSettings,
  saveSettings,
  savePassword,
  readPassword,
  clearPassword,
  hasPassword,
  encryptionAvailable,
  rememberBranch,
  saveApiKey,
  readApiKey,
  clearApiKey,
  setDepotMeta,
  readDepotMeta,
  rememberAppId,
  setIgnoredProblem,
  setOnboarded
} from './store.js'
import {
  sdkStatus,
  scanApps,
  readApp,
  listHistory,
  readLog,
  setAppBranch,
  cleanupPreviewArtifacts,
  createApp,
  renameApp,
  updateAppFields,
  updateDepotFields,
  addDepot,
  removeDepot,
  ensureDepotContentDir,
  syncDepotRoots,
  describeDelete,
  deleteApp,
  scanOrphans,
  adoptOrphans,
  suggestDepotId,
  defaultContentRoot,
  detectSdkRoots,
  getPaths,
  readSteamLogin
} from './sdk.js'
import { loginTest } from './login.js'
import { preflightApp } from './preflight.js'
import { inspectFolder, copyAndStripFolder, suggestDest } from './steamstrip.js'
import { describeLogin, forgetLogin } from './forget.js'
import {
  checkUpdate,
  downloadUpdate,
  installUpdate,
  cleanupDownloads,
  pruneOldDownloads,
  openReleases,
  currentVersion,
  repoUrl,
  isPortable,
  canIncremental,
  incrementalDownload,
  incrementalInstall
} from './updater.js'
import { analyzeTarget, applyDrop } from './dropzone.js'
import { localStatus, startLocal, stopLocal, probePort, steamDevCfg, writeSteamDevCfg } from './localserver.js'
import {
  PLATFORMS,
  DEFAULT_EXCLUSIONS,
  defaultExclusionsFor,
  DEPOT_OS,
  DEPOT_ARCH,
  DEPOT_ARCH_BY_OS,
  DEPOT_LANGUAGES
} from './vdf-edit.js'
import {
  testKey,
  getPartnerApps,
  getAppDepotVersions,
  getAppBetas,
  getAppBuilds,
  diffDepots,
  diffBranches,
  summarizeAppDepots
} from './steamapi.js'
import { fetchAppDepotsViaSteamcmd } from './steamcmdinfo.js'
import { runScript, killRun, sendInput, listRuns } from './runner.js'
import {
  resolveBundledScriptsDir,
  setBundledScriptsDir,
  ensureScripts,
  installScripts
} from './scripts.js'

let mainWindow = null

/**
 * 用 steamcmd 的 app_info_print 读某个 App 的 depot 列表。
 * 这是「不是管理员、拿不到 partner 密钥」时唯一能读到后台真实 DepotID 的路子 ——
 * 复用他们上传构建用的那个账号（密码走应用已经存好的 DPAPI 凭据）。
 */
async function viaSteamcmd(appId, settings) {
  const p = getPaths(settings)
  const username = String(settings.account || '').trim()
  if (!username) {
    return { ok: false, error: '还没有配置 Steam 账号名（设置 → 账号）', needsPassword: true }
  }
  const password = readPassword()
  if (!password) {
    return {
      ok: false,
      needsPassword: true,
      error: `需要 Steam 账号 ${username} 的密码才能用 steamcmd 查后台 Depot（设置里没存密码）`
    }
  }

  try {
    const r = await fetchAppDepotsViaSteamcmd({
      appId,
      steamcmd: p.steamcmd,
      username,
      password,
      cwd: p.builderDir
    })
    if (!r.ok) return r
    // steamcmd 那边解析出来的字段名跟 Web API 一样（depotid / oslist / maxsize…），
    // 必须过同一个 summarizeAppDepots —— 不然向导拿到的是 depotid，
    // 界面读的是 depotId， DepotID 那一列会静默变成空白。
    return {
      ok: true,
      via: 'steamcmd',
      appId: r.appId,
      appIdKnown: true,
      appName: r.appName || '',
      anonymous: !!r.anonymous,
      depots: summarizeAppDepots(r.depots),
      // 原始结构留着，给「与后台对账」用 —— diffDepots 读的是 manifests 数组，
      // 而 summarizeAppDepots 只挑了一个代表 manifest 出来。
      rawDepots: r.depots,
      // app_info_print 的 manifests 以**分支名**为键（public / prerelease…），
      // 所以分支列表能直接推出来，不需要 Web API 的 GetAppBetas。
      betas: steamBranchesFrom(r.depots)
    }
  } catch (e) {
    return { ok: false, error: `steamcmd 查询失败：${e.message}` }
  }
}

/** 从 app_info_print 的 depot manifests 里推出这个 App 有哪些分支（public / beta…）。 */
function steamBranchesFrom(depots = []) {
  const keys = new Set()
  for (const d of depots || []) {
    for (const m of d.manifests || []) if (m.branch) keys.add(String(m.branch))
  }
  return [...keys].map((betakey) => ({ betakey, description: '', buildid: '' }))
}

/**
 * 用 steamcmd 读到的数据组装「与后台对账」的结果。
 *
 * 比 Web API 少两样，界面上要**明说读不到**，不能装作是空的：
 *   ① 「这个密钥名下的 App 列表」—— 那是 Web API 才有的，所以判断不了 AppID 是否在权限内；
 *   ② 构建历史 —— app_info_print 只给每个 depot 当前的 manifest，没有历史列表。
 * 分支列表反而有：app_info_print 的 manifests 以分支名为键，能直接推出来。
 */
function buildSteamVerify(app, steamy, settings, webError = '') {
  const raw = steamy.rawDepots || []
  return {
    ok: true,
    via: 'steamcmd',
    webError,
    anonymous: !!steamy.anonymous,
    appId: String(app.appId),
    appName: steamy.appName || '',
    appIdKnown: true,
    partnerAppCount: 0,
    // 界面读的是归一化之后的字段（depotId / platform / manifestId …），
    // 原始解析结构里叫 depotid / oslist / manifests[].manifestid。
    // 这里必须过一道 summarizeAppDepots —— 少这一道，DepotID 那一列会静默变空白。
    steamDepots: summarizeAppDepots(raw),
    betas: steamy.betas || [],
    builds: [],
    buildsUnavailable: true,
    // diffDepots 要的是原始结构（它自己会去翻 manifests），别喂归一化后的
    depotDiff: diffDepots(app, { depots: raw }),
    branchDiff: diffBranches(
      (settings.branches || {})[String(app.appId)] || [],
      { betas: steamy.betas || [] }
    )
  }
}

/* ------------------------------------------------------------------ *
 *  窗口
 * ------------------------------------------------------------------ */

/* 任务栏 / 窗口图标。开发模式读仓库里的 build/，打包后读 resources/
 * （由 electron-builder 的 extraResources 拷进去）。
 * Windows 用 .ico（多尺寸，任务栏小图才清晰），其它平台用 .png。 */
function appIconPath() {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const roots = app.isPackaged
    ? [process.resourcesPath]
    : [path.join(__dirname, '../../build')]
  for (const root of roots) {
    for (const file of [name, 'icon.png']) {
      const p = path.join(root, file)
      try {
        if (fs.existsSync(p)) return p
      } catch {
        /* 读不到就试下一个 */
      }
    }
  }
  return undefined
}

function createWindow() {
  const settings = loadSettings()
  const b = settings.windowBounds || {}

  mainWindow = new BrowserWindow({
    width: b.width || 1440,
    height: b.height || 920,
    x: b.x,
    y: b.y,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#171a21',
    title: 'SteamSDK 上传工作台',
    // 任务栏 / Alt+Tab 图标。打包后 exe 里也嵌了同一份，但显式给一份
    // 能让开发模式（跑的是 electron.exe）也显示自己的图标，而不是 Electron 的默认原子。
    icon: appIconPath(),
    autoHideMenuBar: true,
    // 不用 titleBarOverlay：那是系统画的按钮，样式跟着 Windows 走，
    // 跟我们的顶栏对不齐，hover 也改不了。自己画三个按钮（见 TitleBar.vue）。
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 最大化状态变了要告诉界面，按钮图标得跟着换
  const tellMaximized = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('win:maximized', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', tellMaximized)
  mainWindow.on('unmaximize', tellMaximized)

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const bounds = mainWindow.getBounds()
    saveSettings({ windowBounds: bounds })
  }
  mainWindow.on('resize', persistBounds)
  mainWindow.on('move', persistBounds)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/* ------------------------------------------------------------------ *
 *  工具
 * ------------------------------------------------------------------ */

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

/** 只允许读 ContentBuilder 目录下的文件，防止渲染层拿到任意路径读取能力 */
function assertInsideContentBuilder(file) {
  const cb = path.resolve(getPaths(loadSettings()).contentBuilder)
  const target = path.resolve(file)
  if (!target.startsWith(cb + path.sep)) {
    throw new Error(`拒绝访问 ContentBuilder 之外的路径：${target}`)
  }
  return target
}

function currentPassword(override) {
  if (typeof override === 'string' && override.length) return override
  return readPassword()
}

/* ------------------------------------------------------------------ *
 *  构建脚本（工具自带，不是 SDK 的一部分）
 * ------------------------------------------------------------------ */

/**
 * 自动把工具自带的 build.ps1 / check.ps1 补进 SDK 的 tools\ContentBuilder。
 * 只在 ContentBuilder 存在时动手；已经存在的文件不覆盖（用户可能改过）。
 * 失败不抛：调用方会再检查一次文件在不在，不耽误后面的流程。
 */
function autoInstallScripts(settings = loadSettings()) {
  const sdkRoot = String(settings?.sdkRoot || '').trim()
  if (!sdkRoot) return { ok: false, error: '还没设置 SDK 路径' }
  const paths = getPaths(settings)
  if (!fs.existsSync(paths.contentBuilder)) {
    return { ok: false, error: 'SDK 路径里没有 tools\\ContentBuilder' }
  }
  try {
    return ensureScripts(paths.contentBuilder)
  } catch (e) {
    console.error('[scripts] auto install failed:', e)
    return { ok: false, error: e.message }
  }
}

/**
 * 跑 check / build 之前确认脚本在那儿：缺了就补一次，补不上再把原因说人话。
 * 返回 null = 可以跑；返回字符串 = 直接回给界面的错误。
 */
function ensureRunScript(settings, paths, which) {
  const file = which === 'check' ? paths.checkScript : paths.buildScript
  const label = which === 'check' ? 'check.ps1' : 'build.ps1'
  if (fs.existsSync(file)) return null
  autoInstallScripts(settings)
  if (fs.existsSync(file)) return null
  if (!fs.existsSync(paths.contentBuilder)) {
    return `找不到 ${label} —— SDK 路径没指向带 tools\\ContentBuilder 的目录：${settings.sdkRoot}`
  }
  return `缺少 ${label}，工具自带的也没能写进去（${paths.contentBuilder}）。到设置里点「安装/修复脚本」重试。`
}

/* ------------------------------------------------------------------ *
 *  IPC
 * ------------------------------------------------------------------ */

function registerIpc() {
  /* ---- 设置 ---- */
  ipcMain.handle('settings:get', () => ({
    settings: loadSettings(),
    encryptionAvailable: encryptionAvailable(),
    hasPassword: hasPassword()
  }))

  ipcMain.handle('settings:save', (_e, patch) => {
    const saved = saveSettings(patch || {})
    // 换了 SDK 路径就顺手补一次构建脚本：干净机器上 SDK 里本来就没有这两个
    // 工具自带文件，不补的话换完路径设置页立刻两行红字。
    if (saved?.ok && patch && Object.prototype.hasOwnProperty.call(patch, 'sdkRoot')) {
      autoInstallScripts(saved.settings || loadSettings())
    }
    return saved
  })
  ipcMain.handle('settings:onboarded', (_e, on) => setOnboarded(on))

  /* ---- Steamworks Web API ---- */
  ipcMain.handle('api:setKey', (_e, key) => saveApiKey(key))
  ipcMain.handle('api:clearKey', () => clearApiKey())
  ipcMain.handle('api:keyState', () => {
    const s = loadSettings()
    const k = readApiKey()
    return { has: !!k, tail: k ? k.slice(-4) : '' }
  })
  ipcMain.handle('api:testKey', async () => {
    const k = readApiKey()
    if (!k) return { ok: false, error: '还没有配置 Web API 密钥' }
    try {
      const r = await testKey(k)
      return { ok: true, count: r.count, sample: r.apps.slice(0, 40) }
    } catch (e) {
      return { ok: false, error: e.message, status: e.status || 0 }
    }
  })

  /**
   * 新建 App 向导用：只填了 AppID 的情况下，把后台这个 App 下已经配好的
   * Depot 全列出来（含平台、体积），好让向导直接填而不是靠猜 AppID+1。
   *
   * 两条路，按可用性自动选：
   *   1. Web API 密钥（partner 级）—— 快，不用登录，但**只有管理员能拿到密钥**
   *   2. steamcmd 的 app_info_print —— 用上传构建的那个账号，合作方普通成员也能用
   * 两条路的结果都过 `summarizeAppDepots()`，所以向导那边看到的形状是一样的。
   */
  ipcMain.handle('api:appDepots', async (_e, { appId, via } = {}) => {
    const id = String(appId ?? '').trim()
    if (!/^\d+$/.test(id)) return { ok: false, error: 'AppID 必须是数字' }

    const s = loadSettings()
    const key = readApiKey()
    // via='steamcmd' 强制走第二条；否则有密钥就用密钥
    const useWeb = via === 'steamcmd' ? false : !!key

    if (useWeb) {
      try {
        const [depots, partnerApps] = await Promise.all([
          getAppDepotVersions(key, id),
          getPartnerApps(key)
        ])
        const known = partnerApps.find((a) => a.appid === id)
        return {
          ok: true,
          via: 'webapi',
          appId: id,
          appIdKnown: !!known,
          appName: known ? known.name : '',
          depots: summarizeAppDepots(depots.depots)
        }
      } catch (e) {
        // 密钥被拒（403）不该直接失败 —— 退回 steamcmd 再试一次
        const steamy = await viaSteamcmd(id, s)
        if (steamy.ok) return { ...steamy, webError: e.message }
        return { ok: false, error: e.message, status: e.status || 0, via: 'webapi' }
      }
    }

    const r = await viaSteamcmd(id, s)
    if (r.ok) return r
    // 没密钥也没密码时，把「该去哪配」讲清楚，别只说失败
    if (r.needsPassword && !key) {
      return {
        ...r,
        error:
          `${r.error}\n\n` +
          '想在向导里直接读后台 Depot，二选一：\n' +
          '  • 在「设置」里保存 Steam 账号密码（用上传构建的那个账号），或者\n' +
          '  • 找管理员要一个 Steamworks Web API 密钥，填在「设置」里。'
      }
    }
    return r
  })

  /**
   * 拿后台的真实数据校验本地 vdf。
   * 这是「本地读不到的东西」唯一的真相来源：本地脚本只能说明你想传什么，
   * 后台才说明这个 App 下到底有哪些 Depot、哪些分支。
   *
   * 跟向导里的「读取后台 Depot」一样是两条路：有 Web API 密钥就用密钥，
   * 没有（或密钥被拒）就走 steamcmd + 已保存的 Steam 账号 —— 所以**不需要管理员**。
   */
  ipcMain.handle('api:verifyApp', async (_e, { dirName, via } = {}) => {
    const s = loadSettings()
    const app = readApp(dirName, s)
    if (app.error) return { ok: false, error: app.error }
    if (!app.appId) return { ok: false, error: '这个 App 没有 AppID，没法查后台' }

    const key = readApiKey()
    const useWeb = via === 'steamcmd' ? false : !!key

    if (useWeb) {
      try {
        const [depots, betas, builds, partnerApps] = await Promise.all([
          getAppDepotVersions(key, app.appId),
          getAppBetas(key, app.appId),
          getAppBuilds(key, app.appId, 5),
          getPartnerApps(key)
        ])

        const known = partnerApps.find((a) => a.appid === String(app.appId))

        return {
          ok: true,
          via: 'webapi',
          appId: String(app.appId),
          appName: known ? known.name : '',
          appIdKnown: !!known,
          partnerAppCount: partnerApps.length,
          steamDepots: summarizeAppDepots(depots.depots),
          betas: betas.betas,
          builds: builds.builds,
          depotDiff: diffDepots(app, depots),
          branchDiff: diffBranches((s.branches || {})[String(app.appId)] || [], betas)
        }
      } catch (e) {
        // 密钥被拒（403）不该直接失败 —— 退回 steamcmd 再试一次
        const steamy = await viaSteamcmd(app.appId, s)
        if (steamy.ok) return buildSteamVerify(app, steamy, s, e.message)
        return { ok: false, error: e.message, status: e.status || 0, via: 'webapi' }
      }
    }

    const steamy = await viaSteamcmd(app.appId, s)
    if (!steamy.ok) return steamy
    return buildSteamVerify(app, steamy, s)
  })

  ipcMain.handle('cred:set', (_e, password) => savePassword(String(password ?? '')))
  ipcMain.handle('cred:clear', () => clearPassword())

  ipcMain.handle('sdk:pickFolder', async (_e, current) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择 SteamSDK 根目录',
      defaultPath: current || loadSettings().sdkRoot,
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths.length) return { ok: false }
    return { ok: true, path: res.filePaths[0] }
  })

  /* ---- SDK ---- */
  ipcMain.handle('sdk:detect', () => detectSdkRoots())

  /**
   * 「登录好了没」——两处都算数：
   *   steamcmd 自己缓存的令牌（在控制台里登录过一次），或者我们存着的密码。
   * 只要有一条能免密构建就算 ready。
   */
  /**
   * 拿用户刚填的账号密码真登一次，用来回答「我填的到底对不对」。
   * 跟 login:state 不是一回事：那个只读 config.vdf，只说明「这台机器以前登录过」。
   */
  ipcMain.handle('login:test', async (e, { account, password, guardCode } = {}) => {
    const wc = e.sender
    const r = await loginTest(account, password, guardCode, loadSettings(), (msg) => {
      if (!wc.isDestroyed()) wc.send('login:progress', msg)
    })
    return { ok: true, ...r }
  })

  ipcMain.handle('login:state', () => {
    const s = loadSettings()
    const sc = readSteamLogin(s)
    const savedPassword = hasPassword()
    return {
      ok: true,
      steamcmd: sc,
      saved: { hasPassword: savedPassword, account: s.account || '' },
      ready: sc.cached || savedPassword,
      checkedAt: Date.now()
    }
  })

  /** 「忘记账号」：先看有什么，再决定清不清 */
  ipcMain.handle('login:describe', () => describeLogin(loadSettings()))
  ipcMain.handle('login:forget', () => {
    const r = forgetLogin(loadSettings())
    // 清完把界面上的标记同步过去，标题栏那颗「凭据已存」要立刻消失
    return { ...r, hasPassword: hasPassword() }
  })
  ipcMain.handle('sdk:status', () => sdkStatus(loadSettings()))

  // 「安装/修复脚本」：把工具自带的 build.ps1 / check.ps1 覆盖回 SDK。
  // 自动流程只在缺失时写，这一颗按钮才允许覆盖内容不一样的版本。
  ipcMain.handle('sdk:installScripts', () => {
    const s = loadSettings()
    const paths = getPaths(s)
    const result = installScripts(paths.contentBuilder, { force: true })
    return { ...result, status: sdkStatus(s) }
  })
  ipcMain.handle('sdk:scan', () => scanApps(loadSettings()))
  ipcMain.handle('sdk:app', (_e, dirName) => readApp(dirName, loadSettings()))
  ipcMain.handle('sdk:history', () => listHistory(loadSettings()))

  ipcMain.handle('sdk:log', (_e, file) => {
    try {
      return { ok: true, text: readLog(assertInsideContentBuilder(file)) }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  /* ---- 改 vdf ---- */
  ipcMain.handle('vdf:setBranch', (_e, { dirName, branch }) => {
    const res = setAppBranch(dirName, branch, loadSettings())
    if (res.ok && branch) rememberBranch(readApp(dirName, loadSettings()).appId, branch)
    return res
  })

  /* ---- 新建 / 编辑 App 与 Depot ---- */
  ipcMain.handle('app:defaults', (_e, { appId, name, platform = 'win64' } = {}) => {
    const s = loadSettings()
    return {
      platforms: PLATFORMS,
      depotOs: DEPOT_OS,
      depotArch: DEPOT_ARCH,
      // 每个 OS 下能选的架构，渲染层用它过滤掉不存在的选项
      depotArchByOs: DEPOT_ARCH_BY_OS,
      depotLanguages: DEPOT_LANGUAGES,
      suggestedDepotId: suggestDepotId(appId),
      suggestedContentRoot: defaultContentRoot(name || '<App名>', platform, s),
      buildsRoot: s.buildsRoot,
      defaultExclusions: defaultExclusionsFor(platform),
      allDefaultExclusions: DEFAULT_EXCLUSIONS
    }
  })

  /** 存/读后台那几项 Depot 元数据（名称/语言/系统/架构），vdf 里没有这些字段 */
  ipcMain.handle('meta:setDepot', (_e, { depotId, meta } = {}) =>
    setDepotMeta(depotId, meta || {})
  )
  ipcMain.handle('meta:allDepots', () => readDepotMeta())

  /** 记住用过的 AppID，给新建 App 的下拉框用 */
  ipcMain.handle('meta:rememberAppId', (_e, { appId, name } = {}) =>
    rememberAppId(appId, name)
  )

  /**
   * 公开的 App 名称查询 —— store.steampowered.com 的 appdetails 不需要密钥，
   * 未发布的 App（只要建过商店页）也能查到名字。查不到不算错误。
   */
  ipcMain.handle('app:publicName', async (_e, { appId } = {}) => {
    const id = String(appId || '').trim()
    if (!/^\d+$/.test(id)) return { ok: false, error: 'AppID 必须是数字' }
    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&l=schinese`
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const json = await res.json()
      const entry = json?.[id]
      if (!entry?.success) return { ok: true, found: false }
      return { ok: true, found: true, name: entry.data?.name || '' }
    } catch (e) {
      return { ok: false, error: e.name === 'TimeoutError' ? '查询超时' : e.message }
    }
  })

  /**
   * 「已知的 App」下拉框的数据源。
   *
   * 只用 appIdHistory：那是用户真填过、而且从 Steam 查回了真实产品名的 AppID。
   * 以前把 scripts\ 下本地建出来的 App 也算进来，可那些名字是「我们给他起的文件夹名」，
   * 不是 Steam 上的产品名 —— 列在「已知的 App」里只会让人以为后台真有这么一个 App。
   * 本地有对应脚本的，只挂一个 local 标记当装饰。
   */
  ipcMain.handle('app:knownApps', async () => {
    const s = loadSettings()
    const localIds = new Set((scanApps(s).apps || []).map((a) => String(a.appId)))

    // 用过的（读到过真实产品名的）—— 没密钥时这是唯一能拿到的列表
    const map = new Map()
    for (const h of s.appIdHistory || []) {
      const appId = String((h && h.appId) || '').trim()
      const name = String((h && h.name) || '').trim()
      if (/^\d+$/.test(appId) && name) map.set(appId, { appId, name, from: 'used' })
    }

    // 有发布商密钥时补上密钥权限范围内的**全部** App ——
    // 这是唯一能完整枚举的办法，普通账号拿不到这种密钥。
    let partnerCount = 0
    const key = readApiKey()
    if (key) {
      try {
        const list = await getPartnerApps(key)
        partnerCount = list.length
        for (const a of list) {
          const appId = String(a.appid || '').trim()
          if (!/^\d+$/.test(appId)) continue
          const prev = map.get(appId)
          map.set(appId, {
            appId,
            name: String(a.name || '').trim() || prev?.name || `App ${appId}`,
            from: prev ? 'both' : 'partner'
          })
        }
      } catch {
        /* 密钥失效/限流时静默降级，只用「用过的」那份 */
      }
    }

    return {
      apps: [...map.values()]
        .sort((a, b) => Number(b.appId) - Number(a.appId))
        .map((a) => ({ ...a, local: localIds.has(a.appId) })),
      partnerCount
    }
  })

  ipcMain.handle('app:create', (_e, spec) => createApp(spec || {}, loadSettings()))
  ipcMain.handle('app:update', (_e, { dirName, patch } = {}) => {
    const p = { ...(patch || {}) }
    // local: true = 用 SDK 自带的本地内容服务器；渲染层不该知道它在哪
    if (p.local === true) {
      p.local = path.join(loadSettings().sdkRoot, 'tools', 'ContentServer', 'htdocs')
    } else if (p.local === false) {
      p.local = ''
    }
    return updateAppFields(dirName, p, loadSettings())
  })
  ipcMain.handle('app:updateDepot', (_e, { dirName, depotFile, patch }) =>
    updateDepotFields(dirName, depotFile, patch || {}, loadSettings())
  )
  ipcMain.handle('app:addDepot', (_e, { dirName, spec }) =>
    addDepot(dirName, spec || {}, loadSettings())
  )
  ipcMain.handle('app:removeDepot', (_e, { dirName, depotFile }) =>
    removeDepot(dirName, depotFile, loadSettings())
  )

  /** 改 App 名字 = 连 scripts 下的文件夹一起改 */
  ipcMain.handle('app:rename', (_e, { dirName, newName }) => {
    const s = loadSettings()
    const res = renameApp(dirName, newName, s)
    if (res.ok && res.changed) {
      if (s.lastApp === dirName) saveSettings({ lastApp: res.dirName })
      // 分支历史是按 AppID 存的，改名不影响
    }
    return res
  })

  /* ---- scripts 根目录下的游离 vdf ---- */
  ipcMain.handle('app:orphans', () => scanOrphans(loadSettings()))

  ipcMain.handle('app:adoptOrphans', (_e, { name } = {}) =>
    adoptOrphans({ name }, loadSettings())
  )

  /** 给早先建的 App 补建内容目录 */
  ipcMain.handle('app:ensureContentDir', (_e, { dirName, depotFile }) =>
    ensureDepotContentDir(dirName, depotFile, loadSettings())
  )

  /** 各 Depot 的内容目录按项目文件夹重排（项目文件夹\win64、\macos …） */
  ipcMain.handle('app:syncDepotRoots', (_e, { dirName, projectDir } = {}) =>
    syncDepotRoots(dirName, projectDir, loadSettings())
  )

  /* ---- 待处理清单里「本次忽略」 ---- */
  ipcMain.handle('app:ignoreProblem', (_e, { dirName, text, on } = {}) => {
    const res = setIgnoredProblem(dirName, text, on !== false)
    if (!res.ok) return res
    return { ...res, app: readApp(dirName, loadSettings()) }
  })

  /* ---- 删除 App ---- */
  ipcMain.handle('app:previewDelete', (_e, { dirName }) => describeDelete(dirName, loadSettings()))
  ipcMain.handle('app:delete', (_e, { dirName, deleteContent } = {}) => {
    const s = loadSettings()
    // depotMeta 是按 depotId 存的，删完脚本就读不到了 —— 先把 id 记下来
    const depotIds = (readApp(dirName, s)?.depots || []).map((d) => String(d.id))
    const res = deleteApp(dirName, { deleteContent: !!deleteContent }, s)
    if (res.ok) {
      // 顺手把这个 App 的分支历史和 depot 属性清掉，免得设置文件里越积越多
      const branches = { ...(s.branches || {}) }
      if (res.appId && branches[res.appId]) {
        delete branches[res.appId]
      }
      const depotMeta = { ...(s.depotMeta || {}) }
      for (const id of depotIds) delete depotMeta[id]
      saveSettings({ branches, depotMeta, ...(s.lastApp === dirName ? { lastApp: null } : {}) })
    }
    return res
  })

  /** 用系统默认编辑器打开 vdf（想手改的时候一步到位） */
  ipcMain.handle('app:openVdf', async (_e, { dirName, depotFile } = {}) => {
    try {
      const app = readApp(dirName, loadSettings())
      if (app.error) return { ok: false, error: app.error }
      const target = depotFile ? path.join(app.dir, depotFile) : app.appPath
      const err = await shell.openPath(target)
      return err ? { ok: false, error: err } : { ok: true, path: target }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  /* ---- 上传前预检 ---- */
  ipcMain.handle('app:preflight', (_e, { dirName } = {}) => {
    try {
      return preflightApp(dirName, loadSettings())
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  /* ---- 剥离 Steam（独立功能）----
     拖一个打包好的文件夹进来，复制一份到旁边，副本里去掉 Steam 原生运行库。
     原文件夹完全不动，和当前选中的 App / Depot 也没关系。 */
  ipcMain.handle('strip:pickFolder', async (_e, { current } = {}) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择要剥离 Steam 的文件夹',
      defaultPath: current || '',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths.length) return { ok: false }
    return { ok: true, path: res.filePaths[0] }
  })

  ipcMain.handle('strip:inspect', (_e, { target } = {}) => {
    try {
      return inspectFolder(target)
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('strip:copy', (e, { src, dest, removeConfig = true } = {}) => {
    try {
      return copyAndStripFolder({
        src,
        dest,
        removeConfig,
        onProgress: (p) => {
          if (!e.sender.isDestroyed()) e.sender.send('strip:progress', p)
        }
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('strip:pickDest', async (_e, { current, name } = {}) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择副本放在哪个文件夹',
      defaultPath: current ? path.dirname(current) : '',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths.length) return { ok: false }
    try {
      return { ok: true, path: suggestDest(res.filePaths[0], name) }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  /* ---- 拖进来的文件夹 / 压缩包 ---- */
  ipcMain.handle('drop:analyze', (e, { target } = {}) => {
    try {
      return analyzeTarget(target, loadSettings(), (msg) => {
        if (!e.sender.isDestroyed()) e.sender.send('drop:progress', msg)
      })
    } catch (e2) {
      return { ok: false, error: e2.message }
    }
  })
  ipcMain.handle('drop:apply', async (_e, spec = {}) => {
    try {
      return await applyDrop(spec, loadSettings())
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  /* ---- 本地内容服务器 ---- */
  ipcMain.handle('local:status', async () => {
    const st = localStatus(loadSettings())
    // 「在跑」和「真的能访问」是两件事，状态里必须分开报
    st.serving = st.running ? await probePort(st.port) : false
    return st
  })
  ipcMain.handle('local:start', (_e, { port } = {}) => startLocal(loadSettings(), port || 80))
  ipcMain.handle('local:stop', () => stopLocal())
  ipcMain.handle('local:devcfg', (_e, { port } = {}) => steamDevCfg(loadSettings(), port || 80))
  ipcMain.handle('local:enableDevcfg', (_e, { port } = {}) =>
    writeSteamDevCfg(loadSettings(), port || 80)
  )
  ipcMain.handle('update:info', () =>
    ({ ok: true, current: currentVersion(), repo: repoUrl(), portable: isPortable(), incremental: canIncremental() })
  )

  ipcMain.handle('update:check', () => checkUpdate())

  ipcMain.handle('update:download', async (e, { url, name } = {}) => {
    const send = (m) => {
      if (!e.sender.isDestroyed()) e.sender.send('update:progress', m)
    }
    let last = 0
    const throttle = (got, total) => {
      // 进度事件别刷太密，一秒钟几十次对界面没意义
      const now = Date.now()
      if (now - last < 150 && got !== total) return
      last = now
      send({ got, total })
    }

    // 装在系统里的那份先试增量：只下改动的块，通常几 MB 而不是 106 MB。
    // 失败（没 latest.yml / 没 blockmap / 证书 / 网络）就静静退回整包 ——
    // 绝不能因为「增量这条路没打通」让更新整个不可用。
    if (canIncremental()) {
      try {
        const r = await incrementalDownload(
          (p) => send({ got: p.got, total: p.total, percent: p.percent, incremental: true }),
          // 差分日志里先算出「这次要下多少」——下载前就把预计大小发给界面
          (est) => send({ estimate: est.estimateBytes, full: est.fullBytes, incremental: true })
        )
        if (r?.upToDate) return { ok: true, upToDate: true, version: r.version, incremental: true }
        // 差分没成（比如校验不符自动回落），让界面别一直挂着「增量下载」
        if (!r?.differential) send({ note: 'incremental-fallback: full', differential: false })
        return {
          ok: true,
          incremental: true,
          differential: !!r.differential,
          estimateBytes: r.estimateBytes || 0,
          fullBytes: r.fullBytes || 0,
          version: r.version
        }
      } catch (err) {
        send({ note: `incremental-fallback: ${err.message}` })
      }
    }

    return downloadUpdate({ url, name, onProgress: throttle })
  })

  ipcMain.handle('update:install', (_e, { path: filePath } = {}) => {
    // 走增量下的那份由 electron-updater 自己记账，不用我们给路径
    if (!filePath && canIncremental()) {
      try {
        return incrementalInstall()
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }
    return installUpdate(filePath)
  })

  ipcMain.handle('update:openReleases', () => openReleases())

  ipcMain.handle('update:cleanup', () => cleanupDownloads())

  ipcMain.handle('local:open', async () => {
    const st = localStatus(loadSettings())
    if (!st.running) return { ok: false, error: '服务器没在跑，先点「启动」。' }
    if (!(await probePort(st.port))) {
      return {
        ok: false,
        error: `http://127.0.0.1:${st.port}/ 没有应答 —— 端口上可能挂着别的东西。先「停止」再「启动」一次。`
      }
    }
    const err = await shell.openExternal(st.url)
    return err ? { ok: false, error: String(err) } : { ok: true, url: st.url }
  })

  /* ---- 系统通知 ---- */
  ipcMain.handle('notify', (_e, { title, body } = {}) => {
    try {
      if (!Notification.isSupported()) return { ok: false, error: '系统不支持通知' }
      const n = new Notification({ title: String(title || 'SteamSDK'), body: String(body || '') })
      n.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
      })
      n.show()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  /* ---- 执行 ---- */
  ipcMain.handle('run:check', (_e, { dirName } = {}) => {
    const s = loadSettings()
    const p = getPaths(s)
    const missing = ensureRunScript(s, p, 'check')
    if (missing) return { ok: false, error: missing }
    const args = dirName ? ['-App', dirName] : []
    const handle = runScript({
      script: p.checkScript,
      args,
      cwd: p.contentBuilder,
      label: dirName ? `检查 ${dirName}` : '检查全部',
      onData: (d) => send('run:data', { kind: 'check', ...d }),
      onExit: (d) => send('run:exit', { kind: 'check', ...d })
    })
    return handle ? { ok: true, ...handle } : { ok: false, error: missing || 'check.ps1 启动失败' }
  })

  ipcMain.handle('run:build', (_e, { dirName, preview = true, password, local = false, guardCode } = {}) => {
    const s = loadSettings()
    const p = getPaths(s)

    const missing = ensureRunScript(s, p, 'build')
    if (missing) return { ok: false, error: missing }

    // -User 是必填（脚本不再自带默认账号）：账号空着时先说清楚，别让 steamcmd 卡在登录提示上
    if (!String(s.account || '').trim()) {
      return { ok: false, error: '还没填 Steam 账号名（设置 → 登录凭据）—— 上传要用它登录 steamcmd。' }
    }

    const pw = currentPassword(password)

    // 这台机器上 steamcmd 没有缓存凭据（日志里明确写 Cached credentials not found），
    // 所以没有密码就没法构建 —— 直接说清楚，不要让用户对着卡住的进程发呆。
    if (!pw) {
      return {
        ok: false,
        needsPassword: true,
        error: '需要 Steam 账号密码：steamcmd 没有缓存凭据。请在下方输入，或先点「登录一次」。'
      }
    }

    const args = ['-App', dirName, '-User', s.account]
    if (preview) args.push('-Preview')
    if (local) args.push('-Local')

    const handle = runScript({
      script: p.buildScript,
      args,
      cwd: p.contentBuilder,
      label: `${local ? '本地服务器' : preview ? 'Preview' : '正式上传'} ${dirName}`,
      password: pw,
      env: { STEAMSDK_BUILD_PASSWORD: pw, STEAMSDK_GUARD_CODE: String(guardCode || '').trim() },
      onData: (d) => send('run:data', { kind: 'build', ...d }),
      onPrompt: (d) => send('run:prompt', { kind: 'build', ...d }),
      onExit: (d) => {
        // 硬杀时 build.ps1 的 finally 不会跑，这里兜底清掉临时 preview 脚本
        cleanupPreviewArtifacts(dirName, loadSettings())
        send('run:exit', { kind: 'build', ...d })
      }
    })
    return handle
      ? { ok: true, preview, local, ...handle }
      : { ok: false, error: 'build.ps1 未找到，请在设置里检查 SDK 路径' }
  })

  /**
   * 打开一个真正的控制台窗口跑 steamcmd，让用户交互登录一次。
   * 登录成功后 steamcmd 会自己保存凭据，之后构建就不需要密码了。
   */
  ipcMain.handle('run:login', () => {
    const p = getPaths(loadSettings())
    if (!fs.existsSync(p.steamcmd)) return { ok: false, error: `找不到 ${p.steamcmd}` }
    try {
      spawn(`start "SteamSDK 登录" "${p.steamcmd}"`, {
        shell: true,
        detached: true,
        windowsHide: false,
        cwd: p.builderDir
      }).unref()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('run:cancel', (_e, runId) => killRun(runId))
  ipcMain.handle('run:input', (_e, { runId, text }) => sendInput(runId, text))
  ipcMain.handle('run:list', () => listRuns())

  /* ---- 窗口按钮（自己画的，不是系统那三个） ---- */
  ipcMain.handle('win:minimize', () => {
    mainWindow?.minimize()
    return { ok: true }
  })
  ipcMain.handle('win:maximize', () => {
    if (!mainWindow) return { ok: false }
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return { ok: true, maximized: mainWindow.isMaximized() }
  })
  ipcMain.handle('win:close', () => {
    mainWindow?.close()
    return { ok: true }
  })
  ipcMain.handle('win:state', () => ({ ok: true, maximized: !!mainWindow?.isMaximized() }))

  /* ---- 系统 ---- */
  ipcMain.handle('shell:openPath', async (_e, target) => {
    if (!target) return { ok: false, error: '路径为空' }
    if (!fs.existsSync(target)) return { ok: false, error: `路径不存在：${target}` }
    const err = await shell.openPath(target)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.handle('shell:openExternal', async (_e, url) => {
    if (!/^https?:\/\//i.test(String(url))) return { ok: false, error: '只允许打开 http/https' }
    await shell.openExternal(url)
    return { ok: true }
  })
}

/* ------------------------------------------------------------------ *
 *  生命周期
 * ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // 任务栏 / 开始菜单靠这个 ID 认「这是哪个应用」。
    //
    // **开发版必须用另一个 ID**：开发时跑的是 node_modules\electron\dist\electron.exe，
    // 如果和打包版共用一个 ID，Windows 会把「com.yingyu.steamsdktool」这个身份跟
    // electron.exe 的图标（那个原子球）绑在一起缓存下来 —— 用户装好的应用再打开，
    // 任务栏和快捷方式就会显示成 Electron 的图标。以前好几轮「图标又变回 electron」
    // 都是这个原因，不是打包没带图标。
    app.setAppUserModelId(
      app.isPackaged ? 'com.yingyu.steamsdktool' : 'com.yingyu.steamsdktool.dev'
    )
    // 工具自带的构建脚本在安装包的 resources\scripts 下（开发时在仓库的 resources\scripts）。
    // 先定下位置，再给当前 SDK 补一次 —— 干净机器上 SDK 里本来就没有 build.ps1 / check.ps1。
    try {
      setBundledScriptsDir(
        resolveBundledScriptsDir({
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          appPath: app.getAppPath()
        })
      )
    } catch (e) {
      console.error('[scripts] resolve bundled dir failed:', e)
    }
    pruneOldDownloads()
    autoInstallScripts()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
