/**
 * 主进程的翻译入口。
 *
 *   import { t } from './i18n.js'
 *   throw new Error(t('找不到 SteamSDK 目录：{path}', { path }))
 *
 * 语言由 settings.language（auto 时看系统语言）决定，会在窗口创建、
 * 设置保存时调用 setLanguage() 刷新。
 */
import * as electron from 'electron'
import { resolveLang, translateIn } from '../shared/i18n/index.js'

/**
 * 主进程里 `electron` 是带 `app` 的对象；但 scripts/test-*.mjs 是在**纯 Node** 下
 * import 这些 main 模块的，那时 `require('electron')` 只返回二进制路径字符串。
 * 用命名空间 import + 兜底，别让「跑单测」把 i18n 拖崩。
 */
function electronApp() {
  return electron.app || electron.default?.app || null
}

let current = 'zh'

export function systemLocale() {
  try {
    return electronApp()?.getLocale?.() || 'zh'
  } catch {
    return 'zh'
  }
}

/** 按偏好 + 系统语言刷新界面语言，返回生效的语言 */
export function setLanguage(pref) {
  current = resolveLang(pref, systemLocale())
  return current
}

export function currentLanguage() {
  return current
}

export function t(key, params) {
  return translateIn(current, key, params)
}
