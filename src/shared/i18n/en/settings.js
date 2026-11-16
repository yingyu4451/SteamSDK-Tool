/**
 * 设置与日志：SettingsView.vue / HistoryView.vue / LoginConsole.vue / ChangelogDialog.vue
 * 用法见 src/shared/i18n/core.js 顶部。键一律加引号。
 */
export default {
  // —— 界面语言（切换语言的地方本身当然也得能翻）——
  '界面语言': 'Language',
  '跟随系统': 'Follow system',
  '跟随系统 → {name}': 'Following system → {name}',

  // —— 设置页：页面骨架 ——
  '设置': 'Settings',
  'SDK 路径、登录凭据、Web API 密钥、界面语言和缩放。':
    'SDK path, sign-in credentials, Web API key, interface language and zoom.',
  'SDK 路径': 'SDK path',
  '选择…': 'Choose...',
  '保存': 'Save',

  // —— 设置页：SDK 路径 ——
  '打开 Steamworks 官方下载页。要登录有该 App 权限的 Steamworks 账号，没有匿名直链':
    'Opens the official Steamworks download page. You must sign in with a Steamworks account that has access to this app; there is no anonymous direct link',
  '下载 Steamworks SDK': 'Download Steamworks SDK',
  '在资源管理器里打开构建目录：{path}': 'Open the build folder in File Explorer: {path}',
  '还没检测到构建目录，先把上面的 SDK 路径指到解压后的 SteamSDK':
    'No build folder detected yet — point the SDK path above at the extracted SteamSDK first',
  '构建目录': 'Build folder',
  '还没装 SDK —— 下完解压到任意目录，再把上面的路径指过去':
    'SDK not installed yet — download it, extract it anywhere, then point the path above at it',
  'SDK 根目录': 'SDK root',
  'scripts 目录': 'scripts folder',
  'output 目录': 'output folder',
  '把工具自带的 build.ps1 / check.ps1 写进 SDK 的 tools\\ContentBuilder（内容一样的不重写）':
    'Write the bundled build.ps1 / check.ps1 into the SDK’s tools\\ContentBuilder (files with the same content are not rewritten)',
  '写入中…': 'Writing...',
  '安装/修复脚本': 'Install/repair scripts',
  '这个安装包不完整（缺自带的 build.ps1 / check.ps1）—— 重新装一次工具':
    'This installer is incomplete (the bundled build.ps1 / check.ps1 are missing) — reinstall the tool',
  '{files} 没写进去': '{files} not written',
  '脚本和工具自带的版本不一致': 'Scripts differ from the bundled version',
  '写入失败': 'Failed to write',
  '已写入 {n} 个脚本': '{n} script written|{n} scripts written',
  '脚本已是最新': 'Scripts are up to date',
  '路径已保存，检查已刷新': 'Path saved — checks refreshed',
  '打不开构建目录': 'Could not open the build folder',

  // —— 设置页：登录凭据 ——
  '登录凭据': 'Sign-in credentials',
  '已保存': 'Saved',
  '未保存': 'Not saved',
  '系统不支持加密存储': 'This system does not support encrypted storage',
  'Steam 账号名（不是邮箱）': 'Steam account name',
  'Steam 密码': 'Steam password',
  'Steam Guard 验证码': 'Steam Guard code',
  '例如 K4F2B': 'e.g. K4F2B',
  '等你在手机上点确认 —— 打开 Steam App，点「确认登录」':
    'Waiting for you to confirm on your phone — open the Steam app and tap “Confirm login”',
  '正在用 steamcmd 登录，第一次要十几秒…':
    'Signing in with steamcmd — the first attempt takes about ten seconds...',
  '登录验证通过，账号和密码已保存': 'Sign-in verified — account and password saved',
  'steamcmd 用缓存令牌登录成功，账号已保存': 'Signed in with a cached steamcmd token — account saved',
  'Steam 说密码不对（Invalid Password）——账号名不是邮箱，检查一下大小写':
    'Steam rejected the password (Invalid Password) — the account name is not an email address; check the casing',
  'Steam 要一个 Steam Guard 验证码，填到上面后再点一次「登录 Steam」':
    'Steam wants a Steam Guard code — enter it above, then click “Sign in to Steam” again',
  '等手机确认超时了 —— 在 Steam App 右下角盾牌里点「确认登录」后再试':
    'Timed out waiting for phone confirmation — tap “Confirm login” under the shield in the Steam app, then try again',
  'Steam 暂时限制了登录尝试（Rate Limit），等几分钟再试':
    'Steam is temporarily rate-limiting sign-in attempts — wait a few minutes and try again',
  '找不到 steamcmd.exe —— 先在上面把 SDK 路径配对':
    'steamcmd.exe not found — set the correct SDK path above first',
  '先填 Steam 账号名': 'Enter your Steam account name first',
  '先填 Steam 密码': 'Enter your Steam password first',
  '密码没存上': 'Could not save the password',
  '登录没成功，也没认出具体原因': 'Sign-in failed and the reason could not be identified',
  '打开系统命令行窗口，自己用 steamcmd 登录（内置窗口打不开时用这个）':
    'Open a system command prompt and sign in with steamcmd yourself (use this if the built-in window will not open)',
  '外置窗口': 'External window',
  '忘记账号': 'Forget account',
  '正在登录…': 'Signing in...',
  '登录 Steam': 'Sign in to Steam',

  // —— 设置页：Web API 密钥 ——
  'Steamworks Web API 密钥': 'Steamworks Web API key',
  '已保存 ····{tail}': 'Saved ····{tail}',
  '32 位十六进制 Publisher 密钥': '32-digit hex Publisher key',
  '加密保存': 'Save encrypted',
  '清除': 'Clear',
  '测试中…': 'Testing...',
  '测试密钥': 'Test key',
  '去后台取密钥': 'Get a key from the backend',
  '密钥已用 DPAPI 加密保存': 'Key encrypted with DPAPI and saved',
  '已清除密钥': 'Key cleared',
  '密钥无效或权限不够（需要 Publisher 级别）':
    'The key is invalid or lacks permission (Publisher level required)',
  '密钥可用，能看到 {n} 个 App': 'Key works — {n} app visible|Key works — {n} apps visible',

  // —— 设置页：界面缩放 ——
  '界面缩放': 'Interface zoom',
  '缩小 5%': 'Zoom out 5%',
  '界面缩放百分比': 'Interface zoom percentage',
  '放大 5%': 'Zoom in 5%',

  // —— 设置页：关于与更新 ——
  '关于': 'About',
  '读取版本中…': 'Reading version...',
  '有新版本 v{version}': 'v{version} available',
  '已是最新': 'Up to date',
  '检查中…': 'Checking...',
  '检查更新': 'Check for updates',
  '新版本': 'New version',
  '（当前 v{current}）': ' (current v{current})',
  '增量下载': 'Incremental download',
  '（全量 {size}）': ' (full {size})',
  '未知大小': 'Unknown size',
  '下载新版安装包；装在系统里的版本会走增量下载':
    'Download the new installer; installed copies use an incremental download',
  'GitHub 这次没返回 release 的资产列表（刚发版时偶尔会这样）。过一会儿再点一次「检查更新」就有了，或者点「在 GitHub 上看」手动下载。':
    'GitHub did not return the release asset list this time (it occasionally happens right after a release). Wait a bit and click “Check for updates” again, or click “View on GitHub” to download manually.',
  '下载中…': 'Downloading...',
  '下载更新': 'Download update',
  '没读到安装包': 'No installer found',
  '打开下载位置': 'Open download location',
  '重启并安装': 'Restart and install',
  '在 GitHub 上看': 'View on GitHub',
  '这次没读到 release 的安装包列表（刚发版时偶尔会这样）。过一会儿再点「检查更新」，或者点「在 GitHub 上看」手动下载。':
    'The release installer list could not be read this time (it occasionally happens right after a release). Wait a bit and click “Check for updates”, or click “View on GitHub” to download manually.',
  '便携版没有安装目录，也覆盖不了正在运行的自己。':
    'The portable build has no install directory and cannot overwrite itself while running.',
  '点「打开下载位置」，关掉工具，用新版替换掉你那个 exe 就行。':
    'Click “Open download location”, close the tool, and replace your exe with the new version.',
  '增量包已经下好了（只下了改动的部分）。':
    'The incremental package has been downloaded (only the changed parts).',
  '安装包已经下好了。': 'The installer has been downloaded.',
  '点「重启并安装」会关掉工具、起安装程序。':
    'Clicking “Restart and install” closes the tool and launches the installer.',
  'SteamPipe 文档': 'SteamPipe docs',
  'Steamworks 构建页': 'Steamworks builds page',
  'GitHub 仓库': 'GitHub repository',
  '更新日志': 'Changelog',

  // —— 构建历史 ——
  '构建历史': 'Build history',
  '下的所有构建日志': '— all build logs under it',
  '最近': 'Recent',
  '筛选文件名': 'Filter by file name',
  '在资源管理器里打开日志所在文件夹': 'Open the log folder in File Explorer',
  '打开文件夹': 'Open folder',
  '刷新': 'Refresh',
  '全部': 'All',
  '还没有构建日志': 'No build logs yet',
  '跑一次「检查配置」或「Preview 空跑」，日志会落在 output 目录并出现在这里。':
    'Run “Check config” or a preview; the logs land in the output folder and appear here.',
  '选一个日志': 'Select a log',
  '读取失败：{error}': 'Failed to read: {error}',
  '读取中…': 'Loading...',
  '选一个日志看内容': 'Select a log to view it',
  '左边列表里点一下文件名；这里会显示明文，可以全选复制。':
    'Click a file name in the list on the left; its plain text appears here and can be selected and copied.',

  // —— Steam 登录控制台 ——
  'Steam 登录控制台': 'Steam sign-in console',
  '跑的就是 SDK 里的 steamcmd。已保存账号时会自动发 login 命令，密码 / 验证码在下面输入框回车发送。':
    'This runs the steamcmd from your SDK. If an account is saved, the login command is sent automatically; type the password / code in the box below and press Enter.',
  '关闭控制台': 'Close console',
  '未连接': 'Not connected',
  '等待输入': 'Waiting for input',
  '等待手机确认': 'Waiting for phone confirmation',
  '已结束': 'Ended',
  'Steam 正在等你手机上点确认': 'Steam is waiting for you to confirm on your phone',
  '—— 拿出手机打开 Steam App，点右下角盾牌图标里的「确认登录」。':
    '— Take out your phone, open the Steam app, and tap “Confirm login” under the shield icon.',
  '不用在下面输任何东西，确认完它自己会继续。':
    'Nothing needs to be entered below — it continues on its own once you confirm.',
  '正在启动 steamcmd…': 'Starting steamcmd...',
  '输入密码 / 验证码 / steamcmd 命令，回车发送':
    'Enter password / code / steamcmd command, press Enter to send',
  '发送': 'Send',
  '发送 Ctrl+C 中断当前命令': 'Send Ctrl+C to interrupt the current command',
  '内置控制台启动失败': 'Failed to start the built-in console',
  '[无法启动内置控制台]': '[Built-in console failed to start]',
  '未知错误': 'Unknown error',
  '可以退回设置页用「打开登录窗口」的外置窗口登录。':
    'You can go back to Settings and sign in with the external window instead.',
  '[steamcmd 已退出，退出码 {code}]': '[steamcmd exited with code {code}]',
  '控制台已经结束了': 'The console has already exited',

  // —— 更新日志弹窗 ——
  '从 v0.1.18 到现在的改动。点版本行展开 / 收起。':
    'Changes from v0.1.18 to now. Click a version row to expand / collapse.',
  '最新': 'Latest',
  '完整提交记录见 GitHub 仓库': 'Full commit history is in the GitHub repository'
}
