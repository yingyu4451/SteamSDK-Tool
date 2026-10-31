<script setup>
import { computed, onMounted, ref, nextTick, watch } from 'vue'
import gsap from 'gsap'
import { Download, RefreshCw, Check, LoaderCircle, TriangleAlert } from '@lucide/vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'
import LoginConsole from './LoginConsole.vue'
import {
  state,
  onboardGo,
  onboardDetect,
  onboardPickFolder,
  onboardApplySdk,
  onboardSaveAccount,
  finishOnboard,
  onboardMode,
  goSettings,
  checkLogin
} from '../store.js'

const el = ref(null)
const o = computed(() => state.onboard)

useDialogA11y(el, () => {
  /* 新手教程允许跳过：Esc 等同「跳过教程」 */
  if (state.onboard?.open) finishOnboard()
}, { isOpen: () => !!o.value?.open })

const STEPS = ['欢迎', 'SDK 路径', 'Steam 账号']

const sdkOk = computed(() => !!state.sdk?.contentBuilderExists)
/** 'auto' = 选的是自动找到的那个；'manual' = 手动填的 */
const mode = computed(() => onboardMode())

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

/* ---- 登录检测：只在点「完成」的时候查一次 ----
 * 第三步刚开始不查、也不轮询。一进来就问，状态栏会先写成「还没检测到登录凭据」——
 * 用户什么都还没做就先吃一个否定结论，而且那个结论还可能马上就过期。 */

const lg = computed(() => state.login)

/** 一句话说清现在是什么状态，别让人猜为什么还没绿 */
const loginText = computed(() => {
  const l = lg.value
  if (l?.error) return '检查失败：' + l.error
  if (l?.steamcmd?.cached) {
    const who = l.steamcmd.account ? ` · ${l.steamcmd.account}` : ''
    return `已登录${who} —— steamcmd 记住了，以后构建不用再输密码`
  }
  if (l?.saved?.hasPassword) return '已保存密码，构建时会自动填'
  return '还没检测到登录凭据'
})

/** 点过一次「完成」之后才显示状态行 —— 没查过就别替用户下结论 */
const loginChecked = ref(false)

/** 手动一改，选中的来源就从「自动」变成「手动」，界面上的标记要立刻跟着走 */
function onManualInput(e) {
  o.value.manual = e.target.value
}

/** Steamworks SDK 只能从后台下（要登录），没有匿名直链 */
const openSdkDownload = () =>
  window.api.shell.openExternal('https://partner.steamgames.com/downloads/list')

onMounted(async () => {
  if (el.value) {
    gsap.fromTo(
      el.value,
      { opacity: 0, y: 20, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: 'power3.out', clearProps: 'transform,opacity' }
    )
  }
  await nextTick()
  if (!o.value.candidates.length) onboardDetect()
})

/** 点「完成」之后的验证过程：idle → checking → ok / fail */
const checkPhase = ref('idle')

/** 教程第三步改用内置登录控制台（node-pty）：登录成功关掉控制台后自动完成本步 */
const loginConsoleOpen = ref(false)

/** 打开控制台前先要求填账号，顺手把账号存进设置 */
async function openTutorialLogin() {
  const acct = String(o.value.account || '').trim()
  if (!acct) {
    o.value.error = '先填要登录的 Steam 账号名（不是邮箱）'
    return
  }
  o.value.error = ''
  await onboardSaveAccount()
  loginConsoleOpen.value = true
}

/* 控制台关掉后复查一次登录状态：绿了就自动结束教程，没绿就停在这一步让人再来一次 */
watch(loginConsoleOpen, async (open) => {
  if (open) return
  checkPhase.value = 'checking'
  loginChecked.value = true
  try {
    const l = await checkLogin()
    if (l?.ready) {
      checkPhase.value = 'ok'
      await new Promise((r) => setTimeout(r, 1200))
      await finishOnboard()
    } else {
      checkPhase.value = 'fail'
    }
  } finally {
    if (checkPhase.value === 'checking') checkPhase.value = 'idle'
  }
})

