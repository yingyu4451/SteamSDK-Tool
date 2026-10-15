# SteamSDK 上传工作台

把 `D:\SteamSDK` 那套 SteamPipe 命令行流程包成一个桌面界面：
App 列表、内容体检、一键自检、Preview 空跑、正式上传、实时日志、构建历史、SetLive 分支管理、多平台 Depot 矩阵。

**一份 SDK 传所有 App / 所有 Depot / 所有版本** —— 界面本身就是围绕这个前提设计的，
不会再出现「一个版本复制一份 SDK」。

## 能做什么

| | |
|---|---|
| **多 App 管理** | 侧栏「＋」打开向导，填名字 + AppID 就建好一个版本（Demo / 正式版 / Playtest）。DepotID 自动按 `AppID + 1` 预填（你的 3036850→3036851 就是这个规律），可以改。**平台行可以拖动排序**，自上而下就是 +1、+2… 的顺序 —— 想让 macOS 拿到 `+1` 就把它拖到第一行 |
| **AppID 撞车当场拦下** | 向导里填的 AppID 如果本地已经有 App 在用，AppID 输入框下面立刻弹黄色横幅并给一个「改用它」按钮。两个本地 App 指同一个 Steam App 是很隐蔽的错误 —— 两边各自看都正常，构建却传到同一处 |
| **读后台真实 DepotID** | 向导里填完 AppID，点「读取后台 Depot」（或直接点到别处）就把后台已经配好的 Depot 列出来 —— 平台、构建号、体积，勾上哪个就把那个平台的 DepotID 换成后台的真实值。**比猜 `AppID+1` 可靠**：后台的 DepotID 不一定连号。**不需要管理员**：只要「设置」里存过 Steam 账号密码，就走 steamcmd 的 `app_info_print` 读；有 Web API 密钥时优先用密钥那条路 |
| **一个 App 管多平台** | **别为 win64 / macOS 各建一个 App。** 一个 App 下面挂多个 Depot 就行 —— 向导里多勾几个平台，或者在 Depot 矩阵上点「＋ 添加 Depot」。每个 Depot 有自己的内容目录和平台，一次构建全部发布，跟 Unity 命令行传 `-steamAppType Demo` 是一回事 |
| **改名（连文件夹一起）** | 抽屉里改 App 名字，`scripts\旧名\` 会自动重命名成 `scripts\新名\`，vdf 内容不动，内容目录也不碰 |
| **收拢游离 vdf** | 根目录下没被任何 App 管的 `app_*.vdf` / `depot_*.vdf` 会被顶部横幅列出来，一键收进 `scripts\<名字>\` 并把引用改成相对路径（这样整个 scripts 目录搬走也不会失效） |
| **新建时就把目录建好** | 向导建 App 时真的 `mkdir` 内容根目录（`D:\SteamBuilds\<名字>\<平台>`），不写占位文件 —— 占了位会被当内容传上 Steam。老配置缺目录时，Depot 行上有个「创建目录」按钮 |
| **删除 App** | 编辑抽屉底部「删除这个 App」。弹窗显示真实文件数/体积和每个内容目录的状态，**二次点击确认**（点一下只是上膛，5 秒内再点一次才真删；改勾选、关窗口、超时都会自动取消）。默认只删 vdf、保留内容目录；要连内容目录一起删得自己勾，而且只有当它在 `D:\SteamBuilds` 里面才会删 |
| **AppID 冲突检测** | 两个本地 App 用同一个 AppID 时，标题栏和侧栏都标红。给其中一个跑构建，内容会传到同一个 Steam App 上 —— 这种错误光看单个 App 是发现不了的 |
| **同步 Depot** | 读后台那个 App 下**实际有哪几个 Depot**（平台 / 分支 / 体积），列成带勾选框的清单，你自己挑要补哪几个，点「添加选中的 N 个」才写进来 —— 本地已有的会置灰标「本地已有」。**和「读取后台 Depot」走同一条路**：有 Web API 密钥就用密钥，没有就自动退回 steamcmd + 已保存的 Steam 账号 —— 不是管理员也能用。纯只读，不会碰后台 |
| **项目文件夹** | 一个 App 一个**项目文件夹**（App 层 `ContentRoot`），各平台在它下面分子目录：`<项目文件夹>\win64`、`\macos`、`\linux`…… 每个 Depot 用自己的 `contentroot` 指过去。改完项目文件夹，抽屉里有「各 Depot 按项目文件夹重排」，一次把所有 Depot 挪过去并建好目录 —— 不重排的话它们还指着旧地方，构建时读到的是过期内容 |
| **界面内编辑** | App 的 AppID / Desc / ContentRoot / BuildOutput / preview / SetLive，Depot 的 DepotID / 平台 / 内容目录 / FileExclusion，全都能在抽屉里改，不用手写 vdf |
| **内容目录一键绑定** | 抽屉里点「选择…」挑文件夹；App 只有一个 Depot 时，改一次两边同步 |
| **Depot 用选项卡，不堆列表** | Depot 面板顶部是平台卡片（只显示**已配置**的平台，没有 win64/win32/linux 占位），点一下切到那个 Depot，下面显示它的状态 / 系统 / 语言 / 四个数字 / 内容目录 / 脚本名，再接「会被上传的可疑文件」和「被 FileExclusion 挡下的文件（按规则分组）」两块折叠区。原来那个独立的「内容体检」面板已删掉 —— 它的四个数字跟这里是同一份，没有存在的必要 |
| **新建 Depot 走侧边栏** | Depot 面板右上角「＋ 新建 Depot」从右侧滑出 460px 侧边栏。字段分两组：**Steamworks 后台**（名称 / DepotID / 操作系统 / 架构 / 语言）和**本地 · SteamPipe**（内容目录）。同平台已经有 Depot 时弹黄色警告，要勾「确实要再加一个同平台的」才能建 |
| **一键自检** | 跑的是 `check.ps1`，输出实时流回界面 |
| **Preview / 正式上传** | 正式上传要点两次确认；没存密码时弹输入行而不是让进程干等 |
| **实时日志** | steamcmd 和 PowerShell 的输出逐行流回，可复制、可中止（整棵进程树一起杀） |
| **构建历史** | `output\` 下所有日志，点开就能看 |
| **分支管理** | 写 `SetLive`，记住用过的分支名，一键跳后台分支页 |
| **上传后跳转** | 正式上传成功后，控制台顶部出现「打开构建页」，直接去设为 live |
| **系统通知** | 自检 / Preview / 上传跑完弹系统通知，不用盯着窗口 |
| **上传前预检** | 自检之外再查一遍「线上会出事」的东西：内容目录重叠、玩家存档没被标成 `userconfig`、macOS `.app` / 符号链接、`.pdb` / 日志 / `BurstDebugInformation` 混在里面、`preview` 还开着却点了正式上传。每条给「拦住 / 警告 / 提示」 |
| **玩家存档保护** | Depot 抽屉里可以标 `FileProperties / userconfig`（相对内容目录）。标上的文件 Steam 首次安装放一份，**之后升级不再覆盖** —— 玩家的进度不会被你的更新冲掉 |
| **verbose 详细日志** | App 抽屉里勾上，vdf 里写 `verbose = 1`，steamcmd 会逐文件打印 |
| **每个 App 独立 BuildOutput** | vdf 里的 `BuildOutput` 现在真的生效了：`build.ps1` 把日志和构建缓存写到那个目录，不再全塞进 ContentBuilder 根下 |
| **本地内容服务器** | 用 SDK 自带的 `ContentServer\`，把构建传进本机而不是 Steam。一键起停、一键写客户端的 `steam_dev.cfg`（会先备份 `.bak`）。调试不用每次真上传 |
| **多 App 批量自检** | 侧栏那个盾牌图标，把每个 App 都跑一遍 `check.ps1`，结果进同一个控制台 |

### 编辑 vdf 时不会毁掉注释

读写分开：**读**走 `vdf.js` 的解析器，**写**走 `vdf-edit.js` 的行级替换。
所以像 `AbyaPlayerTest` 的 depot 脚本里那 13 行「上次构建传了什么垃圾」的说明、
`// Overrides the AppBuild-level ContentRoot.` 这类注释，编辑保存后原样还在。
如果改成「解析成对象再重新序列化」，这些注释会全部消失。

