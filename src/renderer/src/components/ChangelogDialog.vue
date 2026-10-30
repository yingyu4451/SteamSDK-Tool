<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import gsap from 'gsap'
import { History, ChevronDown } from '@lucide/vue'
import { CHANGELOG } from '../changelog.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const el = ref(null)
const list = computed(() => CHANGELOG)
/** 默认展开最新一版，其余收起来 */
const openSet = ref(new Set([0]))

function toggle(i) {
  const next = new Set(openSet.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  openSet.value = next
}

function close() {
  emit('close')
}

useDialogA11y(el, close, { isOpen: () => props.open })

onMounted(async () => {
  await nextTick()
  if (el.value) {
    gsap.fromTo(
      el.value,
      { opacity: 0, y: 16, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' }
    )
  }
})
</script>

<template>
  <Transition name="overlay">
    <div v-if="open" class="fixed inset-0 z-[60] grid place-items-center p-6 no-drag">
      <div class="absolute inset-0 bg-black/25" @click="close" />

      <div
        ref="el"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        class="relative card s-modal w-full max-w-170 max-h-[86vh] overflow-hidden flex flex-col"
      >
        <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3">
          <History :size="18" class="text-accent shrink-0 mt-0.5" />
          <div class="min-w-0">
            <h2 id="changelog-title" class="text-title font-semibold m-0">更新日志</h2>
            <p class="mt-1 mb-0 text-label text-faint leading-relaxed">
              从 v0.1.18 到现在的改动。点版本行展开 / 收起。
            </p>
          </div>
        </header>

        <div class="p-3 flex flex-col gap-1.5 overflow-y-auto scroll-thin">
          <div
            v-for="(v, i) in list"
            :key="v.version"
            class="rounded-card border border-line bg-black/20 overflow-hidden"
          >
            <button
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left border-0 cursor-pointer bg-transparent hover:bg-white/4"
              :aria-expanded="openSet.has(i)"
              @click="toggle(i)"
            >
              <ChevronDown
                :size="14"
                class="shrink-0 text-faint transition-transform duration-200"
                :class="openSet.has(i) ? 'rotate-0' : '-rotate-90'"
              />
              <span class="text-body font-semibold text-ink">v{{ v.version }}</span>
              <span v-if="i === 0" class="pill pill-ok text-micro">最新</span>
              <span class="ml-auto text-micro text-faint">{{ v.date }}</span>
            </button>

            <div class="collapsible" :class="openSet.has(i) && 'is-open'">
              <div>
                <ul
                  class="mt-0 mb-0 pl-9 pr-4 pb-3 flex flex-col gap-1.5 text-label text-muted leading-relaxed"
                >
                  <li v-for="(it, j) in v.items" :key="j" class="list-disc marker:text-line">
                    {{ it }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <footer class="px-5 py-3 border-t border-line flex items-center">
          <div class="flex-1 text-micro text-faint">完整提交记录见 GitHub 仓库</div>
          <button class="btn" @click="close">关闭</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>
