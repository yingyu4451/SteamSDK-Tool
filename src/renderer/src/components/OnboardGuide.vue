<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import gsap from 'gsap'
import { Download, RefreshCw, Check, LoaderCircle } from '@lucide/vue'
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
const STEPS = ['欢迎', 'SDK 路径', 'Steam 账号']

const sdkOk = computed(() => !!state.sdk?.contentBuilderExists)
/** 'auto' = 选的是自动找到的那个；'manual' = 手动填的 */
const mode = computed(() => onboardMode())

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

/* ---- 登录检测：进第三步查一次，之后每 2.5 秒查一次，点「完成」再查一次 ---- */

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

/** 点了一次「完成」但还没登录 —— 再点一次就跳过 */
const finishBlocked = ref(false)

let poll = null
function startPolling() {
  stopPolling()
  checkLogin()
  poll = setInterval(checkLogin, 2500)
}
function stopPolling() {
  if (poll) {
    clearInterval(poll)
    poll = null
  }
}

watch(
  () => [o.value.open, o.value.step],
  ([open, step]) => (open && step === 2 ? startPolling() : stopPolling()),
  { immediate: true }
)
// 一旦检测到登录成功，之前那次「再点一次」的拦截就作废
watch(
  () => lg.value?.ready,
  (v) => {
    if (v) finishBlocked.value = false
  }
)
onUnmounted(stopPolling)

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
      { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: 'power3.out' }
    )
  }
  await nextTick()
  if (!o.value.candidates.length) onboardDetect()
})

