<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { Minus, Square, Copy, X } from '@lucide/vue'
import { state, goSettings } from '../store.js'

const upd = computed(() => state.update?.data || null)

/* ---- 自己画的窗口按钮 ----
 * 用 frame:false + 这套按钮，而不是系统的 titleBarOverlay：
 * 系统那三个的高度/配色/hover 都不归我们管，跟 44px 的顶栏对不齐。 */
const maximized = ref(false)
let off = null

onMounted(async () => {
  const r = await window.api.win.state().catch(() => null)
  if (r?.ok) maximized.value = !!r.maximized
  off = window.api.win.onMaximized((v) => (maximized.value = v))
})

onBeforeUnmount(() => {
  if (typeof off === 'function') off()
})

/* 窗口按钮：顶栏是 h-11 + 1px 下边框，内容盒只有 43px。
 * 按钮必须跟着容器走（h-full），不能用 h-11 —— 否则 44px 的按钮塞进 43px 的盒子里，
 * 图标会比右边的状态胶囊高出 1px。 */
const WBTN = 'h-full w-11 grid place-items-center bg-transparent border-0 cursor-pointer text-muted transition-colors'

/* 一定要在这里先把 window.api.win 取出来再用。
 * 模板里的 `window` 不是全局那个：Vue 编译 <script setup> 的模板时会把
 * window.api.win.maximize() 编成 _ctx.window.api.win.maximize()，而 _ctx 上没有
 * window，点下去就是 TypeError，还被 Vue 吞进 console —— 表现就是「按钮点了没反应」。 */
const win = window.api.win
</script>

<template>
  <header
    class="drag min-h-11 shrink-0 flex items-center gap-3 pl-4 border-b border-line bg-surface-2"
  >
    <!-- 标记：和 scripts/make-icon.mjs 画的是同一个图形，几何常量一一对应
         （背景 #2f516e→#121a24、立方体顶 #8fd4fa / 左 #3f92c9 / 右 #245c8c、箭头 #eaf6ff；
         立方体顶顶点 (128,118)、半宽 58、半高 34、侧面下沉 50；箭头杆 x119-137 y40-150，
         箭头三角 (96,74)(160,74)(128,22)）。箭头先画、立方体压上去，看着就是从箱子里升出来。
         这里用矢量重画而不是贴 build/icon.png —— 22px 下位图会糊。 -->
    <div class="flex items-center gap-2.5 no-drag">
      <svg viewBox="0 0 256 256" class="w-[22px] h-[22px] shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="tb-logo-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2f516e" />
            <stop offset="1" stop-color="#121a24" />
          </linearGradient>
        </defs>
        <rect width="256" height="256" rx="54" fill="url(#tb-logo-bg)" />
        <rect x="119" y="40" width="18" height="110" fill="#eaf6ff" />
        <polygon points="96,74 160,74 128,22" fill="#eaf6ff" />
        <polygon points="128,118 186,152 128,186 70,152" fill="#8fd4fa" />
        <polygon points="70,152 128,186 128,236 70,202" fill="#3f92c9" />
        <polygon points="186,152 128,186 128,236 186,202" fill="#245c8c" />
      </svg>
      <span class="text-label font-bold uppercase tracking-[0.09em] text-ink whitespace-nowrap">SteamSDK 上传工作台</span>
    </div>

    <div class="h-4 w-px bg-line" />

    <!-- SDK 路径完整显示：换行而不是省略号。顶栏高 44px 起、可自动长高 -->
    <div class="flex items-center gap-2 text-micro text-faint no-drag min-w-0">
      <span class="font-mono whitespace-normal break-all leading-[1.35]">{{ state.sdk?.sdkRoot || '—' }}</span>
    </div>

    <div class="ml-auto flex items-center gap-2 no-drag">
      <!-- 正在跑 -->
      <Transition
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0 translate-x-1"
        leave-active-class="transition duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="state.running"
          class="flex items-center gap-2 h-6 px-2 rounded-tag bg-[rgba(102,192,244,.1)] border border-[rgba(102,192,244,.28)]"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span class="text-label text-accent font-medium">
            {{ state.runKind === 'check' ? '检查配置中' : state.runPreview ? 'Preview 中' : '上传中' }}
          </span>
        </div>
      </Transition>

      <!-- 有新版本就点一下，直接去设置页 -->
      <button
        v-if="upd?.hasUpdate"
        class="pill pill-warn no-drag cursor-pointer border-0"
        title="有新版本，点开去设置里更新"
        @click="goSettings()"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-amber" />
        v{{ upd.latest }} 可更新
      </button>
    </div>

    <!-- 窗口按钮：和顶栏同高（h-11 = 44px），hover 自己控 -->
    <div class="self-stretch flex items-stretch no-drag">
      <button :class="WBTN" class="hover:bg-surface-3 hover:text-ink" title="最小化" @click="win.minimize()">
        <Minus :size="15" />
      </button>
      <button
        :class="WBTN"
        class="hover:bg-surface-3 hover:text-ink"
        :title="maximized ? '向下还原' : '最大化'"
        @click="win.maximize()"
      >
        <Copy v-if="maximized" :size="13" />
        <Square v-else :size="12" />
      </button>
      <button
        :class="WBTN"
        class="hover:bg-[#c33a3a] hover:text-white"
        title="关闭"
        @click="win.close()"
      >
        <X :size="16" />
      </button>
    </div>
  </header>
</template>
