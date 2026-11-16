/**
 * 主进程其它工具模块：localserver / steamapi / steam-console / steamcmdinfo /
 * forget / scripts / runner / ptyconsole
 */
export default {
  /* ---------------- steam-console.js：本机 Steam 控制台 / 清空成就 ---------------- */
  'Steam 没在运行。先打开 Steam 客户端再试。': 'Steam is not running. Open the Steam client, then try again.',
  '找不到 Steam 的安装路径（注册表里没有）。': 'Could not find the Steam install path (not in the registry).',
  '没找到 Steam 主窗口。先把 Steam 主界面打开，再试一次。':
    'Could not find the main Steam window. Open the Steam main window, then try again.',
  '切不到 Steam 窗口（可能被别的窗口挡住了）。再试一次。':
    'Could not bring the Steam window to the front (another window may be covering it). Try again.',
  '打不开 Steam 控制台页面。': 'Could not open the Steam console page.',
  '读不到 Steam 窗口的位置。再试一次。': 'Could not read the Steam window position. Try again.',
  '点不到 Steam 控制台的输入框（窗口可能在屏幕外）。把 Steam 窗口拖回屏幕里再试。':
    'Could not click the input box in the Steam console (the window may be off screen). Drag the Steam window back on screen and try again.',
  '切到 Steam 后焦点又被别的窗口抢走了。等别的程序安静下来再试一次。':
    'Focus went to another window right after switching to Steam. Wait until other apps settle down, then try again.',
  '模拟键盘输入失败。': 'Failed to simulate keyboard input.',
  '没等到 Steam 控制台的返回。确认 Steam 已登录，然后重试。':
    'The Steam console never responded. Make sure Steam is signed in, then retry.',
  '清空失败，Steam 返回了未知错误。': 'Clear failed: Steam returned an unknown error.',
  '这个 App 的构建脚本里没有可用的 AppID。': 'The build script for this app has no usable AppID.',
  '写临时脚本失败：{error}': 'Failed to write the temporary script: {error}',
  '清空失败：没拿到 Steam 的返回（{error}）。': 'Clear failed: no response from Steam ({error}).',
  '清空失败：没拿到 Steam 的返回。': 'Clear failed: no response from Steam.',
  '{msg}（当前前台窗口是「{window}」）': '{msg} (the foreground window is “{window}”)',
  'Steam 返回「清空失败」。确认这个账号拥有该 App，并且已经登录 Steam。':
    'Steam reported “clear failed”. Make sure this account owns the app and is signed in to Steam.',

  /* ---------------- steamapi.js：partner Web API 报错与回退提示 ---------------- */
  '还没有配置 Web API 密钥': 'No Web API key configured yet',
  '请求超时（{seconds}s）：{endpoint}': 'Request timed out ({seconds}s): {endpoint}',
  '网络错误：{error}': 'Network error: {error}',
  '密钥被拒绝（{status}）。三种常见原因：① 密钥打错或已作废；② 这个密钥不是从 Steamworks 后台「用户与权限 → API 密钥」签发的；③ 密钥没有这个 App 的权限。':
    'Key rejected ({status}). Three common causes: ① the key is mistyped or revoked; ② the key was not issued from “Users & Permissions → API keys” in the Steamworks backend; ③ the key has no permission for this app.',
  'HTTP {status}：{body}': 'HTTP {status}: {body}',
  '返回的不是 JSON：{body}': 'Response was not JSON: {body}',
  'depot {id} 后台没有': 'depot {id} missing from the backend',
  '本地脚本 {file} 写的是 depot {id}（{platform}），但后台 AppID {appId} 下不存在这个 Depot。要么 DepotID 写错了，要么这个 Depot 还没在后台建。':
    'Local script {file} declares depot {id} ({platform}), but app {appId} has no such depot in the backend. Either the DepotID is wrong or the depot has not been created in the backend yet.',
  'depot {id} 后台还没有任何 Manifest': 'depot {id} has no manifests in the backend yet',
  '后台存在这个 Depot（{name}），但从来没传过内容。':
    'This depot exists in the backend ({name}) but no content was ever uploaded.',
  '后台存在这个 Depot，但从来没传过内容。':
    'This depot exists in the backend but no content was ever uploaded.',
  'depot {id} 匹配': 'depot {id} matched',
  '本地：{local}　后台：{remote}{os}{branch}{build}':
    'Local: {local} · Backend: {remote}{os}{branch}{build}',
  '分支 {branch}': 'branch {branch}',
  '未命名': 'Unnamed',
  '注意：后台这个 Depot 的 Manifest 标的是 {remote}，本地脚本写的是 {local}。平台对不上通常意味着 DepotID 串了。':
    'Note: the manifest in the backend is marked {remote}, but the local script says {local}. A platform mismatch usually means the DepotID is mixed up.',
  '后台多了 depot {id}': 'depot {id} exists only in the backend',
  '后台 AppID {appId} 下有 depot {id}（{name}），本地脚本里没有 —— 这次构建不会更新它。要一起传就在 Depot 矩阵里加上。':
    'app {appId} has depot {id} ({name}) in the backend, but the local script does not — this build will not update it. Add it to the depot matrix to upload it too.',
  '后台 AppID {appId} 下有 depot {id}，本地脚本里没有 —— 这次构建不会更新它。要一起传就在 Depot 矩阵里加上。':
    'app {appId} has depot {id} in the backend, but the local script does not — this build will not update it. Add it to the depot matrix to upload it too.',
  '分支 {branch} 后台不存在': 'branch {branch} missing from the backend',
  '本地历史里有这个分支名，但后台读不到。SetLive 写错分支名会静默失败，先确认后台建过它。':
    'Local history has this branch name, but the backend cannot read it. SetLive fails silently on a wrong branch name, so confirm the branch exists in the backend first.',
  '分支 {branch} 存在': 'branch {branch} exists',
  'Steamworks 后台的 beta 分支': 'Beta branch in the Steamworks backend',

  /* ---------------- steamcmdinfo.js：steamcmd 读 appinfo ---------------- */
  '无法启动 steamcmd：{error}': 'Could not start steamcmd: {error}',
  'steamcmd 超时（{seconds} 秒）。可能是登录卡住了 —— 密码不对、或者账号开了两步验证需要验证码。':
    'steamcmd timed out ({seconds}s). Sign-in may be stuck — wrong password, or the account has two-factor enabled and needs a code.',
  'steamcmd 启动失败：{error}': 'steamcmd failed to start: {error}',
  '找不到 steamcmd：{path}': 'steamcmd not found: {path}',
  'AppID 必须是数字': 'AppID must be a number',
  'steamcmd 登录失败。检查账号密码；如果账号开了 Steam Guard，这个功能用不了（steamcmd 拿不到验证码）—— 可以改从 Web API 密钥读。':
    'steamcmd sign-in failed. Check the account and password; if the account has Steam Guard enabled this feature cannot be used (steamcmd cannot receive the code) — read from a Web API key instead.',
  'steamcmd 没有返回 AppID {id} 的任何内容。\n{output}': 'steamcmd returned nothing for AppID {id}.\n{output}',
  'steamcmd 读不到 AppID {id} 的信息（返回了空块）。两种可能：\n  ① 这个 AppID 不存在或写错了；\n  ② 当前 steamcmd 账号没有这个 App 的权限 —— 用上传构建的那个账号登录才行。':
    'steamcmd could not read AppID {id} (it returned an empty block). Two possibilities:\n  ① the AppID does not exist or is mistyped;\n  ② the current steamcmd account has no permission for this app — sign in with the account you use to upload builds.',
  'steamcmd 读不到 AppID {id} 的信息（返回了空块）。两种可能：\n  ① 这个 AppID 不存在或写错了；\n  ② 当前 steamcmd 账号没有这个 App 的权限 —— 用上传构建的那个账号登录才行（现在用的是 anonymous，只能看已公开的 App）。':
    'steamcmd could not read AppID {id} (it returned an empty block). Two possibilities:\n  ① the AppID does not exist or is mistyped;\n  ② the current steamcmd account has no permission for this app — sign in with the account you use to upload builds (currently using anonymous, which can only read public apps).',

  /* ---------------- ptyconsole.js：内置登录控制台 ---------------- */
  'node-pty 没有加载成功（预编译产物缺失），只能用外置登录窗口':
    'node-pty failed to load (prebuilt binary missing), so only the external sign-in window is available',
  '没有找到 steamcmd.exe': 'steamcmd.exe not found',
  '启动伪终端失败：{error}': 'Failed to start the pseudo-terminal: {error}',
  '会话已结束': 'Session has ended'
}