### app vdf 里 depot 写绝对路径也认

Valve 的模板和手写的脚本里，`"Depots"` 块两种写法都有：

```
"3036851"	"depot_3036851_win64.vdf"                          // 裸文件名（我们生成的）
"3036851"	"D:\SteamSDK\tools\ContentBuilder\scripts\..."     // 绝对路径（手写的）
```

两种都支持。这里踩过一个坑：**`path.join` 不像 `path.resolve` 那样会被绝对路径重置** ——
`path.join('D:\a', 'D:\b\x.vdf')` 拼出来是 `D:\a\D:\b\x.vdf`，于是每个 depot 都被误报「脚本不存在」。
PowerShell 的 `Join-Path` 有同样的问题，`build.ps1` / `check.ps1` 里也一并修了。

### 「新建 Depot」的表单里，哪些字段真的会生效

新建 Depot 的侧边栏把字段分成两组，因为这两组东西的去处完全不同：

**本地 · SteamPipe** —— 只有 `内容目录`（以及 depot 脚本里的 `FileMapping` / `FileExclusion`）。
这些是 `depot_<id>_<平台>.vdf` 里真正生效的部分。实际写出来的脚本长这样：

```
"DepotBuildConfig"
{
	"DepotID"		"3036851"
	"contentroot"	"D:\SteamBuilds\AbyaDemo\win64"
	"FileMapping" { "LocalPath" "*"  "DepotPath" "."  "recursive" "1" }
	"FileExclusion"	"*.pdb"
	...
}
```