/* 这个组件在 App.vue 里是一直挂着的，只有里面那层 div 跟着 open 开关 ——
 * 所以 checkPhase 会活到下一次打开。上一次「验证通过」留下的 ok 会把
 * 主按钮永久禁用，从手册重新进来就卡在第一步动不了。每次打开都清一次。 */
watch(
  () => o.value.open,
  (open) => {
    if (open) {
      checkPhase.value = 'idle'
      loginChecked.value = false
      machineLogin.value = null
      overrideLogin.value = false
      if (o.value.step === 2) probeMachineLogin()
    }
  }
)

/* ---- 一进第三步就先看一眼：这台机器是不是已经登录过了 ----
 * 已经登录过的人不该再被要求填一遍账号密码 —— 查到了就直接把结论摆出来。
 * 查不到则什么都不说，只显示输入框：一进门先吃一个否定结论很讨厌。 */
const machineLogin = ref(null)
const machineChecking = ref(false)
/** 已登录，但用户点了「换个账号」要覆盖 */
const overrideLogin = ref(false)

async function probeMachineLogin() {
  if (machineChecking.value) return
  machineChecking.value = true
  machineLogin.value = null
  try {
    machineLogin.value = await checkLogin()
  } finally {
    machineChecking.value = false
  }
}

watch(
  () => o.value.step,
  (s) => {
    if (s === 2) probeMachineLogin()
  }
)

/** 已经登录过、且用户没要求换账号 → 这一步没什么可填的 */
const alreadyIn = computed(() => !!machineLogin.value?.ready && !overrideLogin.value)

/** 状态行只在「正在验证」或「验证过」的时候出现 —— 没查过就不替用户下结论 */
const rowShow = computed(() => checkPhase.value !== 'idle')
const rowTone = computed(() =>
  checkPhase.value === 'checking' ? 'busy' : checkPhase.value === 'ok' ? 'ok' : 'bad'
)
const rowText = computed(() => {
  if (checkPhase.value === 'checking') return '正在验证登录状态…'
  if (checkPhase.value === 'ok') return '登录成功 —— steamcmd 已经记住这个账号，构建不用再输密码'
  return '还没检测到登录凭据。点「打开登录控制台」在终端里输密码 / 手机确认，成功关掉后这里会自动变绿'
})
const btnText = computed(() => {
  if (o.value.step !== 2) return '下一步'
  if (checkPhase.value === 'checking') return '正在验证…'
  if (checkPhase.value === 'ok') return '验证通过'
  return '完成'
})

async function next() {
  const step = o.value.step
  if (step === 1 && !sdkOk.value) {
    const ok = await onboardApplySdk(o.value.manual)
    if (!ok) return
  }
  if (step === 2) {
    if (checkPhase.value === 'checking') return
    if (alreadyIn.value) {
      checkPhase.value = 'ok'
      await new Promise((r) => setTimeout(r, 1700))
      await finishOnboard()
      return
    }
    await openTutorialLogin()
    return
  }
  onboardGo(step + 1)
}

async function pickAndApply() {
  const r = await onboardPickFolder()
  if (r?.ok && r.path) await onboardApplySdk(r.path)
}

function useCandidate(c) {
  o.value.manual = c.root
  onboardApplySdk(c.root)
}

function skip() {
  finishOnboard()
}
</script>

