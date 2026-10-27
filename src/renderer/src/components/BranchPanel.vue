<script setup>
import { computed, ref, watch } from 'vue'
import { state, setBranch, selectedApp } from '../store.js'

const draft = ref('')
const busy = ref(false)
const message = ref(null)

const appId = computed(() => state.detail?.appId || selectedApp.value?.appId)
const current = computed(() => state.detail?.setLive || '')

const known = computed(() => {
  const key = String(appId.value || 'unknown')
  return state.settings?.branches?.[key] || []
})

watch(current, (c) => (draft.value = c), { immediate: true })

async function apply(branch) {
  busy.value = true
  message.value = null
  try {
    const res = await setBranch(branch)
    if (!res.ok) message.value = { tone: 'bad', text: res.error || '写入失败' }
    else
      message.value = {
        tone: 'ok',
        text: branch ? `已把 SetLive 写成 "${branch}"` : '已注释掉 SetLive（发到默认分支）'
      }
  } finally {
    busy.value = false
    setTimeout(() => (message.value = null), 4000)
  }
}

function openExternal(url) {
  window.api.shell.openExternal(url)
}
</script>

<template>
  <section class="card p-5 flex flex-col min-w-0" v-reveal="{ delay: 0.05 }">
    <header class="flex items-center gap-2">
      <h2 class="text-body font-semibold tracking-tight m-0">分支 / SetLive</h2>
      <span class="pill" :class="current ? 'pill-warn' : 'pill-idle'">
        {{ current || '默认分支' }}
      </span>
    </header>

    <div class="mt-3.5 flex gap-2">
      <input
        v-model="draft"
        type="text"
        placeholder="分支名，例如 qa / internal"
        class="flex-1 h-9 px-3 rounded-input bg-surface border border-line text-body text-ink placeholder:text-faint outline-none focus:border-[rgba(102,192,244,.45)] transition-colors"
        @keydown.enter="apply(draft.trim())"
      />
      <button class="btn no-drag" :disabled="busy" @click="apply(draft.trim())">写入</button>
    </div>

    <div v-if="known.length" class="mt-3">
      <div class="text-micro text-faint tracking-wide mb-1.5">用过的分支</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="b in known"
          :key="b"
          class="px-2.5 h-6 rounded-full border text-label cursor-pointer transition-colors bg-transparent"
          :class="
            b === current
              ? 'border-[rgba(255,180,84,.35)] text-amber'
              : 'border-line text-muted hover:text-ink hover:border-rule'
          "
          @click="draft = b"
        >
          {{ b }}
        </button>
      </div>
    </div>

    <div class="mt-3.5 flex items-center gap-2 flex-wrap">
      <button class="btn no-drag" :disabled="busy || !current" @click="apply('')">
        发到默认分支
      </button>
      <button
        class="btn no-drag"
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
