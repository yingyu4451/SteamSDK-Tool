<script setup>
import { state } from '../store.js'

const props = defineProps({
  path: { type: String, default: '' },
  /** folder = 目录，file = 文件（只影响图标） */
  kind: { type: String, default: 'folder' },
  /** 不存在时变暗并给出提示，而不是让用户点了才发现 */
  exists: { type: Boolean, default: true }
})

async function open() {
  const p = String(props.path || '').trim()
  if (!p) return
  const res = await window.api.shell.openPath(p)
  if (!res.ok) state.toast = { text: res.error, tone: 'bad' }
}
</script>

<template>
  <button
    v-if="path"
    class="path-link no-drag"
    :class="exists ? '' : 'opacity-55'"
    :title="
      exists
        ? `在资源管理器里打开：${path}`
        : `路径不存在，点一下试试：${path}`
    "
    @click="open"
  >
    <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 shrink-0" fill="none">
      <path
        v-if="kind === 'folder'"
        d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.1l1.9 2.1h9.2A1.4 1.4 0 0 1 21 9.5v8.1a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 17.6z"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
      <path
        v-else
        d="M6.5 3h7l4.5 4.5V21h-11.5z"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
      />
    </svg>
    <span class="path-text">{{ path }}</span>
    <svg viewBox="0 0 24 24" class="w-3 h-3 shrink-0 opacity-55" fill="none">
      <path
        d="M14 5h5v5M19 5l-7.5 7.5M18 14v4.4A1.6 1.6 0 0 1 16.4 20H5.6A1.6 1.6 0 0 1 4 18.4V7.6A1.6 1.6 0 0 1 5.6 6H10"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
  <span v-else class="text-[11.5px] text-faint">—</span>
</template>
