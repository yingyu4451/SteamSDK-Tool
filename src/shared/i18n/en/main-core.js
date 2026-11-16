/** 主进程核心：src/main/index.js、src/main/sdk.js、src/main/store.js */
export default {
  // —— 后台 Depot 读取 ——
  '还没有配置 Steam 账号名（设置 → 账号）': 'No Steam account name set yet (Settings → Account)',
  '需要 Steam 账号 {account} 的密码才能用 steamcmd 查后台 Depot（设置里没存密码）':
    'steamcmd needs the password for Steam account {account} to query backend depots (no password saved in Settings)',
  'steamcmd 查询失败：{message}': 'steamcmd query failed: {message}',
  '想在向导里直接读后台 Depot，二选一：\n  • 在「设置」里保存 Steam 账号密码（用上传构建的那个账号），或者\n  • 找管理员要一个 Steamworks Web API 密钥，填在「设置」里。':
    'To read backend depots right here in the wizard, do one of these:\n  • Save the Steam account password (the one used for uploads) in Settings, or\n  • Ask an admin for a Steamworks Web API key and enter it in Settings.',
  '这个 App 没有 AppID，没法查后台': 'This app has no AppID, so its backend cannot be queried',
  '还没有配置 Web API 密钥': 'No Web API key configured yet',

  // —— SDK 路径与构建脚本 ——
  '还没设置 SDK 路径': 'SDK path is not set yet',
  'SDK 路径里没有 tools\\ContentBuilder': 'The SDK path has no tools\\ContentBuilder',
  '找不到 {label} —— SDK 路径没指向带 tools\\ContentBuilder 的目录：{path}':
    'Cannot find {label} — the SDK path does not point to a folder with tools\\ContentBuilder: {path}',
  '缺少 {label}，工具自带的也没能写进去（{dir}）。到设置里点「安装/修复脚本」重试。':
    '{label} is missing and the bundled copy could not be written either ({dir}). Click “Install/repair scripts” in Settings to retry.',
  '拒绝访问 ContentBuilder 之外的路径：{path}': 'Refusing to access a path outside ContentBuilder: {path}',
  '选择 SteamSDK 根目录': 'Select the SteamSDK root folder',
  '找不到 {path}': 'Cannot find {path}',
  'build.ps1 未找到，请在设置里检查 SDK 路径': 'build.ps1 not found — check the SDK path in Settings',

  // —— 本地服务器 / 通知 / 成就 ——
  '服务器没在跑，先点「启动」。': 'The server is not running. Click “Start” first.',
  'http://127.0.0.1:{port}/ 没有应答 —— 端口上可能挂着别的东西。先「停止」再「启动」一次。':
    'http://127.0.0.1:{port}/ is not responding — something else may be holding the port. Click “Stop” and then “Start” again.',
  '系统不支持通知': 'System notifications are not supported',
  '没选中 App。': 'No app selected.',
  '这个 App 的构建脚本里没有 AppID，清不了成就。':
    'This app’s build script has no AppID, so achievements cannot be cleared.',

  // —— 运行与登录 ——
  '查询超时': 'Request timed out',
  '参数不对': 'Invalid parameters',
  '检查 {app}': 'Check {app}',
  '检查全部': 'Check all',
  'check.ps1 启动失败': 'Failed to start check.ps1',
  '还没填 Steam 账号名（设置 → 登录凭据）—— 上传要用它登录 steamcmd。':
    'No Steam account name entered yet (Settings → Sign-in credentials) — it is needed to sign in to steamcmd for uploads.',
  '需要 Steam 账号密码：steamcmd 没有缓存凭据。请在下方输入，或先点「登录一次」。':
    'Steam account password required: steamcmd has no cached credentials. Enter it below, or click “Sign in once” first.',
  '本地服务器': 'Local server',
  '正式上传': 'Upload',

  // —— 路径与外链 ——
  '路径为空': 'Path is empty',
  '路径不存在：{path}': 'Path does not exist: {path}',
  '只允许打开 http/https': 'Only http/https URLs can be opened'
}
