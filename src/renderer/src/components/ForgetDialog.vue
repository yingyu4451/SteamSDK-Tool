<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import gsap from 'gsap'
import { ShieldOff, Check, LoaderCircle, TriangleAlert, FolderOpen } from '@lucide/vue'
import { state, closeForget, doForgetLogin } from '../store.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const el = ref(null)
const f = computed(() => state.forget)

useDialogA11y(el, closeForget, { isOpen: () => !!f.value?.open })
const items = computed(() => f.value?.data?.items || [])
const result = computed(() => f.value?.result || null)

/* 二次点击才真清 —— 跟删除 App / Depot 一个套路，避免手滑 */
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

function onForgetClick() {
  if (!armed.value) {
    arm()
    return
  }
  disarm()
  doForgetLogin()
}

async function openBackup() {
  const p = result.value?.backupDir
  if (p) await window.api.shell.openPath(p)
}

onMounted(async () => {
  await nextTick()
  if (el.value) {
    gsap.fromTo(el.value, { opacity: 0, y: 16, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' })
  }
})
onUnmounted(disarm)
</script>

<template>
  <Transition name="overlay">
  <div v-if="f.open" class="fixed inset-0 z-[60] grid place-items-center p-6 no-drag">
    <div class="absolute inset-0 bg-black/25" @click="closeForget" />

    <div ref="el" role="dialog" aria-modal="true" aria-labelledby="forget-title" class="relative card w-full max-w-[540px] max-h-[86vh] overflow-y-auto scroll-thin">
      <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3">
        <TriangleAlert :size="18" class="text-warn shrink-0 mt-0.5" />
        <div class="min-w-0">
          <h2 id="forget-title" class="text-lead font-semibold m-0">忘记账号</h2>
          <p class="mt-1 mb-0 text-label text-faint leading-relaxed">
            清掉这台机器上所有的 Steam 登录痕迹，之后构建会重新问你要账号密码。
          </p>
        </div>
      </header>

      <div class="p-5 flex flex-col gap-3">
        <!-- 清完了 -->
        <template v-if="result">
          <div class="rounded-md border border-[rgba(139,197,63,.3)] bg-[rgba(139,197,63,.07)] px-3.5 py-3 flex items-start gap-2">
            <Check :size="15" class="text-success shrink-0 mt-0.5" />
            <div class="min-w-0 text-label leading-relaxed">
              <div class="text-success">已清掉 {{ result.removed.length }} 项</div>
              <ul class="mt-1.5 mb-0 pl-4 text-muted">
                <li v-for="(r, i) in result.removed" :key="i">{{ r }}</li>
              </ul>
            </div>
          </div>

          <div v-if="result.skipped?.length" class="rounded-md border border-[rgba(240,169,46,.3)] bg-[rgba(240,169,46,.07)] px-3.5 py-2.5 text-label text-warn">
            <div v-for="(s, i) in result.skipped" :key="i">{{ s }}</div>
          </div>

          <div v-if="result.backupDir" class="rounded-md border border-line bg-[rgba(9,15,23,.5)] px-3.5 py-2.5">
            <div class="text-label text-muted leading-relaxed">
              清之前整份备份在这里，后悔了把里面的文件拷回去就行：
            </div>
            <div class="mt-1.5 flex items-center gap-2 min-w-0">
              <code class="font-mono text-micro text-accent break-all min-w-0">{{ result.backupDir }}</code>
              <button class="btn btn-sm px-2.5  shrink-0" @click="openBackup">
                <FolderOpen :size="12" />
                打开
              </button>
            </div>
          </div>
        </template>

        <!-- 清之前：列清单 -->
        <template v-else>
          <div class="text-label text-muted">会处理这些：</div>

          <div v-if="f.busy && !items.length" class="flex items-center gap-2 text-label text-faint py-2">
            <LoaderCircle :size="14" class="drop-spin-slow" />
            正在检查…
          </div>

          <div v-else class="rounded-md border border-line divide-y divide-[#22334a]">
            <div v-for="it in items" :key="it.key" class="px-3.5 py-2.5 flex items-start gap-2.5">
              <component :is="it.present ? ShieldOff : Check" :size="14" class="shrink-0 mt-0.5" :class="it.present ? 'text-warn' : 'text-faint'" />
              <div class="min-w-0 flex-1">
                <div class="text-label" :class="it.present ? 'text-ink' : 'text-faint'">{{ it.label }}</div>
                <div class="text-micro font-mono text-faint break-all">{{ it.detail }}</div>
              </div>
            </div>
          </div>

          <div class="rounded-md border border-line bg-[rgba(9,15,23,.5)] px-3.5 py-2.5 text-label text-muted leading-relaxed">
            清之前会整份备份到 SDK 根目录下的 <code class="font-mono text-accent">_login-backup-…</code>，后悔了能拷回来。
          </div>

          <div
            class="rounded-md border border-[rgba(240,169,46,.3)] bg-[rgba(240,169,46,.07)] px-3.5 py-2.5 text-label text-warn leading-relaxed"
            :class="armed ? '' : 'hidden'"
          >
            再点一次下面那个红色按钮才会真的清。关掉窗口就取消。
          </div>
        </template>

        <div v-if="f.error" class="rounded-md border border-[rgba(226,75,75,.3)] bg-[rgba(226,75,75,.07)] px-3.5 py-2.5 text-label text-danger">
          {{ f.error }}
        </div>
      </div>

      <footer class="px-5 py-3.5 border-t border-line flex items-center gap-2">
        <div class="flex-1" />
        <button class="btn" @click="closeForget">{{ result ? '关闭' : '取消' }}</button>
        <button
          v-if="!result"
          class="btn"
          :class="armed ? 'btn-danger-solid' : 'btn-danger'"
          :disabled="f.busy || !f.data?.any"
          @click="onForgetClick"
        >
          {{ armed ? `确认清空（${left}）` : '清空登录数据' }}
        </button>
      </footer>
    </div>
  </div>
  </Transition>
</template>
