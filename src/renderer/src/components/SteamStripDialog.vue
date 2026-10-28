<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import {
  state,
  closeStripConfirm,
  setStripDest,
  setStripRemoveConfig,
  confirmStripCopy,
  pickStripDest
} from '../store.js'
import { fmtInt, fmtSize } from '../format.js'
import { Unplug, X, Copy, TriangleAlert } from '@lucide/vue'
import PathLink from './PathLink.vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const el = ref(null)

const s = computed(() => state.strip)
const inspect = computed(() => s.value.inspect)
const native = computed(() => inspect.value?.native || [])
const config = computed(() => inspect.value?.config || [])
const managed = computed(() => inspect.value?.managed || [])
const removeConfig = computed(() => !!s.value.removeConfig)
const busy = computed(() => !!s.value.busy)
const open = computed(() => !!s.value.confirmOpen && !!inspect.value)

const stripCount = computed(
  () => native.value.length + (removeConfig.value ? config.value.length : 0)
)
const copyFiles = computed(
  () => (inspect.value?.copyFiles || 0) + (removeConfig.value ? 0 : config.value.length)
)
const copyBytes = computed(() => {
  const base = inspect.value?.copyBytes || 0
  if (removeConfig.value) return base
  return base + config.value.reduce((n, f) => n + (Number(f.size) || 0), 0)
})

const pct = computed(() => {
  const p = s.value.progress
  if (!p || !p.totalBytes) return 0
  return Math.min(100, (p.copiedBytes / p.totalBytes) * 100)
})

