/**
 * 新手引导：OnboardGuide.vue（欢迎 → SDK 路径 → 登录 Steam 账号）
 * 三步引导的标题、状态行、手机确认提示和底部按钮。代码里的 steamcmd / DPAPI / 路径不翻。
 */
export default {
  // —— 步骤名与通用按钮 ——
  '欢迎': 'Welcome',
  'SDK 路径': 'SDK path',
  'SteamSDK 路径': 'SteamSDK path',
  '登录 Steam 账号': 'Sign in to Steam',
  '下一步': 'Next',
  '正在验证…': 'Verifying...',
  '验证通过': 'Verified',
  '完成': 'Finish',
  '上一步': 'Back',
  '跳过': 'Skip',
  '跳过教程': 'Skip tutorial',
  '新手教程': 'Quick start',

  // —— 欢迎页 ——
  '一份 SDK 管所有 App / Depot / 版本，不用给每个版本复制一份 SDK。':
    'One SDK covers every app, depot and build — no need to copy the SDK for each release.',
  '告诉它你的': 'Point it at your',
  'SteamSDK 在哪': 'SteamSDK folder',
  '，它就能读到你配好的 App 和 Depot': ', and it can read the apps and depots you already configured',
  '填一次': 'Enter your',
  'Steam 账号': 'Steam account',
  '，之后检查配置、空跑、正式上传都在界面里点': ', then run Check config, preview and upload right from this window',
  '一个 App 一个项目文件夹，下面按平台挂 Depot ——': 'One app, one project folder, with a depot per platform —',
  '一次构建全平台一起传': 'one build ships every platform',

  // —— 第 1 步：SDK 路径 ——
  '重新扫一遍常见位置': 'Scan the usual locations again',
  '正在找…': 'Searching...',
  '重新识别': 'Scan again',
  '自动找到的': 'Found automatically',
  '✓ 用的是这个': '✓ Using this',
  '有 steamcmd': 'steamcmd found',
  '缺 steamcmd': 'steamcmd missing',
  '手动指定': 'Set manually',
  '选择…': 'Choose...',
  '打开 Steamworks 官方下载页。要登录有该 App 权限的 Steamworks 账号，没有匿名直链':
    'Opens the official Steamworks download page. You must sign in with a Steamworks account that has access to this app; there is no anonymous direct link',
  '下载 Steamworks SDK': 'Download Steamworks SDK',

  // —— 第 2 步：登录 Steam 账号 ——
  '已完成登录': 'Already signed in',
  'steamcmd 里存着这个账号的登录令牌，构建不用再输密码。直接点「完成」就行。':
    'steamcmd already has a login token for this account, so builds won’t ask for the password again. Just click “Finish”.',
  '正在看这台机器登录过没有…': 'Checking whether this machine is already signed in...',
  'steamcmd 要用它上传构建，也用来读你后台配好的 Depot 列表。':
    'steamcmd uses it to upload builds and to read the depot list you set up in the backend.',
  '不需要 Steamworks 管理员。': 'You don’t need a Steamworks admin account.',
  '账号名（不是邮箱）': 'Account name (not an email)',
  '例如 my_steam_login': 'e.g. my_steam_login',
  '密码': 'Password',
  '留空就先不存': 'Leave blank to skip saving',
  '密码用 Windows DPAPI 加密后存在本机，只有当前 Windows 用户能解 —— 不进命令行参数、不写进任何日志。不存也行，每次构建会问你要。':
    'The password is encrypted with Windows DPAPI and stored on this machine; only the current Windows user can decrypt it. It never appears in command-line arguments and is never written to a log. Saving is optional — each build will ask for it.',

  // —— 登录状态行 ——
  '检查失败：{error}': 'Check failed: {error}',
  '已登录{who} —— steamcmd 记住了，以后构建不用再输密码':
    'Signed in{who} — steamcmd remembers you, so builds won’t ask for the password again',
  '已保存密码，构建时会自动填': 'Password saved — it will be filled in automatically on builds',
  '还没检测到登录凭据': 'No saved login detected yet',
  '等你在手机上点确认 —— 打开 Steam App，点「确认登录」':
    'Waiting for you to confirm on your phone — open the Steam app and tap “Confirm login”',
  '正在用你填的账号登录 steamcmd，第一次要十几秒…':
    'Signing steamcmd in with the account you entered — the first time takes about 15 seconds...',
  '正在验证登录状态…': 'Checking login status...',
  '等太久了 —— 网络慢，或者手机那边一直没确认。可以点「跳过」，构建时再试':
    'That took too long — a slow network, or the confirmation never came through. You can click “Skip” and try again at build time',
  '账号密码没问题 —— steamcmd 已经登录并记住了（{account}）':
    'Account and password are fine — steamcmd is signed in and remembered ({account})',
  'steamcmd 用它以前缓存的令牌登录成功了（{account}）。你这次填的密码没被校验 —— 想真的验一次，先去设置里「忘记账号」':
    'steamcmd signed in with a token cached earlier ({account}). The password you just entered was not verified — to really test it, use “Forget account” in Settings first',
  'Steam 说密码不对（Invalid Password）。检查一下大小写，账号名不是邮箱':
    'Steam rejected the password (Invalid Password). Check the casing, and remember the account name is not an email address',
  '一直在等你手机上确认，没等到。手机上打开 Steam App → 右下角盾牌图标里那条「确认登录」，点了它这就能过':
    'Waited for a confirmation on your phone, but it never came. Open the Steam App → tap the “Confirm login” request under the shield icon at the bottom right, and this will go through',
  'Steam 要一个 Steam Guard 验证码（不是手机确认那种）—— 填到下面再点一次「完成」':
    'Steam wants a Steam Guard code (the typed kind, not a phone confirmation) — enter it below and click “Finish” again',
  'Steam 暂时限制了登录尝试（Rate Limit）。等几分钟再点一次':
    'Steam is rate limiting login attempts. Wait a few minutes, then try once more',
  '找不到 steamcmd.exe —— 回上一步把 SDK 路径配对':
    'steamcmd.exe not found — go back a step and fix the SDK folder',
  '账号名是空的': 'The account name is empty',
  '登录没成功，也没认出具体原因。点「跳过」先继续，构建时能看到 steamcmd 的原始输出':
    'Sign-in failed and the reason wasn’t recognized. Click “Skip” to continue — the raw steamcmd output will show during the build',

  // —— 手机确认（steamcmd 停在等令牌）——
  'Steam 正在等你手机上点确认': 'Steam is waiting for you to confirm on your phone',
  '拿出手机，打开': 'Grab your phone and open',
  '点右下角的': 'At the bottom right, tap the ',
  '盾牌图标': 'shield icon',
  '，里面有一条「确认登录」': ', where you’ll find the “Confirm login” request',
  '点它。这边会自己继续，': 'Tap it — this side continues on its own, ',
  '不用在这个窗口里做任何操作': 'you don’t need to do anything in this window',

  // —— Steam Guard 验证码 ——
  'Steam Guard 验证码': 'Steam Guard code',
  '例如 K4F2B': 'e.g. K4F2B',
  '在手机 Steam App 的「Steam 令牌」页，或者 Steam 发来的邮件里。填好点下面的「完成」。':
    'Find it on the “Steam Guard” page in the mobile Steam App, or in the email Steam sent you. Enter it below and click “Finish”.'
}
