/**
 * Steamworks Web API 客户端。
 *
 * 能读到什么（都需要 Steamworks 后台签发的 Web API 密钥）：
 *   GetPartnerAppListForWebAPIKey  这个密钥有权限的所有 App（AppID + 名字）
 *   GetAppDepotVersions            某个 App 下后台真实存在的所有 Depot + 当前 Manifest
 *   GetAppBetas                    某个 App 的所有分支（public / qa / internal …）
 *   GetAppBuilds                   最近的构建记录
 *
 * 这些在 api.steampowered.com 上叫「PUBLISHER」接口，实际域名是
 * partner.steam-api.com。不带 key 一律 403（不是 404，端点确实存在）。
 *
 * 没有密钥的账号（合作方普通成员）走 `steamcmdinfo.js` 那条路 —— 用 steamcmd
 * 自己的 app_info_print 读同一个 App 的 depot 列表，两条路最后都汇到
 * `summarizeAppDepots()`。
 */
import { oslistToPlatform } from './steamcmdinfo.js'

const PARTNER = 'https://partner.steam-api.com'
const TIMEOUT_MS = 20000

export class SteamApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'SteamApiError'
    this.status = status
  }
}

function buildUrl(pathname, params, key) {
  const u = new URL(PARTNER + pathname)
  for (const [k, v] of Object.entries(params || {})) {
    if (v === null || v === undefined || v === '') continue
    u.searchParams.set(k, String(v))
  }
  u.searchParams.set('key', key)
  return u
}

/** 出错时把 key 从任何可能回显的文本里抹掉 */
function scrub(text, key) {
  return key ? String(text).split(key).join('********') : String(text)
}

async function partnerGet(pathname, params, key) {
  if (!key) throw new SteamApiError('还没有配置 Web API 密钥', 0)

  let res
  try {
    res = await fetch(buildUrl(pathname, params, key), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new SteamApiError(`请求超时（${TIMEOUT_MS / 1000}s）：${pathname}`, 0)
    }
    throw new SteamApiError(`网络错误：${scrub(e?.message || e, key)}`, 0)
  }

  const text = await res.text()

  if (res.status === 401 || res.status === 403) {
    throw new SteamApiError(
      '密钥被拒绝（' +
        res.status +
        '）。三种常见原因：① 密钥打错或已作废；② 这个密钥不是从 Steamworks 后台' +
        '「用户与权限 → API 密钥」签发的；③ 密钥没有这个 App 的权限。',
      res.status
    )
  }
  if (!res.ok) {
    throw new SteamApiError(`HTTP ${res.status}：${scrub(text.slice(0, 200), key)}`, res.status)
  }

  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new SteamApiError(`返回的不是 JSON：${scrub(text.slice(0, 200), key)}`, res.status)
  }

  // Valve 统一包一层 { response: { ... } }
  return json && typeof json === 'object' && 'response' in json ? json.response : json
}

/* ------------------------------------------------------------------ */

/** 这个密钥有权限的所有 App。用来校验 AppID 到底存不存在。 */
export async function getPartnerApps(key) {
  const r = await partnerGet('/ISteamApps/GetPartnerAppListForWebAPIKey/v2/', {}, key)
  const list = r?.apps || r?.applist?.apps || []
  return list
    .map((a) => ({ appid: String(a.appid ?? ''), name: a.name || '' }))
    .filter((a) => a.appid)
    .sort((a, b) => Number(a.appid) - Number(b.appid))
}

/** 某个 App 下后台真实存在的 Depot 列表（含每个 Depot 当前的 Manifest）。 */
export async function getAppDepotVersions(key, appid) {
  const r = await partnerGet('/ISteamApps/GetAppDepotVersions/v1/', { appid }, key)
  const depots = (r?.depots || []).map((d) => ({
    depotid: String(d.depotid ?? ''),
    name: d.name || '',
    maxsize: Number(d.maxsize || 0),
    manifests: (d.manifests || []).map((m) => ({
      manifestid: String(m.manifestid ?? ''),
      buildid: String(m.buildid ?? ''),
      branch: m.branch || '',
      os: m.os || '',
      osarch: m.osarch || '',
      size: Number(m.size || 0),
      downloadsize: Number(m.downloadsize || 0),
      timeupdated: m.timeupdated || null
    }))
  }))
  return { appid: String(r?.appid ?? appid), depots: depots.filter((d) => d.depotid) }
}