function animateIn() {
  if (!el.value) return
  gsap.fromTo(
    el.value,
    { opacity: 0, y: 16, scale: 0.985 },
    { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' }
  )
}

watch(open, async (v) => {
  if (!v) return
  await nextTick()
  animateIn()
})

useDialogA11y(el, () => {
  if (!busy.value) closeStripConfirm()
}, { isOpen: () => open.value })

onMounted(() => {
  if (open.value) animateIn()
})

onBeforeUnmount(() => {
  if (el.value) gsap.killTweensOf(el.value)
})
</script>

<template>
  <Transition name="overlay">
  <div
    v-if="open"
    class="fixed inset-0 z-[62] grid place-items-center bg-black/25 px-6"
    @click.self="!busy && closeStripConfirm()"
  >
    <div ref="el" role="dialog" aria-modal="true" aria-labelledby="strip-dialog-title" class="w-full max-w-[640px] card s-modal overflow-hidden">
      <!-- 头 -->
      <div class="flex items-start gap-3 px-5 py-4 border-b border-line-soft">
        <div
          class="shrink-0 w-9 h-9 rounded-input grid place-items-center bg-[rgba(102,192,244,.1)] text-accent border border-[rgba(102,192,244,.18)]"
        >
          <Unplug :size="17" :stroke-width="1.8" />
        </div>
        <div class="min-w-0 flex-1">
          <div id="strip-dialog-title" class="text-lead font-semibold text-ink">剥离 Steam 运行库</div>
          <div class="mt-0.5 text-label text-muted">
            复制一份到旁边，只去掉副本里的 Steam 原生运行库
          </div>
        </div>
        <button
          class="shrink-0 w-7 h-7 grid place-items-center rounded-md text-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent disabled:opacity-50"
          :disabled="busy"
          title="关闭"
          @click="closeStripConfirm"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </div>

      <!-- 内容 -->
      <div class="px-5 py-4 flex flex-col gap-3.5 max-h-[62vh] overflow-y-auto scroll-thin">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-16 shrink-0 text-label text-faint">原文件夹</span>
          <PathLink :path="inspect.root" />
        </div>
        <div class="flex items-center gap-2 min-w-0 text-label text-muted">
          <span class="w-16 shrink-0 text-faint">文件</span>
          <span>
            <span class="num text-ink">{{ fmtInt(inspect.totalFiles) }}</span> 个 ·
            <span class="num text-ink">{{ fmtSize(inspect.totalBytes) }}</span>
          </span>
        </div>

        <!-- 副本里要去掉的文件 -->
        <div class="card-flat px-3.5 py-3">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-micro font-semibold tracking-wider text-faint uppercase">
              副本里去掉
            </span>
            <span class="text-micro text-faint">
              共 <span class="num text-ink">{{ stripCount }}</span> 个
            </span>
          </div>
          <div v-if="native.length" class="flex flex-col">
            <div
              v-for="f in native"
              :key="f.rel"
              class="flex items-center gap-2 text-label py-0.5 min-w-0"
            >
              <X :size="12" :stroke-width="2" class="shrink-0 text-danger" />
              <span class="font-mono break-all text-muted">{{ f.rel }}</span>
              <span class="ml-auto num shrink-0 text-faint">{{ fmtSize(f.size) }}</span>
            </div>
          </div>
          <div v-else class="text-label text-faint">
            这个文件夹里没找到原生 Steam 运行库，复制后内容会和原文件夹一样。
          </div>
          <label
            v-if="config.length"
            class="mt-2 flex items-start gap-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              class="mt-0.5 accent-[#66c0f4]"
              :checked="removeConfig"
              :disabled="busy"
              @change="setStripRemoveConfig($event.target.checked)"
            />
            <span class="text-label text-muted leading-relaxed">
              也去掉 <span class="font-mono">steam_appid.txt</span>（{{ config.length }} 个）
              —— 有它时启动会拿写死的 AppID 绑 Steam
            </span>
          </label>
        </div>

        <!-- 托管 DLL -->
        <div
          v-if="managed.length"
          class="flex items-start gap-2 text-label leading-relaxed text-faint"
        >
          <span class="w-16 shrink-0">托管 DLL</span>
          <span class="min-w-0">
            保留
            <span class="font-mono text-muted">{{ managed.map((f) => f.name).join('、') }}</span>
            ：游戏程序集还引用它们，删了会直接启动报错。
          </span>
        </div>

        <!-- 副本位置 -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-16 shrink-0 text-label text-faint">副本位置</span>
          <input
            class="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-surface-2 border border-line text-label font-mono text-ink outline-none focus:border-accent disabled:opacity-60"
            :value="s.dest"
            :disabled="busy"
            spellcheck="false"
            @input="setStripDest($event.target.value)"
          />
          <button class="btn shrink-0 px-3 " :disabled="busy" @click="pickStripDest">
            选择…
          </button>
        </div>
        <div class="text-micro text-faint pl-[72px]">
          「选择…」选一个父文件夹，副本自动命名成
          <span class="font-mono">{{ inspect.name }}{{ inspect.destSuffix || '_NoSteam' }}</span>
          ；重名会加 -2、-3。
        </div>

        <!-- 说明 -->
        <div class="flex items-start gap-2 text-label leading-relaxed text-muted">
          <TriangleAlert :size="14" class="shrink-0 mt-0.5 text-amber" />
          <span>
            原文件夹不会改动。确认后开始复制
            <span class="num text-ink">{{ fmtInt(copyFiles) }}</span> 个文件（
            <span class="num text-ink">{{ fmtSize(copyBytes) }}</span>），体积约等于原文件夹。
          </span>
        </div>

        <!-- 进度 -->
        <div v-if="busy" class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-label text-muted">
            <Copy :size="14" :stroke-width="1.8" class="text-accent" />
            正在复制并剥离…
            <span class="ml-auto num">{{ Math.round(pct) }}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-black/40 overflow-hidden">
            <div
              class="h-full rounded-full bg-accent transition-[width] duration-200"
              :style="{ width: pct + '%' }"
            />
          </div>
          <div class="flex items-center justify-between text-micro text-faint">
            <span class="num"
              >{{ fmtInt(s.progress?.copiedFiles || 0) }} /
              {{ fmtInt(s.progress?.totalFiles || 0) }} 个文件</span
            >
            <span class="num"
              >{{ fmtSize(s.progress?.copiedBytes || 0) }} /
              {{ fmtSize(s.progress?.totalBytes || 0) }}</span
            >
          </div>
        </div>

        <!-- 错误 -->
        <div v-if="s.error" class="text-label text-danger break-all">{{ s.error }}</div>
      </div>

      <!-- 底栏 -->
      <div
        class="flex items-center gap-2 px-5 py-3.5 border-t border-line-soft bg-[rgba(9,15,23,.35)]"
      >
        <span class="text-micro text-faint">只复制内容目录，不改 vdf</span>
        <button class="btn ml-auto" :disabled="busy" @click="closeStripConfirm">取消</button>
        <button
          class="btn btn-primary"
          :disabled="busy || !s.dest.trim()"
          @click="confirmStripCopy"
        >
          <Copy :size="15" :stroke-width="1.8" />
          开始剥离
        </button>
      </div>
    </div>
  </div>
  </Transition>
</template>
