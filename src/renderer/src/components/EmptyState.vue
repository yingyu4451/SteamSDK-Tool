<script setup>
defineProps({
  /** lucide 图标组件（如 Terminal），可空 */
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
  /** 紧凑版：面板里的小空态 */
  compact: { type: Boolean, default: false },
  /** default | danger */
  tone: { type: String, default: 'default' },
})
</script>

<template>
  <div class="empty-state" :class="compact?'empty-state-compact':''">
    <div v-if="icon" class="empty-icon" :class="tone==='danger'?'empty-icon-danger':''">
      <component :is="icon" :size="compact ? 16 : 20" :stroke-width="1.8" />
    </div>
    <div class="empty-title">{{ title }}</div>
    <p v-if="hint" class="empty-hint">{{ hint }}</p>
    <div v-if="$slots.default" class="empty-actions">
      <slot />
    </div>
  </div>
</template>
