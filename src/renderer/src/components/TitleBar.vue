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
    <!-- 标记 -->
    <div class="flex items-center gap-2.5 no-drag">
      <div
        class="w-[22px] h-[22px] rounded-[7px] grid place-items-center"
        style="background: linear-gradient(145deg, #66c0f4, #17a58d)"
      >
        <svg viewBox="0 0 24 24" class="w-[13px] h-[13px]" fill="none">
          <path
            d="M12 3v10.5M12 13.5 7.5 9M12 13.5 16.5 9M5 19h14"
            stroke="#04231e"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
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
            {{ state.runKind === 'check' ? '自检中' : state.runPreview ? 'Preview 中' : '上传中' }}
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
