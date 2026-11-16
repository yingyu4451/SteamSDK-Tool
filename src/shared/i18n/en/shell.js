/**
 * 外壳：TitleBar.vue / Sidebar.vue / App.vue / EmptyState.vue / PathLink.vue 等通用件
 * 用法见 src/shared/i18n/core.js 顶部。键一律加引号——中文键里常有空格和括号。
 */
export default {
  'SteamSDK 上传工作台': 'SteamSDK Upload Workbench',

  // —— TitleBar：运行状态 ——
  '检查配置中': 'Checking config',
  'Preview 中': 'Previewing',
  '上传中': 'Uploading',

  // —— TitleBar：构建脚本 / 新版本提示 ——
  '构建脚本需更新': 'Build scripts outdated',
  'SDK 里的构建脚本和工具自带的版本不一致（{files}）。点这里同步成工具自带版本 —— 不更新的话，上传时「关掉某个 Depot」之类的开关可能不生效。':
    'The build scripts in your SDK differ from the bundled ones ({files}). Click to sync them. If you skip this, switches such as “disable a depot” may not take effect when uploading.',
  '有新版本，点开去设置里更新': 'A new version is available — open Settings to update',
  'v{version} 可更新': 'v{version} available',

  // —— TitleBar：窗口按钮 ——
  '最小化': 'Minimize',
  '最大化': 'Maximize',
  '向下还原': 'Restore',
  '关闭': 'Close',

  // —— Sidebar：左侧导航 ——
  '工作台': 'Workbench',
  '构建历史': 'Build history',
  '使用手册': 'Manual',
  '设置': 'Settings',

  // —— Sidebar：App 列表头 / 空状态 ——
  '新建文件夹（把 App 拖进去分类）': 'New folder (drag apps in to group them)',
  '新建文件夹': 'New folder',
  '重新扫描 scripts 目录': 'Rescan the scripts directory',
  '新建 App（Demo / 正式版 / 新平台）': 'New app (demo / release / new platform)',
  '新建 App': 'New app',
  '文件夹名称，回车创建': 'Folder name, press Enter to create',
  '还没有 App': 'No apps yet',
  '点右上角 + 新建一个，或把游戏文件夹拖进窗口。':
    'Click + in the top right to create one, or drag a game folder into the window.',
  '未分类': 'Uncategorized',
  '拖到这里移出文件夹': 'Drop here to move out of the folder',

  // —— Sidebar：文件夹标题行 / 行内操作 ——
  '展开': 'Expand',
  '折叠': 'Collapse',
  '{action}「{name}」；拖动标题行可排序；把 App 拖到这里分类':
    '{action} “{name}” — drag the header row to reorder; drop an app here to file it',
  '删除？': 'Delete?',
  '取消': 'Cancel',
  '删除': 'Delete',
  '删除文件夹（里面的 App 回到未分类，App 本身不受影响）':
    'Delete folder (its apps go back to Uncategorized; the apps themselves are not affected)',
  '删除文件夹（会先确认；里面的 App 回到未分类）':
    'Delete folder (asks first; its apps go back to Uncategorized)',
  '重命名文件夹': 'Rename folder',
  '调色：颜色与边框亮度': 'Color: color and border intensity',

  // —— Sidebar：调色弹窗 ——
  '色相': 'Hue',
  '透明度': 'Opacity',
  '透明度（文件夹边框不透明度）': 'Opacity (folder border opacity)',
  '恢复默认': 'Reset to defaults',

  // —— Sidebar：健康状态 title ——
  '有 Depot 的脚本文件不在了': 'A depot script file is missing',
  '没有 AppID': 'No AppID',
  'AppID 和别的本地 App 撞车': 'AppID conflicts with another local app',
  '有待处理 {n} 项': '{n} item needs attention|{n} items need attention',
  '项目文件夹不存在': 'Project folder not found',
  '一切正常': 'All good',

  // —— App：启动失败 / 读取中 / 拖放浮层 ——
  '启动失败': 'Startup failed',
  '正在读取 SDK…': 'Reading SDK...',
  '松手就分析': 'Drop to analyze',
  '文件夹，或者 .zip': 'A folder, or a .zip',

  // —— PathLink：路径链接 title ——
  '在资源管理器里打开：{path}': 'Open in File Explorer: {path}',
  '路径不存在，点一下试试：{path}': 'Path not found — click to try anyway: {path}'
}
