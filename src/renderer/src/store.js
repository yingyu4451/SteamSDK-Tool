import { reactive, computed } from 'vue'

const api = window.api

/* 构建输出控制台按 App 分开：每个 App 一份缓冲区，切走再切回来还在。
   没有选中 App 时（「全部检查配置」）落在 '__all__' 这一份。 */
const consoleBuckets = new Map()
function consoleBucket() {
  const key = state.selectedDir || '__all__'
  let b = consoleBuckets.get(key)
  if (!b) {
    b = { logs: [], lastExit: null }
    consoleBuckets.set(key, b)
  }
  return b
}

export const state = reactive({
  booted: false,
  bootError: null,

  settings: null,
  // 单个 Depot 是否参与上传：{ [dirName]: [depotId, ...] }，这里放「不上传」的
  // 清单；构建时主进程把它转成 STEAMSDK_SKIP_DEPOTS 传给 build.ps1。
  uploadOff: {},
  // 界面缩放：1 = 100%，主进程 setZoomFactor 后回填（值同时存 settings.zoomFactor）
  zoom: 1,
  // Apps 列表手动排序用的 dirName 顺序（存 settings.appOrder）；不在表里的排后面
  appOrder: [],
  // Apps 文件夹（存 settings.folders）= [{ id, name, collapsed }]；folderMap 是 App → 文件夹
  folders: [],
  folderMap: {},
  sdk: null,
  hasPassword: false,
  encryptionAvailable: false,

  apps: [],
  scanErrors: [],
  // 跨 App 的重复 AppID：[{ appId, apps: [dirName, ...] }]
  duplicates: [],
  scanning: false,
  selectedDir: null,
  detail: null,
  detailLoading: false,

  history: [],

  view: 'workbench', // workbench | history | settings

  // 首次运行引导
  onboard: { open: false, step: 0, busy: false, error: null, candidates: [], manual: '', account: '', password: '', saved: '' },
  login: { ok: false, ready: false, error: null, steamcmd: null, saved: null, checkedAt: 0 },
  forget: { open: false, busy: false, data: null, result: null, error: null },

  running: false,
  runKind: null, // check | build
  runId: null,
  runPreview: true,
  runLocal: false,
  // 构建输出：转发到「当前 App」自己的那份缓冲区（见文件顶部 consoleBucket）
  get logs() {
    return consoleBucket().logs
  },
  set logs(v) {
    consoleBucket().logs = v
  },
  prompt: null,
  get lastExit() {
    return consoleBucket().lastExit
  },
  set lastExit(v) {
    consoleBucket().lastExit = v
  },

  // 构建需要密码但本地没有时，界面弹出输入行：{ preview: boolean }
  askPassword: null,
  askPasswordError: null,
  /** 构建因为缺 Steam Guard 验证码失败时，在这里放 {preview, local}，界面据此弹输码框 */
  askGuard: null,
  runGuardCode: '',
  /** 登录测试期间主进程推过来的进度：{kind:'mobile'} = 等用户在手机上点确认 */
  loginWait: null,

  // 新建 App 向导
  wizard: null,
  // 编辑抽屉：{ kind:'app' } | { kind:'depot', depotFile }
  drawer: null,
  // 轻提示
  toast: null,
  // 正式上传成功后的跳转信息
  uploaded: null,
  // 删除 App 的确认弹窗
  deleteDialog: null,
  // 同步 Depot 的结果（有 Web API 密钥走密钥，没有就走 steamcmd + 已保存账号）
  verify: { busy: false, error: null, needsKey: false, data: null },
  // 「后台构建 / 分支」面板：最近构建 + 各分支当前 BuildID
  buildPanel: { busy: false, error: null, data: null, appId: '' },
  // 上传后自动核对后台 BuildID 的结果：{ appId, buildId, latest, ok, at }
  lastBuildCheck: null,
  /**
   * 「本次忽略」的待处理项 —— 按 App 目录名分组，只存在内存里。
   * 重开应用就清空，所以它和永久忽略是两件事。
   */
  sessionIgnored: {},
  // 同步面板上勾了哪些后台 Depot 要加进来：{ [depotId]: true }
  syncPicks: {},
  syncAdding: false,
  // 新建 Depot 的侧边栏：{ platform, depotId, name, os, arch, language, contentRoot, exclusions, allowDup, busy, error }
  depotSlide: null,
  // Depot 矩阵当前选中的 tab
  activeDepot: null,
// 新建 App 向导的 AppID 下拉框数据
  knownApps: [],
  partnerAppCount: 0,
  // 密钥权限内的 App 列表还在后台加载（向导不能等它 —— 先把弹窗打开，列表后补）
  knownAppsLoading: false,
  // Steamworks 新建 Depot 的选项（系统 / 架构 / 语言）
  depotOptions: { os: [], arch: [], archByOs: {}, languages: [] },
  // scripts 根目录下游离的 vdf（不属于任何 App 文件夹）
  orphans: [],
  orphanDialog: null,
  // 检查文件
  preflight: { busy: false, error: null, data: null },
  // 本地内容服务器
  local: {
    running: false,
    serving: false,
    port: 80,
    url: '',
    installed: true,
    busy: false,
    devcfg: null,
    // 最近一次 local.status() 的结果：里面有 contentFiles / contentBytes，
    // 用来告诉用户「本地服务器里到底是空的还是有东西」
    status: null,
    /**
     * 「一次配好」的步骤表。本地服务器这条路要串起 5 件事，
     * 少做一件最后就是空 depot —— 所以把每一步的状态摆在面板上，
     * 哪一步没成一眼能看出来。
     */
    flow: {
      running: false,
      building: false,
      done: false,
      error: null,
      steps: [
        { id: 'server', label: '启动内容服务器', state: 'idle', detail: '' },
        { id: 'flag', label: '这个 App 标记成「先送本地」', state: 'idle', detail: '' },
        { id: 'build', label: '跑一次构建，把内容写进服务器', state: 'idle', detail: '' },
        { id: 'devcfg', label: '写 steam_dev.cfg', state: 'idle', detail: '' }
      ]
    },
    error: null
  },
  // 拖进来的文件夹 / 压缩包：{ over, busy, data, error }
  // over 是「正拖着东西悬在窗口上」，data 是分析结果
  drop: {
    over: false,
    busy: false,
    data: null,
    error: null,
    // 大包解压要几分钟，这段时间得让界面自己证明还活着
    startedAt: 0,
    progress: null,
    // 拖放窗口里的「读后台」：后台有、本地还没配的 Depot
    backend: { busy: false, done: false, error: '', needsCreds: false, appName: '', via: '', depots: [] }
  },
  // 剥离 Steam（独立功能）：拖文件夹 → 二次确认 → 复制一份 → 剥掉副本里的运行库
  strip: {
    inspect: null, // inspectFolder 的结果：原文件夹、要剥的文件、默认副本位置
    confirmOpen: false,
    busy: false,
    dest: "",
    removeConfig: true,
    progress: null, // { copiedFiles, totalFiles, copiedBytes, totalBytes, rel }
    result: null,
    error: null,
    lastTarget: ""
  },
  // 工具自身的更新（GitHub Releases）
  update: {
    current: '',
    repo: '',
    portable: false, // 便携版：更新下载完只打开文件夹，不自动装
    busy: false,
    checked: false,
    data: null, // checkUpdate 的返回值
    error: null,
    downloading: false,
    got: 0,
    total: 0,
    incremental: false, // 装出来的版本能走 electron-updater 增量
    viaIncremental: false, // 这次下载实际走的是增量
    differential: null, // 增量是否真的成功（false = 退回整包）
    estimate: 0, // 差分日志算出来的「这次要下多少」
    fullSize: 0, // 整包多大
    ready: '' // 下载好的安装包路径
  }
})

/** 平台 id → 显示名（和主进程 vdf-edit.js 的 PLATFORMS 一一对应） */
export const PLATFORM_LABEL = {
  win64: 'Windows 64',
  win32: 'Windows 32',
  macos: 'macOS',
  linux: 'Linux',
  linuxarm64: 'Linux ARM64'
}

export const selectedApp = computed(() => state.apps.find((a) => a.dirName === state.selectedDir) || null)

export const canRun = computed(() => !state.running && !!state.detail && !state.detail.error)

/* ------------------------------------------------------------------ *
 *  启动
 * ------------------------------------------------------------------ */

export async function boot() {
  try {
    const [s, status] = await Promise.all([api.settings.get(), api.sdk.status()])
    state.settings = s.settings
    state.uploadOff = { ...(s.settings?.uploadOff || {}) }
    state.appOrder = Array.isArray(s.settings?.appOrder) ? s.settings.appOrder.map(String) : []
  state.folders = Array.isArray(s.settings?.folders)
    ? s.settings.folders
        .filter((f) => f && f.id)
        .map((f) => ({
          id: String(f.id),
          name: String(f.name || '未命名'),
          collapsed: !!f.collapsed,
          color: String(f.color || '')
        }))
    : []
  state.folderMap =
    s.settings?.folderMap && typeof s.settings.folderMap === 'object'
      ? { ...s.settings.folderMap }
      : {}
    state.zoom = Number(s.settings?.zoomFactor) || 1
    state.hasPassword = s.hasPassword
    state.encryptionAvailable = s.encryptionAvailable
    state.sdk = status
    await rescan()
    const ks = await api.steam.keyState().catch(() => ({ has: false }))
    state.hasApiKey = !!ks?.has
    if (!state.selectedDir && state.apps.length) {
      await selectApp(state.apps[0].dirName)
    }
    state.booted = true
  } catch (e) {
    state.bootError = e.message
    state.booted = true
  }
  // 没走过引导（或者上次点了跳过但被清了）就弹一次
  if (!state.settings?.onboarded) {
    state.onboard.open = true
    state.onboard.manual = state.settings?.sdkRoot || ''
  }
  // 更新检查不挡启动：先让界面出来，再悄悄问一次 GitHub。
  // quiet = true 表示「没网 / 没发布过 release」这种情况不弹错误，只在设置页里留一句话。
  loadUpdateInfo().then(() => checkUpdateNow(true))
}

/* ------------------------------------------------------------------ *
 *  首次运行引导
 * ------------------------------------------------------------------ */

export function onboardGo(step) {
  state.onboard.step = Math.max(0, Math.min(2, step))
  state.onboard.error = null
  // 进第二步时如果还没找到过，现找一次 —— 这样「没找到」的提示只会出现在它该出现的这一步
  if (state.onboard.step === 1 && !state.onboard.candidates.length && !state.onboard.busy) {
    onboardDetect()
  }
  // 进第三步时先问一次登录状态；之后由界面上的轮询接着问
  if (state.onboard.step === 2) checkLogin()
}

export async function onboardDetect() {
  const o = state.onboard
  o.busy = true
  o.error = null
  try {
    o.candidates = (await api.sdk.detect()) || []
    // 「没找到」是第二步的问题，别在欢迎页就吓人
    if (!o.candidates.length && o.step === 1) {
      o.error = '常见位置没找到 SteamSDK —— 手动选一下它所在的文件夹'
    }
  } catch (e) {
    o.error = e.message
  } finally {
    o.busy = false
  }
}

/** 当前选中的是「自动找到的」还是「手动指定的」—— 用来在界面上标出来 */
export function onboardMode() {
  const o = state.onboard
  const m = String(o.manual || '').trim().toLowerCase()
  if (!m) return 'none'
  return (o.candidates || []).some((c) => String(c.root).toLowerCase() === m) ? 'auto' : 'manual'
}

