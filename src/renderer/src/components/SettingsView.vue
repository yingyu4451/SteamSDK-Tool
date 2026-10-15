<script setup>
import { ref, computed, onMounted } from 'vue'
import { Download } from '@lucide/vue'
import { state, rescan, openLogin, checkUpdateNow, downloadUpdateNow, installUpdateNow, openReleases } from '../store.js'

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
    const sdk = sdkDraft.value.trim()
    const acct = accountDraft.value.trim()
    // 账号留空时不要覆盖已有的值：半初始化的输入框一旦保存，
    // 会把账号写坏，后面所有构建都会登录失败。
    const patch = { sdkRoot: sdk }
    if (acct) patch.account = acct
    await window.api.settings.save(patch)
    await reloadSettings()
    await rescan()
    flash(acct ? '已保存，路径检查已刷新' : '已保存路径（账号为空，保留原值）')
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

async function clearPw() {
  await window.api.settings.clearPassword()
  await reloadSettings()
  flash('已清除保存的密码')
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
          <h2 class="text-[13px] font-semibold m-0">SDK 路径</h2>

          <div class="mt-3.5 flex gap-2">
            <input
              v-model="sdkDraft"
              class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] font-mono outline-none focus:border-[rgba(102,192,244,.45)]"
              placeholder="D:\SteamSDK"
            />
            <button class="btn no-drag" @click="pick">选择…</button>
          </div>

          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <button
              class="btn h-7 px-2.5 text-[11px] no-drag"
              title="打开 Steamworks 官方下载页。要登录有该 App 权限的 Steamworks 账号，没有匿名直链"
              @click="openExternal(SDK_DOWNLOAD)"
            >
              <Download :size="13" class="mr-1.5" /> 下载 Steamworks SDK
            </button>
            <span v-if="!state.sdk?.sdkRootExists" class="text-[11px] text-amber">
              还没装 SDK —— 下完解压到任意目录，再把上面的路径指过去
            </span>
          </div>

          <div class="mt-3.5 flex gap-2">
            <input
              v-model="accountDraft"
              class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] font-mono outline-none focus:border-[rgba(102,192,244,.45)]"
              placeholder="Steam 构建账号"
            />
            <button class="btn btn-primary no-drag" :disabled="saving" @click="savePaths">保存</button>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-1.5">
            <div v-for="c in checks" :key="c.label" class="flex items-center gap-2.5 text-[11.5px]">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="c.ok ? 'bg-success' : 'bg-danger'" />
              <span class="w-[110px] shrink-0" :class="c.ok ? 'text-muted' : 'text-danger'">{{ c.label }}</span>
              <span class="font-mono text-faint truncate" :title="c.path">{{ c.path }}</span>
            </div>
          </div>
        </section>

        <!-- 凭据 -->
        <section class="card p-5" v-reveal="{ delay: 0.04 }">
          <div class="flex items-center gap-2.5">
            <h2 class="text-[13px] font-semibold m-0">登录凭据</h2>
            <span class="pill" :class="state.hasPassword ? 'pill-ok' : 'pill-idle'">
              {{ state.hasPassword ? '已保存' : '未保存' }}
            </span>
            <span v-if="!state.encryptionAvailable" class="pill pill-bad">系统不支持加密存储</span>
          </div>

          <div class="mt-3.5 flex gap-2">
            <input
              v-model="passwordDraft"
              type="password"
              class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.45)]"
              placeholder="Steam 账号密码"
              @keydown.enter="savePw"
            />
            <button class="btn no-drag" :disabled="!state.encryptionAvailable" @click="savePw">加密保存</button>
            <button class="btn btn-danger no-drag" :disabled="!state.hasPassword" @click="clearPw">清除</button>
          </div>

          <div class="mt-3 pt-3 border-t border-line-soft">
            <div class="text-[11.5px] text-muted">
              更省事：先在控制台窗口里 <code class="text-accent">login {{ state.settings?.account || '<账号>' }}</code>
            </div>
            <button class="btn no-drag mt-2.5" @click="openLogin">打开登录窗口</button>
          </div>
        </section>

      </div>

      <!-- 右栏：Web API 密钥 + 关于 -->
      <div class="flex flex-col gap-4 min-w-0">
        <!-- Steamworks Web API -->
        <section class="card p-5" v-reveal="{ delay: 0.06 }">
          <div class="flex items-center gap-2">
            <h2 class="text-[13px] font-semibold m-0">Steamworks Web API 密钥</h2>
            <span
              class="px-2 py-[3px] rounded-full text-[10.5px] border"
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
              class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[12.5px] font-mono outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
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
            <span v-if="keyMsg" class="text-[11.5px]" :class="keyMsg.tone === 'bad' ? 'text-danger' : 'text-accent'">
              {{ keyMsg.text }}
            </span>
          </div>

          <div class="mt-2.5 text-[11px] text-faint">
            需要 <span class="text-muted">Publisher</span> 级别（普通 App 管理员拿不到）。
          </div>
        </section>

        <!-- 关于 & 更新 -->
        <section class="card p-5" v-reveal="{ delay: 0.08 }">
          <div class="flex items-center gap-2.5 flex-wrap">
            <h2 class="text-[13px] font-semibold m-0">关于</h2>
            <span class="pill">{{ u.current ? `v${u.current}` : '读取版本中…' }}</span>
            <span v-if="u.data?.hasUpdate" class="pill pill-warn">有新版本 v{{ u.data.latest }}</span>
            <span v-else-if="u.checked && u.data" class="pill pill-ok">已是最新</span>
            <button
              class="ml-auto btn h-7 px-2.5 text-[11.5px] no-drag"
              :disabled="u.busy"
              @click="checkUpdateNow()"
            >
              {{ u.busy ? '检查中…' : '检查更新' }}
            </button>
          </div>

          <div v-if="u.error" class="mt-2.5 text-[11.5px] text-amber">{{ u.error }}</div>

          <div
            v-if="u.data?.hasUpdate"
            class="mt-3 rounded-[10px] border border-[rgba(255,180,84,.3)] bg-[rgba(255,180,84,.06)] p-3"
          >
            <div class="text-[12px] text-[#d7c3a0]">
              新版本 <b>v{{ u.data.latest }}</b>（当前 v{{ u.current }}）<template v-if="u.data.publishedAt">
                · {{ fmtDate(u.data.publishedAt) }}</template
              >
            </div>

            <pre
              v-if="u.data.notes"
              class="mt-2 mb-0 text-[11px] text-muted whitespace-pre-wrap max-h-[150px] overflow-y-auto scroll-thin font-sans"
              >{{ u.data.notes }}</pre
            >

            <div v-if="u.downloading" class="mt-2.5">
              <div class="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div class="h-full bg-accent transition-[width] duration-150" :style="{ width: pct + '%' }" />
              </div>
              <div class="mt-1.5 text-[11px] text-faint num">
                {{ fmtSize(u.got) }} / {{ u.total ? fmtSize(u.total) : '未知大小' }} · {{ pct }}%
              </div>
            </div>

            <div class="mt-2.5 flex items-center gap-2 flex-wrap">
              <button
                v-if="!u.ready"
                class="btn btn-primary h-8 px-3 text-[11.5px] no-drag"
                :disabled="u.downloading || !u.data.asset"
                @click="downloadUpdateNow()"
              >
                {{ u.downloading ? '下载中…' : u.data.asset ? '下载更新' : '这个 release 里没有 .exe' }}
              </button>
              <button v-else class="btn btn-primary h-8 px-3 text-[11.5px] no-drag" @click="installUpdateNow()">
                {{ u.portable ? '打开下载位置' : '重启并安装' }}
              </button>
              <button class="btn h-8 px-3 text-[11.5px] no-drag" @click="openReleases()">在 GitHub 上看</button>
            </div>

            <div v-if="u.ready && u.portable" class="mt-2 text-[11px] text-faint">
              便携版没有安装目录，也覆盖不了正在运行的自己。
              点「打开下载位置」，关掉工具，用新版替换掉你那个 exe 就行。
            </div>
            <div v-else-if="u.ready" class="mt-2 text-[11px] text-faint">
              安装包已经下好了。点「重启并安装」会关掉工具、起安装程序。
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
