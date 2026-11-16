/**
 * 中英切换的内核：不依赖 electron / vue，主进程和渲染层共用。
 *
 * 约定
 * ----
 * 1. 源码里**中文原文就是 key**。中文界面直接把 key 显示出去，
 *    英文界面查 en 字典；查不到就退回中文（宁可漏翻，也不能显示空白）。
 * 2. 带变量的句子写成 `t('已上传 {n} 个文件', { n: 3 })`，中文原文里用
 *    `{名字}` 占位。英文值里同样用 `{名字}`。
 * 3. 英文的复数用竖线分开：`'{n} file|{n} files'`。参数里带 n 时按 n === 1
 *    取第一段，否则取第二段。中文值里不写竖线。
 * 4. 同一句中文在不同位置要有不同英文时，key 后面加 `@@说明`：
 *    `t('关闭@@window')`。中文界面显示时会自动去掉 `@@说明`。
 */

export const LANG_PREF = ['auto', 'zh', 'en']

/** 把设置里存的语言偏好收敛成 auto | zh | en */
export function normalizePref(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === 'auto' || s === 'system') return 'auto'
  if (s.startsWith('zh')) return 'zh'
  if (s.startsWith('en')) return 'en'
  return 'auto'
}

/** auto 时按系统语言决定：zh 开头用中文，其余用英文 */
export function resolveLang(pref, systemLang) {
  const p = normalizePref(pref)
  if (p !== 'auto') return p
  return String(systemLang || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function stripKey(key) {
  const s = String(key ?? '')
  const i = s.indexOf('@@')
  return i > 0 ? s.slice(0, i) : s
}

/** 把 {name} 换掉；params 里没有的占位符原样留着（看得见才好修） */
export function interpolate(text, params) {
  if (!params) return text
  return String(text).replace(/\{(\w+)\}/g, (m, name) => {
    const v = params[name]
    return v === undefined || v === null ? m : String(v)
  })
}

/** 英文复数：取 n（或 count）判断要有 s 的那段 */
function pickPlural(text, params) {
  if (!text.includes('|')) return text
  const raw = params?.n ?? params?.count
  const num = Number(raw)
  const parts = text.split('|')
  if (!Number.isFinite(num)) return parts[parts.length - 1]
  return num === 1 ? parts[0] : parts[1] ?? parts[parts.length - 1]
}

/**
 * 翻译一句。
 * @param {'zh'|'en'} lang
 * @param {string} key 中文原文（可带 @@说明）
 * @param {Record<string, unknown>} [params]
 * @param {Record<string, string>} dict en 字典
 */
export function translate(lang, key, params, dict) {
  const raw = String(key ?? '')
  if (lang !== 'en') return interpolate(stripKey(raw), params)
  const hit = dict && (dict[raw] ?? dict[stripKey(raw)])
  if (hit === undefined) return interpolate(stripKey(raw), params)
  return interpolate(pickPlural(hit, params), params)
}

/** 数字：英文习惯千分位，中文同样用千分位 */
export function formatNumber(lang, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  return n.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')
}

/** 界面用 BCP-47 标记：给 <html lang> 和 Intl 用 */
export function langTag(lang) {
  return lang === 'en' ? 'en-US' : 'zh-CN'
}
