/**
 * 主进程 SDK 层：src/main/sdk.js、src/main/store.js
 *
 * 待处理问题的 key 也在这里：sdk.js 用 problem('中文模板', params) 报，
 * 界面显示走 problemLabel()；「忽略」记的是中文渲染结果，和这里无关。
 */
export default {
  // --- 待处理问题（sdk.js collectProblems）---
  'app vdf 里没有 AppID': 'No AppID in the app vdf',
  'app vdf 和 depot 脚本里都没有 ContentRoot':
    'No ContentRoot in the app vdf or in any depot script',
  '项目文件夹不存在：{path}': 'Project folder does not exist: {path}',
  'Depot {a} 和 {b} 的内容目录是同一个：{root}':
    'Depot {a} and Depot {b} share the same content folder: {root}',
  'Depot {outer} 的内容目录 {outerRoot} 套着 Depot {inner} 的 {innerRoot} —— 构建时会把对方的文件一起传上去':
    'Depot {outer} ({outerRoot}) contains Depot {inner} ({innerRoot}) — a build would upload both',
  'Depot {id} 上传的是 {root}，不在项目文件夹 {base} 里':
    'Depot {id} uploads {root}, which is outside the project folder {base}',
  'app vdf 花括号不配对：{open} 个 { / {close} 个 }':
    'app vdf has unbalanced braces: {open} opening / {close} closing',
  '没有列出任何 Depot': 'No Depots listed',
  'Depot {id} 引用的脚本不存在：{file}': 'Script referenced by Depot {id} is missing: {file}',
  'DepotID 不一致：app 写 {app}，{file} 写 {depot}':
    'DepotID mismatch: app vdf says {app}, {file} says {depot}',
  '{file} 缺少 FileMapping 块': '{file} has no FileMapping block',
  '{file}：还有 {n} 个疑似调试文件会被上传':
    '{file}: {n} suspicious debug file will be uploaded|{file}: {n} suspicious debug files will be uploaded',

  // --- sdk.js：扫描 / 收拢 / 读取 ---
  '未知': 'Unknown',
  '找不到目录 {dir}': 'Folder not found: {dir}',
  '目录 {dir} 里没有 app_*.vdf': 'No app_*.vdf in {dir}',
  '读取失败 {path}': 'Failed to read {path}',
  'scripts 目录不存在：{path}': 'The scripts folder does not exist: {path}',
  'scripts 根目录下没有游离的 vdf 文件': 'There are no loose vdf files in the scripts root',
  '已经存在同名的 App：{name}': 'An app with that name already exists: {name}',
  '根目录下有 {n} 个 app_*.vdf，一次只能收一个（先手动挑一个）':
    'The scripts root has {n} app_*.vdf files — adopt one at a time (pick one by hand first)',
  '没有可收拢的文件': 'No files to adopt',
  '建目录失败：{message}': 'Could not create the folder: {message}',
  '搬文件失败：{message}': 'Could not move the files: {message}',
  '文件已搬好，但 app vdf 里的引用没改成功：{message}':
    'Files moved, but the references in the app vdf were not updated: {message}',
  '拒绝访问 scripts 之外的路径：{path}': 'Refusing to access a path outside scripts: {path}',
  '项目文件夹是空的': 'The project folder is empty',

  // --- sdk.js：depot 增删改 ---
  '找不到 depot 脚本 {file}': 'Depot script not found: {file}',
  '{file} 不存在': '{file} does not exist',
  'DepotID 必须是数字': 'DepotID must be a number',
  'app 脚本里找不到 depot 映射行，文件已改名但引用没更新':
    'No depot mapping line in the app script — the file was renamed but the reference was not updated',
  'Depot {id} 已经在这个 App 里了': 'Depot {id} is already in this app',
  '这个 App 已经有 {platform} 的 Depot 了': 'This app already has a {platform} depot',
  '文件已存在：{file}': 'File already exists: {file}',
  'app 脚本里找不到 Depots 块，已回滚': 'No Depots block in the app script — rolled back',
  '找不到 depot {file}': 'Depot not found: {file}',
  'app 脚本里找不到这行 depot 映射': 'No such depot mapping line in the app script',

  // --- sdk.js：App 名校验 / 新建 / 改名 / 删除 ---
  '名字不能为空': 'Name cannot be empty',
  '名字不能以下划线开头（_ 开头的目录会被扫描跳过）':
    'Name cannot start with an underscore (folders starting with _ are skipped)',
  '名字里不能有 \\ / : * ? " < > | 这几个字符': 'The name cannot contain any of \\ / : * ? " < > |',
  '名字里不能有控制字符': 'Name cannot contain control characters',
  '名字里只能用字母、数字、下划线、点、横线、空格、括号或中文':
    'Use only letters, digits, underscores, dots, hyphens, spaces, brackets or Chinese characters',
  '名字不合法': 'Invalid name',
  '名字太长了（最多 64 字）': 'Name is too long (64 characters max)',
  '找不到 {name}': 'Could not find {name}',
  '重命名失败：{message}': 'Rename failed: {message}',
  'AppID 必须是数字': 'AppID must be a number',
  'DepotID 重复：{id}': 'Duplicate DepotID: {id}',
  '同一个 App 里 {platform} 只能有一个 Depot': 'Only one {platform} depot is allowed per app',
  '创建失败：{message}': 'Create failed: {message}',
  '这个 depot 没有设置内容目录': 'This depot has no content folder set',
  '删除脚本目录失败：{message}': 'Failed to delete the scripts folder: {message}',

  // --- sdk.js：构建历史 / 日志 ---
  '…（仅显示最后 {kb} KB）…': '...(showing only the last {kb} KB)...',
  '读取日志失败：{message}': 'Failed to read the log: {message}',

  // --- store.js ---
  'DepotID 不能为空': 'DepotID cannot be empty',
  '缺少 App 名或问题内容': 'Missing app name or problem text',
  '系统不支持安全存储（safeStorage 不可用），密码不会被保存':
    'This system does not support secure storage (safeStorage unavailable); the password will not be saved',
  '系统不支持安全存储（safeStorage 不可用），密钥不会被保存':
    'This system does not support secure storage (safeStorage unavailable); the key will not be saved',
  'Web API 密钥应该是 32 位十六进制字符': 'The Web API key must be 32 hex characters'
}
