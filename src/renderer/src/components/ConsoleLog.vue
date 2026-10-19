<script setup>
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import gsap from 'gsap'
import { state, clearLogs, cancelRun, answerPrompt, saveApp, submitGuardCode, cancelGuardPrompt } from '../store.js'
import { fmtClock } from '../format.js'
import { reducedMotion } from '../motion.js'
import { Check, TriangleAlert, ShieldAlert, LoaderCircle } from '@lucide/vue'

const verbose = computed(() => state.detail?.verbose === '1')
const verboseBusy = ref(false)

/** verbose 是写进 app vdf 的一个开关：打开后 steamcmd 会打印每个文件，日志会长很多 */
async function toggleVerbose() {
  verboseBusy.value = true
  try {
    await saveApp({ verbose: !verbose.value })
  } finally {
    verboseBusy.value = false
  }
}

const bodyEl = ref(null)
const autoScroll = ref(true)
const promptValue = ref('')
const promptEl = ref(null)
let animated = 0
let startedAt = null
let now = ref(Date.now())
let ticker = null

/* ---- 新行入场：只给「这次新增的」做动画，不重跑整屏 ---- */
watch(
  () => state.logs.length,
  async () => {
    await nextTick()
    const el = bodyEl.value
    if (!el) return
    const kids = Array.from(el.children)
    if (kids.length < animated) animated = 0 // 被清空过
    const fresh = kids.slice(animated)
    animated = kids.length
    if (!fresh.length || reducedMotion()) return
    gsap.fromTo(
      fresh.slice(-30),
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.22, ease: 'power2.out', stagger: 0.012, clearProps: 'transform' }
    )
    if (autoScroll.value) el.scrollTop = el.scrollHeight
  }
)

watch(
  () => state.running,
  (r) => {
    if (r) {
      startedAt = Date.now()
      clearInterval(ticker)
      ticker = setInterval(() => (now.value = Date.now()), 500)
    } else {
      clearInterval(ticker)
      ticker = null
    }
  }
)

onMounted(() => {
  const el = bodyEl.value
  if (el) el.scrollTop = el.scrollHeight
})