<template>
  <Transition name="overlay">
  <div v-if="o.open" class="fixed inset-0 z-[70] grid place-items-center p-6 no-drag">
    <div class="absolute inset-0 bg-black/25" />

    <div ref="el" role="dialog" aria-modal="true" aria-label="新手教程" class="relative card s-modal w-full max-w-155 overflow-hidden">
      <!-- 步骤条 -->
      <div class="flex items-center gap-2 px-6 pt-5">
        <button
          v-for="(name, i) in STEPS"
          :key="name"
          class="flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer"
          @click="onboardGo(i)"
        >
          <span
            class="w-6 h-6 grid place-items-center rounded-full text-micro font-semibold transition-colors"
            :class="
              i === o.step
                ? 'bg-accent text-base'
                : i < o.step
                  ? 'bg-accent/18 text-accent'
                  : 'bg-surface-3 text-faint'
            "
          >
            {{ i + 1 }}
          </span>
          <span class="text-label" :class="i === o.step ? 'text-ink' : 'text-faint'">{{ name }}</span>
          <span v-if="i < STEPS.length - 1" class="w-6 h-px bg-line mx-1" />
        </button>
        <button class="ml-auto btn btn-sm px-3 " @click="skip">跳过教程</button>
      </div>

      <div class="px-6 py-5">
        <!-- ── 0 欢迎 ── -->
        <template v-if="o.step === 0">
          <div class="flex items-center gap-3.5 mb-3">
            <svg viewBox="0 0 256 256" class="w-11 h-11 shrink-0">
              <defs>
                <linearGradient id="ob-bg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#2f516e" />
                  <stop offset="1" stop-color="#121a24" />
                </linearGradient>
              </defs>
              <rect width="256" height="256" rx="54" fill="url(#ob-bg)" />
              <rect x="3" y="3" width="250" height="250" rx="51" fill="none" stroke="#66c0f4" stroke-opacity=".3" />
              <path d="M119 40h18v110h-18z" fill="#eaf6ff" />
              <path d="M96 74h64l-32-52z" fill="#eaf6ff" />
              <path d="M128 118 186 152 128 186 70 152z" fill="#8fd4fa" />
              <path d="M70 152 128 186v50L70 202z" fill="#3f92c9" />
              <path d="M186 152 128 186v50l58-34z" fill="#245c8c" />
            </svg>
            <div>
              <h2 class="text-title font-semibold m-0">SteamSDK 上传工作台</h2>
              <p class="text-label text-muted mt-1 mb-0">
                一份 SDK 管所有 App / Depot / 版本，不用给每个版本复制一份 SDK。
              </p>
            </div>
          </div>

          <div class="card-flat p-4 flex flex-col gap-2.5 mt-4">
            <div class="flex gap-2.5 text-body">
              <span class="text-accent shrink-0">①</span>
              <span class="text-muted"
                >告诉它你的 <span class="text-ink">SteamSDK 在哪</span>，它就能读到你配好的 App 和 Depot</span
              >
            </div>
            <div class="flex gap-2.5 text-body">
              <span class="text-accent shrink-0">②</span>
              <span class="text-muted"
                >填一次 <span class="text-ink">Steam 账号</span>，之后检查配置、空跑、正式上传都在界面里点</span
              >
            </div>
            <div class="flex gap-2.5 text-body">
              <span class="text-accent shrink-0">③</span>
              <span class="text-muted"
                >一个 App 一个项目文件夹，下面按平台挂 Depot —— <span class="text-ink">一次构建全平台一起传</span></span
              >
            </div>
          </div>

          <p class="text-label text-faint mt-3.5 mb-0 leading-relaxed">
            用过的可以直接「跳过教程」，所有设置都在「设置」里，随时能改。
          </p>
        </template>

        <!-- ── 1 SDK 路径 ── -->
        <template v-else-if="o.step === 1">
          <div class="flex items-center gap-3">
            <h2 class="text-title font-semibold m-0">SteamSDK 路径</h2>
            <button
              class="ml-auto btn px-3 "
              :disabled="o.busy"
              title="重新扫一遍常见位置"
              @click="onboardDetect"
            >
              <RefreshCw :size="13" class="mr-1.5" :class="o.busy ? 'animate-spin' : ''" />
              {{ o.busy ? '正在找…' : '重新识别' }}
            </button>
          </div>

          <div
            v-if="o.candidates.length"
            class="mt-3.5 flex flex-col gap-1.5 rounded-card border p-3 transition-colors"
            :class="
              mode === 'auto'
                ? 'border-accent/45 bg-accent/5'
                : 'border-line bg-transparent'
            "
          >
            <div class="flex items-center gap-2">
              <span class="text-micro tracking-wider text-faint uppercase">自动找到的</span>
              <span v-if="mode === 'auto'" class="pill pill-ok">✓ 用的是这个</span>
            </div>
            <button
              v-for="c in o.candidates"
              :key="c.root"
              class="flex items-center gap-2.5 px-3 h-11 rounded-card border text-left transition-colors cursor-pointer"
              :class="
                same(o.manual, c.root)
                  ? 'border-accent/50 bg-accent/8'
                  : 'border-line bg-surface hover:border-rule'
              "
              @click="useCandidate(c)"
            >
              <Check v-if="same(o.manual, c.root)" :size="14" class="shrink-0 text-accent" />
              <span class="font-mono text-label text-ink break-all text-left">{{ c.root }}</span>
              <span v-if="c.hasSteamcmd" class="pill pill-ok ml-auto shrink-0">有 steamcmd</span>
              <span v-else class="pill pill-warn ml-auto shrink-0">缺 steamcmd</span>
            </button>
          </div>

          <div
            class="mt-4 flex flex-col gap-2 rounded-card border p-3 transition-colors"
            :class="
              mode === 'manual'
                ? 'border-accent/45 bg-accent/5'
                : 'border-line bg-transparent'
            "
          >
            <div class="flex items-center gap-2">
              <span class="text-micro tracking-wider text-faint uppercase">手动指定</span>
              <span v-if="mode === 'manual'" class="pill pill-ok">✓ 用的是这个</span>
            </div>
            <div class="flex gap-2">
              <input
                :value="o.manual"
                placeholder="D:\SteamSDK"
                class="flex-1 h-9 px-3 rounded-input bg-surface border text-body font-mono outline-none focus:border-accent/50 placeholder:text-faint"
                :class="mode === 'manual' ? 'border-accent/50' : 'border-line'"
                @input="onManualInput"
              />
              <button class="btn" @click="pickAndApply">选择…</button>
            </div>
          </div>

          <!-- 还没有 SDK 的人大概率就卡在这一步，给个直达入口 -->
          <div class="mt-3">
            <button
              class="btn px-3 "
              title="打开 Steamworks 官方下载页。要登录有该 App 权限的 Steamworks 账号，没有匿名直链"
              @click="openSdkDownload"
            >
              <Download :size="13" class="mr-1.5" /> 下载 Steamworks SDK
            </button>
            <p class="mt-2 mb-0 text-micro text-faint">
              官方 SDK 里没有 build.ps1 / check.ps1 —— 这是本工具自带的，选好路径后会自动写进 ContentBuilder。
            </p>
          </div>
        </template>

        <!-- ── 2 Steam 账号 ── -->
        <template v-else>
          <h2 class="text-title font-semibold m-0">Steam 账号</h2>

          <!-- 一进来就查到已经登录过：直接给结论，不用再填一遍 -->
          <div
            v-if="alreadyIn"
            class="mt-3.5 rounded-card border border-success/30 bg-success/[0.07] px-3.5 py-3"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <Check :size="15" class="shrink-0 text-success" />
              <span class="text-body font-semibold text-success">已完成登录</span>
              <span
                v-if="machineLogin?.steamcmd?.account"
                class="font-mono text-label text-muted"
              >
                {{ machineLogin.steamcmd.account }}
              </span>
            </div>
            <p class="mt-1.5 mb-0 text-label text-muted leading-relaxed">
              steamcmd 里存着这个账号的登录令牌，构建不用再输密码。直接点「完成」就行。
            </p>
            <button
              class="mt-2 text-label text-faint hover:text-muted bg-transparent border-0 p-0 cursor-pointer underline decoration-dotted"
              @click="overrideLogin = true"
            >
              换个账号
            </button>
          </div>

          <!-- 没登录过（或者用户要换账号）：才让人填 -->
          <template v-else>
          <p class="text-label text-muted mt-1.5 mb-0 leading-relaxed">
            <template v-if="machineChecking">正在看这台机器登录过没有…</template>
            <template v-else>
              steamcmd 要用它上传构建，也用来读你后台配好的 Depot 列表。
              <span class="text-ink">不需要 Steamworks 管理员</span>。
            </template>
          </p>

          <div class="mt-3.5 flex flex-col gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-label text-muted">账号名（不是邮箱）</span>
              <input
                :value="o.account"
                placeholder="例如 my_steam_login"
                class="h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-accent/50 placeholder:text-faint"
                @input="o.account = $event.target.value"
              />
            </label>
            <button
              class="btn btn-primary h-9"
              :disabled="o.busy || checkPhase === 'checking'"
              @click="openTutorialLogin"
            >
              打开登录控制台登录
            </button>
            <p class="text-micro text-faint m-0 leading-relaxed">
              控制台里跑的是 SDK 自带的 steamcmd：输密码 / 验证码都在里面，要求手机确认时会有提示。
              登录成功后关掉控制台，这一步会自动完成。
            </p>
          </div>

          <!-- 点「完成」之后才出现 —— 没查过就不替用户下结论。
               登录与否由主进程读 steamcmd 的 config.vdf 判断，不用用户自己打勾 -->
          <div
            v-if="rowShow"
            class="mt-3.5 rounded-card border px-3 py-2.5 flex items-start gap-2"
            :class="{
              'border-accent/34 bg-accent/7': rowTone === 'busy',
              'border-success/30 bg-success/[0.07]': rowTone === 'ok',
              'border-amber/28 bg-amber/6': rowTone === 'bad'
            }"
          >
            <LoaderCircle
              v-if="rowTone === 'busy'"
              :size="14"
              class="shrink-0 mt-0.5 text-accent drop-spin"
            />
            <Check v-else-if="rowTone === 'ok'" :size="14" class="shrink-0 mt-0.5 text-success" />
            <TriangleAlert v-else :size="14" class="shrink-0 mt-0.5 text-warn" />
            <span
              class="text-label leading-relaxed"
              :class="{
                'text-accent': rowTone === 'busy',
                'text-success': rowTone === 'ok',
                'text-warn': rowTone === 'bad'
              }"
            >
              {{ rowText }}
            </span>
          </div>

          </template>
        </template>

        <div
          v-if="o.error"
          class="mt-3 rounded-card border border-danger/30 bg-danger/7 px-3 py-2 text-label text-danger"
        >
          {{ o.error }}
        </div>
      </div>

      <footer class="px-6 py-4 border-t border-line flex items-center gap-2">
        <button
          v-if="o.step > 0"
          class="btn"
          :disabled="checkPhase === 'checking'"
          @click="onboardGo(o.step - 1)"
        >
          上一步
        </button>
        <button
          v-else
          class="text-label text-faint hover:text-muted bg-transparent border-0 p-0 cursor-pointer underline decoration-dotted"
          @click="goSettings(); finishOnboard()"
        >
          我自己去设置里配
        </button>
        <div class="flex-1" />
        <button v-if="o.step === 2" class="btn" :disabled="checkPhase === 'checking'" @click="skip">
          跳过
        </button>
        <button
          class="btn btn-primary"
          :disabled="o.busy || checkPhase === 'checking' || (o.step === 2 && checkPhase === 'ok')"
          @click="next"
        >
          <LoaderCircle v-if="checkPhase === 'checking'" :size="13" class="mr-1.5 drop-spin" />
          <Check v-else-if="o.step === 2 && checkPhase === 'ok'" :size="13" class="mr-1.5" />
          {{ btnText }}
        </button>
      </footer>
    </div>
  </div>
  </Transition>
  <LoginConsole :open="loginConsoleOpen" :account="o.account" @close="loginConsoleOpen = false" />
</template>
