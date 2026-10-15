import { contextBridge, ipcRenderer, webUtils } from 'electron'

/**
 * 渲染层唯一能碰到主进程的入口。
 * 只暴露具体能力，不暴露 ipcRenderer 本身。
 */

function subscribe(channel, handler) {
  const listener = (_e, payload) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
    setPassword: (pw) => ipcRenderer.invoke('cred:set', pw),
    clearPassword: () => ipcRenderer.invoke('cred:clear'),
    pickFolder: (current) => ipcRenderer.invoke('sdk:pickFolder', current)
  },

  sdk: {
    status: () => ipcRenderer.invoke('sdk:status'),
    scan: () => ipcRenderer.invoke('sdk:scan'),
    app: (dirName) => ipcRenderer.invoke('sdk:app', dirName),
    history: () => ipcRenderer.invoke('sdk:history'),
    log: (file) => ipcRenderer.invoke('sdk:log', file)
  },

  vdf: {
    setBranch: (dirName, branch) => ipcRenderer.invoke('vdf:setBranch', { dirName, branch })
  },

  app: {
    defaults: (q) => ipcRenderer.invoke('app:defaults', q || {}),
    create: (spec) => ipcRenderer.invoke('app:create', spec),
    update: (dirName, patch) => ipcRenderer.invoke('app:update', { dirName, patch }),
    updateDepot: (dirName, depotFile, patch) =>
      ipcRenderer.invoke('app:updateDepot', { dirName, depotFile, patch }),
    addDepot: (dirName, spec) => ipcRenderer.invoke('app:addDepot', { dirName, spec }),
    removeDepot: (dirName, depotFile) => ipcRenderer.invoke('app:removeDepot', { dirName, depotFile }),
    rename: (dirName, newName) => ipcRenderer.invoke('app:rename', { dirName, newName }),
    orphans: () => ipcRenderer.invoke('app:orphans'),
    adoptOrphans: (name) => ipcRenderer.invoke('app:adoptOrphans', { name }),
    ensureContentDir: (dirName, depotFile) =>
      ipcRenderer.invoke('app:ensureContentDir', { dirName, depotFile }),
    syncDepotRoots: (dirName, projectDir) =>
      ipcRenderer.invoke('app:syncDepotRoots', { dirName, projectDir }),
    previewDelete: (dirName) => ipcRenderer.invoke('app:previewDelete', { dirName }),
    delete: (dirName, deleteContent) => ipcRenderer.invoke('app:delete', { dirName, deleteContent }),
    openVdf: (dirName, depotFile) => ipcRenderer.invoke('app:openVdf', { dirName, depotFile }),
    publicName: (appId) => ipcRenderer.invoke('app:publicName', { appId }),
    knownApps: () => ipcRenderer.invoke('app:knownApps'),
    preflight: (dirName) => ipcRenderer.invoke('app:preflight', { dirName }),
    ignoreProblem: (dirName, text, on) =>
      ipcRenderer.invoke('app:ignoreProblem', { dirName, text, on })
  },

  /** 本地内容服务器：把构建写进 tools\ContentServer\htdocs，不上传 Steam */
  local: {
    status: () => ipcRenderer.invoke('local:status'),
    start: (port) => ipcRenderer.invoke('local:start', { port }),
    stop: () => ipcRenderer.invoke('local:stop'),
    devcfg: (port) => ipcRenderer.invoke('local:devcfg', { port }),
    enableDevcfg: (port) => ipcRenderer.invoke('local:enableDevcfg', { port }),
    open: () => ipcRenderer.invoke('local:open')
  },

  /** Steamworks 后台那几项 Depot 属性（本地 vdf 里没有），存在应用设置里 */
  meta: {
    setDepot: (depotId, meta) => ipcRenderer.invoke('meta:setDepot', { depotId, meta }),
    allDepots: () => ipcRenderer.invoke('meta:allDepots'),
    rememberAppId: (appId, name) => ipcRenderer.invoke('meta:rememberAppId', { appId, name })
  },

  /** 读后台真实数据 —— 有 Web API 密钥走密钥，没有就走 steamcmd + 已保存的账号 */
  steam: {
    setKey: (key) => ipcRenderer.invoke('api:setKey', key),
    clearKey: () => ipcRenderer.invoke('api:clearKey'),
    keyState: () => ipcRenderer.invoke('api:keyState'),
    testKey: () => ipcRenderer.invoke('api:testKey'),
    verifyApp: (dirName, via) => ipcRenderer.invoke('api:verifyApp', { dirName, via }),
    appDepots: (appId, via) => ipcRenderer.invoke('api:appDepots', { appId, via })
  },

  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  /** 拖进来的文件/文件夹：Electron 32 之后 File.path 没了，只能走 webUtils */
  drop: {
    pathFor: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
    analyze: (target) => ipcRenderer.invoke('drop:analyze', { target }),
    apply: (spec) => ipcRenderer.invoke('drop:apply', spec)
  },

  run: {
    check: (dirName) => ipcRenderer.invoke('run:check', { dirName }),
    build: (dirName, preview, password, local) =>
      ipcRenderer.invoke('run:build', { dirName, preview, password, local }),
    cancel: (runId) => ipcRenderer.invoke('run:cancel', runId),
    input: (runId, text) => ipcRenderer.invoke('run:input', { runId, text }),
    login: () => ipcRenderer.invoke('run:login'),
    list: () => ipcRenderer.invoke('run:list'),
    onData: (h) => subscribe('run:data', h),
    onPrompt: (h) => subscribe('run:prompt', h),
    onExit: (h) => subscribe('run:exit', h)
  },

  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },

  // 工具自身的更新（GitHub Releases）
  update: {
    info: () => ipcRenderer.invoke('update:info'),
    check: () => ipcRenderer.invoke('update:check'),
    download: (url, name) => ipcRenderer.invoke('update:download', { url, name }),
    install: (p) => ipcRenderer.invoke('update:install', { path: p }),
    openReleases: () => ipcRenderer.invoke('update:openReleases'),
    cleanup: () => ipcRenderer.invoke('update:cleanup'),
    onProgress: (h) => subscribe('update:progress', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
