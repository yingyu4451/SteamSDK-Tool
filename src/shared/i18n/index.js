/** 主进程 / 渲染层共用的翻译入口 */
import { translate } from './core.js'
import { en, enConflicts, enSource } from './en/index.js'

export { en, enConflicts, enSource }
export { LANG_PREF, normalizePref, resolveLang, stripKey, interpolate, formatNumber, langTag } from './core.js'

/** @param {'zh'|'en'} lang */
export function translateIn(lang, key, params) {
  return translate(lang, key, params, en)
}
