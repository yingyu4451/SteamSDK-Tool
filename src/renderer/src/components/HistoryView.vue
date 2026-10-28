<script setup>
import { ref, computed } from 'vue'
import { state, loadHistory } from '../store.js'
import { fmtSize, fmtTime } from '../format.js'
import { FolderOpen, FileClock, FileSearch } from '@lucide/vue'
import EmptyState from './EmptyState.vue'

const selected = ref(null)
const content = ref('')
const loading = ref(false)
const filter = ref('')
// '__all__' = 所有 App 的构建（保底不丢），其余是某个 App 自己的那份
const appFilter = ref('__all__')

/** output 下每个 App 一个目录，group 就是 App 名；「最近」排在最前面 */
const groups = computed(() => {
  const map = new Map()
  for (const h of state.history) {
    if (!map.has(h.group)) map.set(h.group, [])
    map.get(h.group).push(h)
  }
  return [...map.entries()].sort((a, b) => (a[0] === '最近' ? -1 : b[0] === '最近' ? 1 : 0))
})

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return state.history.filter((h) => {
    if (appFilter.value !== '__all__' && h.group !== appFilter.value) return false
    return q ? h.name.toLowerCase().includes(q) : true
  })
})

const shownGroups = computed(() => {
  const map = new Map()
  for (const h of shown.value) {
    if (!map.has(h.group)) map.set(h.group, [])
    map.get(h.group).push(h)
  }
  return [...map.entries()]
})

async function open(item) {
  selected.value = item
  loading.value = true
  const res = await window.api.sdk.log(item.file)
  content.value = res.ok ? res.text : `读取失败：${res.error}`
  loading.value = false
}

async function refresh() {
  await loadHistory()
  if (selected.value) open(selected.value)
}

/** 选中那条日志所在的文件夹；没选就用最新那条 */
const logDir = computed(() => {
  const f = selected.value?.file || state.history[0]?.file || ''
  return f ? f.replace(/[\\/][^\\/]*$/, '') : ''
})

function openLogDir() {
  if (logDir.value) window.api.shell.openPath(logDir.value)
}

</script>

<template>
  <div class="p-5 flex flex-col gap-6 h-full min-h-0">
    <div class="flex items-center gap-3">
      <h1 class="text-title font-semibold tracking-tight m-0">构建历史</h1>
      <span class="text-label text-faint">
        <span class="font-mono">ContentBuilder\output\</span> 下的所有构建日志
      </span>
      <div class="flex-1" />
      <input
        v-model="filter"
        placeholder="筛选文件名"
        class="h-9 w-[200px] px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
      />
      <button class="btn no-drag" :disabled="!logDir" title="在资源管理器里打开日志所在文件夹" @click="openLogDir">
        <FolderOpen :size="14" :stroke-width="1.9" />
        打开文件夹
      </button>
      <button class="btn no-drag" @click="refresh">刷新</button>
    </div>

    <!-- 全部 / 每个 App 一份 -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <button
        class="chip"
        :class="appFilter === '__all__' ? 'chip-on' : ''"
        @click="appFilter = '__all__'"
      >
        全部
        <span class="num text-faint">{{ state.history.length }}</span>
      </button>
      <button
        v-for="[group, items] in groups"
        :key="group"
        class="chip"
        :class="appFilter === group ? 'chip-on' : ''"
        @click="appFilter = group"
      >
        {{ group }}
        <span class="num text-faint">{{ items.length }}</span>
      </button>
    </div>

    <div class="grid grid-cols-[330px_1fr] gap-4 flex-1 min-h-0">
      <!-- 列表 -->
      <div class="card overflow-y-auto scroll-thin min-h-0 min-w-0" v-reveal>
        <div v-for="[group, items] in shownGroups" :key="group" class="p-2.5">
          <div class="px-2 py-1.5 text-micro font-semibold tracking-wider text-faint uppercase">
            {{ group }}
          </div>
          <button
            v-for="h in items"
            :key="h.file"
            class="w-full text-left px-2.5 py-2 rounded-card transition-colors cursor-pointer border-0 bg-transparent"
            :class="
              selected?.file === h.file
                ? 'bg-[rgba(102,192,244,.07)] ring-1 ring-[rgba(102,192,244,.3)]'
                : 'hover:bg-surface-2'
            "
            @click="open(h)"
          >
            <div class="text-body font-normal truncate">{{ h.name }}</div>
            <div class="mt-1 flex items-center justify-between gap-2 text-micro text-faint num">
              <span>{{ fmtTime(h.mtime) }}</span>
              <span>{{ fmtSize(h.size) }}</span>
            </div>
          </button>
        </div>

        <div v-if="!shown.length" class="p-4">
          <EmptyState
            compact
            :icon="FileClock"
            title="还没有构建日志"
            hint="跑一次「检查配置」或「Preview 空跑」，日志会落在 output 目录并出现在这里。"
          />
        </div>
      </div>

      <!-- 内容 -->
      <div class="card overflow-hidden flex flex-col min-h-0 min-w-0" v-reveal="{ delay: 0.04 }">
        <header class="px-4 py-2.5 border-b border-line flex items-center gap-3 shrink-0">
          <span class="text-body font-normal truncate">
            {{ selected?.name || '选一个日志' }}
          </span>
          <span v-if="selected" class="text-micro text-faint font-mono break-all ml-auto" :title="selected.file">
            {{ selected.file }}
          </span>
        </header>
        <div class="flex-1 min-h-0 overflow-auto scroll-thin bg-surface-2 p-4">
          <Transition name="fade-fast" mode="out-in">
            <div v-if="loading" key="loading" class="text-label text-faint">读取中…</div>
            <pre
              v-else-if="content"
              key="content"
              class="m-0 text-label leading-[1.7] font-mono text-muted whitespace-pre-wrap break-all"
              >{{ content }}</pre
            >
            <div v-else key="empty" class="h-full grid place-items-center">
              <EmptyState
                :icon="FileSearch"
                title="选一个日志看内容"
                hint="左边列表里点一下文件名；这里会显示明文，可以全选复制。"
              />
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>
