<script setup>
import { computed } from 'vue'
import { state, openOrphanDialog, depotUploadEnabled } from '../store.js'
import AppHeader from './AppHeader.vue'
import ActionBar from './ActionBar.vue'
import DepotMatrix from './DepotMatrix.vue'
import BranchPanel from './BranchPanel.vue'
import ConsoleLog from './ConsoleLog.vue'
import EmptyState from './EmptyState.vue'
import { MousePointerClick, TriangleAlert } from '@lucide/vue'

const detail = computed(() => state.detail)

const agg = computed(() => {
  const a = { upload: 0, uploadBytes: 0, excluded: 0, total: 0, totalBytes: 0 }
  const dirName = detail.value?.dirName || state.selectedDir
  for (const d of detail.value?.depots || []) {
    const x = d.analysis
    if (!x) continue
    // 关掉上传的 Depot 不计入「会上传 / 上传体积」
    if (!depotUploadEnabled(dirName, d.id)) {
      a.excluded += x.excludedCount
      continue
    }
    a.upload += x.uploadCount
    a.uploadBytes += x.uploadBytes
    a.excluded += x.excludedCount
    a.total += x.fileCount
    a.totalBytes += x.totalBytes
  }
  return a
})

const uploadMb = computed(() => agg.value.uploadBytes / 1024 / 1024)
const totalMb = computed(() => agg.value.totalBytes / 1024 / 1024)

/**
 * 还被当回事的待处理条数 —— 永久忽略和「本次忽略」的都不算。
 * 清单本身是常驻的（忽略项也留在里面），所以这里得自己减，
 * 否则会出现「上面写着一切正常、这张卡还报 2 项」。
 */
const activeProblems = computed(() => {
  const d = detail.value
  if (!d) return 0
  const perm = new Set(d.problemsIgnored || [])
  const sess = new Set(state.sessionIgnored?.[d.dirName] || [])
  return (d.problems || []).filter((t) => !perm.has(t) && !sess.has(t)).length
})

const ignoredProblems = computed(() => (detail.value?.problems?.length || 0) - activeProblems.value)
</script>

<template>
  <div class="p-5 flex flex-col gap-6 min-w-0">
    <!-- scripts 根目录下有游离的 vdf：它们不属于任何 App，列表里看不见 -->
    <div
      v-if="state.orphans.length"
      class="card p-4 border-[rgba(255,180,84,.3)] bg-[rgba(255,180,84,.045)]"
      v-reveal
    >
      <div class="flex items-start gap-3">
        <TriangleAlert :size="20" :stroke-width="1.9" class="shrink-0 text-amber mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="text-body text-amber font-normal">
            scripts 根目录下有 {{ state.orphans.length }} 个 vdf 没有被任何 App 管着
          </div>
          <div class="mt-2 flex flex-col gap-0.5">
            <div
              v-for="o in state.orphans"
              :key="o.file"
              class="font-mono text-micro text-muted break-all"
            >
              {{ o.file }}
              <span class="text-faint">
                · {{ o.kind === 'app' ? `app，AppID ${o.appId || '?'}` : `depot ${o.depotId || '?'}` }}
                · {{ o.bytes }} B
              </span>
            </div>
          </div>

          <button class="btn no-drag mt-2.5" @click="openOrphanDialog">收进一个 App 文件夹</button>
        </div>
      </div>
    </div>

    <!-- 切 App 时淡出淡入。只动 opacity / transform，不碰布局尺寸，
         所以不会像早期那些面板一样把整页顶得跳一下。 -->
    <Transition name="appswitch" mode="out-in">
      <!-- 没选 App -->
      <div v-if="!detail && !state.detailLoading" key="__none" class="card p-6" v-reveal>
        <EmptyState
          :icon="MousePointerClick"
          title="左侧选一个 App"
          hint="还没有 App 就点左栏的「＋」加一个；已有的点一下，就能开始检查、空跑或正式上传。"
        />
      </div>

      <div v-else-if="detail" :key="state.selectedDir" class="flex flex-col gap-4 min-w-0">
        <AppHeader />
        <ActionBar />

      <!-- 概览数字：压成一条，别占一块高度 -->
      <div
        class="card px-5 py-2.5 flex items-center gap-5 flex-wrap min-w-0"
        v-reveal="{ delay: 0.02 }"
      >
        <div class="flex items-baseline gap-2 min-w-0" :title="`磁盘共 ${agg.total.toLocaleString('en-US')} 个`">
          <span class="text-micro font-semibold tracking-wider text-faint uppercase shrink-0">会上传</span>
          <span class="num text-title font-semibold text-accent leading-none">{{ agg.upload.toLocaleString('en-US') }}</span>
          <span class="text-label text-faint">个文件</span>
        </div>
        <span class="w-px h-5 bg-line shrink-0" />
        <div class="flex items-baseline gap-2 min-w-0" :title="`磁盘共 ${totalMb.toFixed(1)} MB`">
          <span class="text-micro font-semibold tracking-wider text-faint uppercase shrink-0">上传体积</span>
          <span class="num text-title font-semibold text-ink leading-none">{{ uploadMb >= 1024 ? (uploadMb / 1024).toFixed(2) : uploadMb.toFixed(1) }}</span>
          <span class="text-label text-faint">{{ uploadMb >= 1024 ? 'GB' : 'MB' }}</span>
        </div>
        <span class="w-px h-5 bg-line shrink-0" />
        <div class="flex items-baseline gap-2 min-w-0" title="只不上传，本地保留">
          <span class="text-micro font-semibold tracking-wider text-faint uppercase shrink-0">被排除</span>
          <span
            class="num text-title font-semibold leading-none"
            :class="agg.excluded ? 'text-amber' : 'text-muted'"
          >{{ agg.excluded.toLocaleString('en-US') }}</span>
          <span class="text-label text-faint">个文件</span>
        </div>
        <span class="w-px h-5 bg-line shrink-0" />
        <div
          class="flex items-baseline gap-2 min-w-0"
          :title="
            activeProblems
              ? '见上方问题清单'
              : ignoredProblems
                ? `还有 ${ignoredProblems} 项已忽略`
                : '没有发现问题'
          "
        >
          <span class="text-micro font-semibold tracking-wider text-faint uppercase shrink-0">待处理</span>
          <span
            class="num text-title font-semibold leading-none"
            :class="activeProblems ? 'text-danger' : 'text-success'"
          >{{ activeProblems }}</span>
          <span class="text-label text-faint">项</span>
        </div>
      </div>

      <!-- 左边 Depot（下面挂分支），右边构建输出：右列用 absolute 铺满左列的高度，
           这样行高只由左列决定，日志再多也只会在卡片内部滚动，不会把两列撑高。 -->
      <div class="grid grid-cols-2 gap-4 min-w-0">
        <div class="flex flex-col gap-4 min-w-0 min-h-[320px]">
          <DepotMatrix :depots="detail.depots || []" />
          <BranchPanel />
        </div>
        <div class="relative min-w-0">
          <div class="absolute inset-0 flex flex-col min-h-0">
            <ConsoleLog class="flex-1 min-h-0" />
          </div>
        </div>
      </div>
      </div>

      <!-- 加载中 -->
      <div v-else key="__loading" class="card p-10 grid place-items-center text-muted text-body">
        <div class="flex items-center gap-3">
          <div class="w-5 h-5 rounded-full border-2 border-line border-t-accent animate-spin" />
          正在读取 {{ state.selectedDir }}…
        </div>
      </div>
    </Transition>
  </div>
</template>
