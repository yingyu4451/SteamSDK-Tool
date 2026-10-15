<script setup>
import { computed } from 'vue'
import { state, openOrphanDialog } from '../store.js'
import AppHeader from './AppHeader.vue'
import ActionBar from './ActionBar.vue'
import StatCard from './StatCard.vue'
import DepotMatrix from './DepotMatrix.vue'
import BranchPanel from './BranchPanel.vue'
import ConsoleLog from './ConsoleLog.vue'
import { TriangleAlert, Upload } from '@lucide/vue'

const detail = computed(() => state.detail)

const agg = computed(() => {
  const a = { upload: 0, uploadBytes: 0, excluded: 0, total: 0, totalBytes: 0 }
  for (const d of detail.value?.depots || []) {
    const x = d.analysis
    if (!x) continue
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
</script>

<template>
  <div class="p-5 flex flex-col gap-4 min-w-0">
    <!-- scripts 根目录下有游离的 vdf：它们不属于任何 App，列表里看不见 -->
    <div
      v-if="state.orphans.length"
      class="card p-4 border-[rgba(255,180,84,.3)] bg-[rgba(255,180,84,.045)]"
      v-reveal
    >
      <div class="flex items-start gap-3">
        <TriangleAlert :size="20" :stroke-width="1.9" class="shrink-0 text-amber mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="text-[12.5px] text-amber font-medium">
            scripts 根目录下有 {{ state.orphans.length }} 个 vdf 没有被任何 App 管着
          </div>
          <div class="mt-2 flex flex-col gap-0.5">
            <div
              v-for="o in state.orphans"
              :key="o.file"
              class="font-mono text-[11px] text-muted truncate"
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
      <div
        v-if="!detail && !state.detailLoading"
        key="__none"
        class="card p-10 flex flex-col items-center gap-3 text-center"
        v-reveal
      >
        <div
          class="w-12 h-12 rounded-2xl grid place-items-center border border-line bg-surface-2"
        >
          <Upload :size="24" :stroke-width="1.8" class="text-faint" />
        </div>
        <div class="text-[14px] font-medium">左侧选一个 App</div>
      </div>

      <div v-else-if="detail" :key="state.selectedDir" class="flex flex-col gap-4 min-w-0">
        <AppHeader />
        <ActionBar />

      <!-- 概览数字 -->
      <div class="grid grid-cols-4 gap-3">
        <StatCard
          label="会上传"
          :value="agg.upload"
          unit="个文件"
          tone="accent"
          :hint="`磁盘共 ${agg.total.toLocaleString('en-US')} 个`"
          v-reveal="{ delay: 0.02 }"
        />
        <StatCard
          label="上传体积"
          :value="uploadMb"
          format="mb"
          tone="ink"
          :hint="`磁盘共 ${totalMb.toFixed(1)} MB`"
          v-reveal="{ delay: 0.04 }"
        />
        <StatCard
          label="被排除"
          :value="agg.excluded"
          unit="个文件"
          :tone="agg.excluded ? 'amber' : 'muted'"
          hint="只不上传，本地保留"
          v-reveal="{ delay: 0.06 }"
        />
        <StatCard
          label="待处理"
          :value="detail.problems?.length || 0"
          unit="项"
          :tone="detail.problems?.length ? 'danger' : 'success'"
          :hint="detail.problems?.length ? '见上方问题清单' : '没有发现问题'"
          v-reveal="{ delay: 0.08 }"
        />
      </div>

      <!-- 左边 Depot（下面挂分支），右边构建输出。
           两列都 stretch：构建输出的底边就跟分支那块的底边齐平，不再各高各的。 -->
      <div class="grid grid-cols-[1.2fr_1fr] gap-4 min-w-0">
        <div class="flex flex-col gap-4 min-w-0">
          <DepotMatrix :depots="detail.depots || []" />
          <BranchPanel />
        </div>
        <ConsoleLog />
      </div>
      </div>

      <!-- 加载中 -->
      <div v-else key="__loading" class="card p-10 grid place-items-center text-muted text-[13px]">
        <div class="flex items-center gap-3">
          <div class="w-5 h-5 rounded-full border-2 border-[#23303d] border-t-[#66c0f4] animate-spin" />
          正在读取 {{ state.selectedDir }}…
        </div>
      </div>
    </Transition>
  </div>
</template>
