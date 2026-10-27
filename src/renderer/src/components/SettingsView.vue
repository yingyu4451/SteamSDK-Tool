<script setup>
import { ref, computed, onMounted } from 'vue'
import { Download, ShieldOff, Wrench } from '@lucide/vue'
import {
  state,
  rescan,
  openLogin,
  openForget,
  checkUpdateNow,
  downloadUpdateNow,
  installUpdateNow,
  openReleases,
  zoomStep,
  zoomReset
} from '../store.js'

/** 当前界面缩放百分比，卡片上显示 */
const zoomPct = computed(() => Math.round((Number(state.zoom) || 1) * 100))

/** 官方 SDK 下载页。要 Steamworks 账号登录（就是上传构建那个），没有匿名直链 */
const SDK_DOWNLOAD = 'https://partner.steamgames.com/downloads/list'

const sdkDraft = ref('')
const accountDraft = ref('')
const passwordDraft = ref('')
const saving = ref(false)
const message = ref(null)

/* ---- Web API 密钥 ---- */
const apiKeyDraft = ref('')
const keyState = ref({ has: false, tail: '' })
const keyMsg = ref(null)
const testingKey = ref(false)

onMounted(async () => {
  sdkDraft.value = state.settings?.sdkRoot || ''
  accountDraft.value = state.settings?.account || ''
  keyState.value = await window.api.steam.keyState()
})

function flashKey(text, tone = 'ok') {
  keyMsg.value = { text, tone }
  setTimeout(() => (keyMsg.value = null), 6000)
}

async function saveKey() {
  const res = await window.api.steam.setKey(apiKeyDraft.value.trim())
  if (!res.ok) return flashKey(res.error, 'bad')
  apiKeyDraft.value = ''
  keyState.value = await window.api.steam.keyState()
  flashKey('密钥已用 DPAPI 加密保存')
}

async function clearKey() {
  await window.api.steam.clearKey()
  keyState.value = { has: false, tail: '' }
  flashKey('已清除密钥')
}

async function testKey() {
  testingKey.value = true
  try {
    const res = await window.api.steam.testKey()
    if (!res.ok) {
      flashKey(
        res.status === 401 || res.status === 403
          ? '密钥无效或权限不够（需要 Publisher 级别）'
          : res.error,
        'bad'
      )
      return
    }
    flashKey(`密钥可用，能看到 ${res.count} 个 App`)
  } finally {
    testingKey.value = false
  }
}

const checks = computed(() => {
  const s = state.sdk || {}
  return [
    { label: 'SDK 根目录', ok: s.sdkRootExists, path: s.sdkRoot },
    { label: 'ContentBuilder', ok: s.contentBuilderExists, path: s.contentBuilder },
    { label: 'scripts 目录', ok: s.scriptsDirExists, path: s.scriptsDir },
    { label: 'steamcmd.exe', ok: s.steamcmdExists, path: s.steamcmd },
    { label: 'build.ps1', ok: s.buildScriptExists, path: s.buildScript },
    { label: 'check.ps1', ok: s.checkScriptExists, path: s.checkScript },
    { label: 'output 目录', ok: s.outputDirExists, path: s.outputDir }
  ]
})

/* ---- 构建脚本 ----
 * build.ps1 / check.ps1 是工具自带的（官方 SDK 里没有这两文件）。启动和换 SDK 路径时
 * 主进程会自动补；补不上、或者 SDK 里那份和自带版本不一样时，这里给一颗写回的按钮。 */
const installingScripts = ref(false)
const scriptMsg = ref(null)