**Steamworks 后台** —— `名称` / `DepotID` / `操作系统` / `架构` / `语言`。
这几个**不会写进 vdf，也不会被自动同步到后台**。`DepotID` 除外（它是两边对上的钥匙，必须和后台一致），
其余四个只是本地备查，存在 `settings.json` 的 `depotMeta` 里，
侧边栏的「照着填后台」把这一组拼成可以直接抄的清单。

后台哪些字段是真的、我核对过：对 TF2（AppID 440）跑
`steamcmd +login anonymous +app_info_print 440 +quit` 拿到 1063 行文本 VDF，
逐条 depot 看下来，后台侧的 depot 属性是：

```
"445"
{
	"config" { "language" "russian" }
	"config" { "oslist" "windows"  "osarch" "64" }
	"manifests" { "public" { "gid" ... "size" ... "download" ... } }
	"depotfromapp" "228980"     // 可选
	"sharedinstall" "1"         // 可选
	"systemdefined" "1"         // 可选（Valve 自己定义的）
	"dlcappid" / "maxsize"      // 可选
}
```

对照结论：
- `操作系统` / `架构` / `语言` 对得上后台的 `config.oslist` / `config.osarch` / `config.language`（**语言在 `config` 里，不在 depot 顶层**）。
- **后台的 appinfo 里根本没有 depot「名称」这个字段** —— 表单里的名称纯粹是本地备注。
- `内容目录` 后台也没有，那是 SteamPipe 本地的事。
- 表单里**没有**的是后台确实有的 `dlcappid` / `sharedinstall` / `depotfromapp` / `maxsize` ——
  这几个只在特殊场景用到（DLC depot、共享安装、借别的 App 的 depot），没有做成输入框。
- 后台只能**读**不能写：steamcmd 没有「建 depot」这个命令，`操作系统`/`语言` 这类要真生效，
  还是得去 Steamworks 网页上设一次。

---

## 技术栈

| | |
|---|---|
| 界面 | Vue 3（`<script setup>`）+ TailwindCSS v4（CSS-first `@theme`）|
| 动画 | GSAP（入场、数字滚动、日志行、视图切换）|
| 壳 | Electron 44 + electron-vite 5 + Vite 8 |
| 打包 | electron-builder（NSIS 安装包）|
| 真正的构建逻辑 | 仍然是 `ContentBuilder\build.ps1` / `check.ps1` |

**界面和命令行走的是同一套脚本**，不存在「界面上能跑、命令行不能跑」的分叉。
这个界面只是把参数拼好、把输出流回来、把 vdf 读写做掉。

---

## 怎么把 Demo / 正式版接进来

侧栏的 **＋** 按钮，三步：

