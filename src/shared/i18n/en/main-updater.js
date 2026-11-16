/**
 * 主进程更新器：src/main/updater.js
 * 用法见 src/shared/i18n/core.js 顶部。键一律加引号。
 */
export default {
  // —— 检查更新（GitHub Releases）——
  '请求超时': 'Request timed out',
  '连不上 GitHub：{message}': "Can't reach GitHub: {message}",
  '仓库里还没有发布过 release。': 'This repository has no releases yet.',
  'GitHub 返回 {status}': 'GitHub returned {status}',
  'feed 里没找到 release 地址。': 'No release URL found in the feed.',
  '资产列表里没找到 .exe': 'No .exe found in the asset list',
  '没读到安装包地址（GitHub 的资产列表当时没返回）。过一会儿再点一次「检查更新」。':
    "Couldn't get the installer URL (GitHub's asset list didn't respond). Click “Check for updates” again in a moment.",

  // —— 下载安装包 ——
  '下载失败：{message}': 'Download failed: {message}',
  '下载失败：GitHub 返回 {status}': 'Download failed: GitHub returned {status}',
  '下载超时（20 秒内没连上）': 'Download timed out (could not connect within 20 seconds)',
  '下载不完整（{got}/{total} 字节）': 'Incomplete download ({got}/{total} bytes)',
  '写文件失败：{message}': 'Failed to write the file: {message}',
  '下载中断：{message}': 'Download interrupted: {message}',

  // —— 安装 ——
  '安装包已经不在了，重新下载一次': 'The installer is gone — download it again',
  '起不来安装程序：{message}': "Couldn't start the installer: {message}",

  // —— 增量更新（electron-updater，仅诊断用）——
  '缓存里没有旧安装包': 'No previous installer in the cache',
  '旧块表 HTTP {status}': 'Old blockmap HTTP {status}',
  '旧块表内容不像 blockmap': "Old blockmap doesn't look like a blockmap",
  '没读到 latest.yml 里的版本号': 'Could not read the version from latest.yml'
}
