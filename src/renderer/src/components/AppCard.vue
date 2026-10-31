<script setup>
import { GripVertical } from '@lucide/vue'
import { state } from '../store.js'

const props = defineProps({
  app: { type: Object, required: true },
  folder: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  dimmed: { type: Boolean, default: false }
})
defineEmits(['pointerdown', 'click'])

function activeProblems(app) {
  const perm = new Set(app.problemsIgnored || [])
  const sess = new Set(state.sessionIgnored?.[app.dirName] || [])
  return (app.problems || []).filter((t) => !perm.has(t) && !sess.has(t)).length
}

function healthOf(app) {
  if ((app.depots || []).some((d) => d.missing)) return 'bad'
  if (!app.appId) return 'bad'
  if (app.appId && state.duplicates?.some((d) => String(d.appId) === String(app.appId))) return 'bad'
  if (activeProblems(app)) return 'warn'
  return 'ok'
}

function healthTitle(app) {
  const h = healthOf(app)
  if (h === 'bad') {
    if ((app.depots || []).some((d) => d.missing)) return '有 Depot 的脚本文件不在了'
    if (!app.appId) return '没有 AppID'
    return 'AppID 和别的本地 App 撞车'
  }
  if (h === 'warn') {
    const n = activeProblems(app)
    return n ? `有待处理 ${n} 项` : '项目文件夹不存在'
  }
  return '一切正常'
}
</script>

<template>
  <button
    :data-dir="app.dirName"
    :data-folder="folder"
    class="text-left rounded-card border px-3 py-2.5 transition-colors cursor-pointer select-none"
    :class="[
      selected
        ? 'border-accent bg-accent/16'
        : 'border-line bg-surface hover:bg-surface-3/45',
      dimmed ? 'opacity-0' : ''
    ]"
    :aria-current="selected ? 'true' : undefined"
    :title="'拖动调整顺序/分类；点击切换到 ' + app.dirName"
    @pointerdown="$emit('pointerdown', $event)"
    @click="$emit('click', $event)"
  >
    <div class="flex items-center gap-2 min-w-0">
      <!-- 三态一律是圆点，只有颜色不同；语义写在 title 里 -->
      <span
        class="w-2 h-2 rounded-full shrink-0"
        :class="
          healthOf(app) === 'bad'
            ? 'bg-danger'
            : healthOf(app) === 'warn'
              ? 'bg-amber'
              : 'bg-success'
        "
        :title="healthTitle(app)"
      />
      <span class="text-body font-normal truncate">{{ app.dirName }}</span>
      <GripVertical class="ml-auto shrink-0 text-faint/60" :size="12" :stroke-width="2" />
    </div>
    <!-- 卡片上只留 SetLive（分支名），AppID 在右侧详情里看；没设分支也占住这一行，别把卡片压矮 -->
    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro num min-h-[16px]">
      <span v-if="app.setLive" class="text-amber break-all">{{ app.setLive }}</span>
    </div>
  </button>
</template>