1. **名字** —— 随便取，会成为 `scripts\<名字>\` 的文件夹名，例如 `AbyaBody`
2. **AppID** —— 到 Steamworks 后台看。填完 DepotID 会自动变成 `AppID + 1`，可以改
3. **内容目录** —— 默认 `D:\SteamBuilds\<名字>\<平台>`，可以点「选择…」换

点创建，`app_*.vdf` 和 `depot_*.vdf` 就生成好了，带整套默认排除规则。
新建的脚本默认 `preview = 1`（只空跑），确认没问题再到编辑抽屉里关掉。

已知的 ID（本项目）：

| 版本 | AppID | DepotID |
|---|---|---|
| Abya Playtest | `3036850` | `3036851` ✅ 已验证 |
| Abya 正式版 Body | `2670430` | 按 `+1` 推是 `2670431`，**请到后台核对** |
| Abya Demo | 未知 | 未知 |

建议把 Unity 打包面板的 `-outputDirectory` 直接设成上表里对应 App 的内容目录
（模式选 `DirectFolder`），这样打包完就不需要再手工复制到任何地方。

---

## 快速开始

```powershell
pnpm install          # 依赖（.npmrc 已配 npmmirror 镜像）
pnpm dev              # 开发模式，热更新

pnpm build            # 只编译到 out/
pnpm dist             # 编译 + 出 Windows 安装包 → release\
pnpm icon             # 重新生成 build\icon.ico
```

> Electron 44 不再用 postinstall 下载二进制，改成首次使用时惰性下载。
> 如果 `node_modules\electron\dist` 是空的，跑一次
> `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'; node node_modules\electron\install.js`

> 打安装包时建议带上镜像环境变量，否则 winCodeSign 之类的资源会从 GitHub 慢慢拉：
> `$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'`

---

## 目录结构

```
src/
  main/                 主进程
    index.js            窗口 + 全部 IPC handler
    vdf.js              Valve KeyValues 解析器（只读；写回走定点行替换，保留注释）
    sdk.js              扫描 scripts\、内容体检、vdf 读写、构建历史
    runner.js           spawn pwsh、流式输出、日志脱敏、进程树终止
    store.js            设置持久化 + DPAPI 密码存取
  preload/index.js      contextBridge，只暴露具体能力
  renderer/src/
    store.js            前端状态与动作（不引 Pinia，够用）
    motion.js           GSAP 指令与组合式函数
    components/         各视图
scripts/                开发用辅助脚本（见下）
build/icon.ico          应用图标（由 scripts/make-icon.mjs 生成）
```

### `scripts/` 里的东西

| 文件 | 用途 |
|---|---|
| `make-icon.mjs` | 手写 PNG/ICO 生成图标，不依赖图形库 |
| `cdp-eval.mjs` | 通过 CDP 在渲染进程里执行 JS，用来量真实 DOM |
| `cdp-shot.mjs` | 通过 CDP 抓视口真实像素（不受窗口边框/DPI 缩放干扰）|
| `test-runner.mjs` | 对比三种 PowerShell 调用方式，验证 `-File` 是唯一正确的 |
| `test-stdin.mjs` | 验证 `-File` 下 stdin 能转发到脚本调起的原生进程 |
| `test-pipeline.mjs` | 验证 `"值" \| & exe` 能把内容送进独立进程的 stdin |
| `smoke-packaged.js` | 打包后应用的冒烟检查（配合 `cdp-eval.mjs` 用）|

用法示例：

```powershell
# 带调试端口启动，然后用 CDP 脚本查东西
node_modules\electron\dist\electron.exe . --remote-debugging-port=9222
node scripts\cdp-eval.mjs 9222 scripts\smoke-packaged.js
node scripts\cdp-shot.mjs 9222 shot.png
```

---

## 凭据是怎么处理的（这块值得单独说）

这台机器上的 steamcmd **没有缓存凭据**——它自己的日志写得很清楚：

```
Cached credentials not found.
password:
```

所以每次构建都需要密码。处理方式是：

1. 密码**不放进命令行参数**（不会出现在进程列表里）。
2. 界面把密码交给主进程 → 主进程通过**环境变量** `STEAMSDK_BUILD_PASSWORD`
   传给 `build.ps1` → `build.ps1` 用 PowerShell 管道灌进 steamcmd 的 stdin。
