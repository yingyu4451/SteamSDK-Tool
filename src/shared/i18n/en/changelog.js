/**
 * 更新日志：src/renderer/src/changelog.js 的版本条目与正文。
 * 键与源码里的中文原文逐字一致；改中文时两边一起改。
 */
export default {
  // —— 1.3.0 ——
  '界面支持中文 / English：设置里多了一个「界面语言」，可选「跟随系统」，切换即时生效，不用重启': 'Added an interface language switch: Settings → Language lets you pick Chinese or English, or follow the system, and switching takes effect instantly with no restart.',
  '英文界面覆盖到每个角落：工作台、使用手册、首次运行引导、更新日志，以及报错和状态提示': 'Brought English to every corner of the UI: workbench, manual, first-run guide, changelog, plus error and status messages.',
  '安装包、桌面和开始菜单快捷方式、应用列表和窗口标题的名字统一成 SteamSDK Tool（以前中英文界面各叫一个名字）': 'Unified the installer, the desktop and Start-menu shortcuts, the app list entry and the window title under one name, SteamSDK Tool (the tool used to show a different name in each language).',
  '新建 Depot 时建议的内容目录占位符也跟着语言变（英文是 <app name>）': 'Made the suggested content folder in the new-depot form follow the interface language too (<app name> in English).',

  // —— 1.2.0 ——
  '新增「清空成就」按钮（工作台右上）：让本机 Steam 客户端执行 reset_all_stats，把当前登录账号在这个 App 下的成就和统计一起重置；不联网，也不需要 Web API 密钥': 'Added a “Clear achievements” button in the top right of the workbench: it makes the local Steam client run reset_all_stats, resetting both achievements and stats for the account currently signed in to this app. It works offline and needs no Web API key.',
  '点下去会短暂把 Steam 切到前台，执行完自动切回来；失败会说明原因（Steam 没开、窗口被挡、焦点被抢、控制台没响应），可以直接重试': 'Made the button briefly bring Steam to the foreground and switch back automatically when done. If it fails, the tool explains why (Steam is not running, the window was blocked, focus was stolen, the console did not respond), and you can retry right away.',
  '清的是本机 Steam 客户端当前登录的账号；工具不需要密码，也不会上传任何东西': 'Applied the reset to the account currently signed in to the local Steam client; the tool never asks for a password and uploads nothing.',

  // —— 1.1.0 ——
  '文件导入只剩一种做法：游戏包统一复制进「项目文件夹 / 平台」目录，目标 Depot 的内容目录会自动指到那里；不用再在「直接指过去」和「复制进现有内容目录」之间选': 'Reduced file import to a single path: game builds are always copied into the “project folder / platform” directory, and the target depot’s content folder points there automatically. No more choosing between “point to it directly” and “copy into the existing content folder”.',
  '导入时后台 Depot 还没读完，窗口里会明说「同时在读取后台 Depot…」；文件先读完时也会提示「文件已经读完，后台 Depot 还在读取…列表稍后会自动补全」': 'Added clear messages while the backend depots are still loading during an import: “Also loading backend depots...”, and when the files finish loading first, “Files are loaded, backend depots are still loading... the list will fill in automatically.”',
  '「管理分支」改成工具内弹窗：能看到当前 SetLive、后台分支和本机记录过的分支，本机记录可以自己加、自己删；不再跳 Steamworks 网页': 'Moved “Manage branches” into a dialog inside the tool: it shows the current SetLive, the branches from the backend and the branches saved locally, which you can add or remove yourself. It no longer opens the Steamworks website.',
  '上传完成提示按实际上传的 App 报：构建期间切去别的 App 看东西，完成弹窗也不会再报成当前正在看的那个 App': 'Made upload completion report the app that was actually uploaded: if you switch to another app during a build, the completion dialog no longer names the app you happen to be viewing.',
  '工作台右上角的「构建目录」「Steamworks」按钮删掉了，「构建目录」入口移到「设置 → SDK 路径」': 'Removed the “Build folder” and “Steamworks” buttons from the top right of the workbench, and moved the “Build folder” entry to “Settings → SDK path”.',
  '修复分支记录保存失败（弹窗里报 An object could not be cloned）': 'Fixed branch records failing to save (the dialog reported “An object could not be cloned”).',

  // —— 1.0.0 ——
  '1.0.0：上传流程、Depot 检查、登录与多平台发布都跑顺了，作为第一个正式版': 'Shipped 1.0.0: the upload flow, depot checks, sign-in and multi-platform publishing all worked smoothly — the first stable release.',
  'Depot 详情区分成两块：「体积统计」四个数字一组，「路径与备注」（内容目录 / 脚本 / 导入时间 / 存档保护）一组，行间有分隔线，不再一眼看不出归属': 'Split depot details into two sections: “Size breakdown” with its four numbers, and “Paths and notes” (content folder / script / import time / save protection), with dividers between rows so it is clear at a glance which values belong together.',
  'Depot 详情显示「导入时间」：以后导入会记录时间；这次升级前的旧 Depot 用内容目录里最新文件的修改时间兜底': 'Added an “Imported” time to depot details: new imports record the time, and depots added before this update fall back to the modification time of the newest file in the content folder.',
  '把 zip / 文件夹拖进窗口松手就开始在后台读 Depot 列表，点「同步导入」时通常已经读完': 'Started loading the depot list in the background when a zip or folder is dropped onto the window, so it is usually done by the time you click “Sync and import”.',
  '「同步导入」完成后停在刚导入的那个 Depot，不再自动跳回「新建 Depot」': 'Kept the view on the depot you just imported after you click “Sync and import”, instead of jumping back to “New depot”.',
  '上传完成只提示「已上传（BuildID xxx）」：不再核对后台最新构建、不再弹红色警告': 'Reduced upload completion to “Uploaded (BuildID xxx)”: it no longer checks the latest build in the backend or shows a red warning.',
  '没填密码时「登录 Steam」按钮不可点，回车提交也会被拦住': 'Disabled the “Sign in to Steam” button until a password is entered, and blocked submitting with Enter too.',
  '文件夹支持拖动排序：按住文件夹标题行上下拖，其他文件夹实时让位，顺序会保存；拖动期间所有文件夹临时收起，松手后各自恢复原来的展开 / 收起状态': 'Added drag-to-reorder for folders: hold the folder header row and drag up or down, the other folders move out of the way in real time, and the order is saved. While dragging, all folders collapse temporarily and each returns to its previous expanded or collapsed state when you let go.',
  '修复最上面的文件夹无法往下拖的问题（之前只能让下面的文件夹往上挤）': 'Fixed the topmost folder not being draggable downward (previously it could only be pushed up by a folder below).',

  // —— 0.1.27 ——
  '字体：英文/数字改成 JetBrains Mono（IntelliJ 同款等宽），中文用 MiSans；删掉没安装的 Motiva Sans / Inter': 'Changed fonts: Latin text and numbers now use JetBrains Mono (the same monospace as IntelliJ) and Chinese uses MiSans; removed Motiva Sans and Inter, which were never installed.',
  '依赖升级：Electron 45.2.1、@lucide/vue 1.66.0': 'Updated dependencies: Electron 45.2.1, @lucide/vue 1.66.0.',
  '登录验证改用 node-pty 实时读取 steamcmd 输出：要求手机确认时能立刻提示，不再干等超时': 'Switched sign-in verification to reading steamcmd output in real time through node-pty: when mobile confirmation is required, the prompt appears immediately instead of waiting for a timeout.',
  '新手教程精简：跳过教程改为高亮文字；删掉欢迎页/下载按钮/步骤三里的冗余文字；SDK 路径只在没识别到时才让手动指定；第三步改名「登录 Steam 账号」': 'Streamlined the onboarding: “Skip tutorial” is now highlighted text; removed redundant copy from the welcome page, the download button and step 3; the SDK path is only entered manually when it cannot be detected; step 3 was renamed “Sign in to Steam”.',
  '设置里的登录凭据改成先真登一次、成功才保存；「验证并保存」并入「登录 Steam」，底部三个按钮固定同一行（登录 Steam 在右）': 'Changed login credentials in Settings to save only after a real, successful sign-in; merged “Verify and save” into “Sign in to Steam”, and kept the three bottom buttons on one line, with “Sign in to Steam” on the right.',
  '「外置窗口」改成按钮样式；「忘记账号」不再先备份': 'Restyled “External window” as a button, and “Forget account” no longer makes a backup first.',
  '文件夹调色、检查文件等细节修复（与 0.1.25/0.1.26 的改动一致）': 'Fixed details in folder colors, file checks and more (matching the changes in 0.1.25/0.1.26).',

  // —— 0.1.26 ——
  '展开的文件夹，标题行常驻悬停底色：一眼能看出哪个文件夹是打开状态（收起时仍然只有鼠标悬停才亮）': 'Gave the header row of expanded folders a permanent hover background, so you can tell at a glance which folder is open (collapsed folders still only highlight on hover).',
  'Apps 列表上边距统一为 6px：Apps 标题下方、文件夹之间、文件夹内第一张卡的上沿都一致': 'Unified the top spacing in the Apps list at 6px: below the Apps heading, between folders, and above the first card inside a folder.',

  // —— 0.1.25 ——
  '左侧 App 卡片只显示 SetLive 分支名，不再显示 AppID（AppID 在右侧详情里看）': 'Limited the left app cards to the SetLive branch name, no longer showing the AppID (the AppID is in the details on the right).',
  '文件夹去掉了折叠箭头：图标本身就是开关，收起是闭合文件夹、展开是打开文件夹': 'Removed the collapse arrow from folders: the icon itself is the toggle — a closed folder when collapsed, an open folder when expanded.',
  '切分支 / 改 vdf 后，左侧 App 卡片上的分支名会立刻同步，不用重新扫描': 'Made the branch name on the left app card update immediately after switching branches or editing a vdf, with no rescan needed.',
  'Depot 选项卡状态改成两枚：「配置通过」来自「检查配置」，「文件通过 / 文件 N 个警告 / 文件未检查」来自「检查文件」，悬停能看到判定依据；去掉了和选项卡重复的平台信息': 'Split depot tab statuses into two badges: “Config passed” comes from “Check config”, and “Files passed / N file warnings / Files unchecked” comes from “Check files”; hover to see what the verdict was based on. Removed the platform info that duplicated the tab.',
  '「检查文件」改成只检查当前选中的那一个 Depot（不再全 App 一起扫）；每个 Depot 单独记录结果，收起面板不会丢，切 App 才清空': 'Changed “Check files” to check only the currently selected depot (no more scanning the whole app); each depot tracks its own results, which survive collapsing the panel and clear only when you switch apps.',
  '检查文件里的提示全部改成看得懂的中文：每条都写清楚「是什么、为什么不行、怎么处理」': 'Rewrote all file-check messages in plain language: each one now explains what the issue is, why it blocks the upload, and how to handle it.',
  '检查文件收起结果后，Depot 卡上的文件状态会保留（不再变回「文件未检查」），切 App 才清空': 'Kept the file status on depot cards after the file-check results are collapsed (it no longer reverts to “Files unchecked”); it clears only when you switch apps.',
  '同类问题合并成一条（标题带 ×N，只列前几条，其余显示「…还有 N 个」），说明文字只出现一次': 'Grouped similar issues into one entry (the title carries ×N, only the first few are listed, the rest show “...and N more”), with the explanation appearing once.',
  'macOS 的 .app 不再报警告：ContentPrep 已被 Valve 标记为废弃，SteamPipe 直接按目录上传（启动方式在 Steamworks 后台「安装 → 启动选项」指定）': 'Stopped warning about macOS .app bundles: Valve deprecated ContentPrep, so SteamPipe uploads the folder directly (set the launch method in the Steamworks backend under “Installation → Launch Options”).',
  'App 卡片没设置分支时不再变矮，左侧列表高度保持一致': 'Kept app cards from getting shorter when no branch is set, so the left list heights stay consistent.',
  'Depot 平台选项卡上不再显示体积（体积在下面的统计里）': 'Removed size from depot platform tabs (the size is in the stats below).',
  '去掉了 Depot 的语言过滤下拉：该字段属于 Steamworks 后台配置，工具里改了也不会生效，留着容易误导（多语言内容请按 Valve 文档建多个 Depot）': 'Removed the depot language filter dropdown: that field is configured in the Steamworks backend and changing it in the tool had no effect, so it was misleading (for localized content, create multiple depots as described in Valve’s docs).',

  // —— 0.1.24 ——
  '移除「剥离 Steam」功能（导航、页面、弹窗、主进程 IPC、使用手册条目一并删掉）——以后用不上了，就不再占地方': 'Removed the “Strip Steam” feature (its navigation entry, page, dialog, main-process IPC and manual section were all removed too) — it is no longer needed, so it no longer takes up space.',

  // —— 0.1.23 ——
  '构建脚本自动升级：SDK 里的 build.ps1 / check.ps1 会按脚本版本号或已知旧版哈希替换成工具自带的新版': 'Made build scripts upgrade automatically: build.ps1 and check.ps1 in the SDK are replaced with the bundled versions based on their script version or a known old hash.',
  '右上角新增「构建脚本需更新」提示：脚本被改过、无法安全自动升级时出现，点一下就地同步': 'Added a “Build scripts outdated” notice in the top right: it appears when the scripts were edited and cannot be upgraded safely; one click syncs them in place.',
  '构建脚本不是最新时，正式上传 / Preview 空跑 / 本机试玩 会直接中止并提示，避免「关掉某个 Depot 却还是传了」': 'Made a real upload, a preview dry run and a local playtest stop with a message when the build scripts are out of date, so disabling a depot no longer risks it being uploaded anyway.',
  '轻提示统一改成从窗口顶部下滑出现': 'Changed toasts to slide down from the top of the window.',

  // —— 0.1.22 ——
  'Apps 侧栏支持文件夹：新建 / 重命名 / 删除（二次确认）/ 折叠，App 可拖入拖出分组': 'Added folder support to the Apps sidebar: create, rename, delete (with confirmation) and collapse, plus drag apps in and out of groups.',
  '文件夹可单独设置颜色与边框亮度，自绘 RGBA 拾色器（调色时弹窗在图标右侧，不挡文件夹）': 'Gave folders their own color and border brightness, with a custom RGBA color picker (it opens to the right of the icon so it does not cover the folder).',
  'Apps 列表可拖动排序，拖动过程实时预览': 'Made the Apps list reorderable by dragging, with a live preview while you drag.',
  '按 refactoring-ui 审计报告修完全部 P1 / P2：每页统一标题与唯一主按钮、字阶收敛为 5 档、手册排版、工具栏主次分组、弹层互斥': 'Fixed every P1 / P2 from the refactoring-ui audit report: each page has a consistent title and a single primary button, the type scale is trimmed to five steps, the manual was re-laid out, toolbars now separate primary and secondary actions, and popovers are mutually exclusive.',
  '工具栏所有按钮高度统一': 'Unified the height of all toolbar buttons.',

  // —— 0.1.21 ——
  '标题栏缩到 44px，右上角窗口按钮改成 44×44 正方形，品牌字号 13px': 'Shrank the title bar to 44px, made the window controls in the top right 44×44 squares, and set the brand text to 13px.',
  '导入 / 同步修复：后台 Depot 平台自动回填、同步弹层不再裁掉「收起」、导入对话框按钮与路径语义调整': 'Fixed import and sync issues: backend depot platforms are filled in automatically, the “Collapse” button is no longer clipped in the sync popover, and the import dialog’s buttons and path wording were adjusted.',
  'Depot 选项卡右上角新增上传开关，构建时按开关跳过对应 Depot': 'Added an upload toggle to the top right of each depot tab; builds now skip depots that are switched off.',
  '导入解压的临时目录会自动清理（关窗 / 导入成功 / 下次启动补清）': 'Made temporary folders from import extraction clean up automatically (on window close, after a successful import, and on the next launch for leftovers).',

  // —— 0.1.20 ——
  '工作台统计压成一条，不再占一大块高度': 'Condensed the workbench stats into a single row, no longer taking up a tall block.',
  '构建输出与分支卡等高，日志多时只在卡内滚动': 'Made the build output card the same height as the branch card, with long logs scrolling inside the card.',
  'Depot 空态去掉重复的「新建 Depot」按钮': 'Removed the duplicate “New depot” button from the empty depot state.',
  '侧栏 / 构建输出换深一档底色，侧栏选中态改实心蓝底': 'Gave the sidebar and build output a darker background, and changed the selected sidebar item to a solid blue fill.',

  // —— 0.1.19 ——
  '界面缩放改成 [-] 输入框 [+]，整数百分比、每档 5%': 'Changed zoom to a [-] input [+] control with whole-number percentages in 5% steps.',
  '允许删掉 App 的最后一个 Depot': 'Allowed deleting an app’s last depot.',

  // —— 0.1.18 ——
  '按 refactoring-ui 全量收口：对比度全部达标，统一字重 / 圆角 / 阴影 / 间距 token，浮层与历史行整理': 'Completed the full refactoring-ui pass: all contrast now meets the guidelines, font weights, radii, shadows and spacing tokens are unified, and popovers and history rows were tidied up.',
  '照 Steam 商店重做组件层（标题栏 / 导航 / 卡片 / 按钮 / 标签 / 输入框 / 弹层）': 'Rebuilt the component layer in the style of the Steam store (title bar, navigation, cards, buttons, tags, inputs, popovers).',
  '分支面板改为切换按钮，分支列表从 Web API 自动读取': 'Changed the branch panel to a toggle button and made the branch list load automatically from the Web API.',
  'SetLive 空值不再叫「默认分支」，改为「未设置 / 不设分支」': 'Stopped calling an empty SetLive “default branch”; it is now “not set / no branch”.',
  '新建 App：AppID 对应游戏名直接显示在输入框内；「读后台 Depot」改为手动点击 + 加载动画': 'In the new app flow, showed the game name matching the AppID inside the input field, and changed “Read backend depots” to a manual click with a loading animation.',
  '若干 UI 修复：遮罩统一 25% 黑、AppID 支持中文搜索、后台 Depot 改复选框、平台拖动不再触发系统拖拽': 'Fixed misc UI issues: overlays now use a uniform 25% black, AppID search supports Chinese, backend depots use checkboxes, and dragging platforms no longer triggers the system drag.',
}
