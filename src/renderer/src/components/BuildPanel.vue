<script setup>
import { computed } from 'vue'
import { state, loadBuildPanel, goSettings, PLATFORM_LABEL } from '../store.js'
import { fmtSize } from '../format.js'
import { RefreshCw, KeyRound, Cloud } from '@lucide/vue'
import EmptyState from './EmptyState.vue'

const p = computed(() => state.buildPanel)
const data = computed(() => p.value.data)
// GetAppBuilds 返回升序，界面要「最新在前」
const builds = computed(() =>
  (data.value?.builds || [])
    .slice()
    .sort((a, b) => (Number(b.buildid) || 0) - (Number(a.buildid) || 0))
    .slice(0, 6)
)
const betas = computed(() => data.value?.betas || [])
const latest = computed(() => builds.value[0] || null)
const hasKey = computed(() => !!state.hasApiKey)
const appId = computed(() => String(state.detail?.appId || ''))

/**
 * 构建记录里的 depot 条目只有 DepotID。
 * 后台 depot 摘要里的 platform 是平台 ID（win64…），本地 vdf 里存的已经是中文标签（Windows 64），
 * 所以统一换算成「能直接显示的中文标签」再查。
 */
const depotPlatformLabel = computed(() => {
  const m = {}
  for (const s of data.value?.steamDepots || []) {
    const id = String(s.depotId)
    if (s.platformLabel) m[id] = s.platformLabel
    else if (s.platform) m[id] = PLATFORM_LABEL[s.platform] || s.platform
  }
  for (const d of state.detail?.depots || []) {
    const id = String(d.id)
    if (!m[id] && d.platform) m[id] = PLATFORM_LABEL[d.platform] || d.platform
  }
  return m
})

const viaLabel = computed(() =>
  data.value?.via === 'webapi' ? 'Web API' : data.value?.via === 'steamcmd' ? 'steamcmd' : ''
)

/** 后台给的是 ISO 时间，这里只显示到分钟，够看是哪次构建 */
function fmtWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function depotLabel(d) {
  const plat =
    PLATFORM_LABEL[d.platform] ||
    depotPlatformLabel.value[String(d.depotid)] ||
    (d.platform ? String(d.platform) : '')
  return plat || `Depot ${d.depotid}`
}

function depotSize(d) {
  const bytes = Number(d.downloadsize || d.size || 0)
  return bytes ? fmtSize(bytes) : '—'
}
</script>

<template>
  <section class="card flex flex-col min-w-0">
    <header class="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-line-soft">
      <Cloud :size="15" :stroke-width="1.8" class="text-faint shrink-0" />
      <h2 class="text-label font-semibold text-ink">后台构建</h2>
      <span v-if="appId" class="num text-micro text-faint">AppID {{ appId }}</span>
      <span v-if="viaLabel" class="pill pill-idle">{{ viaLabel }}</span>
      <button
        class="ml-auto btn btn-sm px-2"
        :disabled="p.busy || !hasKey || !appId"
        :title="hasKey ? '重新从后台拉构建与分支' : '先在设置里保存 Web API 密钥'"
        @click="loadBuildPanel(true)"
      >
        <RefreshCw :size="13" :stroke-width="1.9" :class="p.busy ? 'animate-spin' : ''" />
      </button>
    </header>

    <div v-if="!hasKey" class="px-4 py-4">
      <EmptyState
        :icon="KeyRound"
        compact
        title="需要 Web API 密钥"
        hint="在「设置」里加密保存 Publisher 级别的 Web API 密钥后，这里直接显示后台的构建和分支 —— 不用再等 steamcmd。"
      >
        <button class="btn btn-sm px-2.5" @click="goSettings">去设置</button>
      </EmptyState>
    </div>

    <div v-else-if="p.busy && !data" class="px-4 py-6 text-label text-faint">读取中…</div>

    <div v-else-if="p.error" class="px-4 py-3 flex flex-col gap-2 items-start">
      <span class="text-label text-danger">{{ p.error }}</span>
      <button class="btn btn-sm px-2.5" @click="loadBuildPanel(true)">重试</button>
    </div>

    <div v-else-if="data?.ok" class="px-4 py-3 flex flex-col gap-3 min-w-0">
      <p v-if="data.buildsUnavailable" class="text-label text-amber">
        {{ data.webError ? 'Web API 读取失败，已回退 steamcmd' : '没有 Web API 密钥' }} —— 构建列表只有密钥能读。
      </p>

      <template v-if="!data.buildsUnavailable">
        <div class="flex flex-col gap-1.5">
          <span class="text-micro font-semibold uppercase tracking-wider text-faint">最近构建</span>
          <div v-if="!builds.length" class="text-label text-faint">后台还没有构建记录。</div>
          <div
            v-for="b in builds"
            :key="b.buildid"
            class="flex flex-col gap-1 py-1.5 border-b border-line-soft last:border-b-0 min-w-0"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <span class="num text-label text-ink">{{ b.buildid }}</span>
              <span class="text-micro text-faint">{{ fmtWhen(b.timeupdated) }}</span>
              <span
                v-if="b.description"
                class="text-micro text-muted truncate max-w-[260px]"
                :title="b.description"
                >{{ b.description }}</span
              >
            </div>
            <div v-if="b.depots?.length" class="flex items-center gap-1.5 flex-wrap">
              <span
                v-for="d in b.depots"
                :key="d.depotid"
                class="chip"
                :title="`Depot ${d.depotid} · manifest ${d.manifestid || '—'}`"
              >
                {{ depotLabel(d) }} · {{ depotSize(d) }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-micro font-semibold uppercase tracking-wider text-faint">分支指向</span>
          <div v-if="!betas.length" class="text-micro text-faint">后台没有 beta 分支。</div>
          <div v-for="bt in betas" :key="bt.betakey" class="flex items-center gap-2 flex-wrap min-w-0">
            <span class="pill pill-idle">{{ bt.betakey || '默认' }}</span>
            <span class="num text-label text-muted">{{ bt.buildid || '—' }}</span>
            <span
              v-if="bt.description"
              class="text-micro text-faint truncate max-w-[220px]"
              :title="bt.description"
              >{{ bt.description }}</span
            >
            <span v-if="bt.reqpassword" class="pill pill-warn">密码分支</span>
          </div>
        </div>
      </template>

      <div v-else class="flex flex-col gap-1.5">
        <span class="text-micro font-semibold uppercase tracking-wider text-faint">分支指向</span>
        <div v-for="bt in betas" :key="bt.betakey" class="flex items-center gap-2 flex-wrap min-w-0">
          <span class="pill pill-idle">{{ bt.betakey || '默认' }}</span>
          <span class="num text-label text-muted">{{ bt.buildid || '—' }}</span>
        </div>
        <div v-if="!betas.length" class="text-micro text-faint">后台没有 beta 分支。</div>
      </div>
    </div>

    <div v-else class="px-4 py-4 text-label text-faint">还没有数据。</div>
  </section>
</template>
