<script setup>
import { ref, watch, computed } from 'vue'
import { state, selectApp, rescan, openWizard, runCheckAll } from '../store.js'
import { useListStagger } from '../motion.js'

const listEl = ref(null)
const { run } = useListStagger(listEl, (el) => el.dataset.dir)

/** 「全部自检」跑起来的时候，图标要亮着 */
const checkingAll = computed(() => state.running && state.runKind === 'check')

watch(
  () => state.apps.map((a) => a.dirName).join('|'),
  () => run(),
  { immediate: true }
)

const nav = [
  { id: 'workbench', label: '工作台', icon: 'M3 12h6v9H3zM11 3h6v18h-6zM19 8h2v13h-2z' },
  { id: 'history', label: '构建历史', icon: 'M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7' },
  { id: 'settings', label: '设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h1m14 0h1M12 4v1m0 14v1' }
]

const appCount = computed(() => state.apps.length)

function healthOf(app) {
  if (app.problems?.length) return 'bad'
  if (!app.analysis?.exists) return 'warn'
  return 'ok'
}
</script>

<template>
  <aside class="w-[268px] shrink-0 border-r border-line bg-[#0b0e14]/70 flex flex-col min-h-0">
    <!-- 视图切换 -->
    <nav class="p-3 flex flex-col gap-1" v-stagger="{ each: 0.04 }">
      <button
        v-for="n in nav"
        :key="n.id"
        class="group flex items-center gap-2.5 h-9 px-3 rounded-[9px] text-[13px] transition-colors cursor-pointer border-0 text-left"
        :class="
          state.view === n.id
            ? 'bg-surface-3 text-ink font-medium'
            : 'bg-transparent text-muted hover:text-ink hover:bg-surface-2'
        "
        @click="state.view = n.id"
      >
        <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" fill="none">
          <path :d="n.icon" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        {{ n.label }}
        <span
          v-if="state.view === n.id"
          class="ml-auto w-1 h-1 rounded-full bg-accent shrink-0"
        />
      </button>
    </nav>

    <div class="h-px bg-line mx-3" />

    <!-- App 列表 -->
    <div class="px-3 pt-3 pb-2 flex items-center gap-2">
      <span class="text-[11px] font-semibold tracking-wider text-faint uppercase">Apps</span>
      <span class="num text-[11px] text-faint">{{ appCount }}</span>
      <button
        class="ml-auto w-6 h-6 grid place-items-center rounded-md text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="重新扫描 scripts 目录"
        @click="rescan"
      >
        <svg
          viewBox="0 0 24 24"
          class="w-3.5 h-3.5"
          :class="state.scanning && 'animate-spin'"
          fill="none"
        >
          <path
            d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="w-6 h-6 grid place-items-center rounded-md transition-colors cursor-pointer border-0 bg-transparent"
        :class="
          checkingAll
            ? 'text-accent'
            : 'text-faint hover:text-accent hover:bg-surface-2'
        "
        title="全部自检（把每个 App 都跑一遍 check.ps1）"
        @click="runCheckAll"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" :class="checkingAll && 'animate-pulse'" fill="none">
          <path
            d="M12 3 4.5 6v6c0 4.4 3.1 8.1 7.5 9 4.4-.9 7.5-4.6 7.5-9V6z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="m9 12 2.2 2.2L15.5 10"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="w-6 h-6 grid place-items-center rounded-md text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="新建 App（Demo / 正式版 / 新平台）"
        @click="openWizard"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 flex flex-col gap-1.5">
      <button
        v-for="app in state.apps"
        :key="app.dirName"
        :data-dir="app.dirName"
        class="text-left rounded-[10px] border px-3 py-2.5 transition-colors cursor-pointer"
        :class="
          state.selectedDir === app.dirName
            ? 'border-[rgba(46,230,197,.34)] bg-[rgba(46,230,197,.06)]'
            : 'border-line bg-surface hover:bg-surface-2'
        "
        @click="selectApp(app.dirName)"
      >
        <div class="flex items-center gap-2">
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="{
              'bg-success': healthOf(app) === 'ok',
              'bg-amber': healthOf(app) === 'warn',
              'bg-danger': healthOf(app) === 'bad'
            }"
          />
          <span class="text-[13px] font-medium truncate">{{ app.dirName }}</span>
        </div>
        <div class="mt-1.5 flex items-center gap-2 text-[11px] text-faint num">
          <span>App {{ app.appId || '?' }}</span>
          <span class="text-line">·</span>
          <span>{{ app.depots?.length || 0 }} depot</span>
          <span v-if="app.setLive" class="ml-auto text-amber truncate max-w-[74px]">
            {{ app.setLive }}
          </span>
        </div>
      </button>

      <div v-if="!state.apps.length && !state.scanning" class="text-[12px] text-faint px-1 py-3">
        还没有 App。
        <button class="btn h-7 px-2.5 text-[11.5px] mt-2.5 w-full" @click="openWizard">
          ＋ 新建 App
        </button>
      </div>

      <div v-if="state.scanErrors?.length" class="mt-1 flex flex-col gap-1">
        <div
          v-for="(e, i) in state.scanErrors"
          :key="i"
          class="text-[11px] text-danger/80 bg-[rgba(255,92,108,.07)] border border-[rgba(255,92,108,.2)] rounded-lg px-2.5 py-2"
        >
          {{ e.error }}
        </div>
      </div>
    </div>
  </aside>
</template>
