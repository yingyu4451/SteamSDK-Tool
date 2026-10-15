import fs from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

const DEFAULTS = {
  sdkRoot: 'D:\\SteamSDK',
  // 这是 Steam 的「账号名」，不是登录邮箱。steamcmd 自己的
  // builder\config\config.vdf 里 Accounts 段的键就是它。
  // 留空 —— 首次运行时从 config.vdf 里自动认，认不到就让用户在设置里填。
  account: '',
  // 新建 App 时默认把内容目录放在这里：<buildsRoot>\<App 名>\<平台>
  buildsRoot: 'D:\\SteamBuilds',
  rememberPassword: false,
  // appId -> 该 App 用过的分支名列表（Steam 后台的分支信息不在本地，这里只是历史记录）
  branches: {},
  lastApp: null,
  windowBounds: null,
  defaultBuildMode: 'preview', // preview | live
  // depotId -> { name, language, os, arch }
  // Steamworks 后台的 Depot 有名称/语言/系统/架构，本地 vdf 里没有这些字段
  // （run_app_build 不需要，键写进去反而可能报错）。所以存在这里，界面上显示。
  depotMeta: {},
  // 用过的 AppID 历史，给新建 App 的下拉框用：{ appId, name, at }
  appIdHistory: [],
  // appDirName -> [被忽略的问题原文]。有些「待处理」是故意的（比如 depot
  // 就是要点到 Downloads 里的构建产物），不该每次开界面都报一遍。
  ignoredProblems: {}
}

let cache = null

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function credFile() {
  return path.join(app.getPath('userData'), 'credentials.bin')
}

function apiKeyFile() {
  return path.join(app.getPath('userData'), 'webapi.key')
}

export function loadSettings() {
  if (cache) return cache
  let disk = {}
  try {
    disk = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
  } catch {
    /* 首次运行，用默认值 */
  }
  cache = { ...DEFAULTS, ...disk }
  return cache
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  cache = next
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
    return { ok: true, settings: next }
  } catch (e) {
    return { ok: false, error: e.message, settings: next }
  }
}

export function rememberBranch(appId, branch) {
  const s = loadSettings()
  const key = String(appId || 'unknown')
  const list = new Set(s.branches[key] || [])
  if (branch) list.add(branch)
  const branches = { ...s.branches, [key]: [...list] }
  return saveSettings({ branches })
}

/* ------------------------------------------------------------------ *
 *  Depot 元数据：Steamworks 后台新建 Depot 要填的
 *  「名称 / 语言 / 操作系统 / 架构」本地 vdf 里没有对应字段，
 *  存这里供界面显示和编辑。
 * ------------------------------------------------------------------ */

export function setDepotMeta(depotId, meta) {
  const id = String(depotId || '').trim()
  if (!id) return { ok: false, error: 'DepotID 不能为空' }
  const s = loadSettings()
  const next = { ...(s.depotMeta || {}) }
  const cur = next[id] || {}
  const merged = {
    name: meta.name != null ? String(meta.name).trim() : cur.name || '',
    language: meta.language != null ? String(meta.language) : cur.language || 'all',
    os: meta.os != null ? String(meta.os) : cur.os || '',
    arch: meta.arch != null ? String(meta.arch) : cur.arch || ''
  }
  if (!merged.name && !merged.os && !merged.arch) delete next[id]
  else next[id] = merged
  saveSettings({ depotMeta: next })
  return { ok: true, meta: next[id] || null }
}

export function readDepotMeta() {
  return { ...(loadSettings().depotMeta || {}) }
}