const scriptState = computed(() => {
  const s = state.sdk || {}
  const missing = s.missingScripts || []
  const stale = s.staleScripts || []
  const cbOk = !!s.contentBuilderExists
  // 安装包里没有自带脚本（或者两份不全）时别给一颗点不动的按钮，直接说清楚要重装。
  const bundled = s.scriptsBundled !== false
  const canInstall = cbOk && bundled
  return {
    missing,
    stale,
    canInstall,
    // ContentBuilder 都没有的时候是「SDK 路径不对」，不是脚本的问题，不显示这一行
    show: cbOk && (missing.length > 0 || stale.length > 0),
    hint: !bundled
      ? '这个安装包不完整（缺自带的 build.ps1 / check.ps1）—— 重新装一次工具'
      : missing.length
        ? `${missing.join(' / ')} 没写进去`
        : '脚本和工具自带的版本不一致',
    hintClass: !bundled || missing.length ? 'text-danger' : 'text-amber'
  }
})

async function repairScripts() {
  installingScripts.value = true
  scriptMsg.value = null
  try {
    const res = await window.api.sdk.installScripts()
    if (res?.status) state.sdk = res.status
    if (!res?.ok) {
      scriptMsg.value = { text: res?.error || '写入失败', tone: 'bad' }
      return
    }
    const n = (res.written || []).length
    scriptMsg.value = { text: n ? `已写入 ${n} 个脚本` : '脚本已是最新', tone: 'ok' }
    // 状态刷新后这一行会收起来，成功提示自己留 4 秒，别让按钮点完就「无影无踪」
    setTimeout(() => (scriptMsg.value = null), 4000)
  } catch (e) {
    scriptMsg.value = { text: e.message, tone: 'bad' }
  } finally {
    installingScripts.value = false
  }
}

function flash(text, tone = 'ok') {
  message.value = { text, tone }
  setTimeout(() => (message.value = null), 4000)
}

async function reloadSettings() {
  const s = await window.api.settings.get()
  state.settings = s.settings
  state.hasPassword = s.hasPassword
  state.encryptionAvailable = s.encryptionAvailable
  state.sdk = await window.api.sdk.status()
}

async function pick() {
  const res = await window.api.settings.pickFolder(sdkDraft.value)
  if (res.ok) sdkDraft.value = res.path
}

async function savePaths() {
  saving.value = true
  try {
    await window.api.settings.save({ sdkRoot: sdkDraft.value.trim() })
    await reloadSettings()
    await rescan()
    flash('路径已保存，检查已刷新')
  } finally {
    saving.value = false
  }
}

async function saveAccount() {
  const acct = accountDraft.value.trim()
  saving.value = true
  try {
    await window.api.settings.save({ account: acct })
    await reloadSettings()
    flash(acct ? '账号已保存' : '账号已清空')
  } finally {
    saving.value = false
  }
}

async function savePw() {
  if (!passwordDraft.value) return flash('密码为空', 'bad')
  const res = await window.api.settings.setPassword(passwordDraft.value)
  passwordDraft.value = ''
  if (!res.ok) return flash(res.error, 'bad')
  await reloadSettings()
  flash('密码已用 DPAPI 加密保存，只有当前 Windows 用户能解密')
}

/* ---- 工具自身的更新 ---- */

const u = computed(() => state.update)

const pct = computed(() => {
  const { got, total } = u.value
  if (!total) return 0
  return Math.min(100, Math.round((got / total) * 100))
})

