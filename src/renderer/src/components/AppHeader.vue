<script setup>
import { computed, ref } from 'vue'
import {
  state,
  openDrawer,
  ignoreProblem,
  ignoreProblemThisRun,
  restoreProblemThisRun
} from '../store.js'
import PathLink from './PathLink.vue'
import { Pencil } from '@lucide/vue'

const app = computed(() => state.detail)
/** 默认只看见「还该当回事」的；忽略过的点一下表头才展开 */
const showIgnored = ref(false)

/**
 * 待处理清单本身是常驻的（不会整块消失），但**忽略过的行默认收起来** ——
 * 否则忽略完还在原地，看着像没生效。表头那行计数可以点开看回来。
 */
const rows = computed(() => {
  const dir = app.value?.dirName
  const perm = new Set(app.value?.problemsIgnored || [])
  const sess = new Set((dir && state.sessionIgnored?.[dir]) || [])
  return (app.value?.problems || []).map((text) => ({
    text,
    perm: perm.has(text),
    sess: sess.has(text)
  }))
})

const activeRows = computed(() => rows.value.filter((r) => !r.perm && !r.sess))
const ignoredRows = computed(() => rows.value.filter((r) => r.perm || r.sess))
const activeCount = computed(() => activeRows.value.length)
const ignoredCount = computed(() => ignoredRows.value.length)
const visibleRows = computed(() => (showIgnored.value ? rows.value : activeRows.value))

const status = computed(() => {
  if (!app.value || app.value.error) return { tone: 'pill-bad', text: '读取失败' }
  if (dup.value) return { tone: 'pill-bad', text: 'AppID 冲突' }
  if (activeCount.value) return { tone: 'pill-warn', text: `${activeCount.value} 项待处理` }
  return { tone: 'pill-ok', text: '一切正常' }
})

/** 这个 App 的 AppID 是不是也被别的本地 App 用了 */
const dup = computed(() => {
  const id = app.value?.appId
  if (!id) return null
  return state.duplicates?.find((d) => d.appId === id) || null
})
</script>

<template>
  <div v-if="app && !app.error" class="card p-5 min-w-0" v-reveal>
    <div class="flex items-start gap-4 flex-wrap min-w-0">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2.5 flex-wrap min-w-0">
          <h1 class="text-[19px] font-semibold tracking-tight m-0 truncate min-w-0 max-w-[420px]">{{ app.dirName }}</h1>
          <span class="pill" :class="status.tone">{{ status.text }}</span>
          <span v-if="app.setLive" class="pill pill-warn">SetLive · {{ app.setLive }}</span>
          <button class="pill-btn no-drag" title="改 AppID / 描述 / 项目文件夹 / 构建缓存目录" @click="openDrawer('app')">
            <Pencil :size="12" :stroke-width="2.2" />
            编辑
          </button>
        </div>

        <div v-if="app.desc" class="mt-2 text-[12.5px] text-muted truncate">{{ app.desc }}</div>

        <div class="mt-2.5 flex items-center gap-3 flex-wrap text-[12px] text-muted">
          <span class="num">
            AppID <span class="text-ink font-medium">{{ app.appId || '—' }}</span>
          </span>
          <span class="text-line">|</span>
          <span class="num">{{ app.depots.length }} 个 Depot</span>
        </div>

        <div class="mt-3 flex flex-col gap-1.5 min-w-0">
          <div class="flex items-center gap-3 min-w-0">
            <span class="shrink-0 w-[64px] text-[11.5px] text-faint whitespace-nowrap">内容根目录</span>
            <PathLink :path="app.contentRoot" kind="folder" class="min-w-0" />
          </div>

          <div class="flex items-center gap-3 min-w-0">
            <span class="shrink-0 w-[64px] text-[11.5px] text-faint whitespace-nowrap tracking-[0.3em]">构建脚本</span>
            <PathLink :path="app.appPath" kind="file" class="min-w-0" />
          </div>
        </div>
      </div>
    </div>

    <!-- AppID 跨 App 冲突 -->
    <div
      v-if="dup"
      class="mt-4 rounded-[10px] border border-[rgba(255,92,108,.3)] bg-[rgba(255,92,108,.07)] p-3"
    >
      <div class="text-[11.5px] font-semibold text-danger mb-1.5">AppID 冲突</div>
      <div class="text-[12px] text-[#ffb0b8] leading-relaxed">
        AppID <span class="num font-semibold">{{ dup.appId }}</span> 同时被这些本地 App 使用：
        <span class="font-mono">{{ dup.apps.join('、') }}</span>。<br />
        给其中一个跑构建，内容会传到<strong>同一个 Steam App</strong> 上。请到 Steamworks
        后台核对各自的 AppID —— 本地读不到，只有后台有。
      </div>
    </div>

    <!-- 问题清单：块本身常驻，忽略过的行默认收起来（点表头的计数展开） -->
    <div
      v-if="rows.length"
      class="mt-4 rounded-[10px] border border-[rgba(240,169,46,.22)] bg-[rgba(240,169,46,.05)] p-3"
    >
      <div class="flex items-center gap-2 mb-1.5">
        <span class="text-[11.5px] font-semibold text-amber">待处理</span>
        <span class="text-[11px] text-faint num">{{ activeCount }} 项</span>
        <button
          v-if="ignoredCount"
          class="link-btn num"
          :title="showIgnored ? '把忽略过的收起来' : '看看忽略过哪些，可以恢复'"
          @click="showIgnored = !showIgnored"
        >
          已忽略 {{ ignoredCount }} 项{{ showIgnored ? ' · 收起' : '' }}
        </button>
      </div>

      <div class="flex flex-col gap-1">
        <div v-for="(r, i) in visibleRows" :key="i" class="flex items-start gap-2 group">
          <span
            class="text-[12px] leading-relaxed min-w-0 flex-1"
            :class="r.perm || r.sess ? 'text-faint line-through' : 'text-[#d7c3a0]'"
          >{{ r.text }}</span>

          <template v-if="r.perm || r.sess">
            <span class="text-[10px] shrink-0 text-faint pt-[2px]">
              {{ r.perm ? '永久忽略' : '本次忽略' }}
            </span>
            <button
              class="link-btn shrink-0"
              @click="r.perm ? ignoreProblem(r.text, false) : restoreProblemThisRun(r.text)"
            >
              恢复
            </button>
          </template>

          <template v-else>
            <button
              class="link-btn shrink-0"
              title="只这一次不提示 —— 重开应用会回来"
              @click="ignoreProblemThisRun(r.text)"
            >
              本次忽略
            </button>
            <button
              class="link-btn is-danger shrink-0"
              title="写进设置，以后都不再提示（原文完全一样才算同一条，路径变了会重新报）"
              @click="ignoreProblem(r.text, true)"
            >
              永久忽略
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="app?.error" class="card p-5 border-[#4a2a2a]">
    <div class="text-[14px] font-semibold text-[#ff8a8a]">读取 App 失败</div>
    <div class="text-[12.5px] text-muted mt-1.5">{{ app.error }}</div>
  </div>
</template>
