<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal, X } from '@lucide/vue'
import { toast } from '../store.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  account: { type: String, default: '' }
})
const emit = defineEmits(['close'])

const el = ref(null)
const outputEl = ref(null)
const inputEl = ref(null)
const text = ref('')
const input = ref('')
const status = ref('idle') // idle | running | mobile | exited
const sessionId = ref(null)
let offData = null
let offExit = null
let offMobile = null

const MAX_TEXT = 160000

function scrollToEnd() {
  const node = outputEl.value
  if (node) node.scrollTop = node.scrollHeight
}

/** PTY 输出里带 \r、退格和零散控制符，这里归一化成可读文本 */
function appendChunk(raw) {
  const chunk = String(raw ?? '')
  if (!chunk) return
  let next = text.value
  for (const ch of chunk) {
    if (ch === '\b') next = next.slice(0, -1)
    else if (ch === '\r') continue // 终端里 \r 多是「回到行首重写」，丢掉避免刷屏
    else if (ch === '\n') next += '\n'
    else if (ch === '\t') next += '  '
    else if (ch >= ' ') next += ch
  }
  text.value = next.length > MAX_TEXT ? next.slice(-MAX_TEXT) : next
  nextTick(scrollToEnd)
}

async function start() {
  text.value = ''
  status.value = 'running'
  sessionId.value = null
  const r = await api.login.consoleOpen(props.account || '')
  if (!r?.ok) {
    status.value = 'exited'
    text.value = `[无法启动内置控制台] ${r?.error || '未知错误'}\n\n可以退回设置页用「打开登录窗口」的外置窗口登录。\n`
    toast(r?.error || '内置控制台启动失败', 'bad')
    return
  }
  sessionId.value = r.id
  await nextTick()
  scrollToEnd()
  inputEl.value?.focus()
}

function stop() {
  api.login.consoleClose()
  sessionId.value = null
}

async function send() {
  if (!sessionId.value) {
    toast('控制台已经结束了', 'bad')
    return
  }
  const line = input.value
  input.value = ''
  await api.login.consoleInput(sessionId.value, line + '\r')
  inputEl.value?.focus()
}

async function sendCtrlC() {
  if (!sessionId.value) return
  await api.login.consoleInput(sessionId.value, '\u0003')
  inputEl.value?.focus()
}

function close() {
  emit('close')
}

useDialogA11y(el, close, { isOpen: () => props.open })

watch(
  () => props.open,
  async (on) => {
    if (on) await start()
    else stop()
  }
)

onMounted(() => {
  offData = api.login.onConsoleData(({ text: chunk }) => appendChunk(chunk))
  offMobile = api.login.onConsoleMobile(() => {
    status.value = 'mobile'
    toast('Steam 正在等你手机上点确认', 'warn')
  })
  offExit = api.login.onConsoleExit(({ code }) => {
    status.value = 'exited'
    sessionId.value = null
    appendChunk(`\n[steamcmd 已退出，退出码 ${code}]\n`)
  })
})

onBeforeUnmount(() => {
  offData?.()
  offExit?.()
  offMobile?.()
  stop()
})

const STATUS_TEXT = {
  idle: '未连接',
  running: '等待输入',
  mobile: '等待手机确认',
  exited: '已结束'
}
</script>

<template>
  <Transition name="overlay">
    <div v-if="open" class="fixed inset-0 z-[80] grid place-items-center p-6 no-drag">
      <div class="absolute inset-0 bg-black/25" @click="close" />

      <div
        ref="el"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-console-title"
        class="relative card s-modal w-full max-w-[920px] h-[74vh] overflow-hidden flex flex-col"
      >
        <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3 shrink-0">
          <Terminal :size="18" class="text-accent shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1">
            <h2 id="login-console-title" class="text-title font-semibold m-0">Steam 登录控制台</h2>
            <p class="mt-1 mb-0 text-label text-faint leading-relaxed">
              跑的就是 SDK 里的 steamcmd。已保存账号时会自动发 login 命令，密码 / 验证码在下面输入框回车发送。
            </p>
          </div>
          <span
            class="pill text-micro shrink-0"
            :class="
              status === 'mobile'
                ? 'pill-warn'
                : status === 'running'
                  ? 'pill-ok'
                  : status === 'exited'
                    ? 'pill-bad'
                    : 'pill-idle'
            "
          >
            {{ STATUS_TEXT[status] }}
          </span>
          <button class="link-btn shrink-0" title="关闭控制台" @click="close">
            <X :size="16" />
          </button>
        </header>

        <div
          v-if="status === 'mobile'"
          class="mx-5 mt-3 px-3 py-2 rounded-card border border-amber/35 bg-amber/8 text-label text-ink shrink-0"
        >
          <strong>Steam 正在等你手机上点确认</strong> —— 拿出手机打开 Steam App，点右下角盾牌图标里的「确认登录」。
          不用在下面输任何东西，确认完它自己会继续。
        </div>

        <pre
          ref="outputEl"
          class="flex-1 m-3 mx-5 p-3 rounded-card border border-line bg-[#05080c] text-[12px] leading-[1.55] font-mono text-[#c6d4df] overflow-y-auto scroll-thin whitespace-pre-wrap break-all"
          aria-live="polite"
        >{{ text || '正在启动 steamcmd…' }}</pre>

        <footer class="px-5 pb-4 pt-3 border-t border-line flex items-center gap-2 shrink-0">
          <input
            ref="inputEl"
            v-model="input"
            class="flex-1 h-9 px-3 rounded-input bg-surface border border-line text-body font-mono outline-none focus:border-accent/45 placeholder:text-faint"
            placeholder="输入密码 / 验证码 / steamcmd 命令，回车发送"
            :disabled="!sessionId"
            @keydown.enter.prevent="send"
          />
          <button class="btn" :disabled="!sessionId" @click="send">发送</button>
          <button class="btn" :disabled="!sessionId" title="发送 Ctrl+C 中断当前命令" @click="sendCtrlC">
            Ctrl+C
          </button>
          <button class="btn" @click="close">关闭</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>
