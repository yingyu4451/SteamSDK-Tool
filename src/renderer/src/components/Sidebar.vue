<script setup>
import { ref, watch, computed } from 'vue'
import {
  LayoutDashboard,
  History,
  Settings,
  RefreshCw,
  Plus,
  BookOpen,
  Unplug,
  FolderPlus,
  GripVertical
} from '@lucide/vue'
import { state, selectApp, rescan, openWizard, setAppOrder } from '../store.js'
import { useListStagger } from '../motion.js'
import EmptyState from './EmptyState.vue'

const listEl = ref(null)
const { run } = useListStagger(listEl, (el) => el.dataset.dir)

watch(
  () => state.apps.map((a) => a.dirName).join('|'),
  () => run(),
  { immediate: true }
)

const nav = [
  { id: 'workbench', label: '工作台', icon: LayoutDashboard },
  { id: 'history', label: '构建历史', icon: History },
  { id: 'strip', label: '剥离 Steam', icon: Unplug },
  { id: 'manual', label: '使用手册', icon: BookOpen },
  { id: 'settings', label: '设置', icon: Settings }
]

const appCount = computed(() => state.apps.length)

/**
 * 显示顺序：settings.appOrder 里有的按它的顺序排，没记录的（新 App）排最后，
 * 同类内保持扫描返回的顺序。拖动排序只改这个表，不动磁盘。
 */
const apps = computed(() => {
  const rank = new Map((state.appOrder || []).map((d, i) => [d, i]))
  return [...state.apps]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const rx = rank.has(x.a.dirName) ? rank.get(x.a.dirName) : Number.MAX_SAFE_INTEGER
      const ry = rank.has(y.a.dirName) ? rank.get(y.a.dirName) : Number.MAX_SAFE_INTEGER
      return rx - ry || x.i - y.i
    })
    .map((o) => o.a)
})

// ---- Apps 列表拖动排序（pointer 事件；不用 HTML5 DnD，避免系统拖拽光标） ----
const drag = ref({ active: false, dir: '', from: -1, insert: -1, startY: 0, pointerId: -1 })
let lastDragEndAt = 0

function cardEls() {
  return listEl.value ? [...listEl.value.querySelectorAll('[data-dir]')] : []
}

function insertionAt(clientY) {
  const els = cardEls()
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect()
    if (clientY < r.top + r.height / 2) return i
  }
  return els.length
}

