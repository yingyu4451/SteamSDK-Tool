<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import gsap from 'gsap'
import { state, closeOrphanDialog, submitOrphanDialog } from '../store.js'
import { X } from '@lucide/vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const el = ref(null)
const input = ref(null)

onMounted(() => {
  if (el.value) {
    gsap.fromTo(
      el.value,
      { opacity: 0, y: 18, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out', clearProps: 'transform,opacity' }
    )
  }
  nextTick(() => input.value?.focus())
})

const d = computed(() => state.orphanDialog)
const orphans = computed(() => state.orphans || [])
const apps = computed(() => orphans.value.filter((o) => o.kind === 'app'))
const depots = computed(() => orphans.value.filter((o) => o.kind === 'depot'))

useDialogA11y(el, closeOrphanDialog, { isOpen: () => !!d.value })

const canSubmit = computed(() => !!d.value && !!d.value.name.trim() && !d.value.busy)
</script>

<template>
  <Transition name="overlay">
  <div v-if="d" class="fixed inset-0 z-50 grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeOrphanDialog" />

    <div ref="el" role="dialog" aria-modal="true" aria-labelledby="adopt-title" class="relative card w-full max-w-[560px] max-h-[86vh] overflow-y-auto scroll-thin no-drag">
      <header class="px-6 pt-5 pb-4 border-b border-line flex items-start gap-3">
        <div>
          <h2 id="adopt-title" class="text-lead font-semibold m-0">把游离的 vdf 收进一个 App</h2>
        </div>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer"
          @click="closeOrphanDialog"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="p-6 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="text-label text-muted">App 名字（新文件夹的名字）</span>
          <input
            ref="input"
            :value="d.name"
            placeholder="例如 MyGame"
            class="h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
            @input="d.name = $event.target.value"
            @keydown.enter="canSubmit && submitOrphanDialog()"
          />
        </label>

        <div class="card-flat p-3.5">
          <div class="text-micro font-semibold tracking-wider text-faint uppercase mb-2">
            会被搬走的文件
          </div>
          <div
            v-for="o in apps"
            :key="o.file"
            class="font-mono text-label text-accent py-0.5 truncate"
          >
            <span class="text-faint">app　</span>{{ o.file }}
            <span class="text-faint"> → app_{{ o.appId || 'unknown' }}.vdf</span>
          </div>
          <div
            v-for="o in depots"
            :key="o.file"
            class="font-mono text-label text-accent py-0.5 truncate"
          >
            <span class="text-faint">depot</span> {{ o.file }}
          </div>
        </div>

        <div
          v-if="d.error"
          class="rounded-card border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-label text-danger"
        >
          {{ d.error }}
        </div>
      </div>

      <footer class="px-6 py-4 border-t border-line flex items-center gap-2">
        <span class="text-micro text-faint">只搬文件，不动磁盘上的游戏内容</span>
        <div class="flex-1" />
        <button class="btn" @click="closeOrphanDialog">取消</button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submitOrphanDialog">
          {{ d.busy ? '搬运中…' : '收拢' }}
        </button>
      </footer>
    </div>
  </div>
  </Transition>
</template>
