<script setup>
import { ref, computed, onMounted } from 'vue'
import { state, rescan, openLogin } from '../store.js'

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

function openExternal(url) {
  window.api.shell.openExternal(url)
}
</script>

<template>
  <div class="p-5 flex flex-col gap-4 max-w-[900px]">
    <h1 class="text-[17px] font-semibold tracking-tight m-0">设置</h1>

    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0 -translate-y-1">
      <div
        v-if="message"
        class="rounded-[10px] px-4 py-2.5 text-[12.5px] border"
        :class="
          message.tone === 'ok'
            ? 'text-accent border-[rgba(46,230,197,.22)] bg-[rgba(46,230,197,.05)]'
            : 'text-danger border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)]'
        "
      >
        {{ message.text }}
      </div>
    </Transition>

    <!-- 路径 -->
    <section class="card p-5" v-reveal>
      <h2 class="text-[13px] font-semibold m-0">SDK 路径</h2>

      <div class="mt-3.5 flex gap-2">
        <input
          v-model="sdkDraft"
          class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] font-mono outline-none focus:border-[rgba(46,230,197,.45)]"
          placeholder="D:\SteamSDK"
        />
        <button class="btn no-drag" @click="pick">选择…</button>
      </div>

      <div class="mt-3.5 flex gap-2">
        <input
          v-model="accountDraft"
          class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] font-mono outline-none focus:border-[rgba(46,230,197,.45)]"
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
          class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(46,230,197,.45)]"
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

    <!-- Steamworks Web API -->
    <section class="card p-5" v-reveal="{ delay: 0.06 }">
      <div class="flex items-center gap-2">
        <h2 class="text-[13px] font-semibold m-0">Steamworks Web API 密钥</h2>
        <span
          class="px-2 py-[3px] rounded-full text-[10.5px] border"
          :class="
            keyState.has
              ? 'text-accent border-[rgba(46,230,197,.3)] bg-[rgba(46,230,197,.07)]'
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
          class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[12.5px] font-mono outline-none focus:border-[rgba(46,230,197,.45)] placeholder:text-faint"
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

    <!-- 关于 -->
    <section class="card p-5" v-reveal="{ delay: 0.08 }">
      <h2 class="text-[13px] font-semibold m-0">关于</h2>

      <div class="mt-3.5 flex gap-2 flex-wrap">
        <button class="btn no-drag" @click="openExternal('https://partner.steamgames.com/doc/sdk/uploading')">
          SteamPipe 文档
        </button>
        <button class="btn no-drag" @click="openExternal('https://partner.steamgames.com/apps/builds')">
          Steamworks 构建页
        </button>
      </div>
    </section>
  </div>
</template>
