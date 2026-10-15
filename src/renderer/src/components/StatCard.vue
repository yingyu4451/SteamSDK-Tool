<script setup>
import { computed } from 'vue'
import { useCountUp } from '../motion.js'

const props = defineProps({
  label: String,
  value: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  tone: { type: String, default: 'ink' }, // ink | accent | amber | danger | success | muted
  hint: String,
  format: { type: String, default: 'int' } // int | mb | gb
})

const display = useCountUp(() => props.value)

const text = computed(() => {
  const v = Number(display.value) || 0
  if (props.format === 'mb') return v >= 1024 ? (v / 1024).toFixed(2) : v.toFixed(1)
  if (props.format === 'gb') return (v / 1024).toFixed(2)
  return Math.round(v).toLocaleString('en-US')
})

const unitText = computed(() => {
  if (props.format === 'mb') return (Number(display.value) || 0) >= 1024 ? 'GB' : 'MB'
  return props.unit
})

const toneClass = computed(
  () =>
    ({
      ink: 'text-ink',
      accent: 'text-accent',
      amber: 'text-amber',
      danger: 'text-danger',
      success: 'text-success',
      muted: 'text-muted'
    })[props.tone] || 'text-ink'
)
</script>

<template>
  <div class="card p-4 overflow-hidden min-w-0">
    <div class="text-[11px] font-semibold tracking-wider text-faint uppercase">{{ label }}</div>
    <div class="mt-1.5 flex items-baseline gap-1.5">
      <span class="num text-[26px] font-semibold leading-none" :class="toneClass">{{ text }}</span>
      <span v-if="unitText" class="text-[12px] text-faint">{{ unitText }}</span>
    </div>
    <div v-if="hint" class="mt-2 text-[11.5px] text-faint leading-snug">{{ hint }}</div>
  </div>
</template>
