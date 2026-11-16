/**
 * 渲染层的翻译入口。
 *
 *   import { t, lang } from '@/i18n/index.js'
 *   <span>{{ t('上传中') }}</span>
 *   <span :title="t('已上传 {n} 个文件', { n: 3 })"></span>
 *
 * `t()` 读的是响应式的 lang，所以切换语言后模板会自己重画，不用刷新窗口。
 */
import { computed, ref } from 'vue'
import {
  formatNumber,
  interpolate,
  langTag,
  normalizePref,
  resolveLang,
  stripKey,
  translate
} from '../../../shared/i18n/core.js'
import { en } from '../../../shared/i18n/en/index.js'

/** 用户偏好：'auto' | 'zh' | 'en'，来自 settings.language */
export const languagePref = ref('auto')
/** 系统语言，来自主进程 app.getLocale() */
export const systemLang = ref('zh')

export const lang = computed(() => resolveLang(languagePref.value, systemLang.value))
export const isEnglish = computed(() => lang.value === 'en')

export function t(key, params) {
  return translate(lang.value, key, params, en)
}

/** Intl / toLocaleString 用的标记 */
export function localeTag() {
  return langTag(lang.value)
}

/** 千分位数字 */
export function num(value) {
  return formatNumber(lang.value, value)
}

/**
 * 一条「待处理问题」的**身份**文本 —— 永远用中文渲染。
 *
 * 问题的显示文本要跟着界面语言变，但「忽略」记在 settings.json 里的是这条字符串，
 * 拿它当 key 才不会出现「中文下忽略过、切成英文又冒出来」。主进程 collectProblems
 * 给的 { key, params } 渲染成中文之后，和 i18n 之前直接返回的那句话逐字一致，
 * 所以老用户已有的忽略记录继续有效。
 */
export function problemId(p) {
  return interpolate(stripKey(p?.key ?? ''), p?.params)
}

/** 一条「待处理问题」的显示文本 —— 按当前界面语言 */
export function problemLabel(p) {
  return t(p?.key ?? '', p?.params)
}

/** join() 用的分隔符：中文用「、」，英文用「, 」 */
export function listSeparator() {
  return lang.value === 'en' ? ', ' : '、'
}

/**
 * 主进程返回的设置里读出语言，主进程已经用它解析过界面语言，这里保持一致。
 * @param {{language?: string}|null|undefined} settings
 * @param {string} [systemLocale]
 */
export function applyLanguage(settings, systemLocale) {
  if (systemLocale) systemLang.value = systemLocale
  const pref = normalizePref(settings?.language)
  languagePref.value = pref
  if (typeof document !== 'undefined') {
    const tag = langTag(resolveLang(pref, systemLang.value))
    document.documentElement.setAttribute('lang', tag)
  }
  return resolveLang(pref, systemLang.value)
}

/** 设置页点选后立刻生效（落盘由调用方负责） */
export function setLanguagePref(pref) {
  languagePref.value = normalizePref(pref)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', langTag(lang.value))
  }
  return lang.value
}

export { normalizePref, resolveLang }
