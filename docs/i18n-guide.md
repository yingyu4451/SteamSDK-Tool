# 界面中英文案（i18n）约定

工具支持中文 / English 两套界面。**中文原文就是 key**：源码里保留中文，英文查字典，查不到就显示中文原文。

## 怎么用

渲染层（`src/renderer/src/**`）：

```js
import { t, num, listSeparator } from '../i18n/index.js'   // components/ 下也是 ../i18n/index.js
```

```vue
<span>{{ t('上传中') }}</span>
<span :title="t('已上传 {n} 个文件', { n: 3 })"></span>
```

主进程（`src/main/*.js`，不含 i18n.js 自己）：

```js
import { t } from './i18n.js'
throw new Error(t('找不到 SteamSDK 目录：{path}', { path }))
```

- `t()` 读的是响应式语言，切换语言后模板自己重画，**不需要**重新加载窗口。
- 主进程的 `t()` 只在启动和保存设置时刷新，所以只用来生成「给界面看的文本」，不要用来做日志匹配或持久化 key。

## 写法

| 需求 | 写法 |
| --- | --- |
| 普通文案 | `t('关闭')` |
| 插值 | `t('已上传（BuildID {id}）', { id: buildId })` |
| 英文复数 | `t('{n} 个文件', { n })` → 字典值 `'{n} file\|{n} files'`（n === 1 取前半） |
| 同句异译 | `t('关闭@@window')`、`t('关闭@@dialog')`（`@@` 后面只用来区分 key，中文界面会剥掉） |
| 数字千分位 | `num(value)` 代替 `value.toLocaleString('en-US')` |
| 列表分隔 | `listSeparator()` 代替 `'、'`（中文「、」，英文「, 」） |

**不要**写 `t(\`已上传 ${id}\`)` —— 运行时拼出来的字符串查不到字典，检查器会报「动态拼接」。改成参数占位。

## 字典

英文词条在 `src/shared/i18n/en/` 下按领域分文件，每个文件 `export default { '中文': 'English' }`：

```js
export default {
  '关闭': 'Close',
  '{n} 个文件': '{n} file|{n} files'
}
```

- 键**一律加引号**（中文键里常有空格、括号、冒号）。
- 值不要留中文。
- 同一个中文在两个文件里翻译得不一样时，先加载的胜出并 `console.warn`，所以术语要统一（见下）。

## 英文风格

- Steam 开发者工具的语气，简短：按钮/标签 1–3 个词，Sentence case（`Check config`、`New app`），句子正常大小写。
- 统一术语：App → `app`；Depot → `depot`；build → `build`；preview → `preview`；upload → `upload`；branch → `branch`；manifest → `manifest`；ContentRoot → `content root`；SDK 路径 → `SDK path`；Steamworks 后台 → `Steamworks backend`；构建脚本 → `build script`；清空成就 → `Clear achievements`；检查配置 → `Check config`；检查文件 → `Check files`；待处理 → `Needs attention`；上传体积 → `Upload size`；被排除 → `Excluded`。
- 中文标点换英文：`——` → `—`；`（）` → `( )`；`「」` → “ ”；`…` → `...`（或省略）。
- 占位符原样保留：中文里 `{path}` 英文里还是 `{path}`。
- 不要逐字硬翻，读起来像原生英文优先；但意思不能变（尤其错误提示里的操作指引）。

## 自检

```bash
node scripts/i18n-check.mjs          # 全项目
node scripts/i18n-check.mjs --all    # 不截断
node scripts/i18n-check.mjs --dump src/renderer/src/components/TitleBar.vue   # 看某个文件哪里还没迁
```

它报四类东西：

1. **缺英文词条** —— `t()` 用到的中文在字典里没有（英文界面会显示中文）。
2. **仍未走 t() 的中文** —— 源码里剩下的中文（行号 + 原文）。
3. **动态拼接的 t()** —— `t(\`…${x}\`)`，必须改成参数。
4. 警告：词条没被用到、或两个文件译文不一致。

确实不能翻的地方（纯开发者日志、要匹配外部进程输出的中文串）在该行加 `// i18n-ignore` 豁免。

## 哪些中文**不要**翻

判断标准：这句话是「给人看的」，还是「给程序看的」。

- **给人看的** → 翻（界面文案、错误提示、toast、状态标签、title、placeholder）。
- **给程序看的** → 不翻，并加 `// i18n-ignore`，在汇报里说明：
  - 存进 `settings.json` 的值（`defaultBuildMode: 'preview'`、分支名、`depotMeta` 的 key、`appIdHistory` 的条目）；
  - 用作 Map/Set key 或参与 `===` 比较的身份字符串；
  - 用来匹配外部进程输出（steamcmd / build.ps1 的中文输出）的正则或子串。
- 主进程里**模块加载时**就求值的中文（模块顶部的常量表、`label:` 字段）别直接改成 `t()` —— 那时语言还没定。保留中文字段，在**返回给界面**的时候再 `t(item.label)`。
- 文件路径、日志原文、Steam 专有名词（AppID、Depot、SetLive、BuildID、vdf、steamcmd、ContentBuilder）保持原样。

## 待处理问题（problems）

`src/main/sdk.js` 的待处理问题不是字符串，而是 `{ key, params }`（`problem('中文模板', { … })`）：

- 显示：`import { problemLabel } from '../i18n/index.js'` → `problemLabel(p)`（跟着界面语言）。
- 身份：`problemId(p)`（永远中文渲染）—— `problemsIgnored` / `sessionIgnored` 的比较、`ignoreProblem(problemId(p))` 都用它，换语言不会让用户的忽略记录失效。


## 参考实现

- `src/renderer/src/components/TitleBar.vue` + `src/shared/i18n/en/shell.js`：模板文案、`:title`、插值、列表分隔都覆盖了。
- `src/renderer/src/i18n/index.js`：渲染层入口（`t` / `num` / `listSeparator` / `lang`）。
- `src/main/i18n.js`：主进程入口。
- `src/shared/i18n/core.js`：查字典、插值、复数的实现（不需要改）。