export async function onboardPickFolder() {
  const o = state.onboard
  const r = await api.settings.pickFolder(o.manual || '')
  if (r?.ok && r.path) {
    o.manual = r.path
    o.error = null
  }
  return r
}

/** 把选中的 SDK 路径存下来，顺便验一下里面有没有 ContentBuilder */
export async function onboardApplySdk(root) {
  const o = state.onboard
  const dir = String(root || o.manual || '').trim()
  if (!dir) {
    o.error = '先选一个 SteamSDK 目录'
    return false
  }
  o.busy = true
  o.error = null
  try {
    await api.settings.save({ sdkRoot: dir })
    const st = await api.sdk.status()
    state.sdk = st
    state.settings = { ...(state.settings || {}), sdkRoot: dir }
    if (!st.contentBuilderExists) {
      o.error = `这个目录里没有 tools\\ContentBuilder —— ${dir}`
      return false
    }
    o.manual = dir
    return true
  } catch (e) {
    o.error = e.message
    return false
  } finally {
    o.busy = false
  }
}

/** 拿刚填的账号密码真去 steamcmd 登一次 —— 回答「我填的对不对」 */
export async function testTypedLogin(account, password, guardCode) {
  state.loginWait = null
  // 手机确认期间主进程会推一条进度过来，界面据此切成「去手机上点确认」
  const off = api.login.onProgress((m) => {
    if (m?.kind === 'mobile') state.loginWait = { kind: 'mobile', at: Date.now() }
  })
  try {
    const r = await api.login.test(
      String(account || '').trim(),
      String(password || ''),
      String(guardCode || '').trim()
    )
    return r || { ok: false, reason: 'unknown' }
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e?.message || e) }
  } finally {
    off?.()
    state.loginWait = null
  }
}

export async function onboardSaveAccount() {
  const o = state.onboard
  o.busy = true
  o.error = null
  try {
    const acc = String(o.account || '').trim()
    if (acc) await api.settings.save({ account: acc })
    if (o.password) {
      const r = await api.settings.setPassword(o.password)
      if (!r?.ok) {
        o.error = r?.error || '密码没存上'
        return false
      }
      state.hasPassword = true
      o.password = ''
    }
    state.settings = { ...(state.settings || {}), account: acc || state.settings?.account }
    return true
  } catch (e) {
    o.error = e.message
    return false
  } finally {
    o.busy = false
  }
}

/** 从别处（使用手册）再打开一次引导。已经 onboarded 也照样打开，看完关掉不影响那个标记 */
export async function startOnboard() {
  state.view = 'workbench'
  state.onboard.step = 0
  state.onboard.error = ''
  state.onboard.done = false
  state.onboard.saved = false
  state.onboard.manual = state.settings?.sdkRoot || ''
  state.onboard.open = true
  await onboardDetect()
}

/* ------------------------------------------------------------------ *
 *  「登录好了没」——引导第三步要反复问这个
 * ------------------------------------------------------------------ */

/**
 * 问主进程要一次登录状态。
 * 两个来源都算数：steamcmd 自己缓存的登录令牌（在设置里登过一次才会有），或者我们存着的密码。
 * 这个查询很便宜（读一个几百字节的 vdf），所以引导第三步可以隔几秒问一次 ——
 * 用户在控制台里登录成功后，界面自己就绿了。
 */
export async function checkLogin() {
  try {
    const r = await api.login.state()
    if (r?.ok) state.login = { ...r, error: null }
    return state.login
  } catch (e) {
    state.login = { ...state.login, ok: false, error: String(e?.message || e) }
    return state.login
  }
}

/* ------------------------------------------------------------------ *
 *  「忘记账号」—— 清掉工具链上所有登录痕迹
 * ------------------------------------------------------------------ */

export async function openForget() {
  state.forget = { ...state.forget, open: true, busy: true, error: null, data: null, result: null }
  try {
    const r = await api.login.describe()
    state.forget = { ...state.forget, busy: false, data: r }
  } catch (e) {
    state.forget = { ...state.forget, busy: false, error: String(e?.message || e) }
  }
}

export function closeForget() {
  state.forget = { open: false, busy: false, data: null, result: null, error: null }
}

/** 真清。清完刷新登录状态，标题栏那颗「凭据已存」要立刻消失 */
export async function doForgetLogin() {
  const f = state.forget
  if (f.busy) return
  state.forget = { ...f, busy: true, error: null }
  try {
    const r = await api.login.forget()
    state.forget = { ...state.forget, busy: false, result: r }
    state.hasPassword = false
    state.settings = { ...(state.settings || {}), account: '' }
    await checkLogin()
    toast(`已清掉 ${r?.removed?.length || 0} 项登录痕迹`)
  } catch (e) {
    state.forget = { ...state.forget, busy: false, error: String(e?.message || e) }
  }
}

/** 引导的最后一步：无论走完还是「跳过教程」，都记下来不再弹 */
export async function finishOnboard() {
  state.onboard.open = false
  state.settings = { ...(state.settings || {}), onboarded: true }
  try {
    await api.settings.setOnboarded(true)
  } catch {
    /* 记不上就下次再弹，不影响使用 */
  }
  await rescan()
  if (!state.selectedDir && state.apps.length) await selectApp(state.apps[0].dirName)
}

/* ------------------------------------------------------------------ *
 *  工具自身的更新（GitHub Releases）
 * ------------------------------------------------------------------ */

export async function loadUpdateInfo() {
  try {
    const r = await api.update.info()
    if (r?.ok) {
      state.update.current = r.current
      state.update.repo = r.repo
      state.update.portable = !!r.portable
      // 装出来的版本走增量下载（只下改动的块）；便携版只能整包
      state.update.incremental = !!r.incremental
    }
  } catch {
    /* 拿不到就算了，不是关键路径 */
  }
}

export async function checkUpdateNow(quiet = false) {
  const u = state.update
  if (u.busy) return
  u.busy = true
  if (!quiet) u.error = null
  try {
    const r = await api.update.check()
    u.checked = true
    if (r?.ok) {
      u.data = r
      u.error = null
      u.got = 0
      u.total = 0
      u.ready = ''
    } else {
      u.data = null
      u.error = quiet ? null : r?.error || '检查失败'
    }
  } catch (e) {
    u.error = quiet ? null : e.message
  } finally {
    u.busy = false
  }
}

export async function downloadUpdateNow() {
  const u = state.update
  const a = u.data?.asset
  // 装在系统里的版本走增量：不需要 asset（主进程自己读 latest.yml），
  // 但界面上还得有个「要不要下」的依据，所以没有 asset 也能往下走。
  if (!a && !u.incremental) return toast('没读到安装包地址，过一会儿再点「检查更新」', 'bad')
  u.downloading = true
  u.got = 0
  // 增量下载时 actual total 来自 progress 事件（可能只有 1 MB 上下），先不摆整包大小
  u.total = u.incremental ? 0 : a?.size || 0
  u.viaIncremental = false
  u.differential = null
  u.estimate = 0
  u.fullSize = 0
  u.error = null
  try {
    const r = await api.update.download(a?.url, a?.name)
    if (r?.ok && r.upToDate) {
      u.ready = null
      toast('刚才那份已经是最新的了')
    } else if (r?.ok) {
      // 增量由 electron-updater 自己记账，不需要我们再传路径；
      // 整包才有 path，安装时要用它起安装程序。
      u.ready = r.path || '__updater__'
      u.viaIncremental = !!r.incremental
      u.differential = r.incremental ? !!r.differential : null
      u.estimate = r.estimateBytes || 0
      u.fullSize = r.fullBytes || 0
      const usedIncremental = !!r.incremental && r.differential !== false
      toast(usedIncremental ? `增量包下好了（v${r.version}），点「重启并安装」` : '下载好了，点「重启并安装」')
    } else {
      u.error = r?.error || '下载失败'
      toast(u.error, 'bad')
    }
  } finally {
    u.downloading = false
  }
}

export async function installUpdateNow() {
  const u = state.update
  if (!u.ready) return toast('先点「下载更新」', 'bad')
  // 增量下好的那份不用给路径 —— electron-updater 自己知道在哪
  const passPath = u.ready === '__updater__' ? undefined : u.ready
  const r = await api.update.install(passPath)
  if (!r?.ok) return toast(r?.error || '安装失败', 'bad')
  // 便携版：主进程只把文件夹打开，替换得用户自己来
  if (r.manual) toast('已经把新版所在的位置打开了 —— 关掉工具，替换掉你那个 exe')
}

export function openReleases() {
  api.update.openReleases()
}


export async function rescan() {
  state.scanning = true
  try {
    const res = await api.sdk.scan()
    state.apps = res.apps || []
    state.scanErrors = res.errors || []
    state.duplicates = res.duplicates || []
    state.orphans = res.orphans || []
    // 选中的 App 被删掉时回退到第一个
    if (state.selectedDir && !state.apps.some((a) => a.dirName === state.selectedDir)) {
      state.selectedDir = null
      state.detail = null
    }
  } finally {
    state.scanning = false
  }
}

export async function selectApp(dirName) {
  state.selectedDir = dirName
  // 从「构建历史 / 设置」点左侧的 App，应该跳回工作台 —— 只换 selectedDir
  // 的话页面还停在原处，看起来像「点了没反应」
  state.view = 'workbench'
  // 「同步 Depot」「检查文件」这些面板的内容是上一个 App 的，跟着切过来会张冠李戴
  clearVerify()
  clearPreflight()
  clearBuildPanel()
  state.detailLoading = true
  try {
    state.detail = await api.sdk.app(dirName)
    state.settings = { ...state.settings, lastApp: dirName }
    api.settings.save({ lastApp: dirName })
  } finally {
    state.detailLoading = false
  }
  // 后台构建 / 分支面板：有密钥才自动拉（没密钥会白等一次 steamcmd）
  if (state.hasApiKey) void loadBuildPanel()
}

/** 待处理里某一条「永久忽略 / 恢复提示」—— 写进 settings，重开还在 */
export async function ignoreProblem(text, on = true) {
  const dir = state.selectedDir
  if (!dir || !text) return
  const res = await api.app.ignoreProblem(dir, text, on)
  if (!res?.ok) return toast(res?.error || '没记下来', 'bad')
  if (res.app) state.detail = res.app
  // 侧栏那颗灯也要跟着变
  const row = state.apps.find((a) => a.dirName === dir)
  if (row && res.app) {
    row.problems = res.app.problems
    row.problemsIgnored = res.app.problemsIgnored
  }
  toast(on ? '永久忽略了，重开也不会再提示' : '恢复提示')
}

/** 只忽略这一次 —— 只存在内存里，重开应用就回来 */
export function ignoreProblemThisRun(text) {
  const dir = state.selectedDir
  if (!dir || !text) return
  const list = state.sessionIgnored[dir] || (state.sessionIgnored[dir] = [])
  if (!list.includes(text)) list.push(text)
  toast('这次先不提示了（重开应用会回来）')
}

/** 撤销「本次忽略」 */
export function restoreProblemThisRun(text) {
  const dir = state.selectedDir
  const list = state.sessionIgnored[dir]
  if (!list) return
  const i = list.indexOf(text)
  if (i >= 0) list.splice(i, 1)
}

export async function reloadDetail() {
  if (!state.selectedDir) return
  state.detail = await api.sdk.app(state.selectedDir)
  // Depot tab 选中的那个可能已经没了（改名 / 删除），回落到第一个
  const list = state.detail?.depots || []
  if (!list.some((d) => String(d.id) === String(state.activeDepot))) {
    state.activeDepot = list.length ? String(list[0].id) : null
  }
}

