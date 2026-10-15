import { reactive, computed } from 'vue'

const api = window.api

export const state = reactive({
  booted: false,
  bootError: null,

  settings: null,
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

  running: false,
  runKind: null, // check | build
  runId: null,
  runPreview: true,
  runLocal: false,
  logs: [],
  prompt: null,
  lastExit: null,

  // 构建需要密码但本地没有时，界面弹出输入行：{ preview: boolean }
  askPassword: null,
  askPasswordError: null,

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
  // 同步面板上勾了哪些后台 Depot 要加进来：{ [depotId]: true }
  syncPicks: {},
  syncAdding: false,
  // 新建 Depot 的侧边栏：{ platform, depotId, name, os, arch, language, contentRoot, exclusions, allowDup, busy, error }
  depotSlide: null,
  // Depot 矩阵当前选中的 tab
  activeDepot: null,
  // 新建 App 向导的 AppID 下拉框数据
  knownApps: [],
  // Steamworks 新建 Depot 的选项（系统 / 架构 / 语言）
  depotOptions: { os: [], arch: [], languages: [] },
  // scripts 根目录下游离的 vdf（不属于任何 App 文件夹）
  orphans: [],
  orphanDialog: null,
  // 上传前预检
  preflight: { busy: false, error: null, data: null },
  // 本地内容服务器
  local: { running: false, port: 80, url: '', installed: true, busy: false, devcfg: null, error: null }
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
    state.hasPassword = s.hasPassword
    state.encryptionAvailable = s.encryptionAvailable
    state.sdk = status
    await rescan()
    if (!state.selectedDir && state.apps.length) {
      await selectApp(state.apps[0].dirName)
    }
    state.booted = true
  } catch (e) {
    state.bootError = e.message
    state.booted = true
  }
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
  state.detailLoading = true
  try {
    state.detail = await api.sdk.app(dirName)
    state.settings = { ...state.settings, lastApp: dirName }
    api.settings.save({ lastApp: dirName })
  } finally {
    state.detailLoading = false
  }
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

export async function openWizard() {
  const [d, ks, ka] = await Promise.all([
    api.app.defaults({ platform: 'win64' }),
    api.steam.keyState().catch(() => ({ has: false })),
    api.app.knownApps().catch(() => [])
  ])
  state.hasApiKey = !!ks.has
  // 本地已有 App + 用过的 AppID 历史，给 AppID 下拉框用
  state.knownApps = ka || []
  const picks = {}
  for (const p of d.platforms) {
    picks[p.id] = { on: p.id === 'win64', depotId: '', contentRoot: '', autoDepot: true, autoRoot: true, fromSteam: false }
  }
  state.wizard = {
    platforms: d.platforms,
    buildsRoot: d.buildsRoot,
    name: '',
    appId: '',
    desc: '',
    preview: true,
    picks,
    lookup: emptyLookup(),
    busy: false,
    error: null
  }
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

  cur.lookup = {
    ...emptyLookup(),
    done: true,
    via: res.via || '',
    appIdKnown: res.appIdKnown !== false,
    appName: res.appName || '',
    depots: (res.depots || []).map((d) => ({ ...d, on: false, appliedAs: '' }))
  }

  // 读回来就全部勾上：后台认不出平台的那些也找一个空着的平台填进去，
  // 用户要的是「读完就都在」，不想要的自己取消勾。
  const used = new Set(
    Object.entries(cur.picks)
      .filter(([, k]) => k.on)
      .map(([id]) => id)
  )
  for (const d of cur.lookup.depots) {
    if (d.platform) {
      applySteamDepot(cur, d)
      used.add(d.platform)
      continue
    }
    const free = cur.platforms.find((p) => !used.has(p.id))
    if (free) {
      applySteamDepot(cur, d, free.id)
      used.add(free.id)
    }
  }
  autoAssign(cur)
}

/** 用户改 AppID 之后，之前查到的结果就不再是这个 App 的了 */
export function wizardClearLookup() {
  const w = state.wizard
  if (w) w.lookup = emptyLookup()
}

/** 勾 / 取消勾一条后台 depot */
export function wizardToggleSteamDepot(depotId, platform) {
  const w = state.wizard
  const d = w?.lookup?.depots?.find((x) => x.depotId === depotId)
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

  if (!applySteamDepot(w, d, platform)) {
    w.lookup.error = '这个平台的 Depot 已经满了'
    return
  }
  w.lookup.error = null
  autoAssign(w)
}

export function wizardApplyAllSteam() {
  const w = state.wizard
  if (!w?.lookup?.done) return
  for (const d of w.lookup.depots) if (d.platform && !d.on) applySteamDepot(w, d)
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
      preview: w.preview,
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
 *  同步 Depot（有 Web API 密钥走密钥，没有就走 steamcmd + 已保存账号）
 *  只负责把后台已有的 Depot 列出来，加不加由用户自己勾。
 * ------------------------------------------------------------------ */

export async function verifyAgainstSteam(dirName, via) {
  state.verify = { busy: true, error: null, data: null, via: via || '' }
  try {
    const res = await api.steam.verifyApp(dirName || state.selectedDir, via)
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
  const s = state.settings || {}
  const projectDir = state.detail?.contentRoot || ''
  const appName = state.detail?.dirName || ''
  state.syncAdding = true
  const added = []
  const failed = []
  try {
    for (const id of picked) {
      const d = all.find((x) => String(x.depotId) === id)
      if (!d) continue
      // 内容目录默认落在项目文件夹下的平台子目录
      const root = projectDir ? `${projectDir}\\${d.platform}` : ''
      const res = await api.app.addDepot(state.selectedDir, {
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
  await reloadDetail()
  await rescan()
  state.syncPicks = {}
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
    error: null
  }
  // 平台选项从主进程拿一次
  if (!state.depotOptions.os.length) {
    const d = await api.app.defaults({ platform: p })
    state.depotOptions = {
      os: d.depotOs || [],
      arch: d.depotArch || [],
      languages: d.depotLanguages || []
    }
    if (!state.settings) state.settings = { buildsRoot: d.buildsRoot }
  }
}

export function closeDepotSlide() {
  state.depotSlide = null
}

/** 改平台（下拉框里换系统/架构）时，如果内容目录还是自动推的，就跟着变 */
export function setDepotPlatform({ os, arch }) {
  const s = state.depotSlide
  if (!s) return
  const oldAuto = defaultRootFor(s.platform)
  if (os != null) s.os = os
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
  try {
    state.knownApps = (await api.app.knownApps()) || []
  } catch {
    state.knownApps = []
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

export async function runBuild({ preview, password, local }) {
  if (state.running || !state.selectedDir) return
  clearLogs()
  state.askPasswordError = null
  state.running = true
  state.runKind = 'build'
  state.runPreview = !!preview
  state.runLocal = !!local
  pushLog(
    'system',
    `> build.ps1 -App ${state.selectedDir}${preview ? ' -Preview' : ''}${local ? ' -Local' : ''}`
  )
  const res = await api.run.build(state.selectedDir, !!preview, password, !!local)

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
    state.askPassword = { preview: !!preview }
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
  await runBuild({ preview: req.preview, password: pw })
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
 *  主进程事件
 * ------------------------------------------------------------------ */

export function wireEvents() {
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
    const appName = state.selectedDir || ''
    state.lastExit = { code, at: Date.now(), kind }
    pushLog(code === 0 ? 'system' : 'stderr', `— 进程结束，退出码 ${code} —`)
    state.runKind = null

    // 正式上传成功 -> 记下来，界面上给一个直接跳 Steamworks 的入口
    if (code === 0 && kind === 'build' && !wasPreview) {
      state.uploaded = { appId: state.detail?.appId || '', at: Date.now() }
    }

    // 系统通知：不用盯着窗口看
    const title =
      code !== 0
        ? '出错了'
        : kind === 'check'
          ? '自检通过'
          : wasPreview
            ? 'Preview 完成'
            : '上传完成'
    const body =
      code !== 0
        ? `${appName} · 退出码 ${code}`
        : kind === 'check'
          ? `${appName} · 结构与排除规则都没问题`
          : wasPreview
            ? `${appName} · 空跑成功，没有上传任何东西`
            : `${appName} · 去 Steamworks 把这次构建设为 live`
    api.notify(title, body).catch(() => {})

    reloadDetail()
    if (kind === 'build') loadHistory()
  })
}

/* ------------------------------------------------------------------ *
 *  全部 App 一起自检
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
 *  上传前预检
 * ------------------------------------------------------------------ */

export async function runPreflight(dirName) {
  const dir = dirName || state.selectedDir
  if (!dir) return null
  state.preflight = { busy: true, error: null, data: null }
  let res = null
  try {
    res = await api.app.preflight(dir)
  } catch (e) {
    state.preflight = { busy: false, error: e.message, data: null }
    return null
  }
  if (!res || res.ok === false) {
    state.preflight = { busy: false, error: res?.error || '预检失败', data: null }
    return null
  }
  state.preflight = { busy: false, error: null, data: res }
  const n = res.errors || 0
  toast(n ? `预检发现 ${n} 个会挡住上传的问题` : '预检通过，没有会挡住上传的问题', n ? 'warn' : 'ok')
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
      state.local = { ...state.local, ...st, busy: false, devcfg: state.local.devcfg }
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