/** 某个 App 的所有分支。 */
export async function getAppBetas(key, appid) {
  const r = await partnerGet('/ISteamApps/GetAppBetas/v1/', { appid }, key)
  const betas = (r?.betas || []).map((b) => ({
    betakey: b.betakey || '',
    description: b.description || '',
    buildid: b.buildid != null ? String(b.buildid) : '',
    timeupdated: b.timeupdated || null
  }))
  return { appid: String(r?.appid ?? appid), betas: betas.filter((b) => b.betakey) }
}

/** 最近几次构建。 */
export async function getAppBuilds(key, appid, count = 5) {
  const r = await partnerGet(
    '/ISteamApps/GetAppBuilds/v1/',
    { appid, count, depot_details: 1 },
    key
  )
  const builds = (r?.builds || []).map((b) => ({
    buildid: b.buildid != null ? String(b.buildid) : '',
    timeupdated: b.timeupdated || null,
    depots: (b.depots || []).map((d) => ({
      depotid: String(d.depotid ?? ''),
      manifestid: String(d.manifestid ?? ''),
      size: Number(d.size || 0),
      platform: d.platform || ''
    }))
  }))
  return { appid: String(r?.appid ?? appid), builds: builds.filter((b) => b.buildid) }
}

/** 「测试密钥」用：拉一次 App 列表，顺便返回数量。 */
export async function testKey(key) {
  const apps = await getPartnerApps(key)
  return { ok: true, count: apps.length, apps }
}

/* ------------------------------------------------------------------ *
 *  把后台数据和本地 vdf 对起来
 * ------------------------------------------------------------------ */

export const PLATFORM_LABEL = {
  win64: 'Windows 64',
  win32: 'Windows 32',
  macos: 'macOS',
  linux: 'Linux',
  linuxarm64: 'Linux ARM64'
}

/**
 * Steam 的 manifest os / osarch 字段 -> 本地平台 id。
 * 必须看 osarch：Windows 的 32 位 depot 和 64 位 depot 在后台是两条记录，
 * 只看 os 会把 32 位当成 win64。
 */
export function osToPlatform(os, osarch) {
  const o = String(os || '').toLowerCase()
  const a = String(osarch || '').toLowerCase()
  if (o === 'windows') return a === '32' ? 'win32' : 'win64'
  if (o === 'macos' || o === 'osx') return 'macos'
  if (o === 'linux') return a === '64' && String(osarch).includes('arm') ? 'linuxarm64' : 'linux'
  return ''
}

/**
 * 把「某个 App 的 depot 原始结构」整理成向导能直接用的形状。
 * 两个来源都汇到这里：
 *   * Web API  `getAppDepotVersions()` —— 平台线索在 manifest 的 os / osarch
 *   * steamcmd `parseDepotsFromAppInfo()` —— 平台线索在 depot 的 config.oslist
 * 每个 depot 挑一个「最有代表性的 manifest」来报构建信息。
 */
export function summarizeAppDepots(depots = []) {
  return depots.map((d) => {
    const ms = d.manifests || []

    // 平台优先级：depot 自己的 oslist（appinfo 走这条）> manifest 的 os
    const fromList = oslistToPlatform(d.oslist || [])
    const pick = ms.find((m) => osToPlatform(m.os, m.osarch)) || ms[0] || null
    const platform = fromList || (pick ? osToPlatform(pick.os, pick.osarch) : '')

    // 同一个 depot 在多个平台都有 manifest 的情况（少见）也要能看出来
    const osSet = [
      ...new Set([...ms.map((m) => osToPlatform(m.os, m.osarch)), fromList].filter(Boolean))
    ]

    return {
      depotId: String(d.depotid ?? ''),
      name: d.name || '',
      platform,
      platformLabel: platform ? PLATFORM_LABEL[platform] || platform : '',
      osSet,
      os: pick?.os || (d.oslist || []).join(',') || '',
      osarch: pick?.osarch || '',
      hasBuild: ms.length > 0,
      manifestId: pick?.manifestid || '',
      buildId: pick?.buildid || '',
      branch: pick?.branch || '',
      size: pick?.size || 0,
      maxsize: d.maxsize || 0,
      timeupdated: pick?.timeupdated || null
    }
  })
}

