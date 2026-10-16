<script setup>
import { computed, onMounted, ref, nextTick, watch } from 'vue'
import gsap from 'gsap'
import { Download, RefreshCw, Check, LoaderCircle, TriangleAlert } from '@lucide/vue'
import {
  state,
  onboardGo,
  onboardDetect,
  onboardPickFolder,
  onboardApplySdk,
  onboardSaveAccount,
  testTypedLogin,
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
      { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: 'power3.out' }
    )
  }
  await nextTick()
  if (!o.value.candidates.length) onboardDetect()
})

/** 点「完成」之后的验证过程：idle → checking → ok / fail */
const checkPhase = ref('idle')

/** 填了账号密码时那次真登录的结果（没填就是 null，只查机器状态） */
const testResult = ref(null)
/** 这一次走的到底是「真登录」还是「只看机器状态」 */
const rowUsesRealLogin = ref(false)

/* 这个组件在 App.vue 里是一直挂着的，只有里面那层 div 跟着 open 开关 ——
 * 所以 checkPhase 会活到下一次打开。上一次「验证通过」留下的 ok 会把
 * 主按钮永久禁用，从手册重新进来就卡在第一步动不了。每次打开都清一次。 */
watch(
  () => o.value.open,
  (open) => {
    if (open) {
      checkPhase.value = 'idle'
      loginChecked.value = false
      testResult.value = null
      rowUsesRealLogin.value = false
    }
  }
)

/** 状态行只在「正在验证」或「验证过」的时候出现 —— 没查过就不替用户下结论 */
const rowShow = computed(() => checkPhase.value === 'checking' || loginChecked.value)
const rowTone = computed(() => {
  if (checkPhase.value === 'checking') return 'busy'
  const t = testResult.value
  if (t) return t.ok ? 'ok' : 'bad'
  return lg.value?.ready ? 'ok' : 'bad'
})
const rowText = computed(() => {
  if (checkPhase.value === 'checking') {
    return testResult.value === null && rowUsesRealLogin.value
      ? '正在用你填的账号登录 steamcmd，第一次要十几秒…'
      : '正在验证登录状态…'
  }
  const t = testResult.value
  if (t) {
    if (t.timedOut) return '两分半没等到 Steam 回话 —— 网络慢或被拦了。可以点「跳过」，构建时再试'
    switch (t.reason) {
      case 'ok':
        return t.passwordChecked
          ? `账号密码没问题 —— steamcmd 已经登录并记住了（${t.usedAccount}）`
          : `steamcmd 用它以前缓存的令牌登录成功了（${t.usedAccount}）。你这次填的密码没被校验 —— 想真的验一次，先去设置里「忘记账号」`
      case 'bad-password':
        return 'Steam 说密码不对（Invalid Password）。检查一下大小写，账号名不是邮箱'
      case 'steam-guard':
        return '这个账号开了 Steam Guard，光有密码不够 —— 点「跳过」，构建时会开一个控制台窗口让你输验证码'
      case 'rate-limit':
        return 'Steam 暂时限制了登录尝试（Rate Limit）。等几分钟再点一次'
      case 'no-steamcmd':
        return '找不到 steamcmd.exe —— 回上一步把 SDK 路径配对'
      case 'no-account':
        return '账号名是空的'
      default:
        return '登录没成功，也没认出具体原因。点「跳过」先继续，构建时能看到 steamcmd 的原始输出'
    }
  }
  return loginText.value
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
    checkPhase.value = 'checking'
    loginChecked.value = false
    testResult.value = null

    const acct = String(o.value.account || '').trim()
    const pw = String(o.value.password || '')
    rowUsesRealLogin.value = !!(acct && pw)

    try {
      if (rowUsesRealLogin.value) {
        /* 填了账号密码 —— 就真的登一次。
         * 以前这里只读 config.vdf（「这台机器以前登录过没有」），跟你刚敲进去的
         * 那两行字毫无关系，所以乱填也能过。 */
        const t = await testTypedLogin(acct, pw)
        testResult.value = t
        loginChecked.value = true
        if (!t.ok) {
          checkPhase.value = 'fail'
          return
        }
        // 确认能登进去才存，免得把一个错的密码写进 DPAPI
        await onboardSaveAccount()
        checkPhase.value = 'ok'
        await new Promise((r) => setTimeout(r, 700))
        await finishOnboard()
      } else {
        // 没填 —— 那就只能报告这台机器上有没有现成的登录
        await onboardSaveAccount()
        const t0 = Date.now()
        const l = await checkLogin()
        // 读一个几百字节的 vdf，实际只要 ~0.1 秒。快到看不见就等于没发生 ——
        // 留一个 480ms 的下限，让「正在验证」和「结果」这两拍都真的出现在屏幕上。
        const wait = 480 - (Date.now() - t0)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        loginChecked.value = true
        if (!l?.ready) {
          checkPhase.value = 'fail'
          return
        }
        checkPhase.value = 'ok'
        await new Promise((r) => setTimeout(r, 700))
        await finishOnboard()
      }
    } finally {
      if (checkPhase.value === 'checking') checkPhase.value = 'idle'
    }
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

          <!-- 点「完成」之后才出现 —— 没查过就不替用户下结论。
               登录与否由主进程读 steamcmd 的 config.vdf 判断，不用用户自己打勾 -->
          <div
            v-if="rowShow"
            class="mt-3.5 rounded-md border px-3 py-2.5 flex items-start gap-2"
            :class="{
              'border-[rgba(102,192,244,.34)] bg-[rgba(102,192,244,.07)]': rowTone === 'busy',
              'border-[rgba(139,197,63,.3)] bg-[rgba(139,197,63,.07)]': rowTone === 'ok',
              'border-[rgba(240,169,46,.28)] bg-[rgba(240,169,46,.06)]': rowTone === 'bad'
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
              class="text-[11.5px] leading-relaxed"
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

        <div
          v-if="o.error"
          class="mt-3 rounded-md border border-[rgba(226,75,75,.3)] bg-[rgba(226,75,75,.07)] px-3 py-2 text-[11.5px] text-danger"
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
          class="text-[11.5px] text-faint hover:text-muted bg-transparent border-0 p-0 cursor-pointer underline decoration-dotted"
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
</template>