async function next() {
  const step = o.value.step
  if (step === 1 && !sdkOk.value) {
    const ok = await onboardApplySdk(o.value.manual)
    if (!ok) return
  }
  if (step === 2) {
    await onboardSaveAccount()
    // 点「完成」时再确认一次 —— 用户可能刚在控制台里登录完
    const l = await checkLogin()
    if (!l?.ready && !finishBlocked.value) {
      finishBlocked.value = true
      return
    }
    await finishOnboard()
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
  <div v-if="o.open" class="fixed inset-0 z-[70] grid place-items-center p-6 no-drag">
    <div class="absolute inset-0 bg-[rgba(9,13,19,.82)] backdrop-blur-sm" />

    <div ref="el" class="relative card w-full max-w-[620px] overflow-hidden">
      <!-- 步骤条 -->
      <div class="flex items-center gap-2 px-6 pt-5">
        <button
          v-for="(name, i) in STEPS"
          :key="name"
          class="flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer"
          @click="onboardGo(i)"
        >
          <span
            class="w-6 h-6 grid place-items-center rounded-full text-[11px] font-semibold transition-colors"
            :class="
              i === o.step
                ? 'bg-accent text-[#0d1a26]'
                : i < o.step
                  ? 'bg-[rgba(102,192,244,.18)] text-accent'
                  : 'bg-surface-3 text-faint'
            "
          >
            {{ i + 1 }}
          </span>
          <span class="text-[12px]" :class="i === o.step ? 'text-ink' : 'text-faint'">{{ name }}</span>
          <span v-if="i < STEPS.length - 1" class="w-6 h-px bg-line mx-1" />
        </button>
        <button class="ml-auto btn h-7 px-3 text-[11.5px]" @click="skip">跳过教程</button>
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
              <h2 class="text-[17px] font-semibold m-0">SteamSDK 上传工作台</h2>
              <p class="text-[12px] text-muted mt-1 mb-0">
                一份 SDK 管所有 App / Depot / 版本，不用给每个版本复制一份 SDK。
              </p>
            </div>
          </div>

          <div class="card-flat p-4 flex flex-col gap-2.5 mt-4">
            <div class="flex gap-2.5 text-[12.5px]">
              <span class="text-accent shrink-0">①</span>
              <span class="text-muted"
                >告诉它你的 <span class="text-ink">SteamSDK 在哪</span>，它就能读到你配好的 App 和 Depot</span
              >
            </div>
            <div class="flex gap-2.5 text-[12.5px]">
              <span class="text-accent shrink-0">②</span>
              <span class="text-muted"
                >填一次 <span class="text-ink">Steam 账号</span>，之后检查配置、空跑、正式上传都在界面里点</span
              >
            </div>
            <div class="flex gap-2.5 text-[12.5px]">
              <span class="text-accent shrink-0">③</span>
              <span class="text-muted"
                >一个 App 一个项目文件夹，下面按平台挂 Depot —— <span class="text-ink">一次构建全平台一起传</span></span
              >
            </div>
          </div>

          <p class="text-[11.5px] text-faint mt-3.5 mb-0 leading-relaxed">
            用过的可以直接「跳过教程」，所有设置都在「设置」里，随时能改。
          </p>
        </template>

        <!-- ── 1 SDK 路径 ── -->
        <template v-else-if="o.step === 1">
          <div class="flex items-center gap-3">
            <h2 class="text-[16px] font-semibold m-0">SteamSDK 路径</h2>
            <button
              class="ml-auto btn h-8 px-3 text-[11.5px]"
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
            class="mt-3.5 flex flex-col gap-1.5 rounded-lg border p-3 transition-colors"
            :class="
              mode === 'auto'
                ? 'border-[rgba(102,192,244,.45)] bg-[rgba(102,192,244,.05)]'
                : 'border-line bg-transparent'
            "
          >
            <div class="flex items-center gap-2">
              <span class="text-[11px] tracking-wider text-faint uppercase">自动找到的</span>
              <span v-if="mode === 'auto'" class="pill pill-ok">✓ 用的是这个</span>
            </div>
            <button
              v-for="c in o.candidates"
              :key="c.root"
              class="flex items-center gap-2.5 px-3 h-11 rounded-md border text-left transition-colors cursor-pointer"
              :class="
                same(o.manual, c.root)
                  ? 'border-[rgba(102,192,244,.5)] bg-[rgba(102,192,244,.08)]'
                  : 'border-line bg-surface hover:border-[#4a7ba6]'
              "
              @click="useCandidate(c)"
            >
              <Check v-if="same(o.manual, c.root)" :size="14" class="shrink-0 text-accent" />
              <span class="font-mono text-[12px] text-ink truncate">{{ c.root }}</span>
              <span v-if="c.hasSteamcmd" class="pill pill-ok ml-auto shrink-0">有 steamcmd</span>
              <span v-else class="pill pill-warn ml-auto shrink-0">缺 steamcmd</span>
            </button>
          </div>

          <div
            class="mt-4 flex flex-col gap-2 rounded-lg border p-3 transition-colors"
            :class="
              mode === 'manual'
                ? 'border-[rgba(102,192,244,.45)] bg-[rgba(102,192,244,.05)]'
                : 'border-line bg-transparent'
            "
          >
            <div class="flex items-center gap-2">
              <span class="text-[11px] tracking-wider text-faint uppercase">手动指定</span>
              <span v-if="mode === 'manual'" class="pill pill-ok">✓ 用的是这个</span>
            </div>
            <div class="flex gap-2">
              <input
                :value="o.manual"
                placeholder="D:\SteamSDK"
                class="flex-1 h-9 px-3 rounded-md bg-surface border text-[12.5px] font-mono outline-none focus:border-[rgba(102,192,244,.5)] placeholder:text-faint"
                :class="mode === 'manual' ? 'border-[rgba(102,192,244,.5)]' : 'border-line'"
                @input="onManualInput"
              />
              <button class="btn" @click="pickAndApply">选择…</button>
            </div>
          </div>

          <!-- 还没有 SDK 的人大概率就卡在这一步，给个直达入口 -->
          <div class="mt-3">
            <button
              class="btn h-8 px-3 text-[11.5px]"
              title="打开 Steamworks 官方下载页。要登录有该 App 权限的 Steamworks 账号，没有匿名直链"
              @click="openSdkDownload"
            >
              <Download :size="13" class="mr-1.5" /> 下载 Steamworks SDK
            </button>
          </div>
        </template>

        <!-- ── 2 Steam 账号 ── -->
        <template v-else>
          <h2 class="text-[16px] font-semibold m-0">Steam 账号</h2>
          <p class="text-[12px] text-muted mt-1.5 mb-0 leading-relaxed">
            steamcmd 要用它上传构建，也用来读你后台配好的 Depot 列表。
            <span class="text-ink">不需要 Steamworks 管理员</span>。
          </p>

          <div class="mt-3.5 flex flex-col gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-[11.5px] text-muted">账号名（不是邮箱）</span>
              <input
                :value="o.account"
                placeholder="例如 my_steam_login"
                class="h-9 px-3 rounded-md bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.5)] placeholder:text-faint"
                @input="o.account = $event.target.value"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[11.5px] text-muted">密码</span>
              <input
                :value="o.password"
                type="password"
                placeholder="留空就先不存"
                class="h-9 px-3 rounded-md bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.5)] placeholder:text-faint"
                @input="o.password = $event.target.value"
              />
            </label>
          </div>

          <p class="text-[11px] text-faint mt-2.5 mb-0 leading-relaxed">
            密码用 Windows DPAPI 加密后存在本机，只有当前 Windows 用户能解 ——
            不进命令行参数、不写进任何日志。不存也行，每次构建会问你要。
          </p>

          <!-- 登录成功与否由主进程读 steamcmd 的 config.vdf 判断，
               不用用户自己回来打勾 —— 状态变了这里自己就绿 -->
          <div
            class="mt-3.5 rounded-md border px-3 py-2.5 flex items-start gap-2"
            :class="
              lg?.ready
                ? 'border-[rgba(139,197,63,.3)] bg-[rgba(139,197,63,.07)]'
                : 'border-line bg-[rgba(9,15,23,.5)]'
            "
          >
            <component
              :is="lg?.ready ? Check : LoaderCircle"
              :size="14"
              class="shrink-0 mt-0.5"
              :class="lg?.ready ? 'text-success' : 'text-faint drop-spin-slow'"
            />
            <span class="text-[11.5px] leading-relaxed" :class="lg?.ready ? 'text-success' : 'text-muted'">
              {{ loginText }}
            </span>
          </div>

          <div
            v-if="finishBlocked"
            class="mt-3 rounded-md border border-[rgba(240,169,46,.3)] bg-[rgba(240,169,46,.07)] px-3 py-2 text-[11.5px] text-warn leading-relaxed"
          >
            还没检测到登录凭据。不填也能用 —— 只是每次构建会弹框问你要密码。
            <strong class="text-ink">再点一次「完成」就跳过这一步。</strong>
          </div>
        </template>

        <div
          v-if="o.error"
          class="mt-3 rounded-md border border-[rgba(226,75,75,.3)] bg-[rgba(226,75,75,.07)] px-3 py-2 text-[11.5px] text-danger"
        >
          {{ o.error }}
        </div>
      </div>

      <footer class="px-6 py-4 border-t border-line flex items-center gap-2">
        <button v-if="o.step > 0" class="btn" @click="onboardGo(o.step - 1)">上一步</button>
        <button
          v-else
          class="text-[11.5px] text-faint hover:text-muted bg-transparent border-0 p-0 cursor-pointer underline decoration-dotted"
          @click="goSettings(); finishOnboard()"
        >
          我自己去设置里配
        </button>
        <div class="flex-1" />
        <button class="btn btn-primary" :disabled="o.busy" @click="next">
          {{ o.step === 2 ? '完成' : '下一步' }}
        </button>
      </footer>
    </div>
  </div>
</template>
