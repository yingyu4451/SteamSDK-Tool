<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  state,
  setBranch,
  selectedApp,
  loadBuildPanel
} from '../store.js'
import { RefreshCw, Plus } from '@lucide/vue'

const creating = ref(false)
const draft = ref('')
const inputEl = ref(null)
const busy = ref(false)
const message = ref(null)

const appId = computed(() => state.detail?.appId || selectedApp.value?.appId)
const current = computed(() => state.detail?.setLive || '')
const hasKey = computed(() => !!state.hasApiKey)

/** 后台分支（GetAppBetas）。构建面板会顺手拉，切 App 时已经预取。 */
const backendBetas = computed(() => {
  const p = state.buildPanel
  if (!p.data || String(p.data.appId) !== String(appId.value)) return []
  return (p.data.betas || []).filter((b) => b.betakey)
})

const backendBusy = computed(() => {
  const p = state.buildPanel
  return p.busy && String(p.appId) === String(appId.value)
})

/** 本机记过的分支（写过的都记一份，后台没权限时也能点回来） */
const localKnown = computed(() => {
  const key = String(appId.value || 'unknown')
  return state.settings?.branches?.[key] || []
})

/** 合并：后台分支在前，本机独有的补在后面；当前 SetLive 一定在列表里 */
const branches = computed(() => {
  const map = new Map()
  for (const b of backendBetas.value) {
    map.set(b.betakey, {
      key: b.betakey,
      buildid: b.buildid || '',
      description: b.description || '',
      backend: true
    })
  }
  for (const k of localKnown.value) {
    if (!map.has(k)) map.set(k, { key: k, buildid: '', description: '', backend: false })
  }
  if (current.value && !map.has(current.value)) {
    map.set(current.value, { key: current.value, buildid: '', description: '', backend: false })
  }
  return [...map.values()]
})

/** 后台当前 BuildID 只放 tooltip，按钮上保持干净（用户不喜欢冗余文字） */
function branchTitle(b) {
  if (b.backend && b.buildid) {
    const desc = b.description ? ` · ${b.description}` : ''
    return `后台 BuildID ${b.buildid}${desc}`
  }
  return b.backend ? '后台分支（Web API）' : '本机记下的分支'
}

function toggleCreating() {
  creating.value = !creating.value
  if (creating.value) {
    draft.value = current.value || ''
    nextTick(() => inputEl.value?.focus())
  }
}

async function apply(branch) {
  if (busy.value) return
  if (String(branch) === String(current.value)) {
    creating.value = false
    return
  }
  busy.value = true
  message.value = null
  try {
    const res = await setBranch(branch)
    if (!res.ok) {
      message.value = { tone: 'bad', text: res.error || '写入失败' }
    } else {
      message.value = {
        tone: 'ok',
        text: branch ? `SetLive 已切成 "${branch}"` : '已发到默认分支（注释掉 SetLive）'
      }
      creating.value = false
      draft.value = ''
    }
  } finally {
    busy.value = false
    setTimeout(() => (message.value = null), 4000)
  }
}

function confirmNew() {
  const v = draft.value.trim()
  if (!v) return
  apply(v)
}

function openExternal(url) {
  window.api.shell.openExternal(url)
}

watch(appId, () => {
  creating.value = false
  draft.value = ''
})
</script>

<template>
  <section class="card p-5 flex flex-col min-w-0" v-reveal="{ delay: 0.05 }">
    <header class="flex items-center gap-2 flex-wrap">
      <h2 class="text-body font-semibold tracking-tight m-0">分支 / SetLive</h2>
      <span class="pill" :class="current ? 'pill-warn' : 'pill-idle'">
        {{ current || '默认分支' }}
      </span>
      <span v-if="hasKey" class="ml-auto flex items-center gap-1.5">
        <span class="text-micro text-faint">
          {{ backendBusy ? '读取后台分支…' : backendBetas.length ? `${backendBetas.length} 个后台分支` : '后台分支未读到' }}
        </span>
        <button
          class="btn btn-sm px-2"
          :disabled="backendBusy || !appId"
          :title="hasKey ? '从后台刷新分支（Web API GetAppBetas）' : '先在设置里保存 Web API 密钥'"
          @click="loadBuildPanel(true)"
        >
          <RefreshCw :size="13" :stroke-width="1.9" :class="backendBusy ? 'animate-spin' : ''" />
        </button>
      </span>
    </header>

    <div class="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="分支">
      <button
        v-for="b in branches"
        :key="b.key"
        class="btn btn-sm no-drag"
        :class="b.key === current ? 'btn-primary' : ''"
        :disabled="busy"
        :title="branchTitle(b)"
        @click="apply(b.key)"
      >
        {{ b.key }}
      </button>
      <button
        class="btn btn-sm no-drag border-dashed"
        :class="creating ? 'border-accent text-accent' : ''"
        :disabled="busy"
        @click="toggleCreating"
      >
        <Plus :size="13" :stroke-width="2" />
        新建分支
      </button>
      <button
        class="btn btn-sm no-drag"
        :class="!current ? 'btn-primary' : ''"
        :disabled="busy"
        title="注释掉 SetLive，构建发到默认分支"
        @click="apply('')"
      >
        默认分支
      </button>
    </div>

    <div v-if="creating" class="mt-3 flex gap-2">
      <input
        ref="inputEl"
        v-model="draft"
        type="text"
        placeholder="新分支名，例如 qa / internal"
        class="flex-1 h-8 px-3 rounded-input bg-surface border border-line text-body text-ink placeholder:text-faint outline-none focus:border-[rgba(102,192,244,.45)] transition-colors"
        @keydown.enter="confirmNew"
        @keydown.esc="creating = false"
      />
      <button class="btn btn-sm px-3" :disabled="busy || !draft.trim()" @click="confirmNew">写入</button>
      <button class="btn btn-sm px-2" :disabled="busy" @click="creating = false">取消</button>
    </div>

    <p class="mt-2.5 text-micro text-faint leading-relaxed m-0">
      点分支名即写入本地 vdf 的 SetLive；新分支在这里建，建完后台可能还要在 Steamworks 里配分支。
    </p>

    <div class="mt-3 flex items-center gap-2 flex-wrap">
      <button
        class="btn btn-sm no-drag"
        :disabled="!appId"
        @click="openExternal(`https://partner.steamgames.com/apps/branches/${appId}`)"
      >
        管理分支
      </button>
    </div>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="message"
        class="mt-3 text-label rounded-lg px-3 py-2 border"
        :class="
          message.tone === 'ok'
            ? 'text-accent border-[rgba(102,192,244,.22)] bg-[rgba(102,192,244,.05)]'
            : 'text-danger border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)]'
        "
      >
        {{ message.text }}
      </div>
    </Transition>
  </section>
</template>