function fmtSize(n) {
  const b = Number(n) || 0
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = b
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function openExternal(url) {
  window.api.shell.openExternal(url)
}
</script>

<template>
  <div class="p-5 max-w-[1200px]">
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">

      <!-- 左栏：路径 + 凭据 -->
      <div class="flex flex-col gap-4 min-w-0">
        <!-- 路径 -->
        <section class="card p-5" v-reveal>
          <h2 class="text-body font-semibold m-0">SDK 路径</h2>

          <div class="mt-3.5 flex gap-2">
            <input
              v-model="sdkDraft"
              class="flex-1 h-9 px-3 rounded-input bg-surface border border-line text-body font-mono outline-none focus:border-[rgba(102,192,244,.45)]"
              placeholder="D:\SteamSDK"
            />
            <button class="btn no-drag" @click="pick">选择…</button>
            <button class="btn btn-primary no-drag" :disabled="saving" @click="savePaths">保存</button>
          </div>

          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <button
              class="btn btn-sm px-2.5  no-drag"
              title="打开 Steamworks 官方下载页。要登录有该 App 权限的 Steamworks 账号，没有匿名直链"
              @click="openExternal(SDK_DOWNLOAD)"
            >
              <Download :size="13" class="mr-1.5" /> 下载 Steamworks SDK
            </button>
            <span v-if="!state.sdk?.sdkRootExists" class="text-micro text-amber">
              还没装 SDK —— 下完解压到任意目录，再把上面的路径指过去
            </span>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-1.5">
            <div v-for="c in checks" :key="c.label" class="flex items-start gap-2.5 text-label">
              <span class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" :class="c.ok ? 'bg-success' : 'bg-danger'" />
              <span class="w-[110px] shrink-0 pt-0.5" :class="c.ok ? 'text-muted' : 'text-danger'">{{ c.label }}</span>
              <span class="font-mono text-faint break-all min-w-0 flex-1">{{ c.path }}</span>
            </div>
          </div>

          <!-- build.ps1 / check.ps1 是工具自带的（官方 SDK 里没有这两个文件）：缺了会自动补，
               补不上、或者 SDK 里那份跟自带版本不一样时，在这里一键写回。 -->
          <div v-if="scriptState.show || scriptMsg" class="mt-2.5 flex items-center gap-2 flex-wrap">
            <button
              v-if="scriptState.show && scriptState.canInstall"
              class="btn btn-sm px-2.5  no-drag"
              :disabled="installingScripts"
              title="把工具自带的 build.ps1 / check.ps1 写进 SDK 的 tools\ContentBuilder（内容一样的不重写）"
              @click="repairScripts"
            >
              <Wrench :size="13" class="mr-1.5" />
              {{ installingScripts ? '写入中…' : '安装/修复脚本' }}
            </button>
            <span
              v-if="scriptMsg"
              class="text-micro"
              :class="scriptMsg.tone === 'bad' ? 'text-danger' : 'text-success'"
            >
              {{ scriptMsg.text }}
            </span>
            <span v-else class="text-micro" :class="scriptState.hintClass">{{ scriptState.hint }}</span>
          </div>
        </section>

        <!-- 凭据 -->
        <section class="card p-5" v-reveal="{ delay: 0.04 }">
          <div class="flex items-center gap-2.5">
            <h2 class="text-body font-semibold m-0">登录凭据</h2>
            <span class="pill" :class="state.hasPassword ? 'pill-ok' : 'pill-idle'">
              {{ state.hasPassword ? '已保存' : '未保存' }}
            </span>
            <span v-if="!state.encryptionAvailable" class="pill pill-bad">系统不支持加密存储</span>
          </div>

          <div class="mt-3.5 flex gap-2">
            <input
              v-model="accountDraft"
              class="flex-1 h-9 px-3 rounded-input bg-surface border border-line text-body font-mono outline-none focus:border-[rgba(102,192,244,.45)]"
              placeholder="Steam 构建账号名"
              @keydown.enter="saveAccount"
            />
            <button class="btn btn-primary no-drag" :disabled="saving" @click="saveAccount">保存</button>
          </div>

          <div class="mt-2.5 flex gap-2">
            <input
              v-model="passwordDraft"
              type="password"
              class="flex-1 h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-[rgba(102,192,244,.45)]"
              placeholder="Steam 账号密码"
              @keydown.enter="savePw"
            />
            <button class="btn no-drag" :disabled="!state.encryptionAvailable" @click="savePw">加密保存</button>
          </div>

          <div class="mt-3 pt-3 border-t border-line-soft flex items-center gap-2 flex-wrap">
            <button class="btn no-drag" @click="openLogin">打开登录窗口</button>
            <button class="btn btn-danger no-drag" @click="openForget">
              <ShieldOff :size="14" />
              忘记账号
            </button>
            <span class="text-micro text-faint">
              清掉 steamcmd 的登录令牌、用户档案和本机保存的密码
            </span>
          </div>
        </section>

      </div>

      <!-- 右栏：Web API 密钥 + 关于 -->
      <div class="flex flex-col gap-4 min-w-0">
        <!-- Steamworks Web API -->
        <section class="card p-5" v-reveal="{ delay: 0.06 }">
          <div class="flex items-center gap-2">
            <h2 class="text-body font-semibold m-0">Steamworks Web API 密钥</h2>
            <span
              class="px-2 py-[3px] rounded-full text-micro border"
              :class="
                keyState.has
                  ? 'text-accent border-[rgba(102,192,244,.3)] bg-[rgba(102,192,244,.07)]'
                  : 'text-faint border-line'
              "
            >
              {{ keyState.has ? `已保存 ····${keyState.tail}` : '未保存' }}
            </span>
          </div>

          <div class="mt-3 flex gap-2">
            <input
              v-model="apiKeyDraft"
              type="password"
              placeholder="32 位十六进制 Publisher 密钥"
              class="flex-1 h-9 px-3 rounded-input bg-surface border border-line text-body font-mono outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
            />
            <button class="btn no-drag" :disabled="!apiKeyDraft.trim()" @click="saveKey">加密保存</button>
            <button class="btn no-drag" :disabled="!keyState.has" @click="clearKey">清除</button>
          </div>

          <div class="mt-2.5 flex items-center gap-2 flex-wrap">
            <button class="btn no-drag" :disabled="!keyState.has || testingKey" @click="testKey">
              {{ testingKey ? '测试中…' : '测试密钥' }}
            </button>
            <button
              class="btn no-drag"
              @click="openExternal('https://partner.steamgames.com/apps/webapikeys')"
            >
              去后台取密钥
            </button>
            <span v-if="keyMsg" class="text-label" :class="keyMsg.tone === 'bad' ? 'text-danger' : 'text-accent'">
              {{ keyMsg.text }}
            </span>
          </div>

          <div class="mt-2.5 text-micro text-faint">
            需要 <span class="text-muted">Publisher</span> 级别（普通 App 管理员拿不到）。
          </div>
        </section>

        <!-- 界面缩放 -->
        <section class="card p-5" v-reveal="{ delay: 0.07 }">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-body font-semibold m-0">界面缩放</h2>
            <span class="pill num">{{ zoomPct }}%</span>
            <span class="ml-auto text-micro text-faint">Ctrl + = / − / 0</span>
          </div>
          <div class="mt-3 flex items-center gap-2 flex-wrap">
            <button class="btn no-drag" :disabled="zoomPct <= 80" @click="zoomStep(-1)">缩小</button>
            <button class="btn no-drag" @click="zoomReset()">100%</button>
            <button class="btn no-drag" :disabled="zoomPct >= 150" @click="zoomStep(1)">放大</button>
            <span class="text-label text-faint">整界面一起缩放，重开仍生效。</span>
          </div>
        </section>

        <!-- 关于 & 更新 -->
        <section class="card p-5" v-reveal="{ delay: 0.08 }">
          <div class="flex items-center gap-2.5 flex-wrap">
            <h2 class="text-body font-semibold m-0">关于</h2>
            <span class="pill">{{ u.current ? `v${u.current}` : '读取版本中…' }}</span>
            <span v-if="u.data?.hasUpdate" class="pill pill-warn">有新版本 v{{ u.data.latest }}</span>
            <span v-else-if="u.checked && u.data" class="pill pill-ok">已是最新</span>
            <button
              class="ml-auto btn btn-sm px-2.5  no-drag"
              :disabled="u.busy"
              @click="checkUpdateNow()"
            >
              {{ u.busy ? '检查中…' : '检查更新' }}
            </button>
          </div>

          <div v-if="u.error" class="mt-2.5 text-label text-amber">{{ u.error }}</div>

          <div
            v-if="u.data?.hasUpdate"
            class="mt-3 rounded-card border border-[rgba(255,180,84,.3)] bg-[rgba(255,180,84,.06)] p-3"
          >
            <div class="text-label text-muted">
              新版本 <b>v{{ u.data.latest }}</b>（当前 v{{ u.current }}）<template v-if="u.data.publishedAt">
                · {{ fmtDate(u.data.publishedAt) }}</template
              >
            </div>

            <pre
              v-if="u.data.notes"
              class="mt-2 mb-0 text-micro text-muted whitespace-pre-wrap max-h-[150px] overflow-y-auto scroll-thin font-sans"
              >{{ u.data.notes }}</pre
            >

            <div v-if="u.downloading" class="mt-2.5">
              <div class="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div class="h-full bg-accent transition-[width] duration-150" :style="{ width: pct + '%' }" />
              </div>
              <div class="mt-1.5 text-micro text-faint num">
                <template v-if="u.viaIncremental && u.estimate && (!u.total || u.total <= u.estimate * 1.2)">
                  增量下载 · {{ fmtSize(u.got) }} / {{ fmtSize(u.total || u.estimate)
                  }}<template v-if="u.fullSize">（全量 {{ fmtSize(u.fullSize) }}）</template> · {{ pct }}%
                </template>
                <template v-else>
                  {{ fmtSize(u.got) }} / {{ u.total ? fmtSize(u.total) : '未知大小' }} · {{ pct }}%
                </template>
              </div>
            </div>

            <div class="mt-2.5 flex items-center gap-2 flex-wrap">
              <button
                v-if="!u.ready"
                class="btn btn-primary px-3  no-drag"
                :disabled="u.downloading || !(u.data.asset || u.incremental)"
                :title="
                  u.data.asset || u.incremental
                    ? '下载新版安装包；装在系统里的版本会走增量下载'
                    : 'GitHub 这次没返回 release 的资产列表（刚发版时偶尔会这样）。过一会儿再点一次「检查更新」就有了，或者点「在 GitHub 上看」手动下载。'
                "
                @click="downloadUpdateNow()"
              >
                {{ u.downloading ? '下载中…' : u.data.asset || u.incremental ? '下载更新' : '没读到安装包' }}
              </button>
              <button v-else class="btn btn-primary px-3  no-drag" @click="installUpdateNow()">
                {{ u.portable ? '打开下载位置' : '重启并安装' }}
              </button>
              <button class="btn px-3  no-drag" @click="openReleases()">在 GitHub 上看</button>
            </div>

            <div v-if="!u.ready && !u.data.asset && !u.incremental" class="mt-2 text-micro text-faint">
              这次没读到 release 的安装包列表（刚发版时偶尔会这样）。过一会儿再点「检查更新」，或者点「在 GitHub 上看」手动下载。
            </div>
            <div v-if="u.ready && u.portable" class="mt-2 text-micro text-faint">
              便携版没有安装目录，也覆盖不了正在运行的自己。
              点「打开下载位置」，关掉工具，用新版替换掉你那个 exe 就行。
            </div>
            <div v-else-if="u.ready" class="mt-2 text-micro text-faint">
              {{ u.viaIncremental && u.differential ? '增量包已经下好了（只下了改动的部分）。' : '安装包已经下好了。' }}
              点「重启并安装」会关掉工具、起安装程序。
            </div>
          </div>

          <div class="mt-3.5 flex gap-2 flex-wrap">
            <button class="btn no-drag" @click="openExternal('https://partner.steamgames.com/doc/sdk/uploading')">
              SteamPipe 文档
            </button>
            <button class="btn no-drag" @click="openExternal('https://partner.steamgames.com/apps/builds')">
              Steamworks 构建页
            </button>
            <button class="btn no-drag" @click="openReleases()">GitHub 仓库</button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