export function setActiveDepot(id) {
  state.activeDepot = String(id)
}

/** Apps 列表拖动排序：记住 dirName 顺序，下次启动仍按这个顺序显示 */
export function setAppOrder(dirNames) {
  const order = (dirNames || []).map(String)
  state.appOrder = order
  api.settings.save({ appOrder: order }).catch(() => {})
}

// ---- Apps 文件夹：只是本地分类，不动磁盘上的任何文件 ----

/** 文件夹可选颜色（按顺序给新文件夹分配，也可手动改） */
export const FOLDER_COLORS = [
  '#66c0f4',
  '#1a9fff',
  '#4ec9b0',
  '#a4d007',
  '#8bc34a',
  '#f0a92e',
  '#e8b34b',
  '#e06c75',
  '#d05f6b',
  '#f0a1c0',
  '#b18cf3',
  '#8f7ae8',
  '#9aa8bb',
  '#6f8296',
  '#c0c8d2',
  '#4b5b6b'
]

function persistFolders() {
  // 注意：不能把 Vue 的 reactive 代理直接丢给 IPC（structured clone 会抛
  // "An object could not be cloned" 然后被静默 catch 掉），这里先转成普通对象。
  api.settings
    .save({
      folders: state.folders.map((f) => ({ ...f })),
      folderMap: { ...state.folderMap }
    })
    .catch(() => {})
}

/** 这个 App 属于哪个文件夹（folderId，没有则空串） */
export function folderOfApp(dirName) {
  const id = state.folderMap?.[dirName]
  if (!id) return ''
  return state.folders.some((f) => f.id === id) ? id : ''
}

export function createFolder(name) {
  const clean = String(name || '').trim() || '新建文件夹'
  const folder = {
    id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: clean,
    collapsed: false,
    color: FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length]
  }
  state.folders = [...state.folders, folder]
  persistFolders()
  return folder
}

/** 设置文件夹颜色（空串 = 恢复默认主题色） */
export function setFolderColor(id, color) {
  const f = state.folders.find((x) => x.id === id)
  if (!f) return
  f.color = String(color || '')
  persistFolders()
}

/** 文件夹边框亮度 = 颜色透明度（0.1–1），默认 0.4；存在 folders[].colorAlpha */
export function setFolderAlpha(id, alpha) {
  const f = state.folders.find((x) => x.id === id)
  if (!f) return
  const a = Math.min(1, Math.max(0.1, Math.round(Number(alpha) * 20) / 20))
  f.colorAlpha = a
  persistFolders()
}

export function folderAlphaOf(f) {
  return Math.min(1, Math.max(0.1, Number(f?.colorAlpha) || 0.4))
}

export function renameFolder(id, name) {
  const clean = String(name || '').trim()
  if (!clean) return
  const f = state.folders.find((x) => x.id === id)
  if (!f) return
  f.name = clean
  persistFolders()
}

export function toggleFolder(id) {
  const f = state.folders.find((x) => x.id === id)
  if (!f) return
  f.collapsed = !f.collapsed
  persistFolders()
}

/** 删除文件夹：里面的 App 回到「未分类」，App 本身不受影响 */
export function deleteFolder(id) {
  state.folders = state.folders.filter((f) => f.id !== id)
  for (const [dir, fid] of Object.entries(state.folderMap || {})) {
    if (fid === id) delete state.folderMap[dir]
  }
  persistFolders()
}

/** 把 App 放进文件夹（folderId 为空 = 移出到未分类） */
export function assignAppFolder(dirName, folderId) {
  const dir = String(dirName || '')
  if (!dir) return
  if (!folderId) {
    if (state.folderMap && Object.prototype.hasOwnProperty.call(state.folderMap, dir)) {
      delete state.folderMap[dir]
    }
  } else {
    if (!state.folders.some((f) => f.id === folderId)) return
    state.folderMap[dir] = folderId
  }
  persistFolders()
}

/** 这个 Depot 会不会随构建上传（默认会；用户关掉的不上传） */
export function depotUploadEnabled(dirName, depotId) {
  const list = state.uploadOff?.[dirName]
  if (!Array.isArray(list)) return true
  return !list.map(String).includes(String(depotId))
}

/** 切换某个 Depot 的上传开关：写进设置，构建时主进程传给 build.ps1 跳过 */
export async function toggleDepotUpload(depotId) {
  const dirName = state.selectedDir
  if (!dirName) return
  const enabled = !depotUploadEnabled(dirName, depotId)
  let res
  try {
    res = await api.app.setDepotUpload(dirName, String(depotId), enabled)
  } catch (e) {
    res = { ok: false, error: String(e?.message || e) }
  }
  if (!res?.ok) {
    toast(res?.error || '切换失败', 'error')
    return
  }
  const next = { ...(state.uploadOff || {}) }
  const list = Array.isArray(res.uploadOff) ? res.uploadOff.map(String) : []
  if (list.length) next[dirName] = list
  else delete next[dirName]
  state.uploadOff = next
  toast(enabled ? '这个 Depot 会随构建上传' : '已关闭这个 Depot 的上传，构建时跳过')
}

export async function loadHistory() {
  state.history = await api.sdk.history()
}

/* ------------------------------------------------------------------ *
 *  修改 vdf
 * ------------------------------------------------------------------ */

export async function setBranch(branch) {
  if (!state.selectedDir) return { ok: false }
  const res = await api.vdf.setBranch(state.selectedDir, branch)
  if (res.ok) {
    if (branch) {
      const key = String(state.detail?.appId || 'unknown')
      const list = new Set(state.settings.branches?.[key] || [])
      list.add(branch)
      state.settings = { ...state.settings, branches: { ...state.settings.branches, [key]: [...list] } }
    }
    await reloadDetail()
  }
  return res
}

/* ------------------------------------------------------------------ *
 *  轻提示
 * ------------------------------------------------------------------ */

let toastTimer = null
export function toast(text, tone = 'ok') {
  state.toast = { text, tone, at: Date.now() }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (state.toast = null), 4200)
}

/* ------------------------------------------------------------------ *
 *  新建 App 向导
 * ------------------------------------------------------------------ */

/**
 * 打开向导：**先把弹窗放出来**，数据后面补。
 * 以前这里 await 了 api.app.knownApps() —— 那一次要拉 Web API 的 App 列表，
 * 密钥慢的时候点「＋」要等十秒才弹窗，看起来像没响应。
 */
