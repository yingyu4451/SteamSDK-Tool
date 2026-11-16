/**
 * 英文词条的**汇总表**。每个领域一个文件，方便几个人同时翻不同界面，
 * 也免得一个文件几千行。
 *
 * 只写「中文 → 英文」的映射；中文界面不需要字典，源码里的中文原文就是界面文字。
 * 词条写法见 core.js 顶部。新增界面时：先在代码里写 `t('中文原文')`，
 * 再把这一条补到对应领域的文件里（scripts/i18n-check.mjs 会漏的指出来）。
 */
import shell from './shell.js'
import workbench from './workbench.js'
import workbenchPanels from './workbench-panels.js'
import dialogs from './dialogs.js'
import dialogsSimple from './dialogs-simple.js'
import settings from './settings.js'
import onboard from './onboard.js'
import manual from './manual.js'
import store from './store.js'
import changelog from './changelog.js'
import misc from './misc.js'
import mainCore from './main-core.js'
import mainSdk from './main-sdk.js'
import mainTools from './main-tools.js'
import mainAuth from './main-auth.js'
import mainMisc from './main-misc.js'
import mainMisc2 from './main-misc2.js'
import mainUpdater from './main-updater.js'

const MODULES = {
  shell,
  workbench,
  'workbench-panels': workbenchPanels,
  dialogs,
  'dialogs-simple': dialogsSimple,
  settings,
  onboard,
  manual,
  store,
  changelog,
  misc,
  'main-core': mainCore,
  'main-sdk': mainSdk,
  'main-tools': mainTools,
  'main-auth': mainAuth,
  'main-misc': mainMisc,
  'main-misc2': mainMisc2,
  'main-updater': mainUpdater
}

/** 合并后的字典。同一条中文在两个文件里翻译得不一样时以先加载的为准，并记进冲突表 */
export const en = {}
export const enSource = {}
export const enConflicts = []

for (const [name, mod] of Object.entries(MODULES)) {
  for (const [key, value] of Object.entries(mod || {})) {
    if (!key) continue
    if (Object.prototype.hasOwnProperty.call(en, key)) {
      if (en[key] !== value) enConflicts.push({ key, kept: enSource[key], dropped: name, value })
      continue
    }
    en[key] = value
    enSource[key] = name
  }
}

if (enConflicts.length && typeof console !== 'undefined') {
  console.warn('[i18n] 英文词条重复且不一致：', enConflicts)
}
