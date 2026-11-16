/**
 * 小的确认/管理弹窗：BranchManageDialog / DeleteAppDialog / ClearAchievementsDialog /
 * ForgetDialog / AdoptOrphansDialog
 *
 * 「再点一次确认」的文案保留警示语气，别写成普通确认。
 */
export default {
  // —— BranchManageDialog：后台 / 本机分支状态 ——
  '管理分支': 'Manage branches',
  '还没选 App': 'No app selected',
  '后台分支读取中…': 'Loading backend branches...',
  '后台 {n} 个分支': '{n} backend branch|{n} backend branches',
  '后台没有 beta 分支': 'No beta branches in the backend',
  '后台读取失败：{error}': 'Failed to read the backend: {error}',
  '没有 Web API 密钥，读不到后台分支': 'No Web API key, so backend branches cannot be read',
  '后台分支未读取': 'Backend branches not loaded',
  '当前 SetLive': 'Current SetLive',
  '后台': 'Backend',
  '仅本机': 'Local only',
  '本机记录': 'Local record',
  '后台 BuildID {id}': 'Backend BuildID {id}',

  // —— BranchManageDialog：增删与报错 ——
  '新分支名': 'New branch name',
  '分支名，例如 qa / internal': 'Branch name, e.g. qa / internal',
  '添加': 'Add',
  '删除': 'Delete',
  '先切走当前 SetLive，再删这条本机记录': 'Switch away from the current SetLive before deleting this local record',
  '只删本机记录，不影响后台': 'Deletes the local record only — the backend is not affected',
  '这个分支已经在列表里了': 'That branch is already in the list',
  '还没有记录过分支': 'No branches recorded yet',
  '设置还没加载好，稍后再试': 'Settings are still loading — try again shortly',
  '保存失败': 'Save failed',
  '保存失败：{error}': 'Save failed: {error}',
  '只管理本机记录；后台分支由 Steamworks 决定':
    'Local records only; backend branches are managed by Steamworks',

  // —— DeleteAppDialog ——
  '删除 App「{name}」': 'Delete app “{name}”',
  '不可撤销。Steam 上已传的构建不受影响。':
    'This cannot be undone. Builds already uploaded to Steam are not affected.',
  '正在统计要删的东西…': 'Measuring what will be deleted...',
  '一定会删': 'Always deleted',
  '构建脚本目录': 'Build script folder',
  '{n} 个文件 · {size}': '{n} file · {size}|{n} files · {size}',
  '{n} 个 · {size}': '{n} file · {size}|{n} files · {size}',
  '包含 app_{id}.vdf 和所有 depot 脚本。以后再想要这个版本，得重新建一遍。':
    'Contains app_{id}.vdf and all depot scripts. If you need this app again later, you will have to recreate it.',
  '可选': 'Optional',
  '内容目录': 'Content folder',
  '同时删除下面的内容目录': 'Also delete the content folders below',
  '（游戏构建产物，删了要重新打包，确认不需要了再勾）':
    '(game build output — deleting it means repackaging, so check this only if you are sure)',
  '不存在': 'Missing',
  '不在设置里的 buildsRoot 之内，为安全起见不会删':
    'Outside the buildsRoot from settings — will not be deleted for safety',
  '跳过（不在 buildsRoot 内）': 'Skipped (outside buildsRoot)',
  '没有可删的内容目录，所以这次只会删脚本。':
    'No deletable content folders, so only the scripts will be deleted.',
  '再点一次底下那个红色按钮才会真的删。改勾选或关掉窗口都会取消。':
    'Click the red button below again to really delete. Changing the checkbox or closing the window cancels this.',
  'Steam 后台的 App / Depot 不受影响': 'Apps and depots in the Steamworks backend are not affected',
  '取消': 'Cancel',
  '删除中…': 'Deleting...',
  '确认删除（{n}）': 'Confirm delete ({n})',
  '删除这个 App': 'Delete this app',

  // —— ClearAchievementsDialog ——
  '清空成就': 'Clear achievements',
  '让本机 Steam 客户端执行 reset_all_stats，把当前登录账号在这个 App 下的成就和统计一起重置。':
    'Runs reset_all_stats in the local Steam client to reset the achievements and stats for the currently signed-in account in this app.',
  '不联网，也不需要 Web API 密钥。': 'Works offline and needs no Web API key.',
  '已清空 {name} 的 Steam 成就': 'Cleared Steam achievements for {name}',
  '清的是本机 Steam 客户端当前登录的账号。Steam 里的显示可能慢一步 —— 重启游戏或等一会儿再看。':
    'Only the account currently signed in to the local Steam client is affected. Steam may take a moment to show the change — restart the game or check again shortly.',
  /* 这句中间夹着 <strong>，拆成三段翻：中文原文拼起来和原来一字不差 */
  '清的是': 'Clears achievements for ',
  '本机 Steam 客户端当前登录的账号': 'the account currently signed in to the local Steam client',
  '的成就。': '.',
  '工具不需要密码，也不会上传任何东西。': 'No password is needed, and nothing is uploaded.',
  '再点一次下面那个红色按钮才会真的清空。关掉窗口就取消。':
    'Click the red button below again to really clear. Closing the window cancels this.',
  '正在调用 Steam 控制台… 期间会短暂把 Steam 切到前台，清完自动切回来。':
    'Calling the Steam console... Steam is briefly brought to the foreground and switched back when it is done.',
  '如果 Steam 弹出了别的窗口，可能会失败，重试一次即可。':
    'If Steam opens another window this may fail — just retry once.',
  '重试': 'Retry',
  '确认清空（{n}）': 'Confirm clear ({n})',
  '清空全部成就': 'Clear all achievements',

  // —— ForgetDialog ——
  '忘记账号': 'Forget account',
  '清掉这台机器上所有的 Steam 登录痕迹，之后构建会重新问你要账号密码。':
    'Clears every trace of Steam login on this machine; the next build will ask for your account and password again.',
  '已清掉 {n} 项': 'Removed {n} item|Removed {n} items',
  '会处理这些：': 'These will be handled:',
  '正在检查…': 'Checking...',
  '再点一次下面那个红色按钮才会真的清。关掉窗口就取消。':
    'Click the red button below again to really clear. Closing the window cancels this.',
  '清空登录数据': 'Clear login data',

  // —— AdoptOrphansDialog ——
  '把游离的 vdf 收进一个 App': 'Adopt orphan vdf files into an app',
  'App 名字（新文件夹的名字）': 'App name (name of the new folder)',
  '例如 MyGame': 'e.g. MyGame',
  '会被搬走的文件': 'Files that will be moved',
  '只搬文件，不动磁盘上的游戏内容': 'Moves files only — game content on disk is untouched',
  '搬运中…': 'Moving...',
  '收拢': 'Adopt'
}