function onCardPointerDown(e, app) {
  if (e.button !== 0) return
  const from = apps.value.findIndex((a) => a.dirName === app.dirName)
  drag.value = { active: false, dir: app.dirName, from, insert: from, startY: e.clientY, pointerId: e.pointerId }
  const move = (ev) => {
    if (ev.pointerId !== drag.value.pointerId) return
    if (!drag.value.active) {
      if (Math.abs(ev.clientY - drag.value.startY) < 4) return
      drag.value.active = true
    }
    drag.value.insert = insertionAt(ev.clientY)
    ev.preventDefault()
  }
  const up = (ev) => {
    if (ev.pointerId !== drag.value.pointerId) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (drag.value.active) {
      lastDragEndAt = Date.now()
      const d = drag.value
      const arr = apps.value.map((a) => a.dirName)
      const from2 = arr.indexOf(d.dir)
      if (from2 >= 0) {
        const without = arr.filter((x) => x !== d.dir)
        let insert = d.insert
        if (from2 < insert) insert -= 1
        insert = Math.max(0, Math.min(insert, without.length))
        const next = [...without.slice(0, insert), d.dir, ...without.slice(insert)]
        if (next.join('|') !== arr.join('|')) setAppOrder(next)
      }
    }
    drag.value = { active: false, dir: '', from: -1, insert: -1, startY: 0, pointerId: -1 }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onCardClick(app) {
  // 刚拖动完的那一下 click 不要当成「切换 App」
  if (Date.now() - lastDragEndAt < 350) return
  selectApp(app.dirName)
}

/**
 * 三态：红 = 结构性坏了（脚本缺了 / 没有 AppID / AppID 撞车），
 * 黄 = 有待处理但不致命，绿 = 干净。
 *
 * 三个状态用**同一个形状**（圆点），只换颜色 —— 之前黄的是地球、红的是三角、
 * 绿的是圆点，同一个语义轴三种形状，看着像三回事。
 */
/**
 * 还被当回事的待处理条数 —— 永久忽略和「本次忽略」的都不算。
 * 待处理清单本身现在是常驻的（忽略项也留在列表里），所以这里得自己减。
 */
function activeProblems(app) {
  const perm = new Set(app.problemsIgnored || [])
  const sess = new Set(state.sessionIgnored?.[app.dirName] || [])
  return (app.problems || []).filter((t) => !perm.has(t) && !sess.has(t)).length
}

function healthOf(app) {
  if ((app.depots || []).some((d) => d.missing)) return 'bad'
  if (!app.appId) return 'bad'
  if (app.appId && state.duplicates?.some((d) => String(d.appId) === String(app.appId))) return 'bad'
  // 只数「还当回事」的问题。内容目录不存在这类事 collectProblems 已经算进去了，
  // 再单独看一眼 analysis.exists 会让「全部忽略完」之后灯还是黄的。
  if (activeProblems(app)) return 'warn'
  return 'ok'
}

/** 颜色之外再给一句大白话，别只靠颜色传达状态 */
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
  <aside class="w-[236px] shrink-0 s-sidebar flex flex-col min-h-0">
    <!-- 视图切换 -->
    <nav class="p-3 flex flex-col gap-1" v-stagger="{ each: 0.04 }">
      <button
        v-for="n in nav"
        :key="n.id"
        class="s-nav-item group"
        :class="state.view === n.id ? 'is-active' : ''"
        @click="state.view = n.id"
      >
        <component :is="n.icon" :size="16" :stroke-width="1.8" class="shrink-0" />
        {{ n.label }}
      </button>
    </nav>

    <div class="h-px bg-line mx-3" />

    <!-- App 列表 -->
    <div class="px-3 pt-3 pb-2 flex items-center gap-2">
      <span class="text-micro font-semibold tracking-wider text-faint uppercase">Apps</span>
      <span class="num text-micro text-faint">{{ appCount }}</span>
      <button
        class="ml-auto w-7 h-7 grid place-items-center rounded-btn text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="重新扫描 scripts 目录"
        aria-label="重新扫描 scripts 目录"
        @click="rescan"
      >
        <RefreshCw
          :size="14"
          :stroke-width="2"
          :class="state.scanning && 'animate-spin'"
        />
      </button>
      <button
        class="w-7 h-7 grid place-items-center rounded-btn text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="新建 App（Demo / 正式版 / 新平台）"
        aria-label="新建 App"
        @click="openWizard"
      >
        <Plus :size="14" :stroke-width="2.2" />
      </button>
    </div>

    <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 flex flex-col gap-1.5">
      <template v-for="(app, idx) in apps" :key="app.dirName">
        <div v-if="drag.active && drag.insert === idx" class="h-0.5 rounded-full bg-accent shrink-0" />
        <button
          :data-dir="app.dirName"
          class="text-left rounded-card border px-3 py-2.5 transition-colors cursor-pointer select-none"
          :class="[
            state.selectedDir === app.dirName
              ? 'border-[#66c0f4] bg-[rgba(102,192,244,.16)]'
              : 'border-line bg-surface hover:bg-surface-3/45',
            drag.active && drag.dir === app.dirName ? 'opacity-40' : ''
          ]"
          :aria-current="state.selectedDir === app.dirName ? 'true' : undefined"
          :title="'拖动调整顺序；点击切换到 ' + app.dirName"
          @pointerdown="onCardPointerDown($event, app)"
          @click="onCardClick(app)"
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
          <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-faint num">
            <span>App {{ app.appId || '?' }}</span>
            <template v-if="app.setLive">
              <span class="text-faint">·</span>
              <span class="text-amber break-all">{{ app.setLive }}</span>
            </template>
          </div>
        </button>
      </template>
      <div v-if="drag.active && drag.insert === apps.length" class="h-0.5 rounded-full bg-accent shrink-0" />

      <div v-if="!state.apps.length && !state.scanning" class="px-1 py-2">
        <EmptyState compact :icon="FolderPlus" title="还没有 App" hint="点右上角 + 新建一个，或把游戏文件夹拖进窗口。">
          <button class="btn btn-sm" @click="openWizard">新建 App</button>
        </EmptyState>
      </div>

      <div v-if="state.scanErrors?.length" class="mt-1 flex flex-col gap-1">
        <div
          v-for="(e, i) in state.scanErrors"
          :key="i"
          class="text-micro text-danger/80 bg-[rgba(255,92,108,.07)] border border-[rgba(255,92,108,.2)] rounded-btn px-2.5 py-2"
        >
          {{ e.error }}
        </div>
      </div>
    </div>
  </aside>
</template>
