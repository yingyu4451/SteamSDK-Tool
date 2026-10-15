<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import gsap from 'gsap'
import { state, closeDeleteDialog, confirmDelete } from '../store.js'
import { fmtSize, fmtInt } from '../format.js'

const el = ref(null)
const btn = ref(null)

const d = computed(() => state.deleteDialog)

/* ── 二次点击确认 ───────────────────────────────────────────────
   第一次点只是「上膛」，5 秒内再点一次才真删。
   这几件事都会把膛卸掉：超时、关弹窗、改「同时删内容目录」的勾选。
   最后一条最重要 —— 删除范围在你上膛之后变了，就得重新确认。 */
const ARMED_MS = 5000
const armed = ref(false)
const left = ref(0)
let tick = null

function disarm() {
  armed.value = false
  left.value = 0
  clearInterval(tick)
  tick = null
}

function arm() {
  armed.value = true
  left.value = Math.ceil(ARMED_MS / 1000)
  clearInterval(tick)
  tick = setInterval(() => {
    left.value -= 1
    if (left.value <= 0) disarm()
  }, 1000)
}

function onDeleteClick() {
  if (!armed.value) {
    arm()
    return
  }
  disarm()
  confirmDelete()
}

watch(armed, (v) => {
  if (!v || !btn.value) return
  gsap.fromTo(btn.value, { scale: 0.965 }, { scale: 1, duration: 0.22, ease: 'back.out(3)' })
})

watch(
  () => d.value?.deleteContent,
  () => disarm()
)

onMounted(async () => {
  if (el.value) {
    gsap.fromTo(el.value, { opacity: 0, y: 16, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' })
  }
  await nextTick()
})

onUnmounted(disarm)

/** 内容目录里真实存在、且位于 buildsRoot 内、可以删的那些 */
const deletableContent = computed(() => (d.value?.info?.content || []).filter((c) => c.deletable))

const contentTotals = computed(() => {
  const list = deletableContent.value
  return {
    files: list.reduce((a, b) => a + b.files, 0),
    bytes: list.reduce((a, b) => a + b.bytes, 0)
  }
})

const canDelete = computed(() => !!d.value && !d.value.busy && !d.value.loading && !d.value.error)
</script>

<template>
  <div v-if="d" class="fixed inset-0 z-[55] grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" @click="closeDeleteDialog" />

    <div
      ref="el"
      class="relative card w-full max-w-[560px] max-h-[88vh] overflow-y-auto scroll-thin transition-colors duration-200"
      :class="armed ? 'border-[#e24b4b]' : 'border-[#4a2a2a]'"
    >
      <header class="px-6 pt-5 pb-4 border-b border-line">
        <h2 class="text-[15.5px] font-semibold m-0 text-[#ff8a8a]">
          删除 App「{{ d.dirName }}」
        </h2>
        <p class="mt-1.5 mb-0 text-[11.5px] text-[#ff8a8a]">不可撤销。Steam 上已传的构建不受影响。</p>
      </header>

      <div v-if="d.loading" class="p-6 text-[12.5px] text-muted">正在统计要删的东西…</div>

      <div v-else-if="d.error" class="p-6 text-[12.5px] text-danger">{{ d.error }}</div>

      <div v-else class="p-6 flex flex-col gap-4">
        <!-- 脚本目录（一定会删） -->
        <div class="rounded-[10px] border border-[rgba(255,92,108,.22)] bg-[rgba(255,92,108,.05)] p-3.5">
          <div class="flex items-center gap-2">
            <span class="pill pill-bad">一定会删</span>
            <span class="text-[12px] font-medium">构建脚本目录</span>
            <span class="ml-auto num text-[11.5px] text-faint">
              {{ d.info.scripts.files }} 个文件 · {{ fmtSize(d.info.scripts.bytes) }}
            </span>
          </div>
          <div class="mt-2 font-mono text-[11.5px] text-[#ffb0b8] break-all">{{ d.info.scripts.path }}</div>
          <div class="mt-1.5 text-[11px] text-faint">
            包含 app_{{ d.info.appId }}.vdf 和所有 depot 脚本。以后再想要这个版本，得重新建一遍。
          </div>
        </div>

        <!-- 内容目录（可选） -->
        <div class="rounded-[10px] border border-line bg-surface p-3.5">
          <div class="flex items-center gap-2">
            <span class="pill" :class="deletableContent.length ? 'pill-warn' : 'pill-idle'">可选</span>
            <span class="text-[12px] font-medium">内容目录</span>
            <span v-if="deletableContent.length" class="ml-auto num text-[11.5px] text-faint">
              {{ fmtInt(contentTotals.files) }} 个文件 · {{ fmtSize(contentTotals.bytes) }}
            </span>
          </div>

          <label
            v-if="deletableContent.length"
            class="mt-2.5 flex items-start gap-2 text-[12px] cursor-pointer select-none"
          >
            <input type="checkbox" v-model="d.deleteContent" class="accent-[#e24b4b] mt-0.5" />
            <span>
              同时删除下面的内容目录
              <span class="text-faint">（游戏构建产物，删了要重新打包，确认不需要了再勾）</span>
            </span>
          </label>

          <div class="mt-2.5 flex flex-col gap-1.5">
            <div v-for="c in d.info.content" :key="c.depotId" class="flex items-center gap-2 text-[11.5px]">
              <span class="num text-faint shrink-0 w-14">{{ c.depotId }}</span>
              <span class="font-mono truncate flex-1" :class="c.exists ? 'text-muted' : 'text-faint line-through'">
                {{ c.path }}
              </span>
              <span v-if="!c.exists" class="text-faint shrink-0">不存在</span>
              <span
                v-else-if="!c.deletable"
                class="text-amber shrink-0"
                title="不在设置里的 buildsRoot 之内，为安全起见不会删"
              >
                跳过（不在 buildsRoot 内）
              </span>
              <span v-else class="num text-faint shrink-0">{{ fmtInt(c.files) }} 个 · {{ fmtSize(c.bytes) }}</span>
            </div>
          </div>

          <div v-if="!deletableContent.length" class="mt-2 text-[11px] text-faint">
            没有可删的内容目录，所以这次只会删脚本。
          </div>
        </div>

        <!-- 上膛后的提示条 -->
        <div
          v-if="armed"
          class="rounded-[10px] border border-[rgba(255,92,108,.3)] bg-[rgba(255,92,108,.07)] px-3.5 py-2.5 text-[12px] text-[#ff8a8a]"
        >
          再点一次底下那个红色按钮才会真的删。改勾选或关掉窗口都会取消。
        </div>
      </div>

      <footer class="px-6 py-4 border-t border-line flex items-center gap-2">
        <span class="text-[11px] text-faint">Steam 后台的 App / Depot 不受影响</span>
        <div class="flex-1" />
        <button class="btn no-drag" @click="closeDeleteDialog">取消</button>
        <button
          ref="btn"
          class="btn no-drag"
          :class="armed ? 'btn-danger-solid' : 'btn-danger'"
          :disabled="!canDelete"
          @click="onDeleteClick"
        >
          <template v-if="d.busy">删除中…</template>
          <template v-else-if="armed">确认删除（{{ left }}）</template>
          <template v-else>删除这个 App</template>
        </button>
      </footer>
    </div>
  </div>
</template>