/**
 * 本地 depot 脚本 vs 后台 depot 列表。
 * 返回的每条都能直接显示给用户。
 */
export function diffDepots(app, steam) {
  const local = (app?.depots || []).filter((d) => !d.missing)
  const remote = new Map((steam?.depots || []).map((d) => [d.depotid, d]))
  const items = []

  for (const l of local) {
    const id = String(l.id)
    const r = remote.get(id)
    if (!r) {
      items.push({
        level: 'error',
        kind: 'localOnly',
        depotId: id,
        title: `depot ${id} 后台没有`,
        text:
          `本地脚本 ${l.file} 写的是 depot ${id}（${PLATFORM_LABEL[l.platform] || l.platform}），` +
          `但后台 AppID ${app.appId} 下不存在这个 Depot。` +
          `要么 DepotID 写错了，要么这个 Depot 还没在后台建。`
      })
      continue
    }
    remote.delete(id)

    const man = r.manifests || []
    const pub = man.find((m) => m.branch === 'public') || man[0]
    if (!pub) {
      items.push({
        level: 'warn',
        kind: 'matched',
        depotId: id,
        title: `depot ${id} 后台还没有任何 Manifest`,
        text: `后台存在这个 Depot${r.name ? `（${r.name}）` : ''}，但从来没传过内容。`
      })
      continue
    }

    const osPlat = osToPlatform(pub.os)
    const mismatch = osPlat && l.platform && osPlat !== l.platform
    items.push({
      level: mismatch ? 'warn' : 'ok',
      kind: 'matched',
      depotId: id,
      title: `depot ${id} 匹配`,
      text:
        `本地：${PLATFORM_LABEL[l.platform] || l.platform}` +
        `　后台：${r.name || '未命名'}` +
        (pub.os ? ` · ${pub.os}${pub.osarch ? ' ' + pub.osarch : ''}` : '') +
        (pub.branch ? ` · 分支 ${pub.branch}` : '') +
        (pub.buildid ? ` · build ${pub.buildid}` : ''),
      hint: mismatch
        ? `注意：后台这个 Depot 的 Manifest 标的是 ${pub.os}，本地脚本写的是 ${l.platform}。平台对不上通常意味着 DepotID 串了。`
        : ''
    })
  }

  for (const r of remote.values()) {
    items.push({
      level: 'warn',
      kind: 'steamOnly',
      depotId: r.depotid,
      title: `后台多了 depot ${r.depotid}`,
      text:
        `后台 AppID ${app.appId} 下有 depot ${r.depotid}${r.name ? `（${r.name}）` : ''}，` +
        `本地脚本里没有 —— 这次构建不会更新它。要一起传就在 Depot 矩阵里加上。`
    })
  }

  return items
}

/** 本地分支历史 vs 后台分支。 */
export function diffBranches(localBranches, steam) {
  const remote = (steam?.betas || []).map((b) => b.betakey)
  const local = Array.isArray(localBranches) ? localBranches : []
  const items = []

  for (const b of local) {
    if (!remote.includes(b)) {
      items.push({
        level: 'error',
        title: `分支 ${b} 后台不存在`,
        text: `本地历史里有这个分支名，但后台读不到。SetLive 写错分支名会静默失败，先确认后台建过它。`
      })
    }
  }
  for (const b of remote) {
    items.push({
      level: 'ok',
      title: `分支 ${b} 存在`,
      text: b === 'public' ? '默认分支' : '测试分支'
    })
  }
  return items
}
