<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import {
  state,
  runCheck,
  runBuild,
  cancelRun,
  selectedApp,
  submitPassword,
  cancelPasswordPrompt,
  openLogin,
  verifyAgainstSteam,
  clearVerify,
  toggleSyncPick,
  syncPickAll,
  syncAddSelected,
  goSettings,
  openDepotSlide
} from '../store.js'
import { fmtSize } from '../format.js'

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

/** 正式上传要点两次，避免手滑把开发版推到线上 */
function doLive() {
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
</script>

<template>
  <div class="card p-3 flex items-center gap-2 flex-wrap min-w-0" v-reveal="{ delay: 0.02 }">
    <button class="btn no-drag" :disabled="disabled" @click="doCheck">
      <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none">
        <path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      自检
    </button>

    <div class="w-px h-6 bg-line mx-1" />

    <button class="btn no-drag" :disabled="disabled" @click="doPreview">
      <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none">
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" stroke="currentColor" stroke-width="1.8" />
        <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.8" />
      </svg>
      Preview 空跑
    </button>

    <button
      class="btn btn-lg no-drag"
      :class="confirming ? 'btn-danger' : 'btn-primary'"
      :disabled="disabled"
      @click="doLive"
    >
      <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none">
        <path
          d="M12 19V5M12 5 6.5 10.5M12 5l5.5 5.5"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {{ confirming ? '再点一次确认上传' : '正式上传' }}
    </button>

    <Transition enter-active-class="transition duration-150" enter-from-class="opacity-0 scale-95">
      <button v-if="state.running" class="btn btn-danger no-drag" @click="cancelRun">
        <span class="w-2.5 h-2.5 rounded-[3px] bg-current" />
        中止
      </button>
    </Transition>

    <div class="flex-1" />

    <div class="flex items-center gap-1.5">
      <button
        class="btn no-drag"
        :disabled="!state.detail?.contentRoot"
        @click="openPath(state.detail.contentRoot)"
      >
        内容目录
      </button>
      <button class="btn no-drag" :disabled="!state.sdk?.contentBuilder" @click="openPath(state.sdk.contentBuilder)">
        构建目录
      </button>
      <button class="btn no-drag" :disabled="!appId" @click="openExternal(partner('builds'))">
        Steamworks
      </button>
      <button
        class="btn no-drag"
        :disabled="!appId || state.verify.busy"
        @click="verifyAgainstSteam()"
      >
        {{ state.verify.busy ? '读取中…' : '同步 Depot' }}
      </button>
      <button class="btn no-drag" @click="openLogin">登录一次</button>
    </div>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.askPassword"
        class="mt-1 w-full rounded-[10px] border border-[rgba(255,180,84,.24)] bg-[rgba(255,180,84,.06)] px-3 py-2.5"
      >
        <div class="flex items-center gap-2 text-[12px] text-amber">
          <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" fill="none">
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z"
              stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ state.askPasswordError }}
        </div>

        <div class="mt-2.5 flex items-center gap-2 flex-wrap">
          <input
            v-model="pwDraft"
            type="password"
            autofocus
            placeholder="Steam 账号密码"
            class="flex-1 min-w-[200px] h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(255,180,84,.5)]"
            @keydown.enter="submitPw"
          />
          <label class="flex items-center gap-1.5 text-[11.5px] text-muted cursor-pointer select-none">
            <input type="checkbox" v-model="pwRemember" class="accent-[#2ee6c5]" />
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
        class="mt-1 w-full rounded-[10px] border px-3 py-2.5"
        :class="
          state.verify.error
            ? 'border-[rgba(255,180,84,.24)] bg-[rgba(255,180,84,.06)]'
            : 'border-line bg-surface-2/40'
        "
      >
        <template v-if="state.verify.error">
          <div class="flex items-center gap-2 text-[12px] text-amber flex-wrap">
            <span class="font-semibold">同步失败</span>
            <span class="text-muted">{{ state.verify.error }}</span>
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
          <div class="text-[12px] text-muted">正在读取后台 Depot…</div>
        </template>

        <template v-else-if="vd">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-[12px]">同步 Depot</span>
            <span class="px-2 py-[3px] rounded-full text-[10.5px] border text-muted border-line">
              {{ viaLabel }}
            </span>
            <span
              class="px-2 py-[3px] rounded-full text-[10.5px] border"
              :class="
                vd.appIdKnown
                  ? 'text-accent border-[rgba(46,230,197,.3)] bg-[rgba(46,230,197,.07)]'
                  : 'text-amber border-[rgba(255,180,84,.3)] bg-[rgba(255,180,84,.07)]'
              "
            >
              {{ vd.appName ? `AppID ${vd.appId} · ${vd.appName}` : `AppID ${vd.appId}` }}
            </span>
            <span class="text-[11px] text-faint">后台 {{ steamDepots.length }} 个 Depot</span>
            <button class="ml-auto btn h-6 px-2 text-[11px] no-drag" @click="clearVerify">收起</button>
          </div>

          <!-- 后台 Depot，勾选要加进来的 -->
          <div v-if="steamDepots.length" class="mt-2.5 pt-2.5 border-t border-line-soft">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[11px] text-faint">勾上要加到本地脚本的</span>
              <button class="btn h-6 px-2 text-[10.5px] no-drag" @click="syncPickAll(true)">全选</button>
              <button class="btn h-6 px-2 text-[10.5px] no-drag" @click="syncPickAll(false)">全不选</button>
            </div>

            <div
              v-for="d in steamDepots"
              :key="d.depotId"
              class="flex items-center gap-2.5 py-1 min-w-0"
            >
              <input
                type="checkbox"
                class="accent-[#2ee6c5] w-3.5 h-3.5 shrink-0"
                :checked="!!state.syncPicks[String(d.depotId)]"
                :disabled="localIds.has(String(d.depotId))"
                @change="toggleSyncPick(d.depotId)"
              />
              <span class="font-mono num text-[12px] shrink-0">{{ d.depotId }}</span>
              <span class="text-[11.5px] text-muted shrink-0">{{ d.platformLabel || '平台未知' }}</span>
              <span v-if="d.branch" class="text-[11px] text-faint shrink-0">{{ d.branch }}</span>
              <span class="text-[11px] text-faint num shrink-0">{{ fmtSize(d.size) }}</span>
              <span v-if="localIds.has(String(d.depotId))" class="text-[11px] text-accent shrink-0">本地已有</span>
              <button
                v-else-if="!d.platform"
                class="ml-auto btn h-6 px-2 text-[10.5px] no-drag"
                @click="openDepotSlide()"
              >
                手动加
              </button>
            </div>

            <div class="mt-2 flex items-center gap-2 flex-wrap">
              <button
                class="btn btn-primary h-7 px-3 text-[11.5px] no-drag"
                :disabled="!pickCount || state.syncAdding"
                @click="syncAddSelected"
              >
                {{ state.syncAdding ? '添加中…' : `添加选中的 ${pickCount} 个` }}
              </button>
              <span class="text-[11px] text-faint">内容目录默认落在项目文件夹下的平台子目录</span>
            </div>
          </div>
          <div v-else class="mt-2.5 pt-2.5 border-t border-line-soft text-[11.5px] text-faint">
            后台这个 App 下还没有任何 Depot。
          </div>

          <!-- 分支 -->
          <div v-if="branchList.length" class="mt-2.5 pt-2.5 border-t border-line-soft">
            <div class="text-[11px] text-faint mb-1">后台分支</div>
            <div class="flex gap-1.5 flex-wrap">
              <span
                v-for="b in branchList"
                :key="b.key"
                class="px-2 py-[3px] rounded-full text-[10.5px] border"
                :class="
                  b.key === 'public' || b.key === 'default'
                    ? 'text-accent border-[rgba(46,230,197,.3)] bg-[rgba(46,230,197,.07)]'
                    : 'text-muted border-line'
                "
                :title="b.description || ''"
              >
                {{ b.key === 'public' || b.key === 'default' ? '默认分支 public' : b.key }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>
