/**
 * 渲染层 store：src/renderer/src/store.js 里的提示、状态标签、步骤名
 * 键一律加引号；带 {n} 的用 '|' 分单复数。
 */
export default {
  // —— 顶部引导 / SteamSDK 目录 ——
  '常见位置没找到 SteamSDK —— 手动选一下它所在的文件夹': 'SteamSDK wasn’t found in the usual places — pick the folder it’s in',
  '先选一个 SteamSDK 目录': 'Pick a SteamSDK folder first',
  '这个目录里没有 tools\\ContentBuilder —— {dir}': 'No tools\\ContentBuilder in this folder — {dir}',

  // —— 自更新 ——
  '没读到安装包地址，过一会儿再点「检查更新」': 'Couldn’t read the installer URL — try “Check for updates” again in a moment',
  '检查失败': 'Check failed',
  '刚才那份已经是最新的了': 'The one I just fetched is already the latest',
  '增量包下好了（v{version}），点「重启并安装」': 'Update downloaded (v{version}) — click “Restart and install”',
  '下载好了，点「重启并安装」': 'Downloaded — click “Restart and install”',
  '下载失败': 'Download failed',
  '先点「下载更新」': 'Click “Download update” first',
  '安装失败': 'Install failed',
  '已经把新版所在的位置打开了 —— 关掉工具，替换掉你那个 exe':
    'Opened the folder with the new version — close the app and replace your exe',
  '已清掉 {n} 项登录痕迹': 'Cleared {n} sign-in trace|Cleared {n} sign-in traces',

  // —— 构建脚本同步 ——
  '先等这次任务跑完再更新脚本': 'Wait for this run to finish before updating the scripts',
  '构建脚本写入失败': 'Couldn’t write the build scripts',
  '已更新 {n} 个构建脚本': 'Updated {n} build script|Updated {n} build scripts',
  '构建脚本已是最新': 'Build scripts are up to date',

  // —— 提示 / 忽略 ——
  '没记下来': 'Couldn’t save it',
  '永久忽略了，重开也不会再提示': 'Ignored for good — this won’t show again after a restart',
  '这次先不提示了（重开应用会回来）': 'Skipped for now (it comes back after a restart)',
  '恢复提示': 'Restore',

  // —— Depot 上传开关 ——
  '切换失败': 'Switch failed',
  '这个 Depot 会随构建上传': 'This depot uploads with the build',
  '已关闭这个 Depot 的上传，构建时跳过': 'Turned off uploads for this depot — skipped at build time',

  // —— 平台表 / 读后台 ——
  '先把 AppID 填成数字': 'Enter the AppID as a number first',
  '后台还有 {n} 个 Depot 没有平台行可放：先在平台表里加一行，再读一次。':
    '{n} backend depot still needs a platform row: add one to the platform table, then read again.|{n} backend depots still need a platform row: add one to the platform table, then read again.',
  '已从后台填入 {n} 个 Depot（{app}）': 'Filled in {n} depot from the backend ({app})|Filled in {n} depots from the backend ({app})',
  '已从后台填入 {n} 个 Depot': 'Filled in {n} depot from the backend|Filled in {n} depots from the backend',
  '后台这个 App 下还没有 Depot': 'This app has no depots in the backend yet',
  '平台行不够用了：先去平台表里加一行，再勾这个后台 Depot。':
    'No platform rows left: add a row to the platform table, then tick this backend depot.',
  '至少要选一个平台': 'Select at least one platform',
  '每个平台的 DepotID 都必须是数字': 'Every platform’s DepotID must be a number',
  'DepotID 有重复': 'Duplicate DepotID',
  'DepotID 必须是数字': 'DepotID must be a number',
  '{platform} 的内容目录不能为空': 'The content folder for {platform} can’t be empty',
  '内容目录不能为空': 'Content folder can’t be empty',
  '平台未知': 'Unknown platform',
  '64 位': '64-bit',

  // —— 文件夹 / App ——
  '已创建 {name}（{n} 个 Depot），并建好 {made} 个内容目录':
    'Created {name} ({n} depot) with {made} content folder|Created {name} ({n} depots) with {made} content folders',
  '已创建 {name}（{n} 个 Depot）': 'Created {name} ({n} depot)|Created {name} ({n} depots)',
  '已改名为 {name}': 'Renamed to {name}',
  '已删除 {name}{dirs}{skip}': 'Deleted {name}{dirs}{skip}',
  '，连同 {n} 个内容目录': ', along with {n} content folder|, along with {n} content folders',
  '（{n} 个目录不在 buildsRoot 内，已跳过）': ' ({n} folder outside buildsRoot — skipped)| ({n} folders outside buildsRoot — skipped)',

  // —— 上传 / 构建结果 ——
  '这次日志里没有 BuildID —— 不是正式上传（Preview / 本地构建都不带 BuildID）':
    'No BuildID in this log — that wasn’t a real upload (preview and local builds carry no BuildID)',
  '✔ 已上传：BuildID {id}': '✔ Uploaded: BuildID {id}',
  '已上传 {app}（BuildID {id}）': 'Uploaded {app} (BuildID {id})',
  '已上传（BuildID {id}）': 'Uploaded (BuildID {id})',
  '构建脚本不是最新（{files}），已中止 Preview 空跑：点右上角「构建脚本需更新」同步后再试':
    'Build scripts are out of date ({files}) — preview dry run aborted: click “Build scripts need updating” at the top right to sync, then try again',
  '构建脚本不是最新（{files}），已中止上传：点右上角「构建脚本需更新」同步后再试':
    'Build scripts are out of date ({files}) — upload aborted: click “Build scripts need updating” at the top right to sync, then try again',
  '— 进程结束，退出码 {code} —': '— process exited with code {code} —',
  '构建失败，退出码 {code}': 'Build failed with code {code}',
  '构建没能启动': 'The build couldn’t start',
  '内容已经进本地服务器了 —— 重启 Steam 就能下到': 'Content is on the local server — restart Steam and you can download it',
  '构建成功，但 htdocs 里还是空的': 'Build succeeded, but htdocs is still empty',

  // —— 系统通知 ——
  '出错了': 'Something went wrong',
  '检查配置通过': 'Config check passed',
  '内容已送进本地服务器': 'Content delivered to the local server',
  'Preview 完成': 'Preview finished',
  '上传完成': 'Upload finished',
  '全部 App': 'All apps',
  '{who} · 退出码 {code}': '{who} · exit code {code}',
  '{who} · 结构与排除规则都没问题': '{who} · structure and exclusion rules look good',
  '{who} · 重启 Steam 后就能从本机下到': '{who} · restart Steam and it’s downloadable from this machine',
  '{who} · 空跑成功，没有上传任何东西': '{who} · dry run succeeded — nothing was uploaded',
  '{who} · 去 Steamworks 把这次构建设为 live': '{who} · set this build live in Steamworks',
  '> check.ps1（所有 App）': '> check.ps1 (all apps)',
  '(全部)': '(all)',

  // —— Depot 增删 / 拖放 / 导入 ——
  '一个都没勾': 'Nothing ticked',
  '加了 {n} 个，失败：{list}': 'Added {n}, failed: {list}',
  '；': '; ',
  '已加入 {n} 个 Depot': 'Added {n} depot|Added {n} depots',
  '这个 App 还没有 AppID，读不了后台': 'This app has no AppID yet — can’t read the backend',
  '需要先在设置里保存 Steam 账号密码': 'Save your Steam account and password in Settings first',
  '读不到后台': 'Couldn’t read the backend',
  '本地已经有 Depot {id}（{platform}）了': 'Depot {id} is already local ({platform})',
  '本地还没有这个 DepotID。点右上角「读后台」能核对后台有没有。':
    'This DepotID isn’t local yet. Click “Read backend” at the top right to check whether the backend has it.',
  '后台有：{platform} · 最近构建 {id}': 'In the backend: {platform} · latest build {id}',
  '后台有：{platform} · 还没有构建': 'In the backend: {platform} · no builds yet',
  '后台这个 App 下没有这个 DepotID —— 要么打错了，要么后台还没建':
    'No such DepotID under this app in the backend — either it’s a typo or it hasn’t been created yet',
  '已新建 Depot {file}': 'Created depot {file}',
  '已把 {n} 个 vdf 收进 scripts\\{dir}': 'Moved {n} vdf into scripts\\{dir}|Moved {n} vdf files into scripts\\{dir}',
  '已保存（文件重命名为 {file}）': 'Saved (file renamed to {file})',
  '添加失败': 'Couldn’t add',
  '已添加 Depot {id}，并建好目录 {path}': 'Added depot {id} and created {path}',
  '已添加 Depot {id}': 'Added depot {id}',
  '删除失败': 'Couldn’t delete',
  '已删除该 Depot': 'Depot deleted',
  '已打开登录窗口：在里面的 steamcmd 提示符下执行 login {account}':
    'Login window opened: run login {account} at the steamcmd prompt inside',
  '<账号>': '<account>',
  '正在中止…': 'Stopping…',
  '已提交验证码': 'Code submitted',
  '读不出来': 'Couldn’t read it',
  '没什么可同步的': 'Nothing to sync',
  '补不进来': 'Couldn’t add it',
  '已把 Depot {id} 补进本地': 'Added depot {id} locally',
  '读不了这个路径': 'Can’t read this path',
  '先选一个 App': 'Pick an app first',
  '放不进去': 'Couldn’t drop it there',
  '已复制进 {path}': 'Copied into {path}',
  '先选一个有 AppID 的 App': 'Pick an app that has an AppID first',
  '清空失败': 'Couldn’t clear',
  '已清空 {app} 的 Steam 成就': 'Cleared the Steam achievements for {app}',
  '检查文件失败': 'File check failed',
  'Depot {id}：发现 {n} 个会挡住上传的问题': 'Depot {id}: {n} problem that blocks the upload|Depot {id}: {n} problems that block the upload',
  'Depot {id}：通过，有 {n} 个警告可以看一眼': 'Depot {id}: passed, with {n} warning worth a look|Depot {id}: passed, with {n} warnings worth a look',
  'Depot {id}：检查通过，没有发现问题': 'Depot {id}: check passed — nothing found',

  // —— 本地内容服务器 / 存档标记 ——
  '改不了': 'Couldn’t change it',
  '这个 App 的构建会传进本地内容服务器': 'Builds for this app go to the local content server',
  '已改回正常上传 Steam': 'Back to uploading to Steam',
  '已更新玩家存档标记': 'Updated the player save flag',
  '本地内容服务器已启动：{url}': 'Local content server started: {url}',
  '本地内容服务器已停': 'Local content server stopped',
  '写不了 steam_dev.cfg': 'Can’t write steam_dev.cfg',
  '已写入 {file}{backup}': 'Wrote {file}{backup}',
  '（原文件备份成 .bak）': ' (original backed up as .bak)',
  '内容服务器起不来': 'Couldn’t start the content server',
  '写不进 vdf': 'Can’t write the vdf',
  '打不开': 'Could not open',
  '密码没存上': 'Could not save the password',
  '保存失败': 'Save failed',
  '已保存': 'Saved',
  '读取失败': 'Load failed',
  '启动失败': 'Startup failed'
}
