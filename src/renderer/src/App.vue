<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import {
  boot,
  state,
  wireEvents,
  loadHistory,
  setDropOver,
  dropAnalyze,
  inspectStripFolder,
  zoomStep,
  zoomReset
} from './store.js'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import WorkbenchView from './components/WorkbenchView.vue'
import SteamStripView from './components/SteamStripView.vue'
import HistoryView from './components/HistoryView.vue'
import SettingsView from './components/SettingsView.vue'
import ManualView from './components/ManualView.vue'
import NewAppWizard from './components/NewAppWizard.vue'
import NewDepotSlideover from './components/NewDepotSlideover.vue'
import EditDrawer from './components/EditDrawer.vue'
import DeleteAppDialog from './components/DeleteAppDialog.vue'
import AdoptOrphansDialog from './components/AdoptOrphansDialog.vue'
import ForgetDialog from './components/ForgetDialog.vue'
import DropDialog from './components/DropDialog.vue'
import OnboardGuide from './components/OnboardGuide.vue'
import SteamStripDialog from './components/SteamStripDialog.vue'
import { Upload } from '@lucide/vue'

const views = {
  workbench: WorkbenchView,
  strip: SteamStripView,
  history: HistoryView,
  settings: SettingsView,
  manual: ManualView
}
const current = computed(() => views[state.view] || WorkbenchView)

/* 拖文件夹/压缩包进来。
 * 只认「从资源管理器拖进来的文件」（dataTransfer.types 里有 Files），
 * 不然后台那个平台行拖拽排序（text/plain）也会把这层浮层点亮。 */
let dragDepth = 0

function hasFiles(e) {
  const t = e.dataTransfer?.types
  return !!t && Array.from(t).includes('Files')
}

function onDragEnter(e) {
  if (!hasFiles(e)) return
  dragDepth++
  setDropOver(true)
}

function onDragOver(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(e) {
  if (!hasFiles(e)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) setDropOver(false)
}

function onDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  setDropOver(false)
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  // Electron 32 之后 File.path 没了
  const p = window.api?.drop?.pathFor(file) || ''
  if (!p) {
    setDropOver(false)
    return
  }
  // 剥离 Steam 页只认文件夹：拖进来直接检查它，不走上传内容的分析流程
  if (state.view === 'strip') inspectStripFolder(p)
  else dropAnalyze(p)
}

/* 界面缩放快捷键：Ctrl + = / - / 0（主键盘和小键盘的 + - 都覆盖） */
function onZoomKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    zoomStep(1)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    zoomStep(-1)
  } else if (e.key === '0') {
    e.preventDefault()
    zoomReset()
  }
}

onMounted(async () => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  window.addEventListener('keydown', onZoomKey)

  wireEvents()
  await boot()
  await loadHistory()
})

onUnmounted(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
  window.removeEventListener('keydown', onZoomKey)
})

/* 视图切换：淡出 + 轻微位移，比直接硬切有方向感 */
function onEnter(el, done) {
  gsap.fromTo(
    el,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', onComplete: done }
  )
}
function onLeave(el, done) {
  gsap.to(el, { opacity: 0, y: -6, duration: 0.18, ease: 'power2.in', onComplete: done })
}
</script>

<template>
  <div class="h-full flex flex-col relative z-10">
    <TitleBar />

    <div class="flex-1 flex min-h-0">
      <Sidebar />

      <main class="flex-1 min-w-0 min-h-0 relative">
        <!-- 启动失败 -->
        <div v-if="state.booted && state.bootError" class="p-8">
          <div class="card p-6 border-danger/35">
            <div class="text-lead font-semibold text-danger mb-2">启动失败</div>
            <div class="text-body text-muted">{{ state.bootError }}</div>
          </div>
        </div>

        <!-- 首次加载骨架 -->
        <div v-else-if="!state.booted" class="h-full grid place-items-center">
          <div class="flex flex-col items-center gap-3 text-muted text-body">
            <div
              class="w-7 h-7 rounded-full border-2 border-line border-t-accent animate-spin"
            />
            正在读取 SDK…
          </div>
        </div>

        <Transition v-else mode="out-in" :css="false" @enter="onEnter" @leave="onLeave">
          <!--
            滚动容器必须是这个「单一根节点」的 div。
            视图组件内部是 v-if / v-else 片段（多根节点），Vue 不会把外部传入的
            class 自动继承下去，所以直接给 <component> 加 class 是无效的。
          -->
          <div
            :key="state.view"
            class="h-full min-h-0 overflow-y-auto overflow-x-hidden scroll-thin"
          >
            <component :is="current" />
          </div>
        </Transition>
      </main>
    </div>

    <!-- 全局浮层 -->
    <NewAppWizard />
    <NewDepotSlideover />
    <EditDrawer />
    <DeleteAppDialog />
    <AdoptOrphansDialog />
    <ForgetDialog />
    <DropDialog />
    <OnboardGuide />
    <SteamStripDialog />

    <!-- 拖着东西悬在窗口上 -->
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.drop.over && !state.drop.data"
        class="fixed inset-0 z-[58] grid place-items-center pointer-events-none"
      >
        <div class="absolute inset-3 rounded-card border-2 border-dashed border-accent/50 bg-black/70 backdrop-blur-sm" />
        <div class="relative flex flex-col items-center gap-2 text-accent pointer-events-none">
          <Upload :size="32" :stroke-width="1.8" />
          <div class="text-body font-semibold">
            {{ state.view === 'strip' ? '松手就检查' : '松手就分析' }}
          </div>
          <div class="text-label text-muted">
            {{ state.view === 'strip' ? '把游戏文件夹拖进来' : '文件夹，或者 .zip' }}
          </div>
        </div>
      </div>
    </Transition>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.toast"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-card border text-body shadow-2xl max-w-[80vw] truncate"
        :class="
          state.toast.tone === 'bad'
            ? 'border-danger/30 bg-danger/12 text-danger'
            : 'border-accent/30 bg-surface-2 text-accent'
        "
      >
        {{ state.toast.text }}
      </div>
    </Transition>
  </div>
</template>