/** 记住用过的 AppID，下次新建 App 的下拉框里能直接选 */
export function rememberAppId(appId, name) {
  const id = String(appId || '').trim()
  if (!/^\d+$/.test(id)) return { ok: false }
  const s = loadSettings()
  const list = (s.appIdHistory || []).filter((x) => x && String(x.appId) !== id)
  list.unshift({ appId: id, name: String(name || ''), at: Date.now() })
  saveSettings({ appIdHistory: list.slice(0, 30) })
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 *  「本次忽略」的问题
 *
 *  待处理清单里有些条目是**故意**的（比如 depot 就是指向 Downloads 里的
 *  构建产物）。按 App + 问题原文记下来，下次不再提示；原文一样才算同一条，
 *  路径变了会重新报 —— 这正是想要的行为。
 * ------------------------------------------------------------------ */

export function readIgnoredProblems(appDirName) {
  const all = loadSettings().ignoredProblems || {}
  const list = all[appDirName]
  return Array.isArray(list) ? list : []
}

export function setIgnoredProblem(appDirName, text, on) {
  const key = String(appDirName || '').trim()
  const t = String(text || '').trim()
  if (!key || !t) return { ok: false, error: '缺少 App 名或问题内容' }
  const s = loadSettings()
  const all = { ...(s.ignoredProblems || {}) }
  const list = new Set(all[key] || [])
  if (on) list.add(t)
  else list.delete(t)
  if (list.size) all[key] = [...list]
  else delete all[key]
  saveSettings({ ignoredProblems: all })
  return { ok: true, ignored: all[key] || [] }
}

/* ------------------------------------------------------------------ *
 *  密码：用 Electron 的 safeStorage（Windows 上底层是 DPAPI，
 *  只有当前 Windows 用户能解密）加密后落盘，明文永不写入磁盘。
 * ------------------------------------------------------------------ */

export function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function savePassword(password) {
  if (!encryptionAvailable()) {
    return { ok: false, error: '系统不支持安全存储（safeStorage 不可用），密码不会被保存' }
  }
  try {
    const enc = safeStorage.encryptString(password)
    fs.mkdirSync(path.dirname(credFile()), { recursive: true })
    fs.writeFileSync(credFile(), enc)
    saveSettings({ rememberPassword: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function readPassword() {
  try {
    if (!fs.existsSync(credFile())) return ''
    return safeStorage.decryptString(fs.readFileSync(credFile()))
  } catch {
    return ''
  }
}

export function clearPassword() {
  try {
    if (fs.existsSync(credFile())) fs.unlinkSync(credFile())
  } catch {
    /* ignore */
  }
  saveSettings({ rememberPassword: false })
  return { ok: true }
}

export function hasPassword() {
  return fs.existsSync(credFile())
}

/* ------------------------------------------------------------------ *
 *  Steamworks Web API 密钥：公开 API 端点不带 key 一律 403，
 *  只有 Steamworks 后台签发的密钥才能读到「后台到底有哪些 App /
 *  哪些 Depot / 哪些分支」。同样用 safeStorage 加密落盘。
 * ------------------------------------------------------------------ */

export function saveApiKey(key) {
  if (!encryptionAvailable()) {
    return { ok: false, error: '系统不支持安全存储（safeStorage 不可用），密钥不会被保存' }
  }
  const clean = String(key || '').trim()
  if (!/^[0-9A-Fa-f]{32}$/.test(clean)) {
    return { ok: false, error: 'Web API 密钥应该是 32 位十六进制字符' }
  }
  try {
    fs.mkdirSync(path.dirname(apiKeyFile()), { recursive: true })
    fs.writeFileSync(apiKeyFile(), safeStorage.encryptString(clean))
    saveSettings({ hasApiKey: true })
    return { ok: true, tail: clean.slice(-4) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function readApiKey() {
  try {
    if (!fs.existsSync(apiKeyFile())) return ''
    return safeStorage.decryptString(fs.readFileSync(apiKeyFile()))
  } catch {
    return ''
  }
}

export function clearApiKey() {
  try {
    if (fs.existsSync(apiKeyFile())) fs.unlinkSync(apiKeyFile())
  } catch {
    /* ignore */
  }
  saveSettings({ hasApiKey: false })
  return { ok: true }
}

export function hasApiKey() {
  return fs.existsSync(apiKeyFile())
}
