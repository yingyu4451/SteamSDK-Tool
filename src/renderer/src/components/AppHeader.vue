<script setup>
import { computed } from 'vue'
import { state, openDrawer, ignoreProblem, ignoreProblemThisRun } from '../store.js'
import { t, num, listSeparator, problemId, problemLabel, isEnglish } from '../i18n/index.js'
import PathLink from './PathLink.vue'
import { Pencil } from '@lucide/vue'

const app = computed(() => state.detail)

/**
 * 待处理清单只列「还该当回事」的那些。
 * 全部忽略掉之后，块本身整个消失 —— 界面上不再留一个「0 项」的空壳。
 * 忽略过的那些挪到「编辑 → 已忽略的提示」里，在那儿恢复。
 */
const rows = computed(() => {
  const dir = app.value?.dirName
  const perm = new Set(app.value?.problemsIgnored || [])
  const sess = new Set((dir && state.sessionIgnored?.[dir]) || [])
  return (app.value?.problems || []).map((p) => {
    // id 是固定中文渲染（忽略状态按它记），label 跟着界面语言走
    const id = problemId(p)
    return { id, label: problemLabel(p), perm: perm.has(id), sess: sess.has(id) }
  })
})

const activeRows = computed(() => rows.value.filter((r) => !r.perm && !r.sess))
const ignoredCount = computed(() => rows.value.filter((r) => r.perm || r.sess).length)
const activeCount = computed(() => activeRows.value.length)

const status = computed(() => {
  if (!app.value || app.value.error) return { tone: 'pill-bad', text: t('读取失败') }
  if (dup.value) return { tone: 'pill-bad', text: t('AppID 冲突') }
  if (activeCount.value) return { tone: 'pill-warn', text: t('{n} 项待处理', { n: num(activeCount.value) }) }
  return { tone: 'pill-ok', text: t('一切正常') }
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
          <h1 class="text-display font-semibold tracking-tight m-0 break-words min-w-0 text-ink">{{ app.dirName }}</h1>
          <span class="pill" :class="status.tone">{{ status.text }}</span>
          <span v-if="app.setLive" class="pill pill-warn">SetLive · {{ app.setLive }}</span>
          <button class="btn btn-sm no-drag" :title="t('改 AppID / 描述 / 项目文件夹 / 构建缓存目录')" @click="openDrawer('app')">
            <Pencil :size="12" :stroke-width="2.2" />
            {{ t('编辑') }}
          </button>
        </div>

        <div v-if="app.desc" class="mt-2 text-body text-muted truncate">{{ app.desc }}</div>

        <div class="mt-2.5 flex items-center gap-3 flex-wrap text-label text-muted">
          <span class="num">
            AppID <span class="text-ink font-normal">{{ app.appId || '—' }}</span>
          </span>
          <span class="text-faint">|</span>
          <span class="num">{{ t('{n} 个 Depot', { n: num(app.depots.length) }) }}</span>
        </div>

        <div class="mt-3 flex flex-col gap-1.5 min-w-0">
          <div class="flex items-start gap-3 min-w-0">
            <span class="shrink-0 pt-1 text-label text-faint whitespace-nowrap" :class="isEnglish ? 'w-28' : 'w-16'">{{ t('项目文件夹') }}</span>
            <PathLink :path="app.contentRoot" kind="folder" class="min-w-0" />
          </div>

          <div class="flex items-start gap-3 min-w-0">
            <span class="shrink-0 pt-1 text-label text-faint whitespace-nowrap" :class="isEnglish ? 'w-28' : 'w-16'">{{ t('构建脚本') }}</span>
            <PathLink :path="app.appPath" kind="file" class="min-w-0" />
          </div>
        </div>
      </div>
    </div>

    <!-- AppID 跨 App 冲突 -->
    <div
      v-if="dup"
      class="fade-in-up mt-4 rounded-card border border-danger/30 bg-danger/7 p-3"
    >
      <div class="text-label font-semibold text-danger mb-1.5">{{ t('AppID 冲突') }}</div>
      <div class="text-label text-muted leading-relaxed">
        AppID <span class="num font-semibold">{{ dup.appId }}</span> {{ t('同时被这些本地 App 使用：') }}
        <span class="font-mono">{{ dup.apps.join(listSeparator()) }}</span>{{ t('。') }}<br />
        {{ t('给其中一个跑构建，内容会传到') }}<strong>{{ t('同一个 Steam App') }}</strong>{{ t(' 上。请到 Steamworks 后台核对各自的 AppID —— 本地读不到，只有后台有。') }}
      </div>
    </div>

    <!-- 问题清单：只列还没被忽略的。全忽略完这块整个消失，不留空壳 -->
    <div
      v-if="activeRows.length"
      class="fade-in-up mt-4 rounded-card border border-amber/22 bg-amber/5 p-3"
    >
      <div class="flex items-center gap-2 mb-1.5">
        <span class="text-label font-semibold text-amber">{{ t('待处理') }}</span>
        <span class="text-micro text-faint num">{{ t('{n} 项', { n: num(activeRows.length) }) }}</span>
        <span v-if="ignoredCount" class="text-micro text-faint num">
          · {{ t('另有 {n} 项已忽略（在「编辑」里恢复）', { n: num(ignoredCount) }) }}
        </span>
      </div>

      <div class="flex flex-col gap-1">
        <div v-for="(r, i) in activeRows" :key="i" class="flex items-start gap-2 group">
          <span class="text-label leading-relaxed min-w-0 flex-1 text-muted">{{ r.label }}</span>

          <button
            class="link-btn shrink-0"
            :title="t('只这一次不提示 —— 重开应用会回来')"
            @click="ignoreProblemThisRun(r.id)"
          >
            {{ t('本次忽略') }}
          </button>
          <button
            class="link-btn is-danger shrink-0"
            :title="t('写进设置，以后都不再提示（原文完全一样才算同一条，路径变了会重新报）。想恢复去「编辑」里')"
            @click="ignoreProblem(r.id, true)"
          >
            {{ t('永久忽略') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="app?.error" class="card p-5 border-danger/35">
    <div class="text-copy font-semibold text-danger">{{ t('读取 App 失败') }}</div>
    <div class="text-body text-muted mt-1.5">{{ app.error }}</div>
  </div>
</template>