function onScroll() {
  const el = bodyEl.value
  if (!el) return
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function clear() {
  clearLogs()
  animated = 0
}

async function copyAll() {
  const text = state.logs.map((l) => `[${fmtClock(l.t)}] ${l.line}`).join('\n')
  await navigator.clipboard.writeText(text)
}

async function submitPrompt() {
  const v = promptValue.value
  if (!v) return
  promptValue.value = ''
  await answerPrompt(v)
}

/* ---- 构建失败在「要 Steam Guard 验证码」上时补一个码 ---- */
const guardValue = ref('')
const guardEl = ref(null)

async function submitGuard() {
  const v = guardValue.value.trim()
  if (!v) return
  guardValue.value = ''
  await submitGuardCode(v)
}

watch(
  () => state.askGuard,
  async (g) => {
    if (g && !state.running) {
      await nextTick()
      guardEl.value?.focus()
    }
  }
)

/** 上传成功后一键跳到 Steamworks 的构建页，省得自己找 */
function openBuildsPage() {
  const id = state.uploaded?.appId || state.detail?.appId
  if (id) window.api.shell.openExternal(`https://partner.steamgames.com/apps/builds/${id}`)
}

watch(
  () => state.prompt,
  async (p) => {
    if (p && p.kind !== 'mobile-confirm') {
      await nextTick()
      promptEl.value?.focus()
    }
  }
)

const elapsed = computed(() => {
  if (!startedAt) return ''
  const s = Math.floor(((state.running ? now.value : startedAt) - startedAt) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const exitTone = computed(() => {
  if (!state.lastExit) return null
  return state.lastExit.code === 0 ? 'ok' : 'bad'
})
</script>

<template>
  <!-- 固定高度：日志再长也不把整页撑高，自己在框里滚 -->
  <section class="card overflow-hidden flex flex-col min-w-0 h-[460px]" v-reveal="{ delay: 0.08 }">
    <div v-if="state.running" class="scanline" />

    <header class="px-5 py-3 flex items-center gap-2.5 border-b border-line shrink-0">
      <h2 class="text-[13px] font-semibold tracking-tight m-0">构建输出</h2>

      <span v-if="state.running" class="pill pill-warn">
        <span class="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
        {{ state.runKind === 'check' ? '检查配置中' : '上传中' }} · {{ elapsed }}
      </span>
      <span v-else-if="state.lastExit" class="pill" :class="exitTone === 'ok' ? 'pill-ok' : 'pill-bad'">
        退出码 {{ state.lastExit.code }}
      </span>
      <span v-else class="text-[11.5px] text-faint">还没有运行过</span>

      <span class="ml-auto num text-[11px] text-faint">{{ state.logs.length }} 行</span>

      <label
        class="flex items-center gap-1.5 text-[11.5px] text-faint cursor-pointer select-none"
        title="打开后 steamcmd 会逐个文件打印，日志会长很多 —— 排查「到底传了哪些文件」时才需要"
      >
        <input
          type="checkbox"
          :checked="verbose"
          :disabled="verboseBusy || !state.detail"
          class="accent-[#66c0f4]"
          @change="toggleVerbose"
        />
        详细日志
      </label>

      <label class="flex items-center gap-1.5 text-[11.5px] text-faint cursor-pointer select-none">
        <input type="checkbox" v-model="autoScroll" class="accent-[#66c0f4]" />
        自动滚动
      </label>

      <button class="btn h-7 px-2.5 text-[11.5px] no-drag" :disabled="!state.logs.length" @click="copyAll">
        复制
      </button>
      <button class="btn h-7 px-2.5 text-[11.5px] no-drag" :disabled="!state.logs.length" @click="clear">
        清空
      </button>
      <button v-if="state.running" class="btn btn-danger h-7 px-2.5 text-[11.5px] no-drag" @click="cancelRun">
        中止
      </button>
    </header>

    <!-- 需要用户输入（密码 / Steam Guard） -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.prompt"
        class="px-5 py-2.5 border-b border-[rgba(255,180,84,.24)] bg-[rgba(255,180,84,.06)] flex items-center gap-3 shrink-0"
      >
        <TriangleAlert :size="16" :stroke-width="1.9" class="text-amber shrink-0" />
        <span class="text-[12.5px] text-amber">{{ state.prompt.hint }}</span>
        <!-- 手机确认那条不用输任何东西，去手机上点就行 —— 别摆一个让人以为要打字的框 -->
        <template v-if="state.prompt.kind === 'mobile-confirm'">
          <LoaderCircle :size="15" class="text-amber shrink-0 drop-spin" />
          <span class="text-[11.5px] text-faint">等你在手机上点确认…（盾牌图标 → 确认登录）</span>
        </template>
        <template v-else>
          <input
            ref="promptEl"
            v-model="promptValue"
            :type="state.prompt.kind === 'password' ? 'password' : 'text'"
            class="flex-1 max-w-[320px] h-8 px-3 rounded-lg bg-surface border border-line text-[13px] outline-none focus:border-[rgba(255,180,84,.5)]"
            placeholder="输入后回车"
            @keydown.enter="submitPrompt"
          />
          <button class="btn h-8 no-drag" @click="submitPrompt">提交</button>
        </template>
      </div>
    </Transition>

    <!-- 构建因为缺 Steam Guard 验证码失败：补一个码就能接着跑，不用重敲密码 -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.askGuard && !state.running"
        class="px-5 py-2.5 border-b border-[rgba(240,169,46,.24)] bg-[rgba(240,169,46,.06)] flex items-center gap-3 shrink-0 flex-wrap"
      >
        <ShieldAlert :size="16" :stroke-width="1.9" class="text-amber shrink-0" />
        <span class="text-[12.5px] text-amber">
          Steam 要 Steam Guard 验证码 —— 手机 Steam App 的「Steam 令牌」页或邮件里的那串码
        </span>
        <input
          ref="guardEl"
          v-model="guardValue"
          class="w-[150px] h-8 px-3 rounded-lg bg-surface border border-line text-[13px] tracking-[0.18em] num outline-none focus:border-[rgba(240,169,46,.5)]"
          placeholder="验证码"
          autocomplete="one-time-code"
          @keydown.enter="submitGuard"
        />
        <button class="btn h-8 no-drag" @click="submitGuard">带验证码重试</button>
        <button class="btn h-8 no-drag" @click="cancelGuardPrompt">取消</button>
      </div>
    </Transition>

    <!-- 上传成功后：还差「设为 live」这一步 -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.uploaded"
        class="px-5 py-2.5 border-b border-[rgba(74,222,128,.24)] bg-[rgba(74,222,128,.06)] flex items-center gap-3 shrink-0"
      >
        <Check :size="16" :stroke-width="2.4" class="text-success shrink-0" />
        <span class="text-[12.5px] text-success">
          上传成功。还差一步：去 Steamworks 把这次构建设为 live（分支由 SetLive 决定）。
        </span>
        <div class="flex-1" />
        <button class="btn h-8 no-drag" @click="openBuildsPage">打开构建页</button>
        <button class="btn h-8 no-drag" @click="state.uploaded = null">知道了</button>
      </div>
    </Transition>

    <div
      ref="bodyEl"
      class="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 py-3 bg-[#080b10] select-text"
      @scroll="onScroll"
    >
      <div v-for="(l, i) in state.logs" :key="i" class="log-line">
        <span class="log-ts">{{ fmtClock(l.t) }}</span>
        <span :class="`log-${l.stream}`">{{ l.line }}</span>
      </div>

      <div
        v-if="!state.logs.length"
        class="h-full grid place-items-center text-[12px] text-faint"
      >
        点「检查配置」或「Preview 空跑」开始
      </div>
    </div>
  </section>
</template>
