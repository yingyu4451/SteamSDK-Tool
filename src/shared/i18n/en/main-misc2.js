/** 主进程其余工具层：src/main/{forget,localserver,runner,scripts}.js */
export default {
  // —— 清单项之间的顿号；主进程没有 listSeparator，只能用 t('、') ——
  '、': ', ',

  // --- forget.js：清单（describeLogin）---
  'steamcmd 缓存的登录令牌': 'Login token cached by steamcmd',
  '有（下次构建可以免密）': 'Present (next build can skip the password)',
  '没有': 'None',
  'steamcmd 记住的账号名': 'Account name remembered by steamcmd',
  'steamcmd 的用户档案': 'steamcmd user profiles',
  '本机保存的密码': 'Password saved on this machine',
  '已加密存盘': 'Stored encrypted',
  '构建日志里的账号名': 'Account name in the build log',

  // --- forget.js：清理结果 ---
  '花括号不配平，没敢写回去': 'Unbalanced braces — did not write the file back',
  'steamcmd 的登录令牌和账号名': 'steamcmd login token and account name',
  'config.vdf 没清掉：{message}': 'Could not clean config.vdf: {message}',
  '用户档案没删掉：{message}': 'Could not delete the user profiles: {message}',
  '设置里记住的账号名': 'Account name remembered in Settings',
  '本地凭据没清掉：{message}': 'Could not remove the local credentials: {message}',
  '构建日志里的账号名没清掉 —— steamcmd 正占着这个日志文件。把它的控制台窗口关掉再点一次「忘记账号」就行。（{reason}）':
    'Could not scrub the account name from the build log — steamcmd is holding the log file open. Close its console window and click “Forget account” again. ({reason})',

  // --- localserver.js：本地内容服务器状态与报错 ---
  '进程': 'Process',
  '找不到 {path} —— 先在「构建目录」里跑一次带本地服务器的构建。':
    'Could not find {path} — run a build with the local content server from “Build folder” first.',
  '端口 {port} 已经被占用：{holder}。': 'Port {port} is already in use: {holder}.',
  '端口 {port} 已经被占用。': 'Port {port} is already in use.',
  'Steam 客户端默认只连 80 端口，所以要么把占用它的程序关掉，要么换个端口（换端口后客户端那边多半连不上）。':
    'The Steam client only connects on port 80 by default, so either close whatever is using it or pick another port (the client probably will not connect on a different port).',
  '换一个端口再试。': 'Try a different port.',
  '没有权限监听 {port} 端口 —— 1024 以下的端口要管理员身份运行。':
    'No permission to listen on port {port} — ports below 1024 require running as administrator.',
  '监听 {port} 端口失败：{message}': 'Could not listen on port {port}: {message}',
  '服务器起来了但 http://127.0.0.1:{port}/ 没有应答，已经停掉。':
    'The server started but http://127.0.0.1:{port}/ did not respond, so it was stopped.',
  '找不到 Steam 安装目录（注册表里没有）': 'Steam install folder not found (not in the registry)',
  '写入失败：{message}': 'Could not write the file: {message}',

  // --- runner.js：跑脚本 / 交互提示 ---
  '该任务没有可写入的 stdin': 'This task has no writable stdin',
  '任务不存在或已结束': 'That task does not exist or has already finished',
  '脚本不存在：{path}': 'Script not found: {path}',
  'Steam 要你在手机上确认 —— 打开 Steam App，点「确认登录」。这边会自己继续':
    'Steam needs you to confirm on your phone — open the Steam App and tap “Confirm login”. This side will carry on by itself',
  'Steam 要求两步验证码，请输入后回车': 'Steam is asking for a two-factor code — type it and press Enter',
  '无法启动 {exe}：{message}': 'Could not start {exe}: {message}',

  // --- scripts.js：自带构建脚本的安装 / 修复 ---
  '没有 ContentBuilder 目录 —— 先在设置里选对 SDK 路径':
    'No ContentBuilder folder — set the correct SDK path in Settings first',
  'ContentBuilder 目录不存在：{path}': 'ContentBuilder folder not found: {path}',
  '这个安装包里没找到自带的构建脚本（resources\\scripts），装包不完整':
    'The bundled build scripts (resources\\scripts) are missing from this install package — the package is incomplete',
  '自带脚本缺失：{path}': 'Bundled script missing: {path}',
  '写不进 {dir}（{files}）：{reason} —— 这个目录可能被占用或没有写权限':
    'Could not write into {dir} ({files}): {reason} — the folder may be in use or read-only',
  '安装包里没找到自带的构建脚本': 'The bundled build scripts were not found in the install package'
}