3. 勾选「加密保存」时，用 Electron `safeStorage`（Windows 底层是 DPAPI）
   加密后落盘，**只有当前 Windows 用户能解密**，明文不写磁盘。
4. `runner.js` 里对所有输出做了脱敏：万一密码以任何形式回显，界面和日志里只会看到 `********`。

**为什么不能「看到 password: 提示再回答」**：steamcmd 的 stdout 接管道时是块缓冲的，
它的提示文字根本刷不出来（已实测，steamcmd 自己的 `console_log.txt` 里能看到 `password:`，
但 Node 这边永远收不到）。只能提前把密码写进 stdin。

**「登录一次」这条路还没被证实**：界面上有个按钮会开一个真正的控制台窗口跑 steamcmd，
本意是让你在里面 `login 445140823` 输入密码 + Steam Guard，让 steamcmd 自己保存凭据。
但 2026-10-14 14:29 那次尝试在 `builder\config\config.vdf` 里**没有留下任何 token 或
ssfn 文件**，steamcmd 自己的 `console_log.txt` 里也没有 `Logging in user` 记录 ——
所以「登一次以后就免密码」目前**没有证据支持**，先当作不成立。

现实可用的免输方式就是界面里勾「加密保存」（DPAPI 加密落盘，只有当前 Windows 用户能解密）
—— 弹密码输入行时这个勾**默认就是选中的**，回车一次以后就不用再输了。

---

## 已知限制

- **Steam Guard 两步验证**：因为上面说的缓冲问题，界面看不到验证码提示。
  需要两步验证时请用「登录一次」那条路。
- **分支列表读不到**：Steam 的分支信息只在合作方后台，本地没有 API。
  界面里的「用过的分支」只是它自己记的历史，真正建分支要去后台。
- **`app.asar` 已经瘦身**：vue/gsap 被 Vite 打进 renderer bundle 后运行时用不到，
  已从 `dependencies` 挪到 `devDependencies`，asar 从 15.50 MB 降到 **0.47 MB**，
  安装包 108.2 MB → **106.3 MB**。如果以后在 renderer 里引了新的运行时依赖，
  记得同步调整。
- 内容体检要遍历整个内容目录（这个项目是 536 个文件 / 1 GB），
  内容特别大时扫描会变慢。

---

## 开发时踩到的坑（留着别再踩）

1. **VDF 有根键**。`"AppBuild" { ... }` 整个文件包在一个根键里，
   解析器必须把根键拆掉，否则 `AppID` / `ContentRoot` 全都读不到。
2. **VDF 里的反斜杠不是转义符**。Valve 自己的脚本就写着 `D:\content\depot1002`。
   只有 `\\` 和 `\"` 才算转义，其余 `\x` 要原样保留，否则路径会变成
   `D:SteamBuildsAbyaPlayerTestwin64`。
3. **PowerShell 传参必须用 `-File`**。用 `-Command` 拼字符串时，
   如果把参数名也加引号（`'-App' '值'`），`'-App'` 会被当成位置参数而不是参数名。
4. **`pwsh` 的 `-File` 模式管道输出默认就是 UTF-8**，不需要再塞
   `[Console]::OutputEncoding` 前置语句——塞了反而会让参数绑定阶段的报错
   以 OEM 代码页输出、中文变乱码。
5. **Vue 的多根节点组件不会继承 `class`**。视图组件内部是 `v-if/v-else` 片段时，
   挂到 `<component>` 上的 `overflow-y-auto` 之类会**静默失效**，
   必须在外面套一个真正单一根节点的 div。
6. **`grid` / `flex` 子项默认 `min-width: auto`**，里面只要有不可断行的长字符串
   （比如绝对路径）就会把布局撑破。给子项加 `min-w-0`。
7. **electron-builder 的锁是 `proper-lockfile`**，构建中途硬杀进程会留下死锁，
   下一次构建直接报 `Lock file is already being held`。
8. **看截图判断布局不可靠**。显示器 DPI 缩放 125% 时，CUA 截图的坐标和 CSS 坐标
   差 1.25 倍，很容易把没问题的布局看成被裁掉。要下结论请用 `cdp-eval.mjs` 量 DOM，
   或者用 `cdp-shot.mjs` 抓视口像素。
