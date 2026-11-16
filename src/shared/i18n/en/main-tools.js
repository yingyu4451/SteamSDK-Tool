/**
 * 主进程检查/登录/落盘相关：preflight.js / login.js / dropzone.js / vdf-edit.js / vdf.js
 */
export default {
  // --- preflight.js：检查文件的问题标题 / 正文 / 建议 ---
  '…还有 {n} 个': '...and {n} more',
  '这个 Depot 没有内容目录': 'This depot has no content folder',
  '配置里写的内容目录不存在：{path}': 'The content folder in the config does not exist: {path}',
  '(空)': '(empty)',
  '把游戏构建输出到这个目录，或者在「编辑」里改成现有目录。没有内容目录就没法检查文件，也没法上传。':
    'Build the game into this folder, or point it at an existing one via “Edit”. Without a content folder there is nothing to check and nothing to upload.',
  '文件名里有 Windows 不允许的字符': 'File names contain characters Windows does not allow',
  '文件名不能带 < > : " | ? *，Steam 打包会直接失败。改名后重新检查；不想改名就把这些文件加到 Depot 的排除规则里。':
    'File names cannot contain < > : ? * or the pipe character — Steam packing fails outright. Rename them and check again, or add them to the depot’s exclusions.',
  '文件路径太长（超过 {max} 个字符）': 'File path too long (over {max} characters)',
  '{n} 字符：{path}': '{n} characters: {path}',
  '超过 {max} 个字符，玩家在 Windows 上解压会失败。把目录层级缩短一层，或者换个更浅的目录。':
    'Over {max} characters — players on Windows will fail to extract it. Shorten the folder nesting by one level, or move it to a shallower folder.',
  '单个文件/文件夹名太长（超过 {max} 个字符）': 'File or folder name too long (over {max} characters)',
  '改短这个名字后重新检查。': 'Shorten this name and check again.',
  '有文件只是大小写不同': 'Some files differ only in letter case',
  'Steam 区分大小写，但玩家在 Windows 上下载会撞成同一个文件，只剩一个。删掉或改名其中一个。':
    'Steam is case-sensitive, but on Windows these land on the same file and only one survives. Delete or rename one of them.',
  '有快捷方式式的文件（符号链接）': 'Some files are shortcuts (symlinks)',
  'Steam 上传时不保留符号链接，玩家下载到的可能是坏的或空文件。建议删掉或换成真实文件（macOS .app 里的符号链接属正常结构，已自动忽略）。':
    'Steam does not keep symlinks on upload, so players may get broken or empty files. Delete them or replace them with real files (symlinks inside a macOS .app are normal structure and already ignored).',
  '有 macOS 自动生成的垃圾文件': 'macOS left junk files in the build',
  '{n} 个，例如：{list}': '{n} found, e.g. {list}',
  '像 .DS_Store、._xxx、__MACOSX 这些是 macOS 顺手生成的，不属于游戏文件。在 Depot 的排除规则里加上 .DS_Store / ._* / __MACOSX 就能挡掉。':
    '.DS_Store, ._xxx, __MACOSX and the like are created by macOS, not part of the game. Add .DS_Store / ._* / __MACOSX to the depot’s exclusions to keep them out.',
  'macOS 程序包不完整（找不到可执行文件）': 'macOS app bundle is incomplete (no executable found)',
  '{path}（{n} 个文件，没有 Contents/MacOS 可执行文件）':
    '{path} ({n} file, no Contents/MacOS executable)|{path} ({n} files, no Contents/MacOS executable)',
  '确认这两个 .app 是完整的 macOS 程序，或者从 Depot 里去把它们排除掉。':
    'Make sure the .app bundles are complete macOS apps, or exclude them from the depot.',
  'macOS 程序包会按目录结构上传': 'macOS app bundles upload with their folder structure',
  '{name}（{n} 个文件{sym}）': '{name} ({n} file{sym})|{name} ({n} files{sym})',
  '，含 {n} 个符号链接': ', including {n} symlink|, including {n} symlinks',
  'App 的启动方式在 Steamworks 后台的「安装 → 启动选项」里指定（可写 Game.app/Contents/MacOS/Game）；现在的 SteamPipe 直接认 .app 目录，不需要再用 ContentPrep（Valve 已标记为废弃）。':
    'Set how the app launches under “Installation → Launch Options” in the Steamworks backend (you can point it at Game.app/Contents/MacOS/Game). SteamPipe now accepts .app folders directly, so ContentPrep (deprecated by Valve) is no longer needed.',
  '有不会被上传的空目录': 'Some empty folders will not be uploaded',
  '{n} 个：{list}': '{n} found: {list}',
  'Steam 只上传文件，空目录不会出现在玩家那边。这条只是说明，不影响上传，可以忽略。':
    'Steam uploads files only, so empty folders never reach players. This is informational and safe to ignore.',
  '这个 Depot 的脚本文件不存在': 'This depot’s script file is missing',
  'app 的 vdf 里引用了这个 depot 脚本，但 scripts 目录里没有它。补上脚本，或者从 app vdf 里删掉这一行。':
    'The app vdf references this depot script, but it is not in the scripts folder. Add the script back, or remove that line from the app vdf.',
  '找不到 Depot {id}': 'Depot {id} not found',
  // 列表分隔符：中文用「、」，英文用逗号
  '、': ', ',

  // --- dropzone.js：拖入 zip / 文件夹 ---
  '根下有 .app bundle': '.app bundle at the root',
  '有 UnityPlayer 的 .dylib': 'UnityPlayer .dylib found',
  '有 UnityPlayer.so': 'UnityPlayer.so found',
  '有可执行的 {name}': 'executable {name} found',
  '有 UnityPlayer.dll': 'UnityPlayer.dll found',
  '有 {name}': '{name} found',
  '有 *_Data 目录': '*_Data folder found',
  'Unity 构建（*_Data 目录）': 'Unity build (*_Data folder)',
  '{n} 个 .app bundle': '{n} .app bundle|{n} .app bundles',
  '文件夹名里有「{name}」': 'Folder name contains “{name}”',
  '只能自动解 .zip。{ext} 请先用 7-Zip 解开，再把文件夹拖进来。':
    'Only .zip can be extracted automatically. Unpack {ext} with 7-Zip first, then drag the folder in.',
  '正在解压…': 'Extracting...',
  '解压失败': 'Extraction failed',
  '没拿到路径': 'No path received',
  '找不到：{path}': 'Not found: {path}',
  '读不了：{message}': 'Cannot read: {message}',
  '正在统计文件…': 'Counting files...',
  '只能拖文件夹或者 .zip': 'Drag a folder or a .zip only',
  '{name} 不是压缩包。拖文件夹，或者 .zip。': '{name} is not an archive. Drag a folder, or a .zip.',
  '解压失败：{message}': 'Extraction failed: {message}',
  '没拿到要放进去的项目平台目录 —— 先在界面上选一个项目文件夹':
    'No target platform folder — pick a project folder in the UI first',
  '系统 + 架构组合出来是 {os}，和选的 {platform} 不一致':
    'OS + architecture resolves to {os}, which does not match the selected {platform}',
  '找不到要导入的文件夹：{path}': 'Import folder not found: {path}',
  '复制失败：{message}': 'Copy failed: {message}',
  '新建 Depot 失败': 'Could not create depot',
  '更新 Depot 内容目录失败': 'Could not update the depot content folder',

  // --- vdf-edit.js：Depot 语言回退值（语言表本身是模块加载时的常量，保持中文） ---
  '所有语言': 'All languages',

  // --- vdf-edit.js：架构标签（DEPOT_ARCH 是模块加载时的常量，渲染时 t(x.label) 现翻） ---
  '64 位': '64-bit',
  '32 位': '32-bit'
}
