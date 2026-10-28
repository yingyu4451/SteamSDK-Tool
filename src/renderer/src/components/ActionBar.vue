<script setup>
import { computed, ref, reactive, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  state,
  runCheck,
  runBuild,
  cancelRun,
  selectedApp,
  submitPassword,
  cancelPasswordPrompt,
  verifyAgainstSteam,
  clearVerify,
  toggleSyncPick,
  syncPickAll,
  syncAddSelected,
  goSettings,
  openDepotSlide,
  runPreflight,
  clearPreflight
} from '../store.js'
import { fmtSize } from '../format.js'
import { CheckCircle2, Eye, FileCog, FolderOpen, LoaderCircle, Lock, PackageSearch, RefreshCw, ShieldCheck, SquareArrowOutUpRight, Upload, X } from '@lucide/vue'
import EmptyState from './EmptyState.vue'

const confirming = ref(false)
const pwDraft = ref('')
const pwRemember = ref(true)
let timer = null

function submitPw() {
  const v = pwDraft.value
  if (!v) return
  pwDraft.value = ''
  submitPassword(v, { remember: pwRemember.value })
}

const appId = computed(() => state.detail?.appId || selectedApp.value?.appId)
const disabled = computed(() => state.running || !state.detail || !!state.detail.error)

const vd = computed(() => state.verify.data || null)
const viaLabel = computed(() =>
  state.verify.via === 'steamcmd' ? 'steamcmd + 已保存的 Steam 账号' : 'Steamworks Web API'
)

/** 后台那个 App 下的 Depot（已归一化：depotId / platformLabel / branch / size） */
const steamDepots = computed(() =>
  [...(vd.value?.steamDepots || [])].sort((a, b) => Number(a.depotId || 0) - Number(b.depotId || 0))
)

const localIds = computed(() => new Set((state.detail?.depots || []).map((d) => String(d.id))))
const pickCount = computed(() => Object.keys(state.syncPicks).length)

const branchList = computed(() =>
  (vd.value?.betas || []).map((b) => ({
    key: b.betakey || b.name || 'default',
    description: b.description || ''
  }))
)

function reset() {
  confirming.value = false
  clearTimeout(timer)
}

function doCheck() {
  reset()
  runCheck()
}

function doPreview() {
  reset()
  runBuild({ preview: true })
}

/** 正式上传要点两次，避免手滑把开发版推到线上 */function doLive() {
  if (!confirming.value) {
    confirming.value = true
    timer = setTimeout(() => (confirming.value = false), 4500)
    return
  }
  reset()
  runBuild({ preview: false })
}

onBeforeUnmount(() => clearTimeout(timer))

async function openExternal(url) {
  await window.api.shell.openExternal(url)
}
async function openPath(p) {
  const r = await window.api.shell.openPath(p)
  if (!r.ok) alert(r.error)
}

const partner = (seg) => `https://partner.steamgames.com/apps/${seg}/${appId.value}`
/* ---- 检查文件 ---- */

const pf = computed(() => state.preflight.data || null)
const pfTone = computed(() => {
  if (!pf.value) return ''
  if (pf.value.errors) return 'text-danger'
  if (pf.value.warns) return 'text-amber'
  return 'text-accent'
})

/* ---- 浮层锚点 ----
 * 浮层挂在工具条这一层（绝对定位，不占布局），所以默认只能贴工具条的左右边。
 * 想让面板正对着点它的那个按钮，就得自己算一下按钮相对工具条的横向位置。
 */
const barEl = ref(null)
const anchors = reactive({ pf: {}, verify: {}, pwd: {} })
const POP_W = 620

function anchorTo(key, el) {
  const bar = barEl.value
  const btn = el || bar?.querySelector(`[data-pop="${key}"]`)
  if (!bar || !btn) return
  const b = bar.getBoundingClientRect()
  const r = btn.getBoundingClientRect()
  const w = Math.min(POP_W, b.width)
  const left = r.left - b.left
  if (left + w > b.width) {
    // 右边放不下就改成贴着按钮的右边对齐 —— 不然会顶到窗口外面
    anchors[key] = { left: 'auto', right: `${Math.round(Math.max(0, b.right - r.right))}px` }
    return
  }
  anchors[key] = { left: `${Math.round(Math.max(0, left))}px`, right: 'auto' }
}

