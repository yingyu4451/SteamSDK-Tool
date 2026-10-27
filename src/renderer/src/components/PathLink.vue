<script setup>
import { state } from '../store.js'
import { ExternalLink, File, Folder } from '@lucide/vue'

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
    <component
      :is="kind === 'folder' ? Folder : File"
      :size="14"
      :stroke-width="1.8"
      class="shrink-0"
    />
    <span class="path-text">{{ path }}</span>
    <ExternalLink :size="12" :stroke-width="2" class="shrink-0 opacity-55" />
  </button>
  <span v-else class="text-label text-faint">—</span>
</template>
