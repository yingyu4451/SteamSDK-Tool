<script setup>
import { computed, ref } from 'vue'
import { state, openDrawer, ignoreProblem } from '../store.js'
import PathLink from './PathLink.vue'

const app = computed(() => state.detail)
const showIgnored = ref(false)

const status = computed(() => {
  if (!app.value || app.value.error) return { tone: 'pill-bad', text: '读取失败' }
  if (dup.value) return { tone: 'pill-bad', text: 'AppID 冲突' }
  if (app.value.problems?.length) return { tone: 'pill-warn', text: `${app.value.problems.length} 项待处理` }
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
          <button class="btn h-7 px-2.5 text-[11.5px] no-drag" @click="openDrawer('app')">编辑</button>
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

    <!-- 问题清单 -->
    <div
      v-if="app.problems?.length"
      class="mt-4 rounded-[10px] border border-[rgba(255,180,84,.22)] bg-[rgba(255,180,84,.05)] p-3"
    >
      <div class="text-[11.5px] font-semibold text-amber mb-1.5">待处理</div>
      <div class="flex flex-col gap-1">
        <div v-for="(p, i) in app.problems" :key="i" class="flex items-start gap-2 group">
          <span class="text-[12px] text-[#d7c3a0] leading-relaxed min-w-0 flex-1">{{ p }}</span>
          <button
            class="btn h-6 px-2 text-[10.5px] no-drag shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            title="这条不再提示（原文一样才认作同一条，路径变了会重新报）"
            @click="ignoreProblem(p, true)"
          >
            忽略
          </button>
        </div>
      </div>
    </div>

    <!-- 已忽略的 -->
    <div v-if="app.problemsIgnored?.length" class="mt-3 text-[11.5px]">
      <button
        class="bg-transparent border-0 p-0 cursor-pointer text-faint hover:text-muted underline decoration-dotted"
        @click="showIgnored = !showIgnored"
      >
        已忽略 {{ app.problemsIgnored.length }} 条{{ showIgnored ? '，收起' : '' }}
      </button>
      <div v-if="showIgnored" class="mt-2 flex flex-col gap-1">
        <div v-for="(p, i) in app.problemsIgnored" :key="'ig' + i" class="flex items-start gap-2">
          <span class="text-[11.5px] text-faint leading-relaxed min-w-0 flex-1 line-through">{{ p }}</span>
          <button class="btn h-6 px-2 text-[10.5px] no-drag shrink-0" @click="ignoreProblem(p, false)">
            恢复
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="app?.error" class="card p-5 border-[#4a2a2a]">
    <div class="text-[14px] font-semibold text-[#ff8a8a]">读取 App 失败</div>
    <div class="text-[12.5px] text-muted mt-1.5">{{ app.error }}</div>
  </div>
</template>
