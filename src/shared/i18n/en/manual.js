/**
 * 使用手册：ManualView.vue
 * 五节静态正文（能做什么 / 三个词 / 工具条按钮 / 什么不该传 / 分支和 SetLive）。
 * check.ps1、vdf 键名、排除规则里的通配符和示例路径原样保留。
 */
export default {
  // —— 页头 ——
  '每个按钮是干什么的、怎么开始。': 'What every button does, and how to start.',
  '搜…': 'Search...',
  '从头走一遍设置流程': 'Walk through setup from the start',
  '没有匹配「{q}」的章节。': 'No sections match “{q}”.',
  '完整文档在仓库里': 'Full docs live in the repo',
  '中文和 English README 内容更全，含已知限制和开发说明。':
    'The Chinese and English READMEs go further — known limitations and development notes included.',
  '打开 README': 'Open README',
  '去设置': 'Go to settings',

  // —— 能做什么 ——
  '能做什么': 'What it can do',
  '游戏包拖进来': 'Drop a build in',
  '窗口任意位置拖入文件夹或 zip。自动认出平台（看 UnityPlayer.dll / .app / .so），告诉你该导入哪个 Depot；同一个平台还没 Depot，就现场建一个。':
    'Drag a folder or zip anywhere in the window. The platform is detected from UnityPlayer.dll / .app / .so and the tool tells you which depot to import it into — if that platform has no depot yet, it creates one on the spot.',
  '读后台 Depot': 'Read depots from the backend',
  '向导里填 AppID，点「读后台 Depot」，拿回后台真实的 DepotID 和体积，不用照着 AppID+1 猜。':
    'Enter the AppID in the wizard and click “Read backend depots” to get the real DepotIDs and sizes from Steamworks — no more guessing AppID+1.',
  '同步 Depot': 'Sync depots',
  '后台建好、本地还没配的 Depot，勾上一次性补进 scripts。':
    'Depots that exist in the backend but aren’t configured locally yet — tick them and they’re added to the scripts in one go.',
  '一个 App 管多平台': 'One app, many platforms',
  'win64 / macOS / linux 各建一个 Depot，一次构建全传。不用为了多平台拆成好几个 App。':
    'Create one depot per platform (win64 / macOS / linux) and ship them all in a single build. No need to split platforms across several apps.',
  '界面里改 vdf': 'Edit the vdf in the UI',
  'AppID、项目文件夹、构建缓存目录、排除规则、存档保护，都在抽屉里改。写走的是行级替换，你手写的注释不会被动。':
    'AppID, project folder, build cache folder, exclusions and save protection are all edited in the drawer. Writes use line-level replacement, so comments you wrote by hand survive.',
  '内容目录就地打包': 'Build straight into the content folder',
  '把 Unity 的输出目录设成 Depot 的内容目录（输出模式 DirectFolder），打完包不用再复制到任何地方。':
    'Point Unity’s output at the depot’s content folder (DirectFolder output mode) and the finished build lands there — no copying afterwards.',
  '上传前两道关': 'Two checks before upload',
  '「检查配置」查 vdf，「检查文件」查真实文件 —— 非法字符、超长路径、大小写冲突、符号链接、.app bundle。':
    'Check config validates the vdf; Check files scans the real files — illegal characters, over-long paths, case conflicts, symlinks and .app bundles.',
  '空跑': 'Preview',
  'Preview 走一遍完整构建，但一个字节都不传到 Steam，看 manifest 确认到底传了什么。':
    'Preview runs a full build without sending a single byte to Steam — check the manifest to see exactly what would be uploaded.',
  '本机试玩': 'Play locally',
  '本地内容服务器把内容指到本机，Steam 客户端直接读，不用先上传就能试。':
    'The local content server points content at your machine so the Steam client reads it directly — test without uploading first.',
  '日志留在窗口里': 'Logs stay in the window',
  'steamcmd 和 PowerShell 的输出逐行流回来，随时中止，整棵进程树一起杀。':
    'steamcmd and PowerShell output streams back line by line; you can abort at any time and the whole process tree is killed.',
  '构建历史': 'Build history',
  'output 目录下所有日志，按 App 筛、按名字搜。':
    'Every log under the output folder, filterable by app and searchable by name.',

  // —— 三个词 ——
  '三个词': 'Three words',
  'Steam 上的一个「产品」，用 AppID 标识。Demo、正式版、Playtest 是三个不同的 App。':
    'A “product” on Steam, identified by an AppID. A demo, a release build and a playtest are three different apps.',
  '一个 App 下面的一个内容包，用 DepotID 标识。一个平台一个 Depot。':
    'A content package under an app, identified by a DepotID. One depot per platform.',
  '项目文件夹': 'Project folder',
  '你电脑上放构建产物的目录，比如 D:\\SteamBuilds\\MyGame。下面按平台分子目录（win64、macos），每个子目录绑一个 Depot。':
    'The folder on your machine that holds build output, e.g. D:\\SteamBuilds\\MyGame, with one subfolder per platform (win64, macos), each bound to a depot.',
  '这三个 ID 只在 Steamworks 后台看得见。工具能读回来，但写不回去 —— 后台的 App 和 Depot 得你自己先建。':
    'These three IDs only exist in the Steamworks backend. The tool can read them back but can’t write them — you still create the app and depots yourself.',

  // —— 工具条按钮 ——
  '工具条按钮': 'Toolbar buttons',
  '检查配置': 'Check config',
  '跑 check.ps1。核对 vdf 里的 AppID / DepotID / 内容目录 / 排除规则，以及 depot 脚本之间对不对得上。不看实际文件，很快。':
    'Runs check.ps1. Validates the AppID / DepotID / content folder / exclusions in the vdf, and that the depot scripts agree with each other. It doesn’t touch actual files, so it’s fast.',
  '检查文件': 'Check files',
  '扫真正会被上传的文件，找非法字符、超长路径、大小写冲突、符号链接、macOS 的 .app bundle。':
    'Scans the files that will actually be uploaded for illegal characters, over-long paths, case conflicts, symlinks and macOS .app bundles.',
  'Preview 空跑': 'Preview',
  '完整走一遍构建，但一个字节都不传到 Steam。':
    'Runs a complete build without sending a single byte to Steam.',
  '正式上传': 'Upload',
  '真上传。要点两次才生效。': 'The real upload. Takes two clicks to confirm.',
  '读后台这个 App 下的 Depot 列表，勾上就把本地没有的补进 scripts。':
    'Reads the depot list for this app from the backend; tick the ones you want and any missing locally are added to the scripts.',
  '本地服务器': 'Local server',
  '把内容指到本地 ContentServer，Steam 客户端直接从你机器读。':
    'Points content at the local ContentServer so the Steam client reads straight from your machine.',
  '「检查配置」查的是配置，「检查文件」查的是文件。两个都跑 —— 上传失败最常见的原因就是配置对、但路径里有问题。':
    'Check config checks the config; Check files checks the files. Run both — the usual reason an upload fails is a valid config with a bad path.',

  // —— 什么不该传 ——
  '什么不该传': 'What not to upload',
  '每个 Depot 都有自己的排除规则（vdf 里的 FileExclusion），在 Depot 卡片右上角「编辑」里改。默认已经挡掉：':
    'Every depot has its own exclusion rules (FileExclusion in the vdf), edited via “Edit” in the top right of the depot card. These are excluded by default:',
  '*.pdb、*.log、*.ps1、*.bat、*.cmd —— 调试和脚本垃圾':
    '*.pdb, *.log, *.ps1, *.bat, *.cmd — debug and script junk',
  'logs\\*、tools\\* —— 本地工具目录': 'logs\\*, tools\\* — local tool folders',
  'steam_appid.txt —— 只在本地测试用': 'steam_appid.txt — only needed for local testing',
  '*BurstDebugInformation_DoNotShip\\* —— Unity Burst 的调试信息':
    '*BurstDebugInformation_DoNotShip\\* — Unity Burst debug info',
  'macOS 上还有 *.dSYM\\*、*.sym': 'On macOS also *.dSYM\\*, *.sym',
  '玩家存档（Progress、Settings 这类运行时会改的文件）走另一条路：Depot 编辑里加进「存档保护」，Steam 更新时就不会覆盖玩家改过的文件。':
    'Player saves (files the game modifies at runtime, such as Progress or Settings) take a different route: add them to “save protection” in the depot editor and Steam updates won’t overwrite them.',

  // —— 分支和 SetLive ——
  '分支和 SetLive': 'Branches and SetLive',
  '分支列表现在直接从 Steamworks 后台读（需要 Web API 密钥）；没密钥时只显示本机写过的分支。vdf 里的 SetLive 写哪个分支名，那次构建就进哪个分支。':
    'The branch list is now read straight from the Steamworks backend (needs a Web API key); without a key only branches written locally are shown. Whatever branch name is in SetLive in the vdf is the branch that build goes to.',
  'SetLive 留空 = 不设分支：构建只生成，不会自动上任何分支（包括 default）。default 分支要在后台网页上手动设 live。':
    'An empty SetLive means no branch: the build is generated but nothing goes live (not even default). Set the default branch live manually in the backend web UI.'
}