function reanchor() {
  if (state.askPassword) anchorTo('pwd')
  if (state.verify.busy || state.verify.error || state.verify.data) anchorTo('verify')
  if (state.preflight.busy || state.preflight.error || state.preflight.data) anchorTo('pf')
}
onMounted(() => window.addEventListener('resize', reanchor))
watch(
  () => state.askPassword,
  (v) => {
    if (v) nextTick(() => anchorTo('pwd'))
  }
)

/* 切 App 时把「同步 Depot」「检查文件」两个面板一起收掉 ——
 * 它们的内容是上一个 App 的，留在屏幕上就是张冠李戴。
 * 面板的开合是由 state.verify / state.preflight 是否有数据决定的，
 * selectApp() 里已经调 clearVerify() / clearPreflight()，这里只需要在
 * 它们被清空后重算锚点。 */
watch(
  () => [state.verify.data, state.preflight.data, state.verify.busy, state.preflight.busy],
  () => nextTick(reanchor)
)
</script>

<template>
  <div ref="barEl" class="card p-3 flex items-center gap-2 flex-wrap min-w-0 relative" v-reveal="{ delay: 0.02 }">
    <button
      class="btn no-drag"
      :disabled="disabled"
      title="检查配置：跑 check.ps1，核对 vdf 里的 AppID / DepotID / 内容目录 / 排除规则，以及 depot 脚本之间对不对得上。不看实际文件。"
      @click="doCheck"
    >
      <FileCog :size="16" :stroke-width="1.9" />
      检查配置
    </button>

    <button
      class="btn no-drag"
      :disabled="disabled || state.preflight.busy"
      data-pop="pf"
      title="检查文件：扫一遍真正会被上传的文件，找非法字符、超长路径、大小写冲突、符号链接、macOS 的 .app bundle。配置没问题但文件有问题时，只有这一关能发现。"
      :aria-expanded="state.preflight.busy || !!state.preflight.error || !!pf"
      aria-controls="pop-preflight"
      @click="(e) => { anchorTo('pf', e.currentTarget); runPreflight() }"
    >
      <ShieldCheck :size="16" :stroke-width="1.8" />
      {{ state.preflight.busy ? '检查中…' : '检查文件' }}
    </button>

    <div class="w-px h-6 bg-line mx-1" />

    <button class="btn no-drag" :disabled="disabled" @click="doPreview">
      <Eye :size="16" :stroke-width="1.8" />
      Preview 空跑
    </button>

    <button
      class="btn no-drag"
      :class="confirming ? 'btn-danger' : 'btn-primary'"
      :disabled="disabled"
      data-pop="pwd"
      @click="doLive"
    >
      <Upload :size="16" :stroke-width="2.2" />
      {{ confirming ? '再点一次确认上传' : '正式上传' }}
    </button>

    <Transition enter-active-class="transition duration-150" enter-from-class="opacity-0 scale-95">
      <button v-if="state.running" class="btn btn-danger no-drag" @click="cancelRun">
        <span class="w-2.5 h-2.5 rounded-sm bg-current" />
        中止
      </button>
    </Transition>

    <div class="w-px h-6 bg-line mx-1" />

    <button
      class="btn no-drag"
      :disabled="!appId || state.verify.busy"
      data-pop="verify"
      :aria-expanded="state.verify.busy || !!state.verify.error || !!vd"
      aria-controls="pop-verify"
      @click="(e) => { anchorTo('verify', e.currentTarget); verifyAgainstSteam() }"
    >
      <RefreshCw :size="15" :stroke-width="1.9" :class="state.verify.busy ? 'animate-spin' : ''" />
      {{ state.verify.busy ? '读取中…' : '同步 Depot' }}
    </button>

    <button
      class="btn no-drag"
      :disabled="!appId"
      title="在 Steamworks 后台打开这个 App 的生成版本页面"
      @click="openExternal(partner('builds'))"
    >
      <SquareArrowOutUpRight :size="15" :stroke-width="1.9" />
      查看生成版本
    </button>

    <div class="flex-1" />
    <div class="flex items-center gap-1.5">
      <button class="btn no-drag" :disabled="!state.sdk?.contentBuilder" @click="openPath(state.sdk.contentBuilder)">
        <FolderOpen :size="14" class="mr-1.5" /> 构建目录
      </button>
      <button class="btn no-drag" :disabled="!appId" @click="openExternal(partner('builds'))">
        <SquareArrowOutUpRight :size="14" class="mr-1.5" /> Steamworks
      </button>
    </div>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.askPassword"
        class="bar-pop bar-pop-left rounded-card border border-[rgba(255,180,84,.3)] px-3 py-2.5"
        :style="anchors.pwd"
      >
        <div class="flex items-center gap-2 text-label text-amber">
          <Lock :size="16" :stroke-width="1.9" class="shrink-0" />
          {{ state.askPasswordError }}
        </div>

        <div class="mt-2.5 flex items-center gap-2 flex-wrap">
          <input
            v-model="pwDraft"
            type="password"
            autofocus
            placeholder="Steam 账号密码"
            class="flex-1 min-w-[200px] h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-[rgba(255,180,84,.5)]"
            @keydown.enter="submitPw"
          />
          <label class="flex items-center gap-1.5 text-label text-muted cursor-pointer select-none">
            <input type="checkbox" v-model="pwRemember" class="accent-[#66c0f4]" />
            加密保存
          </label>
          <button class="btn btn-primary no-drag" :disabled="!pwDraft" @click="submitPw">
            用这个密码{{ state.askPassword.preview ? '空跑' : '上传' }}
          </button>
          <button class="btn no-drag" @click="cancelPasswordPrompt">取消</button>
        </div>
      </div>
    </Transition>

    <!-- 同步 Depot -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.verify.busy || state.verify.error || state.verify.data"
        id="pop-verify"
        role="region"
        aria-label="同步 Depot"
        class="bar-pop bar-pop-wide bar-pop-right rounded-card border px-3 py-2.5"
        :style="anchors.verify"
        :class="
          state.verify.error
            ? 'border-[rgba(255,180,84,.3)]'
            : 'border-line'
        "
      >
        <template v-if="state.verify.error">
          <div class="flex items-center gap-2 text-label text-amber flex-wrap">
            <span class="font-semibold">同步失败</span>
            <span class="text-muted min-w-0 flex-1">{{ state.verify.error }}</span>
            <button class="ml-auto btn btn-sm px-2  no-drag shrink-0" @click="clearVerify">关闭</button>
          </div>
          <div v-if="state.verify.needsKey" class="mt-2 flex items-center gap-2 flex-wrap">
            <button class="btn btn-primary no-drag" @click="verifyAgainstSteam(null, 'steamcmd')">
              改用 steamcmd
            </button>
          </div>
          <div v-else-if="state.verify.needsPassword" class="mt-2 flex items-center gap-2 flex-wrap">
            <button class="btn btn-primary no-drag" @click="goSettings">去设置里填账号密码</button>
          </div>
        </template>

        <template v-else-if="state.verify.busy">
          <div class="flex items-center gap-2.5 text-label text-muted">
            <LoaderCircle :size="16" class="text-accent drop-spin shrink-0" />
            <span>正在读取后台 Depot…（走 steamcmd 时要 10–30 秒）</span>
          </div>
        </template>

        <template v-else-if="vd">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-label">同步 Depot</span>
            <span class="px-2 py-[3px] rounded-full text-micro border text-muted border-line">
              {{ viaLabel }}
            </span>
            <span
              class="px-2 py-[3px] rounded-full text-micro border"
              :class="
                vd.appIdKnown
                  ? 'text-accent border-[rgba(102,192,244,.3)] bg-[rgba(102,192,244,.07)]'
                  : 'text-amber border-[rgba(255,180,84,.3)] bg-[rgba(255,180,84,.07)]'
              "
            >
              {{ vd.appName ? `AppID ${vd.appId} · ${vd.appName}` : `AppID ${vd.appId}` }}
            </span>
            <span class="text-micro text-faint">后台 {{ steamDepots.length }} 个 Depot</span>
            <button class="ml-auto btn btn-sm px-2  no-drag" @click="clearVerify">收起</button>
          </div>

          <!-- 后台 Depot，勾选要加进来的 -->
          <div v-if="steamDepots.length" class="mt-2.5 pt-2.5 border-t border-line-soft">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-micro text-faint">勾选要加进本地的</span>
              <button class="btn btn-sm px-2  no-drag" @click="syncPickAll(true)">全选</button>
              <button class="btn btn-sm px-2  no-drag" @click="syncPickAll(false)">全不选</button>
            </div>

            <div
              v-for="d in steamDepots"
              :key="d.depotId"
              class="flex items-center gap-2.5 py-1 min-w-0"
            >
              <input
                type="checkbox"
                class="accent-[#66c0f4] w-3.5 h-3.5 shrink-0"
                :checked="!!state.syncPicks[String(d.depotId)]"
                :disabled="localIds.has(String(d.depotId))"
                @change="toggleSyncPick(d.depotId)"
              />
              <span class="font-mono num text-label shrink-0">{{ d.depotId }}</span>
              <span class="text-label text-muted shrink-0">{{ d.platformLabel || '平台未知' }}</span>
              <span v-if="d.branch" class="text-micro text-faint shrink-0">{{ d.branch }}</span>
              <span class="text-micro text-faint num shrink-0">{{ fmtSize(d.size) }}</span>
              <span v-if="localIds.has(String(d.depotId))" class="text-micro text-accent shrink-0">本地已有</span>
              <button
                v-else-if="!d.platform"
                class="ml-auto btn btn-sm px-2  no-drag"
                @click="openDepotSlide()"
              >
                手动加
              </button>
            </div>

            <div class="mt-2 flex items-center gap-2 flex-wrap">
              <button
                class="btn btn-primary btn-sm px-3  no-drag"
                :disabled="!pickCount || state.syncAdding"
                @click="syncAddSelected"
              >
                {{ state.syncAdding ? '添加中…' : `添加选中的 ${pickCount} 个` }}
              </button>
            </div>
          </div>
          <div v-else class="mt-2.5 pt-2.5 border-t border-line-soft">
            <EmptyState
              compact
              :icon="PackageSearch"
              title="后台还没有 Depot"
              hint="这个 App 在 Steamworks 后台一个 Depot 都没有，先在后台建一个再回来同步。"
            />
          </div>

          <!-- 分支 -->
          <div v-if="branchList.length" class="mt-2.5 pt-2.5 border-t border-line-soft">
            <div class="text-micro text-faint mb-1">后台分支</div>
            <div class="flex gap-1.5 flex-wrap">
              <span
                v-for="b in branchList"
                :key="b.key"
                class="px-2 py-[3px] rounded-full text-micro border text-muted border-line"
                :title="b.description || ''"
              >
                {{ b.key }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </Transition>

    <!-- 检查文件 -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.preflight.busy || state.preflight.error || pf"
        id="pop-preflight"
        role="region"
        aria-label="检查文件结果"
        class="bar-pop bar-pop-wide bar-pop-left rounded-card border px-3 py-2.5"
        :style="anchors.pf"
        :class="
          state.preflight.error
            ? 'border-[rgba(255,180,84,.3)]'
            : 'border-line'
        "
      >
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-label">检查文件</span>
          <span v-if="pf" class="text-micro" :class="pfTone">
            {{ pf.errors }} 个会拦住上传 · {{ pf.warns }} 个警告 · {{ pf.infos }} 条提示
          </span>
          <span v-else-if="state.preflight.busy" class="text-micro text-faint">正在查后台和本地…</span>
          <button class="ml-auto btn btn-sm px-2.5  no-drag" @click="clearPreflight">收起</button>
        </div>

        <div v-if="state.preflight.error" class="mt-2 flex flex-col gap-1">
          <div class="text-label text-amber">{{ state.preflight.error }}</div>
          <div class="text-micro text-faint leading-relaxed">
            先跑「检查配置」确认 vdf 和内容目录没问题；脚本的完整报错在底部「构建输出」里。
          </div>
        </div>
        <div v-else-if="pf && !pf.problems.length" class="mt-2 flex items-center gap-2 text-label text-accent">
          <CheckCircle2 :size="16" :stroke-width="2" class="shrink-0" />
          没有发现问题。
        </div>
        <div v-else-if="pf" class="mt-2 flex flex-col gap-2">
          <div v-for="(p, i) in pf.problems" :key="i" class="flex items-start gap-2 min-w-0">
            <span
              class="pill shrink-0 mt-[1px]"
              :class="p.level === 'error' ? 'pill-bad' : p.level === 'warn' ? 'pill-warn' : 'pill-idle'"
            >
              {{ p.level === 'error' ? '拦住' : p.level === 'warn' ? '警告' : '提示' }}
            </span>
            <div class="min-w-0">
              <div class="text-label text-ink">{{ p.title }}</div>
              <div class="text-micro text-faint font-mono break-all">{{ p.text }}</div>
              <div v-if="p.hint" class="text-micro text-muted">{{ p.hint }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>
