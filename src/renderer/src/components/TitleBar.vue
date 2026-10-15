<script setup>
import { computed } from 'vue'
import { state, goSettings } from '../store.js'

const sdkOk = computed(
  () => !!(state.sdk?.steamcmdExists && state.sdk?.scriptsDirExists && state.sdk?.buildScriptExists)
)

const upd = computed(() => state.update?.data || null)
</script>

<template>
  <header
    class="drag h-11 shrink-0 flex items-center gap-3 pl-4 pr-[150px] border-b border-line bg-[#0a0d13]/85 backdrop-blur"
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
      <span class="text-[13px] font-semibold tracking-tight">SteamSDK 上传工作台</span>
    </div>

    <div class="h-4 w-px bg-line" />

    <div class="flex items-center gap-2 text-[12px] text-faint no-drag">
      <span class="font-mono">{{ state.sdk?.sdkRoot || '—' }}</span>
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
          class="flex items-center gap-2 h-6 px-2.5 rounded-full bg-[rgba(102,192,244,.1)] border border-[rgba(102,192,244,.28)]"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span class="text-[11.5px] text-accent font-medium">
            {{ state.runKind === 'check' ? '检查配置中' : state.runPreview ? 'Preview 中' : '上传中' }}
          </span>
        </div>
      </Transition>

      <span class="pill" :class="sdkOk ? 'pill-ok' : 'pill-bad'">
        <span class="w-1.5 h-1.5 rounded-full" :class="sdkOk ? 'bg-success' : 'bg-danger'" />
        {{ sdkOk ? 'SDK 就绪' : 'SDK 路径异常' }}
      </span>

      <span v-if="state.hasPassword" class="pill pill-idle" title="密码已用 DPAPI 加密保存">
        凭据已存
      </span>

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
  </header>
</template>
