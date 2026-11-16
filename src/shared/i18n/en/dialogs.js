/**
 * 大弹窗：EditDrawer.vue / NewAppWizard.vue / DropDialog.vue
 */
export default {
  // —— EditDrawer / NewAppWizard：App 一行一条、名字与描述 ——
  'App 名字': 'App name',
  '描述': 'Description',
  '项目文件夹': 'Project folder',
  '未设置': 'Not set',
  '空': 'Empty',
  '默认': 'Default',
  '修改': 'Change',
  '改名': 'Rename',
  '改名中…': 'Renaming...',
  '确定': 'Confirm',
  '名字没变': 'Name unchanged',
  'AppID 不能空': 'AppID cannot be empty',
  'BuildOutput 不能空 —— 日志和构建缓存都放这儿':
    'BuildOutput cannot be empty — logs and the build cache live here',
  'qa / internal（留空 = 不设分支，构建只生成）': 'qa / internal (leave empty = no branch, build only)',

  // 改名说明：路径外面套着 font-mono，只能拆成几段翻；拼起来是
  // 「This renames the whole scripts\X folder to scripts\Y, and the script files
  //  are renamed with it. The content folder stays the same.」
  '会把': 'This renames the whole',
  '整个文件夹改成': 'folder to',
  '，脚本文件跟着重命名。内容目录': ', and the script files are renamed with it. The content folder',
  '不动': ' stays the same',
  '。': '.',

  // —— EditDrawer：各 Depot 按项目文件夹重排 ——
  '先把项目文件夹填上': 'Set the project folder first',
  '重排失败': 'Rearrange failed',
  '已重排 {n} 个 Depot：{ids}': '{n} depot rearranged: {ids}|{n} depots rearranged: {ids}',
  '各 Depot 已经就是这个结构，没有改动': 'Every depot already uses this structure — nothing changed',
  '重排中…': 'Rearranging...',
  '各 Depot 按项目文件夹重排': 'Rearrange depots by project folder',

  // —— EditDrawer：已忽略的提示 ——
  '已忽略的提示': 'Ignored notices',
  '{n} 条': '{n} notice|{n} notices',
  '永久忽略': 'Ignored forever',
  '本次忽略': 'Ignored this session',
  '恢复之后会重新出现在 App 头上的待处理里':
    'After restoring, it shows again under Needs attention at the top of the app',
  '恢复提示': 'Restore',

  // —— EditDrawer：脚本 / 删除 ——
  '用系统编辑器打开': 'Open in system editor',
  '删除这个 App': 'Delete this app',
  '编辑 App': 'Edit app',
  '编辑 Depot {id}': 'Edit depot {id}',

  // —— EditDrawer：Depot 表单 ——
  '平台': 'Platform',
  '内容目录': 'Content folder',
  '改 DepotID 或平台会自动重命名脚本文件，并同步 app 脚本里的引用。':
    'Changing the DepotID or platform renames the script files and updates the references in the app script.',
  'FileExclusion（{n} 条）': 'FileExclusion ({n} rule)|FileExclusion ({n} rules)',
  '恢复默认': 'Reset to defaults',
  '没有任何排除规则 —— 内容目录里的日志、符号文件都会被传上去。':
    'No exclusion rules — logs and symbol files in the content folder will be uploaded too.',
  '加一条，例如 *.pdb 或 logs\\*': 'Add one, e.g. *.pdb or logs\\*',
  '这条规则已经有了': 'That rule already exists',
  '这条已经有了': 'That entry already exists',
  '添加': 'Add',
  'FileProperties / userconfig（{n} 条）':
    'FileProperties / userconfig ({n} entry)|FileProperties / userconfig ({n} entries)',
  '玩家运行时会改的文件：Steam 首次安装时放一份，之后升级不再覆盖':
    'Files the game modifies at runtime: Steam installs them fresh and never overwrites them on updates',
  '保护存档': 'Protects saves',
  '没有标记为玩家数据的文件 —— 玩家存档在升级时会被覆盖掉。':
    'No files are marked as player data — player saves will be overwritten on updates.',
  '相对内容目录，例如 MyGame_Data/Progress': 'Relative to the content folder, e.g. MyGame_Data/Progress',
  '确认删除 Depot（{n}）': 'Confirm delete depot ({n})',
  '删除这个 Depot': 'Delete this depot',
  '会删掉文件 {file}，并从 app 脚本里移除引用。':
    'Deletes the file {file} and removes its reference from the app script.',
  'Steam 上已经传过的 depot 不受影响。5 秒内再点一次才真删。':
    'Depots already uploaded to Steam are unaffected. Click again within 5 seconds to really delete.',

  // —— DropDialog：读文件 / 分析结果 ——
  '文件导入': 'Import files',
  '已等 {n} 秒': '{n} second elapsed|{n} seconds elapsed',
  '正在读 {name}…': 'Reading {name}...',
  '正在读…': 'Reading...',
  '{n} 个文件': '{n} file|{n} files',
  '解压后的内容': 'the extracted contents',
  '这个文件夹': 'this folder',
  '（项目文件夹还没设置）': '(project folder not set)',
  '把{what}复制进 {dest}，并把后台 Depot {id} 的内容目录指到这里':
    'Copy {what} into {dest} and point the content folder of backend depot {id} there',
  '把{what}复制进 {dest}，并作为新 Depot {id} 的内容目录':
    'Copy {what} into {dest} and use it as the content folder of the new depot {id}',
  '把{what}复制进 {dest}，并把 {platform} Depot {id} 的内容目录指到这里':
    'Copy {what} into {dest} and point the content folder of the {platform} depot {id} there',
  '压缩包会先在这里解开再数一遍。包大的话要等几分钟 —— 别关窗口，也别再拖一次。':
    'The archive is unpacked and counted here first. Large packages take a few minutes — do not close the window or drop again.',
  '同时在读取后台 Depot…': 'Reading backend depots at the same time...',
  '平台没认出来': 'Platform not recognized',
  '压缩包': 'Archive',
  '名字里的 AppID {id}': 'AppID {id} in the name',
  '判断依据：{why}': 'Detected by: {why}',
  '特征：{list}': 'Markers: {list}',
  '文件太多，只统计了前 3 万个。': 'Too many files — only the first 30,000 were counted.',
  'macOS 的 .app bundle 传上去容易坏签名 —— 跑「检查文件」能看到详情，Valve 的 tools\\ContentPrep 是专门处理这个的。':
    'Uploading a macOS .app bundle easily breaks its signature — run “Check files” for details; Valve’s tools\\ContentPrep is built for exactly this.',

  // —— DropDialog：选 Depot ——
  '文件已经读完，后台 Depot 还在读取…列表稍后会自动补全。':
    'Files are read; backend depots are still loading... the list will fill in automatically.',
  '导入哪个 Depot': 'Import into which depot',
  '平台一致': 'Platform matches',
  '（没有内容目录）': '(no content folder)',
  '未在本地配置': 'Not configured locally',
  '新建一个 Depot': 'Create a new depot',
  '（这个 App 还没有 Depot）': '(this app has no depots yet)',
  '没读到后台：{error}': 'Could not read the backend: {error}',
  '重试': 'Retry',
  '后台的 Depot 本地都配齐了{app}。': 'All backend depots are already configured locally{app}.',
  '（{name}）': ' ({name})',
  '·已占用': '· In use',
  'Depot 名称': 'Depot name',
  '内容会复制到': 'Content will be copied to',
  '＋ 脚本 {file}': '+ Script {file}',
  '处理中…': 'Working...',
  '同步并导入': 'Sync and import',
  '复制并导入': 'Copy and import',
  '新建并导入': 'Create and import',

  // —— NewAppWizard：顶部字段与已知 App ——
  '<App名>': '<app name>',
  '（未填）': '(not set)',
  '正在从密钥拉取权限内的 App…': 'Fetching apps allowed by the API key...',
  '已拉取 {n} 个 App（Web API 密钥）': '{n} app fetched (Web API key)|{n} apps fetched (Web API key)',
  '用过的 App {n} 个': '{n} app used before|{n} apps used before',
  '还没有记录': 'No records yet',
  '会创建': 'Creates',
  '↑↓ 选择，Enter 填入': '↑↓ to choose, Enter to fill in',
  '（没有名字）': '(no name)',
  '本地文件夹：{name}': 'Local folder: {name}',
  '本地已有': 'Local',
  '新建 App': 'New app',
  '例如 MyGame': 'e.g. MyGame',
  '例如 1234560；输入可搜索已知 App': 'e.g. 1234560; type to search known apps',
  '展开已知 App 列表': 'Show known apps',
  '已知 App': 'Known apps',
  '没有匹配的 App —— 可以继续手填 AppID': 'No matching app — you can still type the AppID manually',
  'AppID 不在密钥权限内 —— 还能继续建，但「读后台 Depot」「同步 Depot」会 403。':
    'This AppID is outside the API key permissions — you can still create it, but “Read backend depots” and “Sync depot” will return 403.',
  'AppID {id} 已经被本地 App「{names}」用了 —— 再建一个就是两个本地 App 指着同一个 Steam App，构建会传到同一处。':
    'AppID {id} is already used by the local app “{names}” — creating another one means two local apps point at the same Steam app and builds land in the same place.',
  '改用它': 'Use that app',
  '去设置里配': 'Set it up in Settings',
  '用 steamcmd 再试一次': 'Try again with steamcmd',

  // —— NewAppWizard：平台表 ——
  '平台 ↑↓': 'Platform ↑↓',
  '拖动排序：从上到下就是 DepotID +1、+2… 的顺序':
    'Drag to reorder: top to bottom sets the DepotID +1, +2... order',
  '32 位和 ARM64 的 Depot 只有老项目才需要；新 App 一般只建 Windows 64 / macOS / Linux。':
    '32-bit and ARM64 depots are only needed by old projects; new apps usually just create Windows 64, macOS and Linux.',
  '{n} 个脚本': '{n} script|{n} scripts',
  '{n} 个目录': '{n} folder|{n} folders',
  '例如 MyGame 正式版': 'e.g. MyGame release',

  // —— NewAppWizard：描述 / 会创建 ——
  '脚本': 'Scripts',
  '目录': 'Folders',
  '＋ 脚本　': '+ Script ',
  '＋ 目录　': '+ Folder ',
  '展开': 'Expand',
  '收起': 'Collapse',
  'DepotID 有重复 —— 同一个 App 下每个 DepotID 必须不一样。':
    'Duplicate DepotIDs — every depot in the same app needs a different DepotID.',
  '创建中…': 'Creating...',
  '创建（{n} 个 Depot）': 'Create ({n} depot)|Create ({n} depots)',

  // —— 通用按钮 ——
  '取消': 'Cancel',
  '保存': 'Save',
  '保存中…': 'Saving...'
}
