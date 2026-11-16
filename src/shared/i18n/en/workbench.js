/**
 * 工作台主界面：WorkbenchView / ActionBar / DepotMatrix / AppCard
 */
export default {
  // --- WorkbenchView：游离 vdf 提示 / 空状态 ---
  'scripts 根目录下有 {n} 个 vdf 没有被任何 App 管着':
    '{n} vdf file in the scripts root is not managed by any app|{n} vdf files in the scripts root are not managed by any app',
  'app，AppID {id}': 'app, AppID {id}',
  '收进一个 App 文件夹': 'Move into an app folder',
  '左侧选一个 App': 'Select an app on the left',
  '还没有 App 就点左栏的「＋」加一个；已有的点一下，就能开始检查、空跑或正式上传。':
    'If you have no apps yet, click “＋” in the left sidebar to add one. Click an existing app to start checking, run a preview, or upload for real.',
  '正在读取 {dir}…': 'Reading {dir}...',

  // --- WorkbenchView：概览数字 ---
  '磁盘共 {n} 个': '{n} file on disk|{n} files on disk',
  '会上传': 'To upload',
  '个文件': 'file|files',
  '磁盘共 {size} MB': '{size} MB on disk',
  '上传体积': 'Upload size',
  '只不上传，本地保留': 'Not uploaded, kept locally',
  '被排除': 'Excluded',
  '待处理': 'Needs attention',
  '项': 'item|items',
  '见上方问题清单': 'See the problem list above',
  '还有 {n} 项已忽略': '{n} ignored item|{n} ignored items',
  '没有发现问题': 'No problems found',

  // --- ActionBar：按钮与提示 ---
  'steamcmd + 已保存的 Steam 账号': 'steamcmd + saved Steam account',
  '检查配置': 'Check config',
  '检查配置：跑 check.ps1，核对 vdf 里的 AppID / DepotID / 内容目录 / 排除规则，以及 depot 脚本之间对不对得上。不看实际文件。':
    'Check config: runs check.ps1 to verify the AppID / DepotID / content folder / exclusion rules in the vdf, and that the depot scripts agree with each other. Does not look at actual files.',
  '检查文件': 'Check files',
  '检查文件：只检查当前选中的这个 Depot，扫一遍它真正会被上传的文件，找非法字符、超长路径、大小写冲突、符号链接、macOS 的 .app 包。每个 Depot 单独检查、单独记状态。':
    'Check files: checks only the currently selected depot, scanning the files it will actually upload for invalid characters, overlong paths, case collisions, symlinks, and macOS .app bundles. Each depot is checked and tracked separately.',
  'Preview 空跑': 'Preview',
  '正式上传': 'Upload',
  '再点一次确认上传': 'Click again to confirm the upload',
  '在 Steamworks 后台打开这个 App 的生成版本页面':
    'Open this app’s builds page in the Steamworks backend',
  '查看生成版本': 'View builds',
  '清空本机 Steam 账号在这个 App 下的全部成就（Steam 控制台执行，不联网、不需要密钥）':
    'Clear all achievements of the local Steam account for this app (runs in the Steam console; no network, no key needed)',
  'Steam 账号密码': 'Steam account password',
  '用这个密码空跑': 'Preview with this password',
  '用这个密码上传': 'Upload with this password',
  '同步 Depot': 'Sync depots',
  '同步失败': 'Sync failed',
  '改用 steamcmd': 'Use steamcmd instead',
  '去设置里填账号密码': 'Add credentials in Settings',
  '正在读取后台 Depot…（走 steamcmd 时要 10–30 秒）':
    'Reading backend depots... (takes 10–30 seconds over steamcmd)',
  '后台 {n} 个 Depot': '{n} depot in the backend|{n} depots in the backend',
  '后台分支': 'Backend branches',
  '勾选要加进本地的': 'Select the ones to add locally',
  '全选': 'Select all',
  '全不选': 'Select none',
  '平台未知': 'Unknown platform',
  '手动加': 'Add manually',
  '添加中…': 'Adding...',
  '添加选中的 {n} 个': 'Add {n} selected depot|Add {n} selected depots',
  '后台还没有 Depot': 'No depots in the backend yet',
  '这个 App 在 Steamworks 后台一个 Depot 都没有，先在后台建一个再回来同步。':
    'This app has no depots in the Steamworks backend yet. Create one there first, then come back and sync.',

  // --- ActionBar：检查文件结果 ---
  '检查文件结果': 'Check files results',
  '{n} 个会拦住上传': '{n} upload blocker|{n} upload blockers',
  '{n} 个警告': '{n} warning|{n} warnings',
  '{n} 条提示': '{n} note|{n} notes',
  '正在扫这个 Depot 的文件…': 'Scanning this depot’s files...',
  '先跑「检查配置」确认 vdf 和内容目录没问题；脚本的完整报错在底部「构建输出」里。':
    'Run “Check config” first to make sure the vdf and content folder are fine; the full script error is in “Build output” at the bottom.',
  '没有发现问题。': 'No problems found.',
  '拦住': 'Blocking',
  '警告': 'Warning',
  '提示': 'Note',

  // --- DepotMatrix：状态标签与悬停说明 ---
  '脚本缺失': 'Script missing',
  'DepotID 不一致': 'DepotID mismatch',
  '内容目录不存在': 'Content folder missing',
  '{n} 个可疑文件': '{n} suspicious file|{n} suspicious files',
  '配置通过': 'Config check passed',
  'app vdf 引用的 depot 脚本不存在':
    'The depot script referenced by the app vdf does not exist',
  '脚本里的 DepotID 与 app vdf 里写的不一致':
    'The DepotID in the script does not match the one in the app vdf',
  'vdf 里的内容目录不存在：点「创建目录」，或在编辑抽屉里改':
    'The content folder in the vdf does not exist. Click “Create folder”, or change it in the edit drawer.',
  '内容目录里有 {n} 个可疑文件；跑一次「检查文件」看详情':
    '{n} suspicious file in the content folder; run “Check files” for details|{n} suspicious files in the content folder; run “Check files” for details',
  '配置检查通过：脚本存在、DepotID 与文件名一致、内容目录存在、没有可疑文件（来自「检查配置」；实际文件另看「检查文件」）':
    'Config check passed: the script exists, its DepotID matches the file name, the content folder exists, and there are no suspicious files (from “Check config”; actual files are covered by “Check files”)',
  '文件未检查': 'Files not checked',
  '点上方「检查文件」只扫这一个 Depot（{id}）真正会被上传的文件':
    'Click “Check files” above to scan only the files depot {id} will actually upload',
  '文件 {n} 个问题': '{n} file issue|{n} file issues',
  '这个 Depot 扫出 {n} 个会拦住上传的文件问题（非法字符/超长路径/大小写冲突等）；点「检查文件」看详情':
    'This depot has {n} file issue that blocks the upload (invalid characters / overlong paths / case collisions, etc.); click “Check files” for details|This depot has {n} file issues that block the upload (invalid characters / overlong paths / case collisions, etc.); click “Check files” for details',
  '文件 {n} 个警告': '{n} file warning|{n} file warnings',
  '这个 Depot 扫出 {n} 个警告（符号链接 / macOS 元数据 / .app 包等），点「检查文件」看详情':
    '{n} warning in this depot (symlinks / macOS metadata / .app bundles, etc.); click “Check files” for details|{n} warnings in this depot (symlinks / macOS metadata / .app bundles, etc.); click “Check files” for details',
  '文件通过': 'Files OK',
  '最近一次对这个 Depot 的「检查文件」没有发现会拦住上传的问题':
    'The last “Check files” run on this depot found no upload-blocking issues',

  // --- DepotMatrix：卡片 / 体积 / 路径 ---
  '＋ 新建 Depot': '+ New depot',
  '不上传': 'Not uploaded',
  '这个 Depot 会随构建上传；点击改为不上传':
    'This depot is included in the upload; click to exclude it',
  '这个 Depot 不会上传；点击改为上传':
    'This depot is excluded from the upload; click to include it',
  '切换 {platform} Depot 上传': 'Toggle upload for the {platform} depot',
  '创建目录': 'Create folder',
  '磁盘文件': 'Files on disk',
  '总体积': 'Total size',
  '用「导入文件」导入这个 Depot 时记录的时间':
    'The time recorded when this depot was imported with “Import files”',
  '这个 Depot 没有导入记录；显示的是内容目录里最新文件的修改时间':
    'This depot has no import record; showing the modification time of the newest file in the content folder',
  '导入时间': 'Imported',
  '存档保护': 'Save protection',
  '没标任何玩家数据文件': 'No player data files marked',

  // --- DepotMatrix：可疑文件 / 被排除的文件 / 空状态 ---
  '会被上传的可疑文件': 'Suspicious files that will be uploaded',
  '这些应该加进 FileExclusion': 'These should be added to FileExclusion',
  '被 FileExclusion 挡下的文件': 'Files excluded by FileExclusion',
  '只不上传，本地都还在': 'Not uploaded, still on disk',
  '… 还有 {n} 个': '... and {n} more',
  '没有文件被排除。': 'No files excluded.',
  '还没有 Depot': 'No depots yet',
  '点右上角「新建 Depot」，按平台各建一个 —— 一次构建会全平台一起传。':
    'Click “New depot” in the top right and create one per platform — a single build uploads all platforms together.',

  // --- DepotMatrix：toast ---
  '创建失败': 'Create failed',
  '已创建 {path}': 'Created {path}',
  '{path} 早就存在': '{path} already exists',

  // --- AppCard ---
  '拖动调整顺序/分类；点击切换到 {name}':
    'Drag to reorder or regroup; click to switch to {name}'
}
