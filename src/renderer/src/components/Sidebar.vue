<script setup>
import { ref, watch, computed } from 'vue'
import {
  LayoutDashboard,
  History,
  Settings,
  RefreshCw,
  ShieldCheck,
  Plus,
  BookOpen,
  Unplug
} from '@lucide/vue'
import { state, selectApp, rescan, openWizard, runCheckAll } from '../store.js'
import { useListStagger } from '../motion.js'

const listEl = ref(null)
const { run } = useListStagger(listEl, (el) => el.dataset.dir)

/** 「全部检查配置」跑起来的时候，图标要亮着 */
const checkingAll = computed(() => state.running && state.runKind === 'check')

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
    return n ? `有待处理 ${n} 项` : '内容根目录不存在'
  }
  return '一切正常'
}
</script>

<template>
  <aside class="w-[268px] shrink-0 border-r border-line bg-[#171a21]/70 flex flex-col min-h-0">
    <!-- 视图切换 -->
    <nav class="p-3 flex flex-col gap-1" v-stagger="{ each: 0.04 }">
      <button
        v-for="n in nav"
        :key="n.id"
        class="group flex items-center gap-2.5 h-9 px-3 rounded-[9px] text-[13px] transition-colors cursor-pointer border-0 text-left"
        :class="
          state.view === n.id
            ? 'bg-surface-3 text-ink font-medium'
            : 'bg-transparent text-muted hover:text-ink hover:bg-surface-2'
        "
        @click="state.view = n.id"
      >
        <component :is="n.icon" :size="16" :stroke-width="1.8" class="shrink-0" />
        {{ n.label }}
        <span
          v-if="state.view === n.id"
          class="ml-auto w-1 h-1 rounded-full bg-accent shrink-0"
        />
      </button>
    </nav>

    <div class="h-px bg-line mx-3" />

    <!-- App 列表 -->
    <div class="px-3 pt-3 pb-2 flex items-center gap-2">
      <span class="text-[11px] font-semibold tracking-wider text-faint uppercase">Apps</span>
      <span class="num text-[11px] text-faint">{{ appCount }}</span>
      <button
        class="ml-auto w-6 h-6 grid place-items-center rounded-md text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="重新扫描 scripts 目录"
        @click="rescan"
      >
        <RefreshCw
          :size="14"
          :stroke-width="2"
          :class="state.scanning && 'animate-spin'"
        />
      </button>
      <button
        class="w-6 h-6 grid place-items-center rounded-md transition-colors cursor-pointer border-0 bg-transparent"
        :class="
          checkingAll
            ? 'text-accent'
            : 'text-faint hover:text-accent hover:bg-surface-2'
        "
        title="把所有 App 都跑一遍 check.ps1"
        @click="runCheckAll"
      >
        <ShieldCheck
          :size="14"
          :stroke-width="1.8"
          :class="checkingAll && 'animate-pulse'"
        />
      </button>
      <button
        class="w-6 h-6 grid place-items-center rounded-md text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="新建 App（Demo / 正式版 / 新平台）"
        @click="openWizard"
      >
        <Plus :size="14" :stroke-width="2.2" />
      </button>
    </div>

    <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 flex flex-col gap-1.5">
      <button
        v-for="app in state.apps"
        :key="app.dirName"
        :data-dir="app.dirName"
        class="text-left rounded-[10px] border px-3 py-2.5 transition-colors cursor-pointer"
        :class="
          state.selectedDir === app.dirName
            ? 'border-[rgba(102,192,244,.34)] bg-[rgba(102,192,244,.06)]'
            : 'border-line bg-surface hover:bg-surface-2'
        "
        @click="selectApp(app.dirName)"
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
          <span class="text-[13px] font-medium truncate">{{ app.dirName }}</span>
        </div>
        <div class="mt-1.5 flex items-center gap-2 text-[11px] text-faint num">
          <span>App {{ app.appId || '?' }}</span>
          <span class="text-rule">·</span>
          <span>{{ app.depots?.length || 0 }} depot</span>
          <span v-if="app.setLive" class="ml-auto text-amber truncate max-w-[74px]">
            {{ app.setLive }}
          </span>
        </div>
      </button>

      <div v-if="!state.apps.length && !state.scanning" class="px-1 py-3">
        <button class="btn h-7 px-2.5 text-[12px] w-full" @click="openWizard">
          ＋ 新建 App
        </button>
      </div>

      <div v-if="state.scanErrors?.length" class="mt-1 flex flex-col gap-1">
        <div
          v-for="(e, i) in state.scanErrors"
          :key="i"
          class="text-[11px] text-danger/80 bg-[rgba(255,92,108,.07)] border border-[rgba(255,92,108,.2)] rounded-lg px-2.5 py-2"
        >
          {{ e.error }}
        </div>
      </div>
    </div>
  </aside>
</template>
