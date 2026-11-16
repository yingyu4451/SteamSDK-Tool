/**
 * 工作台面板：BranchPanel / ConsoleLog / NewDepotSlideover / AppHeader
 */
export default {
  // —— BranchPanel：标题 / 分支 pill ——
  '分支 / SetLive': 'Branch / SetLive',
  'SetLive 为空：构建只生成，不会自动切到任何分支':
    'SetLive is empty: builds are generated only and never switch to a branch automatically',
  '读取后台分支…': 'Reading backend branches...',
  '{n} 个后台分支': '{n} backend branch|{n} backend branches',
  '后台分支未读到': 'No backend branches read',
  '从后台刷新分支（Web API GetAppBetas）': 'Refresh branches from the backend (Web API GetAppBetas)',

  // —— BranchPanel：分支按钮 / 新建 / 管理 ——
  '分支': 'Branches',
  '后台 BuildID {id}{desc}': 'Backend BuildID {id}{desc}',
  '后台分支（Web API）': 'Backend branch (Web API)',
  '本机记下的分支': 'Branch saved locally',
  '清空 SetLive：构建只生成，不自动设到任何分支（default 分支要在后台网页手动设 live）':
    'Clear SetLive: builds are generated only and will not be assigned to any branch automatically (set the default branch live manually in the backend)',
  '不设分支': 'No branch',
  '新建一个 beta 分支：只写本地 vdf 的 SetLive，后台还要在 Steamworks 里配':
    'Create a beta branch: writes SetLive to the local vdf only; you still need to set it up in Steamworks',
  '新建分支': 'New branch',
  '管理本机记录的分支；后台分支只读': 'Manage locally saved branches; backend branches are read-only',
  '管理分支': 'Manage branches',
  '新分支名，例如 qa / internal': 'New branch name, for example qa / internal',
  '写入': 'Save',
  'SetLive 已切成 "{branch}"': 'SetLive switched to "{branch}"',
  '已清空 SetLive：构建只生成，不自动设到任何分支':
    "SetLive cleared: builds are generated only and won't be assigned to any branch",

  // —— ConsoleLog：标题栏 ——
  '构建输出': 'Build output',
  '退出码 {code}': 'Exit code {code}',
  '还没有运行过': 'Not run yet',
  '{n} 行': '{n} line|{n} lines',
  '打开后 steamcmd 会逐个文件打印，日志会长很多 —— 排查「到底传了哪些文件」时才需要':
    'Prints every file via steamcmd; the log gets much longer — only needed when checking which files were actually uploaded',
  '详细日志': 'Verbose log',
  '自动滚动': 'Auto-scroll',
  '复制': 'Copy',
  '清空': 'Clear',
  '中止': 'Abort',

  // —— ConsoleLog：需要输入 / 上传成功 ——
  '等你在手机上点确认…（盾牌图标 → 确认登录）':
    'Waiting for you to confirm on your phone... (shield icon → approve sign-in)',
  '输入后回车': 'Type and press Enter',
  '提交': 'Submit',
  'Steam 要 Steam Guard 验证码 —— 手机 Steam App 的「Steam 令牌」页或邮件里的那串码':
    'Steam needs a Steam Guard code — the one on the “Steam Guard” page of the mobile Steam app or in your email',
  '验证码': 'Code',
  '带验证码重试': 'Retry with code',
  '上传成功。还差一步：去 Steamworks 把这次构建设为 live（分支由 SetLive 决定）。':
    'Uploaded. One step left: set this build live in Steamworks (the branch is determined by SetLive).',
  '打开构建页': 'Open builds page',
  '知道了': 'Got it',
  '点「检查配置」或「Preview 空跑」开始，steamcmd 和脚本的输出会实时出现在这里。':
    'Click “Check config” or “Preview” to start; output from steamcmd and the scripts appears here in real time.',

  // —— NewDepotSlideover：头部 / 后台读取 ——
  '新建 Depot': 'New depot',
  '只在本地记录，不会写进 vdf': 'Saved locally only; not written to the vdf',
  '用 steamcmd + 已保存的 Steam 账号读后台这个 App 的 Depot 列表':
    "Read this app's depot list from the backend using steamcmd and the saved Steam account",
  '读后台': 'Read backend',

  // —— NewDepotSlideover：字段 ——
  'Depot 名称': 'Depot name',
  '例如 MyGame Content': 'For example MyGame Content',
  '例如 1234561': 'For example 1234561',
  '后台新建时如果留空，Steam 会自动分配一个':
    'If left blank when creating in the backend, Steam assigns one automatically',
  '操作系统': 'Operating system',
  '架构': 'Architecture',
  '本地 · SteamPipe': 'Local · SteamPipe',
  'vdf 里真正生效的部分': 'The part that actually takes effect in the vdf',
  '这个 App 已经有 {platform} 的 Depot（{id}）。':
    'This app already has a depot for {platform} ({id}).',
  '确实要再加一个同平台的': 'Yes, add another depot for the same platform',

  // —— NewDepotSlideover：会写出什么 / 底部按钮 ——
  '会写出什么': 'What will be written',
  '＋ 脚本': '+ Script',
  '＋ 目录': '+ Folder',
  '（未填）': '(not set)',
  '创建 Depot': 'Create depot',

  // —— AppHeader：状态 pill / 基本信息 ——
  '读取失败': 'Load failed',
  'AppID 冲突': 'AppID conflict',
  '{n} 项待处理': '{n} item needs attention|{n} items need attention',
  '改 AppID / 描述 / 项目文件夹 / 构建缓存目录':
    'Edit AppID / description / project folder / build cache directory',
  '编辑': 'Edit',
  '{n} 个 Depot': '{n} depot|{n} depots',
  '构建脚本': 'Build script',

  // —— AppHeader：AppID 冲突块 ——
  '同时被这些本地 App 使用：': 'is also used by these local apps:',
  '。': '.',
  '给其中一个跑构建，内容会传到': 'Running a build for one of them uploads content to ',
  '同一个 Steam App': 'the same Steam app',
  ' 上。请到 Steamworks 后台核对各自的 AppID —— 本地读不到，只有后台有。':
    ". Check each app's AppID in the Steamworks backend — it cannot be read locally; only the backend has it.",

  // —— AppHeader：待处理清单 ——
  '待处理': 'Needs attention',
  '{n} 项': '{n} item|{n} items',
  '另有 {n} 项已忽略（在「编辑」里恢复）': '{n} more ignored (restore in Edit)',
  '只这一次不提示 —— 重开应用会回来': 'Skip it this time only — it comes back when you reopen the app',
  '写进设置，以后都不再提示（原文完全一样才算同一条，路径变了会重新报）。想恢复去「编辑」里':
    'Saved to settings and never shown again (only an identical original counts as the same item; a changed path is reported again). Restore it in Edit.',
  '读取 App 失败': 'Failed to load app'
}
