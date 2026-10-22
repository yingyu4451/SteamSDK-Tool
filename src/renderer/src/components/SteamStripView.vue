<script setup>
import { computed } from 'vue'
import {
  state,
  pickStripFolder,
  resetStrip,
  reopenStripConfirm,
  openStripDest,
  confirmStripCopy
} from '../store.js'
import { fmtInt, fmtSize } from '../format.js'
import {
  Unplug,
  FolderOpen,
  Copy,
  CircleCheck,
  TriangleAlert,
  X,
  ArrowRight
} from '@lucide/vue'
import PathLink from './PathLink.vue'

const strip = computed(() => state.strip)
const inspect = computed(() => strip.value.inspect)
const result = computed(() => strip.value.result)
const busy = computed(() => strip.value.busy)
const dropOver = computed(() => !!state.drop.over)

const pct = computed(() => {
  const p = strip.value.progress
  if (!p || !p.totalBytes) return 0
  return Math.min(100, (p.copiedBytes / p.totalBytes) * 100)
})
</script>

<template>
  <div class="p-5 flex flex-col gap-4 min-w-0 max-w-[1000px]">
    <!-- 标题 -->
    <div class="card px-5 py-4 flex items-start gap-3">
      <div
        class="shrink-0 w-9 h-9 rounded-[9px] grid place-items-center bg-[rgba(102,192,244,.1)] text-accent border border-[rgba(102,192,244,.18)]"
      >
        <Unplug :size="17" :stroke-width="1.8" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h1 class="text-[17px] font-semibold text-ink">剥离 Steam</h1>
          <span class="pill pill-idle">复制后剥离</span>
        </div>
        <p class="mt-1 text-[12px] leading-relaxed text-muted">
          把已经打包好的游戏文件夹拖进来，确认后复制一份到旁边，副本里去掉
          <span class="font-mono text-faint">steam_api64.dll</span> 这类 Steam
          运行库，启动时就不绑定 Steam。原文件夹一个字节都不动，副本可以随时删掉。
        </p>
      </div>
      <button class="btn shrink-0" :disabled="busy" @click="pickStripFolder">
        <FolderOpen :size="15" :stroke-width="1.8" />
        选择文件夹
      </button>
    </div>

    <!-- 错误 -->
    <div
      v-if="strip.error && !strip.confirmOpen"
      class="card-flat px-4 py-3 flex items-start gap-2 text-[12px] text-[#ff8a8a]"
    >
      <TriangleAlert :size="15" :stroke-width="1.9" class="shrink-0 mt-0.5" />
      <div class="min-w-0 break-all">{{ strip.error }}</div>
    </div>

    <!-- 复制进度 -->
    <div v-if="busy" class="card p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2 text-[13px] text-ink">
        <Copy :size="15" :stroke-width="1.8" class="text-accent" />
        正在复制并剥离…
        <span class="ml-auto num text-[12px] text-muted">{{ Math.round(pct) }}%</span>
      </div>
      <div class="h-1.5 rounded-full bg-[#101824] overflow-hidden">
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-200"
          :style="{ width: pct + '%' }"
        />
      </div>
      <div class="flex items-center justify-between text-[12px] text-muted">
        <span class="num"
          >{{ fmtInt(strip.progress?.copiedFiles || 0) }} /
          {{ fmtInt(strip.progress?.totalFiles || 0) }} 个文件</span
        >
        <span class="num"
          >{{ fmtSize(strip.progress?.copiedBytes || 0) }} /
          {{ fmtSize(strip.progress?.totalBytes || 0) }}</span
        >
      </div>
      <div class="font-mono text-[11px] text-faint truncate">
        {{ strip.progress?.rel || '' }}
      </div>
    </div>

    <!-- 完成 -->
    <div v-else-if="result" class="card p-4 flex flex-col gap-4">
      <div class="flex items-start gap-3">
        <CircleCheck :size="20" :stroke-width="1.9" class="shrink-0 text-success mt-0.5" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[14px] font-semibold text-ink">复制完成</span>
            <span
              v-if="result.stripped.length"
              class="pill pill-ok"
              :title="`副本里少了 ${result.stripped.length} 个 Steam 文件`"
            >
              已剥掉 {{ result.stripped.length }} 个文件
            </span>
            <span v-else class="pill pill-warn" title="副本内容和原文件夹一样">
              没找到 Steam 运行库
            </span>
          </div>
          <div class="mt-2 flex flex-col gap-1.5 text-[12px]">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-[64px] shrink-0 text-faint">原文件夹</span>
              <PathLink :path="result.src" />
            </div>
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-[64px] shrink-0 text-faint">副本</span>
              <PathLink :path="result.dest" />
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="card-flat px-3.5 py-2.5">
          <div class="text-[11px] text-faint">复制文件</div>
          <div class="num text-[16px] text-ink mt-0.5">{{ fmtInt(result.copiedFiles) }}</div>
        </div>
        <div class="card-flat px-3.5 py-2.5">
          <div class="text-[11px] text-faint">复制体积</div>
          <div class="num text-[16px] text-ink mt-0.5">{{ fmtSize(result.copiedBytes) }}</div>
        </div>
        <div class="card-flat px-3.5 py-2.5">
          <div class="text-[11px] text-faint">剥掉的文件</div>
          <div class="num text-[16px] text-ink mt-0.5">{{ fmtInt(result.stripped.length) }}</div>
        </div>
      </div>

      <div v-if="result.stripped.length" class="card-flat px-3.5 py-3">
        <div class="text-[11px] font-semibold tracking-wider text-faint uppercase mb-1">
          副本里没有这些文件
        </div>
        <div
          v-for="f in result.stripped"
          :key="f.rel"
          class="flex items-center gap-2 text-[12px] py-0.5"
        >
          <X :size="12" :stroke-width="2" class="shrink-0 text-danger" />
          <span class="font-mono truncate text-muted">{{ f.rel }}</span>
          <span class="ml-auto num shrink-0 text-faint">{{ fmtSize(f.size) }}</span>
        </div>
      </div>

      <div v-if="result.keptManaged?.length" class="text-[11.5px] leading-relaxed text-faint">
        托管 DLL 保留：
        <span class="font-mono">{{ result.keptManaged.map((f) => f.name).join('、') }}</span>
        —— 游戏程序集还引用它们，删了启动会报错，所以只剥原生运行库。
      </div>

      <div class="flex items-center gap-2">
        <button class="btn btn-primary" @click="openStripDest">
          <FolderOpen :size="15" :stroke-width="1.8" />
          打开副本文件夹
        </button>
        <button class="btn" @click="resetStrip">
          <ArrowRight :size="15" :stroke-width="1.8" />
          再来一个
        </button>
      </div>
    </div>

    <!-- 已选但还没确认（比如先把确认弹窗关了） -->
    <div v-else-if="inspect" class="card p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2 text-[13px] text-ink">
        <Unplug :size="15" :stroke-width="1.8" class="text-accent" />
        已选文件夹
      </div>
      <PathLink :path="inspect.root" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span><span class="num text-ink">{{ fmtInt(inspect.totalFiles) }}</span> 个文件</span>
        <span><span class="num text-ink">{{ fmtSize(inspect.totalBytes) }}</span></span>
        <span>
          要剥掉
          <span class="num text-ink">{{ inspect.native.length + inspect.config.length }}</span>
          个 Steam 文件（{{ inspect.native.length }} 个原生运行库）
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-primary" @click="reopenStripConfirm">
          <Copy :size="15" :stroke-width="1.8" />
          继续确认
        </button>
        <button class="btn" @click="pickStripFolder">换一个文件夹</button>
      </div>
    </div>

    <!-- 起始：拖拽区 -->
    <div
      v-else
      class="card p-8 min-h-[320px] grid place-items-center relative overflow-hidden cursor-pointer"
      :class="dropOver && 'border-accent'"
      @click="pickStripFolder"
    >
      <div
        class="absolute inset-2 rounded-[12px] border-2 border-dashed transition-colors"
        :class="dropOver ? 'border-[rgba(102,192,244,.6)]' : 'border-[rgba(102,192,244,.16)]'"
      />
      <div class="relative flex flex-col items-center gap-3 text-center">
        <div
          class="w-12 h-12 rounded-full grid place-items-center"
          :class="
            dropOver
              ? 'bg-[rgba(102,192,244,.18)] text-accent'
              : 'bg-[rgba(102,192,244,.08)] text-faint'
          "
        >
          <Unplug :size="22" :stroke-width="1.7" />
        </div>
        <div class="text-[14px] font-medium text-ink">
          {{ dropOver ? '松手就检查这个文件夹' : '把游戏文件夹拖到这里' }}
        </div>
        <div class="text-[12px] text-muted">
          或者
          <span class="text-accent underline underline-offset-2">点这里选文件夹</span>
        </div>
        <div class="text-[11px] text-faint mt-1">
          只处理文件夹本身；原文件夹不改动，只复制副本再剥离
        </div>
      </div>
    </div>

    <!-- 说明 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="card-flat px-4 py-3">
        <div class="text-[12px] font-semibold text-ink mb-1">原文件夹不动</div>
        <div class="text-[11.5px] leading-relaxed text-muted">
          剥离只发生在副本里，原文件夹内容、时间戳都不变；副本坏了直接删掉重来。
        </div>
      </div>
      <div class="card-flat px-4 py-3">
        <div class="text-[12px] font-semibold text-ink mb-1">剥掉什么</div>
        <div class="text-[11.5px] leading-relaxed text-muted">
          steam_api64.dll / steam_api.dll / libsteam_api.so / libsteam_api.dylib，以及可选的
          steam_appid.txt。副本照常复制其它所有文件。
        </div>
      </div>
      <div class="card-flat px-4 py-3">
        <div class="text-[12px] font-semibold text-ink mb-1">托管 DLL 保留</div>
        <div class="text-[11.5px] leading-relaxed text-muted">
          com.rlabrecque.steamworks.net.dll 这类要留着：游戏程序集还引用它，删了会在加载时报错，不是「不绑
          Steam」。
        </div>
      </div>
    </div>

  </div>
</template>
