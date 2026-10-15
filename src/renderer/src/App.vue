<script setup>
import { computed, onMounted } from 'vue'
import gsap from 'gsap'
import { boot, state, wireEvents, loadHistory } from './store.js'
import { reducedMotion } from './motion.js'

import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import WorkbenchView from './components/WorkbenchView.vue'
import HistoryView from './components/HistoryView.vue'
import SettingsView from './components/SettingsView.vue'
import NewAppWizard from './components/NewAppWizard.vue'
import NewDepotSlideover from './components/NewDepotSlideover.vue'
import EditDrawer from './components/EditDrawer.vue'
import DeleteAppDialog from './components/DeleteAppDialog.vue'
import AdoptOrphansDialog from './components/AdoptOrphansDialog.vue'

const views = { workbench: WorkbenchView, history: HistoryView, settings: SettingsView }
const current = computed(() => views[state.view] || WorkbenchView)

onMounted(async () => {
  wireEvents()
  await boot()
  await loadHistory()
})

/* 视图切换：淡出 + 轻微位移，比直接硬切有方向感 */
function onEnter(el, done) {
  if (reducedMotion()) return done()
  gsap.fromTo(
    el,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', onComplete: done }
  )
}
function onLeave(el, done) {
  if (reducedMotion()) return done()
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
          <div class="card p-6 border-[#4a2229]">
            <div class="text-[15px] font-semibold text-[#ff8d97] mb-2">启动失败</div>
            <div class="text-[13px] text-muted">{{ state.bootError }}</div>
          </div>
        </div>

        <!-- 首次加载骨架 -->
        <div v-else-if="!state.booted" class="h-full grid place-items-center">
          <div class="flex flex-col items-center gap-3 text-muted text-[13px]">
            <div
              class="w-7 h-7 rounded-full border-2 border-[#23303d] border-t-[#2ee6c5] animate-spin"
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

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="state.toast"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-[11px] border text-[12.5px] shadow-2xl max-w-[80vw] truncate"
        :class="
          state.toast.tone === 'bad'
            ? 'border-[rgba(255,92,108,.3)] bg-[#22141a] text-[#ff8d97]'
            : 'border-[rgba(46,230,197,.3)] bg-[#0d211e] text-accent'
        "
      >
        {{ state.toast.text }}
      </div>
    </Transition>
  </div>
</template>