const WIZARD_PLATFORMS_FALLBACK = [
  { id: 'win64', label: 'Windows 64' },
  { id: 'win32', label: 'Windows 32' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
  { id: 'linuxarm64', label: 'Linux ARM64' }
]

export function openWizard() {
  if (state.wizard) return
  const picks = {}
  for (const p of WIZARD_PLATFORMS_FALLBACK) {
    picks[p.id] = {
      on: p.id === 'win64',
      depotId: '',
      contentRoot: '',
      autoDepot: true,
      autoRoot: true,
      fromSteam: false
    }
  }
  state.wizard = {
    platforms: WIZARD_PLATFORMS_FALLBACK.map((p) => ({ ...p })),
    buildsRoot: state.settings?.buildsRoot || '',
    name: '',
    appId: '',
    desc: '',
    picks,
    lookup: emptyLookup(),
    busy: false,
    error: null,
    loading: true
  }

  // 本地默认值（平台表 / buildsRoot / 排除规则）—— IPC 很快，弹窗已经出来了
  api.app
    .defaults({ platform: 'win64' })
    .then((d) => {
      const w = state.wizard
      if (!w) return
      w.platforms = d.platforms || w.platforms
      w.buildsRoot = d.buildsRoot || w.buildsRoot
      for (const p of w.platforms) {
        if (!w.picks[p.id]) {
          w.picks[p.id] = {
            on: false,
            depotId: '',
            contentRoot: '',
            autoDepot: true,
            autoRoot: true,
            fromSteam: false
          }
        }
      }
      w.loading = false
      autoAssign(w)
    })
    .catch(() => {
      if (state.wizard) state.wizard.loading = false
    })

  // 密钥状态是本地读；App 列表要拉网络，单独放后台，不挡弹窗
  api.steam
    .keyState()
    .then((ks) => (state.hasApiKey = !!ks.has))
    .catch(() => {})
  void loadKnownApps()
}

export function closeWizard() {
  state.wizard = null
}

/** 名字 / AppID 变了就重算所有「自动」字段：DepotID 依次 AppID+1、+2…，目录按名字+平台 */
function autoAssign(w) {
  const name = (w.name || '').trim() || '<App名>'
  const idOk = /^\d+$/.test(String(w.appId).trim())
  let n = 0
  for (const p of w.platforms) {
    const k = w.picks[p.id]
    if (!k || !k.on) continue
    if (k.autoDepot && idOk) k.depotId = String(Number(w.appId) + 1 + n)
    if (k.autoRoot) k.contentRoot = `${w.buildsRoot}\\${name}\\${p.suffix}`
    n++
  }
}

export function wizardAppIdChanged(appId) {
  const w = state.wizard
  if (!w) return
  const changed = String(w.appId || '') !== String(appId ?? '')
  if (changed) {
    // AppID 一改，之前查到的后台 Depot 就不是这个 App 的了
    wizardClearLookup()
    // 从后台填进来的 DepotID 属于旧 App，必须退回自动值，否则会拿着错的 ID 去建
    for (const p of w.platforms) {
      const k = w.picks[p.id]
      if (k?.fromSteam) {
        k.autoDepot = true
        k.fromSteam = false
      }
    }
  }
  w.appId = appId
  autoAssign(w)
}

export function wizardNameChanged(name) {
  const w = state.wizard
  if (!w) return
  w.name = name
  autoAssign(w)
}

export function wizardTogglePlatform(platform) {
  const w = state.wizard
  if (!w) return
  const k = w.picks[platform]
  if (!k) return
  k.on = !k.on
  // 全关掉就没意义了，至少留一个
  if (!w.platforms.some((p) => w.picks[p.id].on)) {
    k.on = true
    return
  }
  autoAssign(w)
}

/**
 * 拖动平台行：把 fromId 插到 toId 的位置。
 * 顺序就是自上而下 +1 的顺序 —— autoAssign 按 w.platforms 的次序发号，所以移动完直接重排。
 * 手填过或从后台读来的 DepotID（autoDepot=false）不会被覆盖。
 */
export function wizardMovePlatform(fromId, toId) {
  const w = state.wizard
  if (!w || !fromId || !toId || fromId === toId) return
  const arr = w.platforms
  const fi = arr.findIndex((p) => p.id === fromId)
  const ti = arr.findIndex((p) => p.id === toId)
  if (fi < 0 || ti < 0) return
  const [moved] = arr.splice(fi, 1)
  arr.splice(ti, 0, moved)
  autoAssign(w)
}

export function wizardSetDepotId(platform, value) {
  const w = state.wizard
  if (!w?.picks[platform]) return
  w.picks[platform].depotId = value
  w.picks[platform].autoDepot = false
  w.picks[platform].fromSteam = false // 用户手打的，AppID 变了也不能自动抹掉
}

export function wizardSetRoot(platform, value) {
  const w = state.wizard
  if (!w?.picks[platform]) return
  w.picks[platform].contentRoot = value
  w.picks[platform].autoRoot = false
}

export async function wizardPickRoot(platform) {
  const w = state.wizard
  const res = await api.settings.pickFolder(
    w?.picks?.[platform]?.contentRoot || state.settings?.buildsRoot
  )
  if (res.ok) wizardSetRoot(platform, res.path)
}

/** 兼容旧调用点 */
export async function pickContentRoot() {
  const plat = state.wizard?.platforms?.find((p) => state.wizard.picks[p.id]?.on)?.id
  return plat ? wizardPickRoot(plat) : null
}

/* ---- 从后台读 Depot ---- */

const emptyLookup = () => ({
  busy: false,
  done: false,
  error: null,
  needsKey: false,
  needsPassword: false,
  via: '',
  appIdKnown: false,
  appName: '',
  depots: []
})

/** 把后台某个 depot 填进对应平台的 pick */
function applySteamDepot(w, d, platform) {
  const target = platform || d.platform
  const k = w.picks[target]
  if (!k) return false
  k.on = true
  // 后台回来的 depotId 是数字，本地一律用字符串 —— 不然 .trim() / === 全乱套
  k.depotId = String(d.depotId)
  k.autoDepot = false // 别让 autoAssign 又按 AppID+1 盖掉
  k.fromSteam = true // 但 AppID 一变就得作废
  d.on = true
  d.appliedAs = target
  return true
}

/** 读后台：这个 AppID 下已经配好了哪些 Depot。via='steamcmd' 可强制走免密钥那条路 */
export async function wizardLookup(via) {
  const w = state.wizard
  if (!w) return
  if (w.lookup?.busy) return // 连点两次不要各跑一遍，第二次会把 Depot 挤到别的平台行
  const id = String(w.appId || '').trim()

  if (!/^\d+$/.test(id)) {
    w.lookup = { ...emptyLookup(), error: '先把 AppID 填成数字' }
    return
  }

  w.lookup = { ...emptyLookup(), busy: true }
  let res
  try {
    res = await api.steam.appDepots(id, via)
  } catch (e) {
    res = { ok: false, error: e.message }
  }

  // 等结果的时候用户可能改了 AppID 或关了弹窗
  const cur = state.wizard
  if (!cur || String(cur.appId || '').trim() !== id) return

  if (!res.ok) {
    cur.lookup = {
      ...emptyLookup(),
      needsKey: !!res.needsKey,
      needsPassword: !!res.needsPassword,
      error: res.error
    }
    return
  }

  // 重新读之前先撤掉上一次后台填的行，不然再点一次会把 Depot 挤到 win32 / Linux 上
  for (const p of cur.platforms) {
    const k = cur.picks[p.id]
    if (!k?.fromSteam) continue
    k.fromSteam = false
    k.on = false
    k.depotId = ''
    k.autoDepot = true
  }

  // 读回来的 Depot 直接填进平台行（不弹清单、不出现复选框）：
  // 后台认得平台的按平台填；认不得的（Web API 只给 DepotID）按常见平台顺序找空行。
  const list = (res.depots || []).map((d) => ({ ...d, on: false, appliedAs: '' }))
  let filled = 0
  let unmatched = 0
  for (const d of list) {
    const target = d.platform || nextFreePlatform(cur)
    if (target && cur.picks[target]) {
      applySteamDepot(cur, d, target)
      filled++
    } else {
      unmatched++
    }
  }
  autoAssign(cur)

  cur.lookup = {
    ...emptyLookup(),
    via: res.via || '',
    appIdKnown: res.appIdKnown !== false,
    appName: res.appName || '',
    error: unmatched
      ? `后台还有 ${unmatched} 个 Depot 没有平台行可放：先在平台表里加一行，再读一次。`
      : null
  }

  toast(
    filled
      ? `已从后台填入 ${filled} 个 Depot${res.appName ? `（${res.appName}）` : ''}`
      : '后台这个 App 下还没有 Depot',
    filled ? 'ok' : 'bad'
  )
}

/** 用户改 AppID 之后，之前查到的结果就不再是这个 App 的了 */
export function wizardClearLookup() {
  const w = state.wizard
  if (w) w.lookup = emptyLookup()
}

/** 后台 depot 没带平台时（Web API 只给 DepotID），按常见平台顺序填进空着的平台行 */
const WIZARD_STEAM_ORDER = ['win64', 'macos', 'linux', 'win32', 'linuxarm64']

function nextFreePlatform(w) {
  const used = new Set(
    Object.entries(w.picks)
      .filter(([, k]) => k.fromSteam)
      .map(([id]) => id)
  )
  for (const id of WIZARD_STEAM_ORDER) {
    if (w.picks[id] && !used.has(id)) return id
  }
  return w.platforms.map((p) => p.id).find((id) => w.picks[id] && !used.has(id)) || ''
}

/** 勾 / 取消勾一条后台 depot */
export function wizardToggleSteamDepot(depotId, platform) {
  const w = state.wizard
  const d = w?.lookup?.depots?.find((x) => String(x.depotId) === String(depotId))
  if (!d) return

  if (d.on) {
    const key = d.appliedAs || d.platform
    const k = w.picks[key]
    // 只有这个平台当前用的确实是这条 depot 才回退，避免误伤用户手填的值
    if (k && String(k.depotId) === String(d.depotId)) {
      k.autoDepot = true
      k.fromSteam = false
      autoAssign(w)
    }
    d.on = false
    d.appliedAs = ''
    return
  }

  const target = platform || d.platform || nextFreePlatform(w)
  if (!target || !w.picks[target]) {
    w.lookup.error = '平台行不够用了：先去平台表里加一行，再勾这个后台 Depot。'
    return
  }
  applySteamDepot(w, d, target)
  w.lookup.error = null
  autoAssign(w)
}

export function wizardApplyAllSteam() {
  const w = state.wizard
  if (!w?.lookup?.done) return
  for (const d of w.lookup.depots) {
    if (d.on) continue
    const target = d.platform || nextFreePlatform(w)
    if (target) applySteamDepot(w, d, target)
  }
  autoAssign(w)
}

export function selectedPicks(w) {
  return w.platforms.filter((p) => w.picks[p.id]?.on).map((p) => ({ ...p, ...w.picks[p.id] }))
}

export async function submitWizard() {
  const w = state.wizard
  if (!w) return
  const picked = selectedPicks(w)
  w.error = null

  if (!picked.length) {
    w.error = '至少要选一个平台'
    return
  }
  // 后台回来的 DepotID 是数字，本地是字符串 —— 一律 String() 再判，别假设类型
  const ids = picked.map((p) => String(p.depotId ?? '').trim())
  if (ids.some((x) => !/^\d+$/.test(x))) {
    w.error = '每个平台的 DepotID 都必须是数字'
    return
  }
  if (new Set(ids).size !== ids.length) {
    w.error = 'DepotID 有重复'
    return
  }
  for (const p of picked) {
    if (!String(p.contentRoot ?? '').trim()) {
      w.error = `${p.label} 的内容目录不能为空`
      return
    }
  }

  w.busy = true
  try {
    const res = await api.app.create({
      name: w.name.trim(),
      appId: w.appId.trim(),
      desc: w.desc.trim(),
      // 项目文件夹：各平台构建的父目录。各 Depot 默认取它下面的平台子目录。
      // 用户自己改过某个平台的目录时，那个平台以用户填的为准（下面的 contentRoot）。
      projectDir: `${String(w.buildsRoot || '').replace(/[\\/]+$/, '')}\\${w.name.trim()}`,
      depots: picked.map((p) => ({
        depotId: p.depotId.trim(),
        platform: p.id,
        contentRoot: p.contentRoot.trim()
      }))
    })
    if (!res.ok) {
      w.error = res.error
      return
    }
    const n = res.depots?.length || 0
    state.wizard = null
    await rescan()
    await selectApp(res.dirName)
    const made = (res.contentDirs || []).filter((c) => c.created).length
    toast(`已创建 ${res.dirName}（${n} 个 Depot）` + (made ? `，并建好 ${made} 个内容目录` : ''))
  } finally {
    if (state.wizard) state.wizard.busy = false
  }
}

/* ------------------------------------------------------------------ *
 *  改 App 名字（连文件夹一起改）
 * ------------------------------------------------------------------ */

export async function renameApp(dirName, newName) {
  const res = await api.app.rename(dirName, newName)
  if (!res.ok) {
    toast(res.error, 'bad')
    return res
  }
  if (!res.changed) return res
  state.selectedDir = res.dirName
  toast(`已改名为 ${res.dirName}`)
  await rescan()
  await selectApp(res.dirName)
  return res
}

/* ------------------------------------------------------------------ *
 *  后台构建 / 分支面板
 * ------------------------------------------------------------------ */

export async function loadBuildPanel(force = false) {
  const appId = String(state.detail?.appId || '')
  if (!appId) return { ok: false }
  const cur = state.buildPanel
  if (!force && cur.data && cur.appId === appId) return { ok: true }
  if (cur.busy && cur.appId === appId) return { ok: false }

  const forDir = state.selectedDir
  state.buildPanel = { busy: true, error: null, data: null, appId }
  try {
    const res = await api.steam.builds(appId)
    if (state.selectedDir !== forDir) return { ok: false, stale: true }
    if (!res?.ok) {
      state.buildPanel = { busy: false, error: res?.error || '读取失败', data: null, appId }
      return res
    }
    state.buildPanel = { busy: false, error: null, data: res, appId }
    return res
  } catch (e) {
    if (state.selectedDir === forDir) {
      state.buildPanel = { busy: false, error: e.message, data: null, appId }
    }
    return { ok: false, error: e.message }
  }
}

export function clearBuildPanel() {
  state.buildPanel = { busy: false, error: null, data: null, appId: '' }
}

/* ------------------------------------------------------------------ *
 *  上传后自动核对：日志里的 BuildID 是否真的成了后台最新构建
 *  「steamcmd 说 Successfully finished」和「后台真有这个 BuildID」是两件事。
 * ------------------------------------------------------------------ */

export async function verifyUploadedBuild(appId, logs) {
  const id = String(appId || '')
  if (!id) return
  const text = (Array.isArray(logs) ? logs : []).join('\n')
  const hits = [...text.matchAll(/\(BuildID\s+(\d+)\)/g)]
  const buildId = hits.length ? hits[hits.length - 1][1] : ''
  if (!buildId) {
    pushLog('system', '这次日志里没有 BuildID —— 不是正式上传（Preview / 本地构建都不带 BuildID）')
    return
  }
  if (!state.hasApiKey) {
    pushLog('system', `本次构建 BuildID ${buildId}（没有 Web API 密钥，跳过后台核对）`)
    return
  }

  pushLog('system', `正在核对后台：BuildID ${buildId}…`)
  try {
    const res = await api.steam.builds(id)
    if (!res?.ok) {
      pushLog('stderr', `后台核对失败：${res?.error || '未知错误'}`)
      return
    }
    const latest = (res.builds || [])[0] || null
    const ok = !!latest && String(latest.buildid) === String(buildId)
    state.lastBuildCheck = { appId: id, buildId, latest: latest ? latest.buildid : '', ok, at: Date.now() }
    if (ok) {
      pushLog('system', `✔ 后台最新构建就是 BuildID ${buildId} —— 内容已经进 Steam 后台`)
      toast(`已上传，后台确认 BuildID ${buildId}`)
    } else if (!latest) {
      pushLog('system', `后台还没列出构建记录（BuildID ${buildId}），可能还在处理 —— 稍后点「同步 Depot」再看一次`)
      toast('上传完成，但后台构建列表还没刷新出来', 'bad')
    } else {
      pushLog(
        'stderr',
        `⚠ BuildID ${buildId} 已经上传，但后台最新构建是 ${latest.buildid} —— 可能之前的构建比它新，或这次没生效`
      )
      toast(`注意：后台最新构建是 ${latest.buildid}，不是 ${buildId}`, 'bad')
    }
    void loadBuildPanel(true)
  } catch (e) {
    pushLog('stderr', `后台核对失败：${e.message}`)
  }
}

/* ------------------------------------------------------------------ *
 *  同步 Depot（有 Web API 密钥走密钥，没有就走 steamcmd + 已保存账号）
 *  只负责把后台已有的 Depot 列出来，加不加由用户自己勾。
 * ------------------------------------------------------------------ */

export async function verifyAgainstSteam(dirName, via) {
  // 记住这次是给哪个 App 查的。查后台要十几秒（走 steamcmd 时更久），
  // 期间用户很可能已经切走了 —— 那种情况下结果不能再往界面上写，
  // 否则 B 的窗口里会冒出 A 的 Depot 列表。
  const forDir = dirName || state.selectedDir
  const stale = () => state.selectedDir !== forDir

  state.verify = { busy: true, error: null, data: null, via: via || '' }
  try {
    const res = await api.steam.verifyApp(forDir, via)
    if (stale()) return { ok: false, stale: true }
    if (!res.ok) {
      state.verify = {
        busy: false,
        error: res.error,
        needsKey: !!res.needsKey,
        needsPassword: !!res.needsPassword,
        via: res.via || via || '',
        data: null
      }
      state.syncPicks = {}
      return res
    }
    state.verify = { busy: false, error: null, via: res.via || '', data: res }
    // 默认勾上「后台有、本地还没配」并且能认出平台的那些 —— 这些才是要同步的。
    // 其余一律不勾，加不加由用户自己决定。
    const local = new Set(
      (state.detail?.depots || []).map((d) => String(d.id))
    )
    const picks = {}
    for (const d of res.steamDepots || []) {
      const id = String(d.depotId || '')
      if (id && !local.has(id) && d.platform) picks[id] = true
    }
    state.syncPicks = picks
    return res
  } catch (e) {
    if (stale()) return { ok: false, stale: true }
    state.verify = { busy: false, error: e.message, data: null, via: via || '' }
    return { ok: false, error: e.message }
  }
}

export function toggleSyncPick(depotId) {
  const id = String(depotId)
  const next = { ...state.syncPicks }
  if (next[id]) delete next[id]
  else next[id] = true
  state.syncPicks = next
}

export function syncPickAll(on) {
  if (!on) {
    state.syncPicks = {}
    return
  }
  const local = new Set((state.detail?.depots || []).map((d) => String(d.id)))
  const picks = {}
  for (const d of state.verify.data?.steamDepots || []) {
    const id = String(d.depotId || '')
    if (id && !local.has(id)) picks[id] = true
  }
  state.syncPicks = picks
}

/** 把勾上的后台 Depot 加成本地 depot 脚本 */
export async function syncAddSelected() {
  const picked = Object.keys(state.syncPicks)
  if (!picked.length) return { ok: false, error: '一个都没勾' }
  const all = state.verify.data?.steamDepots || []
  const projectDir = state.detail?.contentRoot || ''
  // 勾选、项目文件夹、要写进哪个 App，全部在开跑之前定死 ——
  // 中途切 App 不能让脚本落进另一个 App 的目录里
  const forDir = state.selectedDir
  state.syncAdding = true
  const added = []
  const failed = []
  try {
    for (const id of picked) {
      const d = all.find((x) => String(x.depotId) === id)
      if (!d) continue
      // 内容目录默认落在项目文件夹下的平台子目录
      const root = projectDir ? `${projectDir}\\${d.platform}` : ''
      const res = await api.app.addDepot(forDir, {
        depotId: id,
        platform: d.platform,
        os: d.os || '',
        arch: d.osarch || '',
        contentRoot: root,
        allowDuplicatePlatform: true
      })
      if (res.ok) added.push(id)
      else failed.push(`${id}: ${res.error}`)
    }
  } finally {
    state.syncAdding = false
  }
  // 结果是写给 forDir 的；如果人已经切走了，就别把它的详情刷到当前 App 上
  if (state.selectedDir === forDir) await reloadDetail()
  await rescan()
  if (state.selectedDir === forDir) state.syncPicks = {}
  if (failed.length) toast(`加了 ${added.length} 个，失败：${failed.join('；')}`, 'bad')
  else toast(`已加入 ${added.length} 个 Depot`, 'ok')
  return { ok: true, added, failed }
}

export function clearVerify() {
  state.verify = { busy: false, error: null, needsKey: false, needsPassword: false, via: '', data: null }
  state.syncPicks = {}
}

/* ------------------------------------------------------------------ *
 *  新建 Depot 侧边栏
 * ------------------------------------------------------------------ */

/** 从项目文件夹 + 平台推一个默认内容目录 */
function defaultRootFor(platform) {
  const project = state.detail?.contentRoot || ''
  if (!project) return ''
  return `${project}\\${platform}`
}

export async function openDepotSlide(platform) {
  const appId = state.detail?.appId || ''
  const taken = new Set((state.detail?.depots || []).map((d) => String(d.id)))
  let n = Number(appId) + 1
  while (taken.has(String(n))) n++
  const p = platform || 'win64'
  state.depotSlide = {
    platform: p,
    depotId: n > 1 ? String(n) : '',
    name: `${state.detail?.dirName || ''} Content`,
    os: p.startsWith('win') ? 'windows' : p === 'macos' ? 'macos' : 'linux',
    arch: p === 'win32' ? '32' : p === 'linuxarm64' ? 'arm64' : '64',
    language: 'all',
    contentRoot: defaultRootFor(p),
    allowDup: false,
    busy: false,
    error: null,
    // 这个 Depot 属于哪个 App —— 填表的时候能看见
    appId,
    appName: '',
    // 后台这个 App 下的 depot（点「读后台」才有；已有对账结果就直接用）
    backend: null,
    lookupBusy: false,
    lookupError: ''
  }
  slideLoadApp()
  // 平台选项从主进程拿一次
  if (!state.depotOptions.os.length) {
    const d = await api.app.defaults({ platform: p })
    state.depotOptions = {
      os: d.depotOs || [],
      arch: d.depotArch || [],
      archByOs: d.depotArchByOs || {},
      languages: d.depotLanguages || []
    }
    if (!state.settings) state.settings = { buildsRoot: d.buildsRoot }
  }
}

/** 侧边栏一打开就把这个 App 的名字查出来（本地名字优先，其次后台公开名） */
export async function slideLoadApp() {
  const s = state.depotSlide
  if (!s) return
  const id = String(s.appId || '').trim()
  if (!/^\d+$/.test(id)) return
  const local = (state.apps || []).find((a) => String(a.appId) === id)
  if (local) s.appName = local.dirName
  const name = await publicName(id)
  if (state.depotSlide === s && name) s.appName = name
  // 已经有对账结果就直接拿来用，不再打一次接口
  if (state.depotSlide === s && !s.backend && state.verify?.data?.steamDepots?.length) {
    s.backend = state.verify.data.steamDepots
  }
}

/** 点「读后台」时才真去拉一次这个 App 的 depot 列表（走 steamcmd，几秒到几十秒） */
export async function slideLookupBackend() {
  const s = state.depotSlide
  if (!s) return
  const id = String(s.appId || '').trim()
  if (!/^\d+$/.test(id)) {
    s.lookupError = '这个 App 还没有 AppID，读不了后台'
    return
  }
  s.lookupBusy = true
  s.lookupError = ''
  try {
    const r = await api.steam.appDepots(id)
    if (state.depotSlide !== s) return
    if (r?.ok) {
      s.backend = r.depots || []
      if (r.appName) s.appName = r.appName
    } else {
      s.lookupError = r?.error || (r?.needsPassword ? '需要先在设置里保存 Steam 账号密码' : '读不到后台')
    }
  } catch (e) {
    if (state.depotSlide === s) s.lookupError = e.message || '读取失败'
  } finally {
    if (state.depotSlide === s) s.lookupBusy = false
  }
}

/** 正在填的 DepotID 在后台是什么情况 */
export function slideDepotHint() {
  const s = state.depotSlide
  if (!s) return null
  const id = String(s.depotId || '').trim()
  if (!/^\d+$/.test(id)) return null
  const local = (state.detail?.depots || []).find((d) => String(d.id) === id)
  if (local) return { tone: 'bad', text: `本地已经有 Depot ${id}（${local.platformLabel || local.platform}）了` }
  const list = s.backend
  if (!list) {
    return { tone: 'idle', text: '本地还没有这个 DepotID。点右上角「读后台」能核对后台有没有。' }
  }
  const hit = list.find((d) => String(d.depotId) === id)
  if (hit) {
    return {
      tone: 'ok',
      text: `后台有：${hit.platformLabel || '平台未知'}${hit.hasBuild ? ` · 最近构建 ${hit.buildId || hit.manifestId}` : ' · 还没有构建'}`
    }
  }
  return { tone: 'warn', text: '后台这个 App 下没有这个 DepotID —— 要么打错了，要么后台还没建' }
}

export function closeDepotSlide() {
  state.depotSlide = null
}

/** 某个操作系统下能选的架构。主进程给表，这里只做过滤。 */
export function archOptionsFor(os) {
  const all = state.depotOptions?.arch || []
  const ids = state.depotOptions?.archByOs?.[os]
  if (!ids || !ids.length) return all.length ? all : [{ id: '64', label: '64 位' }]
  const list = all.filter((a) => ids.includes(a.id))
  return list.length ? list : [{ id: '64', label: '64 位' }]
}

/** 改平台（下拉框里换系统/架构）时，如果内容目录还是自动推的，就跟着变 */
export function setDepotPlatform({ os, arch }) {
  const s = state.depotSlide
  if (!s) return
  const oldAuto = defaultRootFor(s.platform)
  if (os != null) {
    s.os = os
    // 换系统之后，原来选的架构可能在新系统下根本不存在（比如 macOS 没有 32 位），
    // 不换掉的话会留下一个选不中任何选项的下拉框。
    const ok = archOptionsFor(s.os).map((a) => a.id)
    if (!ok.includes(s.arch)) s.arch = ok[0]
  }
  if (arch != null) s.arch = arch
  const guess =
    s.os === 'windows' ? (s.arch === '32' ? 'win32' : 'win64')
      : s.os === 'macos' ? 'macos'
        : s.os === 'linux' ? (s.arch === 'arm64' ? 'linuxarm64' : 'linux')
          : s.platform
  if (s.contentRoot === oldAuto || !s.contentRoot) s.contentRoot = defaultRootFor(guess)
  s.platform = guess
}

export async function submitDepotSlide() {
  const s = state.depotSlide
  if (!s) return { ok: false }
  if (!/^\d+$/.test(String(s.depotId || '').trim())) {
    s.error = 'DepotID 必须是数字'
    return { ok: false }
  }
  if (!String(s.contentRoot || '').trim()) {
    s.error = '内容目录不能为空'
    return { ok: false }
  }
  s.busy = true
  s.error = null
  try {
    const res = await api.app.addDepot(state.selectedDir, {
      depotId: String(s.depotId).trim(),
      platform: s.platform,
      os: s.os,
      arch: s.arch,
      name: s.name,
      language: s.language,
      contentRoot: String(s.contentRoot).trim(),
      allowDuplicatePlatform: s.allowDup
    })
    if (!res.ok) {
      s.error = res.error
      if (res.duplicatePlatform) s.allowDup = false
      return res
    }
    state.activeDepot = String(s.depotId).trim()
    state.depotSlide = null
    await reloadDetail()
    await rescan()
    toast(`已新建 Depot ${res.file}`)
    return res
  } finally {
    if (state.depotSlide) state.depotSlide.busy = false
  }
}

export async function pickDepotRoot() {
  const s = state.depotSlide
  if (!s) return
  const p = await api.settings.pickFolder(s.contentRoot)
  if (p) s.contentRoot = p
}

/* ------------------------------------------------------------------ *
 *  已知 App 列表 / 公开名称查询
 * ------------------------------------------------------------------ */

export async function loadKnownApps() {
  state.knownAppsLoading = true
  try {
    const r = await api.app.knownApps()
    state.knownApps = Array.isArray(r) ? r : r?.apps || []
    state.partnerAppCount = r?.partnerCount || 0
  } catch {
    state.knownApps = []
    state.partnerAppCount = 0
  } finally {
    state.knownAppsLoading = false
  }
  return state.knownApps
}

/** store.steampowered.com 的名称查询，不需要密钥 */
export async function publicName(appId) {
  const id = String(appId || '').trim()
  if (!/^\d+$/.test(id)) return null
  try {
    const r = await api.app.publicName(id)
    if (r?.ok && r.found) {
      await api.meta.rememberAppId(id, r.name)
      return r.name
    }
  } catch {
    /* 查不到不算错 */
  }
  return null
}

export function goSettings() {
  state.view = 'settings'
}

/* ------------------------------------------------------------------ *
 *  游离 vdf：不在任何 App 文件夹里，列表里看不见
 * ------------------------------------------------------------------ */

export function openOrphanDialog() {
  const list = state.orphans || []
  if (!list.length) return
  // 用 app vdf 里的 AppID 猜个名字
  const app = list.find((o) => o.kind === 'app')
  const guess = app?.appId ? `App_${app.appId}` : ''
  state.orphanDialog = { name: guess, busy: false, error: null }
}

export function closeOrphanDialog() {
  state.orphanDialog = null
}

export async function submitOrphanDialog() {
  const d = state.orphanDialog
  if (!d) return
  d.busy = true
  d.error = null
  try {
    const res = await window.api.app.adoptOrphans(d.name.trim())
    if (!res.ok) {
      d.error = res.error
      return
    }
    state.orphanDialog = null
    await rescan()
    await selectApp(res.dirName)
    const n = res.moved?.length || 0
    toast(`已把 ${n} 个 vdf 收进 scripts\\${res.dirName}`)
  } finally {
    if (state.orphanDialog) state.orphanDialog.busy = false
  }
}

/* ------------------------------------------------------------------ *
 *  编辑抽屉
 * ------------------------------------------------------------------ */

export function openDrawer(kind, depotFile = null) {
  state.drawer = { kind, depotFile, busy: false, error: null }
}

export function closeDrawer() {
  state.drawer = null
}

export async function saveApp(patch, { silent = false } = {}) {
  if (!state.selectedDir) return { ok: false }
  const res = await api.app.update(state.selectedDir, patch)
  if (!res.ok) {
    toast(res.error || '保存失败', 'bad')
    return res
  }
  // 只有一个 depot 时，内容目录一起改，省得改两遍
  if (patch.contentRoot != null && state.detail?.depots?.length === 1) {
    await api.app.updateDepot(state.selectedDir, state.detail.depots[0].file, {
      contentRoot: patch.contentRoot
    })
  }
  await reloadDetail()
  if (!silent) toast('已保存')
  return res
}

export async function saveDepot(depotFile, patch) {
  if (!state.selectedDir) return { ok: false }
  const res = await api.app.updateDepot(state.selectedDir, depotFile, patch)
  if (!res.ok) {
    toast(res.error || '保存失败', 'bad')
    return res
  }
  await reloadDetail()
  state.drawer = state.drawer ? { ...state.drawer, depotFile: res.file || depotFile } : null
  toast(res.renamed ? `已保存（文件重命名为 ${res.file}）` : '已保存')
  return res
}

export async function addDepotToApp(spec) {
  if (!state.selectedDir) return { ok: false }
  const res = await api.app.addDepot(state.selectedDir, spec)
  if (!res.ok) {
    toast(res.error || '添加失败', 'bad')
    return res
  }
  await reloadDetail()
  toast(
    `已添加 Depot ${spec.depotId}` + (res.contentDirCreated ? `，并建好目录 ${res.contentRoot}` : '')
  )
  return res
}

export async function deleteDepot(depotFile) {
  if (!state.selectedDir) return { ok: false }
  const res = await api.app.removeDepot(state.selectedDir, depotFile)
  if (!res.ok) {
    toast(res.error || '删除失败', 'bad')
    return res
  }
  await reloadDetail()
  state.drawer = null
  toast('已删除该 Depot')
  return res
}

export async function openVdf(depotFile) {
  const res = await api.app.openVdf(state.selectedDir, depotFile)
  if (!res.ok) toast(res.error, 'bad')
}

/* ------------------------------------------------------------------ *
 *  剥离 Steam（独立功能）
 *  拖进一个打包好的文件夹 → 二次确认 → 复制一份到旁边，副本里去掉
 *  steam_api64.dll 这类原生运行库。原文件夹一个字节都不动。
 * ------------------------------------------------------------------ */

/** 失败时统一把错误收进弹窗 */
function stripFailed(message) {
  const s = state.strip
  s.busy = false
  s.progress = null
  s.error = message || "操作失败"
}

export async function pickStripFolder() {
  const res = await api.strip.pickFolder(state.strip.lastTarget || state.settings?.buildsRoot || "")
  if (!res?.ok || !res.path) return
  await inspectStripFolder(res.path)
}

/** 拖进来 / 选完文件夹之后先看一眼：里面有什么、要剥什么、默认复制到哪 */
export async function inspectStripFolder(target) {
  const p = String(target || "").trim()
  if (!p) return
  const s = state.strip
  s.busy = true
  s.error = null
  s.result = null
  s.progress = null
  s.lastTarget = p
  let res
  try {
    res = await api.strip.inspect(p)
  } catch (e) {
    stripFailed(e.message)
    toast(e.message, "bad")
    return
  }
  if (state.strip !== s) return
  s.busy = false
  if (!res?.ok) {
    s.inspect = null
    stripFailed(res?.error || "读不了这个文件夹")
    toast(s.error, "bad")
    return
  }
  s.inspect = res
  s.dest = res.defaultDest || ""
  s.removeConfig = true
  s.confirmOpen = true
}

export function closeStripConfirm() {
  if (state.strip.busy) return
  state.strip.confirmOpen = false
}

export function setStripDest(v) {
  const s = state.strip
  s.dest = String(v ?? "")
  s.error = null
}

/** 选一个父文件夹，副本放进去 */
export async function pickStripDest() {
  const s = state.strip
  if (!s.inspect || s.busy) return
  const res = await api.strip.pickDest(s.dest, s.inspect.name)
  if (res?.ok && res.path) {
    s.dest = res.path
    s.error = null
  } else if (res?.error) {
    s.error = res.error
  }
}

/** 还没确认就先把弹窗关了：从「已选文件夹」小结里重新打开 */
export function reopenStripConfirm() {
  const s = state.strip
  if (!s.inspect || s.busy) return
  s.error = null
  s.confirmOpen = true
}

export function setStripRemoveConfig(v) {
  state.strip.removeConfig = !!v
}

/** 二次确认后：复制 + 剥离。进度走 strip:progress 事件 */
export async function confirmStripCopy() {
  const s = state.strip
  if (!s.inspect || s.busy) return
  if (!s.dest.trim()) {
    s.error = "先填一个副本位置"
    return
  }
  s.busy = true
  s.error = null
  s.progress = {
    copiedFiles: 0,
    totalFiles: s.inspect.totalFiles,
    copiedBytes: 0,
    totalBytes: s.inspect.totalBytes
  }
  let res
  try {
    res = await api.strip.copy(s.inspect.root, s.dest.trim(), s.removeConfig)
  } catch (e) {
    stripFailed(e.message)
    return
  }
  if (state.strip !== s) return
  s.busy = false
  s.progress = null
  if (!res?.ok) {
    s.error = res?.error || "复制失败"
    return
  }
  s.result = res
  s.inspect = null
  s.confirmOpen = false
  toast(res.stripped.length ? `已复制并剥离：${res.name}` : `已复制：${res.name}（没找到 Steam 运行库）`)
}

export async function openStripDest() {
  const dest = state.strip.result?.dest
  if (!dest) return
  const r = await api.shell.openPath(dest)
  if (!r?.ok) toast(r?.error || "打不开", "bad")
}

/** 回到「拖一个文件夹进来」的起点 */
export function resetStrip() {
  const s = state.strip
  if (s.busy) return
  s.inspect = null
  s.confirmOpen = false
  s.dest = ""
  s.progress = null
  s.result = null
  s.error = null
}

/* ------------------------------------------------------------------ *
 *  删除 App
 * ------------------------------------------------------------------ */

export async function openDeleteDialog() {
  if (!state.selectedDir) return
  const dirName = state.selectedDir
  state.deleteDialog = {
    loading: true,
    info: null,
    dirName,
    deleteContent: false,
    busy: false,
    error: null
  }
  const info = await api.app.previewDelete(dirName)
  // 用户可能在等待期间关了弹窗
  if (!state.deleteDialog || state.deleteDialog.dirName !== dirName) return
  state.deleteDialog.loading = false
  state.deleteDialog.info = info
  if (!info.ok) state.deleteDialog.error = info.error
}

export function closeDeleteDialog() {
  state.deleteDialog = null
}

export async function confirmDelete() {
  const d = state.deleteDialog
  if (!d || d.busy) return
  // 二次点击的「第一次」由弹窗自己管（armed 状态）；这里只管真删。

  d.busy = true
  const res = await api.app.delete(d.dirName, d.deleteContent)
  if (!res.ok) {
    d.busy = false
    d.error = res.error
    return
  }

  state.deleteDialog = null
  state.drawer = null
  if (state.selectedDir === d.dirName) {
    state.selectedDir = null
    state.detail = null
  }
  await rescan()
  if (!state.selectedDir && state.apps.length) await selectApp(state.apps[0].dirName)

  const n = res.removed?.content?.length || 0
  const skipped = res.removed?.skipped?.length || 0
  toast(
    `已删除 ${d.dirName}` +
      (n ? `，连同 ${n} 个内容目录` : '') +
      (skipped ? `（${skipped} 个目录不在 buildsRoot 内，已跳过）` : '')
  )
}

/* ------------------------------------------------------------------ *
 *  执行
 * ------------------------------------------------------------------ */

export function clearLogs() {
  state.logs = []
  state.lastExit = null
  state.prompt = null
  state.uploaded = null
}

export async function runCheck() {
  if (state.running) return
  clearLogs()
  state.running = true
  state.runKind = 'check'
  pushLog('system', `> check.ps1 ${state.selectedDir ? `-App ${state.selectedDir}` : '(全部)'}`)
  const res = await api.run.check(state.selectedDir || undefined)
  if (!res.ok) {
    pushLog('stderr', res.error || '启动失败')
    state.running = false
    state.runKind = null
  } else {
    state.runId = res.id
  }
}

export async function runBuild({ preview, password, local, guardCode }) {
  if (state.running || !state.selectedDir) return
  clearLogs()
  state.askPasswordError = null
  state.askGuard = null
  state.running = true
  state.runKind = 'build'
  state.runPreview = !!preview
  state.runLocal = !!local
  state.runGuardCode = String(guardCode || '').trim()
  pushLog(
    'system',
    `> build.ps1 -App ${state.selectedDir}${preview ? ' -Preview' : ''}${local ? ' -Local' : ''}`
  )
  const res = await api.run.build(state.selectedDir, !!preview, password, !!local, guardCode)

  if (res.ok) {
    state.runId = res.id
    state.askPassword = null
    return
  }

  state.running = false
  state.runKind = null

  if (res.needsPassword) {
    // 不把这条当成错误刷进日志，而是弹输入行让用户补密码
    state.logs = []
    // local 也要带着 —— 否则补完密码会退化成一次普通上传
    state.askPassword = { preview: !!preview, local: !!local }
    state.askPasswordError = res.error
    return
  }

  pushLog('stderr', res.error || '启动失败')
}

/** 用户在界面里补了密码 */
export async function submitPassword(pw, { remember = false } = {}) {
  const req = state.askPassword
  if (!req || !pw) return
  if (remember) {
    const r = await api.settings.setPassword(pw)
    if (r.ok) state.hasPassword = true
  }
  state.askPassword = null
  state.askPasswordError = null
  await runBuild({ preview: req.preview, password: pw, local: req.local })
}

/**
 * 带上 Steam Guard 验证码再来一次。
 * 密码不用重敲 —— 主进程还留着上一次那 30 秒的缓存。
 */
export async function submitGuardCode(code) {
  const req = state.askGuard
  if (!req || !code) return
  state.askGuard = null
  await runBuild({ preview: req.preview, local: req.local, guardCode: code })
}

export function cancelGuardPrompt() {
  state.askGuard = null
  state.prompt = null
}

export function cancelPasswordPrompt() {
  state.askPassword = null
  state.askPasswordError = null
}

/** 打开一个控制台窗口做一次交互登录，之后就不需要密码了 */
export async function openLogin() {
  const res = await api.run.login()
  if (!res.ok) alert(res.error)
  else pushLog('system', '已打开登录窗口：在里面的 steamcmd 提示符下执行 login ' + (state.settings?.account || '<账号>'))
}

export async function cancelRun() {
  if (!state.runId) return
  pushLog('system', '正在中止…')
  await api.run.cancel(state.runId)
}

export async function answerPrompt(text) {
  if (!state.runId || !state.prompt) return
  await api.run.input(state.runId, text)
  pushLog('system', '已提交验证码')
  state.prompt = null
}

export function pushLog(stream, line) {
  state.logs.push({ stream, line, t: Date.now() })
  // 控制台上限，防止长时间构建把内存吃满
  if (state.logs.length > 4000) state.logs.splice(0, state.logs.length - 4000)
}

/* ------------------------------------------------------------------ *
 *  界面缩放（主进程 webContents.setZoomFactor，值同时写进 settings.json）
 * ------------------------------------------------------------------ */

export const ZOOM_MIN_PCT = 80
export const ZOOM_MAX_PCT = 150
export const ZOOM_STEP_PCT = 5

/** 百分比取整并夹到 80–150 */
export function clampZoomPct(pct) {
  const n = Math.round(Number(pct))
  if (!Number.isFinite(n)) return 100
  return Math.min(ZOOM_MAX_PCT, Math.max(ZOOM_MIN_PCT, n))
}

export async function setZoom(factor) {
  const r = await api.ui.zoom(factor)
  if (r?.ok) {
    state.zoom = r.zoomFactor
    state.settings = { ...state.settings, zoomFactor: r.zoomFactor }
  }
  return r
}

/** 设成某个整数百分比（输入框用） */
export function setZoomPercent(pct) {
  return setZoom(clampZoomPct(pct) / 100)
}

/** dir = 1 加 5%，-1 减 5%；先在整数百分比上取整再步进，到头停在 80% / 150% */
export function zoomStep(dir) {
  const curPct = Math.round((Number(state.zoom) || 1) * 100)
  return setZoomPercent(curPct + (dir > 0 ? ZOOM_STEP_PCT : -ZOOM_STEP_PCT))
}

export function zoomReset() {
  return setZoom(1)
}

/* ------------------------------------------------------------------ *
 *  主进程事件
 * ------------------------------------------------------------------ */

export function wireEvents() {
  api.update.onProgress(({ got, total, incremental, estimate, full, differential, note }) => {
    // 增量下载时 total 是「这次要下的字节数」，可能只有几 MB —— 界面按它算百分比
    if (typeof got === 'number') state.update.got = got
    if (total) state.update.total = total
    // 差分算完、真正开始下之前先报一次「这次要下多少 / 整包多大」
    if (typeof estimate === 'number') state.update.estimate = estimate
    if (typeof full === 'number') state.update.fullSize = full
    if (incremental) state.update.viaIncremental = true
    if (typeof differential === 'boolean') state.update.differential = differential
    if (note && /incremental-fallback/.test(String(note))) {
      state.update.viaIncremental = false
      state.update.differential = false
    }
  })

  api.drop.onProgress((msg) => {
    if (state.drop.busy) state.drop.progress = msg
  })

  api.strip.onProgress((p) => {
    if (state.strip.busy) state.strip.progress = p
  })

  api.run.onData((d) => {
    if (d.stream === 'system') pushLog('system', d.line)
    else pushLog(d.stream, d.line)
  })

  api.run.onPrompt((d) => {
    state.prompt = d
  })

  api.run.onExit((d) => {
    state.running = false
    state.runId = null
    const code = d.code
    const kind = state.runKind
    const wasPreview = state.runPreview
    const wasLocal = state.runLocal
    const appName = state.selectedDir || ''
    state.lastExit = { code, at: Date.now(), kind }
    pushLog(code === 0 ? 'system' : 'stderr', `— 进程结束，退出码 ${code} —`)
    state.runKind = null
    state.runLocal = false

    /* 构建卡在「要 Steam Guard 验证码」上时给个补码入口。
     * steamcmd 那句提示走 stdout，接管道时是块缓冲的、未必刷得出来，
     * 所以 runner 的 onPrompt 不一定抓得到 —— 退出后扫一遍日志兜底。 */
    if (code !== 0) {
      const text = (state.logs || []).map((l) => l.line).join('\n')
      if (
        /Account Logon Denied|Invalid Login Auth Code|Steam Guard code|Two-factor code|has not been authenticated for your account/i.test(
          text
        )
      ) {
        state.askGuard = { preview: wasPreview, local: wasLocal }
      }
    }

    // 「一次配好」里那次构建结束了 —— 收尾并检查内容真进去了没
    if (wasLocal && state.local.flow?.building) {
      const f = state.local.flow
      f.building = false
      f.running = false
      if (code === 0) {
        loadLocalStatus()
          .then(() => {
            const n = state.local.status?.contentFiles || 0
            setStep('build', n > 0 ? 'done' : 'fail', n > 0 ? `${n} 个文件已在服务器里` : '构建成功但服务器里还是空的')
            f.done = n > 0
            toast(n > 0 ? '内容已经进本地服务器了 —— 重启 Steam 就能下到' : '构建成功，但 htdocs 里还是空的')
          })
          .catch(() => {
            setStep('build', 'done', '构建成功')
            f.done = true
          })
      } else {
        setStep('build', 'fail', `退出码 ${code}`)
        f.error = `构建失败，退出码 ${code}`
      }
    }

    // 正式上传成功 -> 记下来，界面上给一个直接跳 Steamworks 的入口
    // 本地服务器构建不算上传 —— 一个字节都没到 Steam
    if (code === 0 && kind === 'build' && !wasPreview && !wasLocal) {
      state.uploaded = { appId: state.detail?.appId || '', at: Date.now() }
      // 「steamcmd 说成功」≠「后台真有这个 BuildID」——有密钥就再核一遍
      void verifyUploadedBuild(
        String(state.detail?.appId || ''),
        (state.logs || []).map((l) => l.line)
      )
    }

    // 系统通知：不用盯着窗口看
    const title =
      code !== 0
        ? '出错了'
        : kind === 'check'
          ? '检查配置通过'
          : wasLocal
            ? '内容已送进本地服务器'
            : wasPreview
              ? 'Preview 完成'
              : '上传完成'
    const body =
      code !== 0
        ? `${appName} · 退出码 ${code}`
        : kind === 'check'
          ? `${appName} · 结构与排除规则都没问题`
          : wasLocal
            ? `${appName} · 重启 Steam 后就能从本机下到`
            : wasPreview
              ? `${appName} · 空跑成功，没有上传任何东西`
              : `${appName} · 去 Steamworks 把这次构建设为 live`
    api.notify(title, body).catch(() => {})

    reloadDetail()
    if (kind === 'build') loadHistory()
  })
}

/* ------------------------------------------------------------------ *
 *  全部 App 一起检查配置
 * ------------------------------------------------------------------ */

export async function runCheckAll() {
  if (state.running) return
  clearLogs()
  state.running = true
  state.runKind = 'check'
  pushLog('system', '> check.ps1（所有 App）')
  const res = await api.run.check(undefined)
  if (!res.ok) {
    pushLog('stderr', res.error || '启动失败')
    state.running = false
    state.runKind = null
  } else {
    state.runId = res.id
  }
}

/* ------------------------------------------------------------------ *
 *  拖进来一个文件夹 / 压缩包
 * ------------------------------------------------------------------ */

/** 悬停高亮：只在窗口这一层管，子元素不用各自监听 */
export function setDropOver(on) {
  state.drop.over = !!on
}

export function closeDrop() {
  state.drop.data = null
  state.drop.error = null
  state.drop.over = false
  state.drop.backend = { busy: false, done: false, error: '', needsCreds: false, appName: '', via: '', depots: [] }
  // 解压缓存不长期占盘：导入窗口一关就把 .drop-probe 清掉
  // （applyDrop 成功时已清过一次，这里兜住取消/关闭/分析失败的情况）
  try {
    api.drop.cleanup()
  } catch {
    /* 清理失败不影响关闭窗口 */
  }
}

/**
 * 拖放窗口里读后台，列出「后台有、本地还没配」的 Depot。
 * 为什么值得自动跑：后台如果已经有一个同平台的 Depot，而本地只有别的平台，
 * 那么窗口默认给出的「新建一个 Depot（AppID+1）」就会撞上一个已经存在的 ID。
 */
export async function dropLookupBackend() {
  const dir = state.selectedDir
  const appId = String(state.detail?.appId || '').trim()
  const box = state.drop.backend
  if (!dir || !/^\d+$/.test(appId)) {
    box.error = '这个 App 还没有 AppID，读不了后台'
    box.done = true
    return
  }
  box.busy = true
  box.error = ''
  box.done = false
  box.depots = []
  try {
    const res = await api.steam.appDepots(appId)
    // 切走了就别把 A 的后台结果写进 B 的窗口
    if (state.selectedDir !== dir) return
    if (!res || res.ok === false) {
      box.error = res?.error || '读不出来'
      if (res?.needsKey || res?.needsPassword) box.needsCreds = true
      return
    }
    const localIds = new Set((state.detail?.depots || []).map((x) => String(x.id)))
    box.appName = res.appName || ''
    box.via = res.via || ''
    box.depots = (res.depots || []).filter((x) => x.platform && !localIds.has(String(x.depotId)))
    box.done = true
  } catch (e) {
    if (state.selectedDir === dir) box.error = e.message
  } finally {
    if (state.selectedDir === dir) box.busy = false
  }
}

/** 把后台某个 Depot 补进本地脚本，返回它的 depotFile 以便直接选中 */
export async function dropSyncDepot(depotId, platform) {
  const dir = state.selectedDir
  if (!dir || !depotId) return { ok: false, error: '没什么可同步的' }
  state.drop.busy = true
  try {
    const base = String(state.detail?.contentRoot || '').replace(/[\\/]+$/, '')
    const res = await api.app.addDepot(dir, {
      depotId: String(depotId),
      platform,
      contentRoot: base ? `${base}\\${platform}` : '',
      allowDuplicatePlatform: true
    })
    if (!res || res.ok === false) {
      state.drop.error = res?.error || '补不进来'
      return { ok: false, error: state.drop.error }
    }
    await rescan()
    if (state.selectedDir === dir) await reloadDetail()
    // 后台清单里已经有的那条现在落到本地了，从待选里摘掉
    state.drop.backend.depots = state.drop.backend.depots.filter((x) => String(x.depotId) !== String(depotId))
    const made = (state.detail?.depots || []).find((x) => String(x.id) === String(depotId))
    toast(`已把 Depot ${depotId} 补进本地`)
    return { ok: true, file: made?.file || '' }
  } catch (e) {
    state.drop.error = e.message
    return { ok: false, error: e.message }
  } finally {
    state.drop.busy = false
  }
}

/** 第一步：看它是什么。压缩包会先解到 .drop-probe 里探一下 */
export async function dropAnalyze(target) {
  const p = String(target || '').trim()
  if (!p) return
  state.drop.over = false
  state.drop.busy = true
  state.drop.error = null
  state.drop.startedAt = Date.now()
  state.drop.progress = null
  // 先把窗口支起来。4 GB 的压缩包解压要好几分钟，那段时间里
  // 主进程是忙的 —— 不留点动的东西，用户只会以为程序挂了。
  state.drop.data = { pending: true, target: p, name: p.split(/[\\/]/).pop() }
  try {
    const res = await api.drop.analyze(p)
    if (!res || res.ok === false) {
      state.drop.error = res?.error || '读不了这个路径'
      state.drop.data = { ok: false, target: p, name: p.split(/[\\/]/).pop() }
    } else {
      state.drop.data = res
    }
  } catch (e) {
    state.drop.error = e.message
    state.drop.data = { ok: false, target: p, name: p.split(/[\\/]/).pop() }
  } finally {
    state.drop.busy = false
    state.drop.progress = null
  }
}

/** 第二步：导入选好的 Depot（没有就给新建一个） */
export async function dropApply(spec) {
  if (!state.selectedDir) return toast('先选一个 App', 'bad')
  state.drop.busy = true
  try {
    const res = await api.drop.apply({
      ...spec,
      appDirName: state.selectedDir,
      kind: state.drop.data?.kind,
      archive: state.drop.data?.archive,
      dir: state.drop.data?.dir,
      target: state.drop.data?.target
    })
    if (!res || res.ok === false) {
      state.drop.error = res?.error || '放不进去'
      return res
    }
    closeDrop()
    await rescan()
    await reloadDetail()
    toast(
      res.mode === 'copy'
        ? `已复制进 ${res.contentRoot}`
        : `内容目录已指到 ${res.contentRoot}`,
      'ok'
    )
    return res
  } catch (e) {
    state.drop.error = e.message
    return { ok: false, error: e.message }
  } finally {
    state.drop.busy = false
  }
}

/* ------------------------------------------------------------------ *
 *  检查文件
 * ------------------------------------------------------------------ */

export async function runPreflight(dirName) {
  const dir = dirName || state.selectedDir
  if (!dir) return null
  // 跟「同步 Depot」一个道理：扫盘可能很久，扫完时人可能已经切到别的 App 了，
  // 那份结果不能再往界面上写
  const stale = () => state.selectedDir !== dir
  state.preflight = { busy: true, error: null, data: null }
  let res = null
  try {
    res = await api.app.preflight(dir)
  } catch (e) {
    if (stale()) return null
    state.preflight = { busy: false, error: e.message, data: null }
    return null
  }
  if (stale()) return null
  if (!res || res.ok === false) {
    state.preflight = { busy: false, error: res?.error || '检查文件失败', data: null }
    return null
  }
  state.preflight = { busy: false, error: null, data: res }
  const n = res.errors || 0
  toast(n ? `检查文件发现 ${n} 个会挡住上传的问题` : '检查文件通过，没有会挡住上传的问题', n ? 'warn' : 'ok')
  return res
}

export function clearPreflight() {
  state.preflight = { busy: false, error: null, data: null }
}

/* ------------------------------------------------------------------ *
 *  App 级开关：verbose / 本地内容服务器
 * ------------------------------------------------------------------ */

export async function setAppVerbose(on) {
  if (!state.selectedDir) return
  await api.app.update(state.selectedDir, { verbose: !!on })
  await reloadDetail()
}

export async function setAppLocal(on) {
  if (!state.selectedDir) return
  const r = await api.app.update(state.selectedDir, { local: !!on })
  if (r && r.ok === false) {
    toast(r.error || '改不了', 'bad')
    return
  }
  await reloadDetail()
  toast(on ? '这个 App 的构建会传进本地内容服务器' : '已改回正常上传 Steam')
}

/* ------------------------------------------------------------------ *
 *  Depot 的「玩家存档文件」（FileProperties / userconfig）
 * ------------------------------------------------------------------ */

export async function setDepotUserConfig(depotFile, list) {
  if (!state.selectedDir) return null
  const r = await api.app.updateDepot(state.selectedDir, depotFile, { userConfig: list })
  if (r && r.ok === false) {
    toast(r.error || '保存失败', 'bad')
    return r
  }
  await reloadDetail()
  await rescan()
  toast('已更新玩家存档标记')
  return r
}

/* ------------------------------------------------------------------ *
 *  本地内容服务器
 * ------------------------------------------------------------------ */

export async function loadLocalStatus() {
  try {
    const st = await api.local.status()
    if (st?.ok) {
      state.local = {
        ...state.local,
        ...st,
        // 原样留一份，面板要用 contentFiles / contentBytes
        status: st,
        busy: false,
        devcfg: state.local.devcfg
      }
    }
  } catch {
    /* 主进程没起来也无所谓 */
  }
  return state.local
}

export async function loadLocalDevCfg() {
  try {
    state.local.devcfg = await api.local.devcfg(state.local.port || 80)
  } catch (e) {
    state.local.devcfg = { ok: false, error: e.message }
  }
  return state.local.devcfg
}

export async function startLocalServer() {
  state.local.busy = true
  state.local.error = null
  const r = await api.local
    .start(state.local.port || 80)
    .catch((e) => ({ ok: false, error: e.message }))
  state.local.busy = false
  if (!r.ok) {
    state.local.error = r.error
    toast(r.error || '启动失败', 'bad')
    return r
  }
  await loadLocalStatus()
  toast(`本地内容服务器已启动：${state.local.url}`)
  return r
}

export async function stopLocalServer() {
  state.local.busy = true
  await api.local.stop().catch(() => null)
  state.local.busy = false
  await loadLocalStatus()
  toast('本地内容服务器已停')
}

export async function openLocalServer() {
  const r = await api.local.open().catch((e) => ({ ok: false, error: e.message }))
  if (!r.ok) toast(r.error || '打不开', 'bad')
  return r
}

export async function enableLocalDevCfg() {
  const r = await api.local
    .enableDevcfg(state.local.port || 80)
    .catch((e) => ({ ok: false, error: e.message }))
  if (!r.ok) {
    toast(r.error || '写不了 steam_dev.cfg', 'bad')
    return r
  }
  await loadLocalDevCfg()
  toast(`已写入 ${r.file}${r.backedUp ? '（原文件备份成 .bak）' : ''}`)
  return r
}

/* ------------------------------------------------------------------ *
 *  「一次配好」—— 把这条路上的 5 件事串成一个按钮
 * ------------------------------------------------------------------ */

function flowStep(id) {
  return (state.local.flow.steps || []).find((s) => s.id === id)
}

function setStep(id, st, detail = '') {
  const s = flowStep(id)
  if (s) {
    s.state = st
    s.detail = detail
  }
}

/** 把流程重置成「还没开始」，其它面板按钮也能调 */
export function resetLocalFlow() {
  const f = state.local.flow
  f.running = false
  f.building = false
  f.done = false
  f.error = null
  for (const s of f.steps) {
    s.state = 'idle'
    s.detail = ''
  }
}

/**
 * 起服务器 + 标记 App + 写 steam_dev.cfg + 跑一次本地构建。
 *
 * 顺序是有讲究的：服务器必须先起来（否则构建写进去也没人服务），
 * 标记必须在构建之前（"Local" 那行是构建时读的），
 * steam_dev.cfg 什么时候写都行，所以放最后。
 *
 * 80 端口常被占（本机上就有别的进程监听 80），所以起不来会自动换 8099 再试一次 ——
 * 「一次就成功」主要就靠这个。
 */
export async function runLocalSetup() {
  const dir = state.selectedDir
  const f = state.local.flow
  if (!dir || f.running) return { ok: false }

  f.running = true
  f.done = false
  f.error = null
  state.local.error = null
  for (const s of f.steps) {
    s.state = 'idle'
    s.detail = ''
  }

  const fail = (stepId, msg) => {
    setStep(stepId, 'fail', msg)
    f.error = msg
    f.running = false
    toast(msg, 'bad')
    return { ok: false, error: msg }
  }

  /* 1. 服务器 —— 端口被占就自动换一个 */
  setStep('server', 'doing')
  const wanted = state.local.port || 80
  let r = await api.local.start(wanted).catch((e) => ({ ok: false, error: e.message }))
  if (!r.ok && wanted !== 8099) {
    r = await api.local.start(8099).catch((e) => ({ ok: false, error: e.message }))
    if (r.ok) state.local.port = 8099
  }
  if (!r.ok) return fail('server', r.error || '内容服务器起不来')
  await loadLocalStatus()
  setStep('server', 'done', `127.0.0.1:${state.local.port}`)

  /* 2. 让这个 App 的构建走本地 */
  setStep('flag', 'doing')
  const u = await api.app.update(dir, { local: true }).catch((e) => ({ ok: false, error: e.message }))
  if (u && u.ok === false) return fail('flag', u.error || '写不进 vdf')
  await reloadDetail()
  setStep('flag', 'done')

  /* 3. steam_dev.cfg —— 已经配好就跳过 */
  setStep('devcfg', 'doing')
  await loadLocalDevCfg()
  const cfg = state.local.devcfg
  if (!cfg?.ok) {
    setStep('devcfg', 'fail', cfg?.error || '找不到 Steam 目录')
  } else if (cfg.has) {
    setStep('devcfg', 'done', '之前就配好了')
  } else {
    const w = await api.local.enableDevcfg(state.local.port).catch((e) => ({ ok: false, error: e.message }))
    if (w.ok) {
      await loadLocalDevCfg()
      setStep('devcfg', 'done', w.backedUp ? '已写入（原文件备份成 .bak）' : '已写入')
    } else {
      setStep('devcfg', 'fail', w.error || '写不了')
    }
  }

  /* 4. 跑构建 —— 这一步是异步的，退出码在 onExit 里回收 */
  setStep('build', 'doing', '构建进行中，看下面的输出')
  f.building = true
  await runBuild({ preview: false, local: true })

  if (!state.running) {
    // 没起来（多半是缺密码）—— 让密码提示接管，流程先停在这
    f.building = false
    if (state.askPassword) {
      setStep('build', 'idle', '等着你填密码')
      f.running = false
      return { ok: false, needsPassword: true }
    }
    return fail('build', '构建没能启动')
  }

  // 构建跑起来了，running 保持 true，等 onExit 收尾
  return { ok: true, started: true }
}
