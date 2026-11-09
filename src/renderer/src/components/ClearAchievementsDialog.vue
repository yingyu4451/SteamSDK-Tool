<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import gsap from 'gsap'
import { Trophy, Check, LoaderCircle, TriangleAlert } from '@lucide/vue'
import { state, closeClearAchievements, clearAchievementsNow } from '../store.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const el = ref(null)
const c = computed(() => state.clearAchievements)

useDialogA11y(el, closeClearAchievements, { isOpen: () => !!c.value?.open })

/* 二次点击才真清 —— 跟删除 App / 忘记账号一个套路，避免手滑把成就清了 */
const ARMED_MS = 5000
const armed = ref(false)
const left = ref(0)
let tick = null

function disarm() {
  armed.value = false
  left.value = 0
  if (tick) {
    clearInterval(tick)
    tick = null
  }
}

function arm() {
  armed.value = true
  left.value = Math.round(ARMED_MS / 1000)
  tick = setInterval(() => {
    left.value -= 1
    if (left.value <= 0) disarm()
  }, 1000)
}

function onClearClick() {
  if (!armed.value) {
    arm()
    return
  }
  disarm()
  clearAchievementsNow()
}

function retry() {
  disarm()
  clearAchievementsNow()
}

onMounted(async () => {
  await nextTick()
  if (el.value) {
    gsap.fromTo(
      el.value,
      { opacity: 0, y: 16, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' }
    )
  }
})
onUnmounted(disarm)
</script>

<template>
  <Transition name="overlay">
    <div v-if="c?.open" class="fixed inset-0 z-[60] grid place-items-center p-6 no-drag">
      <div class="absolute inset-0 bg-black/25" @click="closeClearAchievements" />

      <div
        ref="el"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ach-title"
        class="relative card s-modal w-full max-w-135 max-h-[86vh] overflow-y-auto scroll-thin"
      >
        <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3">
          <TriangleAlert :size="18" class="text-warn shrink-0 mt-0.5" />
          <div class="min-w-0">
            <h2 id="ach-title" class="text-title font-semibold m-0">清空成就</h2>
            <p class="mt-1 mb-0 text-label text-faint leading-relaxed">
              让本机 Steam 客户端执行 reset_all_stats，把当前登录账号在这个 App 下的成就和统计一起重置。
              不联网，也不需要 Web API 密钥。
            </p>
          </div>
        </header>

        <div class="p-5 flex flex-col gap-3">
          <!-- 清完了 -->
          <div
            v-if="c.done"
            class="rounded-card border border-success/30 bg-success/[0.07] px-3.5 py-3 flex items-start gap-2"
          >
            <Check :size="15" class="text-success shrink-0 mt-0.5" />
            <div class="min-w-0 text-label leading-relaxed">
              <div class="text-success">已清空 {{ c.appName }} 的 Steam 成就</div>
              <div class="mt-1 text-muted">
                清的是本机 Steam 客户端当前登录的账号。Steam 里的显示可能慢一步 —— 重启游戏或等一会儿再看。
              </div>
              <div v-if="c.message" class="mt-1.5 text-micro font-mono text-faint break-all">
                {{ c.message }}
              </div>
            </div>
          </div>

          <!-- 清之前 -->
          <template v-else>
            <div class="rounded-card border border-line divide-y divide-line">
              <div class="px-3.5 py-2.5 flex items-center gap-2.5">
                <Trophy :size="14" class="shrink-0 text-muted" />
                <div class="min-w-0 flex-1">
                  <div class="text-label text-ink">{{ c.appName }}</div>
                  <div class="text-micro font-mono text-faint">AppID {{ c.appId }}</div>
                </div>
              </div>
              <div class="px-3.5 py-2.5 text-label text-muted leading-relaxed">
                清的是<strong class="text-ink font-semibold">本机 Steam 客户端当前登录的账号</strong>的成就。
                工具不需要密码，也不会上传任何东西。
              </div>
            </div>

            <div
              class="rounded-card border border-amber/30 bg-amber/7 px-3.5 py-2.5 text-label text-warn leading-relaxed"
              :class="armed ? '' : 'hidden'"
            >
              再点一次下面那个红色按钮才会真的清空。关掉窗口就取消。
            </div>

            <div v-if="c.busy" class="flex items-start gap-2 text-label text-muted leading-relaxed py-1">
              <LoaderCircle :size="14" class="drop-spin-slow shrink-0 mt-0.5" />
              <span>
                正在调用 Steam 控制台… 期间会短暂把 Steam 切到前台，清完自动切回来。
                如果 Steam 弹出了别的窗口，可能会失败，重试一次即可。
              </span>
            </div>

            <div
              v-if="c.error"
              class="rounded-card border border-danger/30 bg-danger/7 px-3.5 py-2.5 text-label text-danger"
            >
              <div>{{ c.error }}</div>
              <button class="btn btn-sm mt-2 no-drag" :disabled="c.busy" @click="retry">重试</button>
            </div>
          </template>
        </div>

        <footer class="px-5 py-3.5 border-t border-line flex items-center gap-2">
          <div class="flex-1" />
          <button class="btn" :disabled="c.busy" @click="closeClearAchievements">
            {{ c.done ? '关闭' : '取消' }}
          </button>
          <button
            v-if="!c.done"
            class="btn"
            :class="armed ? 'btn-danger-solid' : 'btn-danger'"
            :disabled="c.busy"
            @click="onClearClick"
          >
            {{ armed ? `确认清空（${left}）` : '清空全部成就' }}
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>
