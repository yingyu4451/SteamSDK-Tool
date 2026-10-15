<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import gsap from 'gsap'
import {
  state,
  closeDepotSlide,
  setDepotPlatform,
  submitDepotSlide,
  pickDepotRoot,
  slideLookupBackend,
  slideDepotHint
} from '../store.js'
import { X, RefreshCw } from '@lucide/vue'

const el = ref(null)
const idInput = ref(null)

onMounted(() => {
  if (el.value) {
    gsap.fromTo(el.value, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power3.out' })
  }
  nextTick(() => idInput.value?.focus())
})

const s = computed(() => state.depotSlide)

/** 正在填的 DepotID 在本地 / 后台是什么情况 */
const idHint = computed(() => slideDepotHint())

/** 这个平台是不是已经有 depot 了 */
const dup = computed(() => {
  const v = s.value
  if (!v) return null
  return (state.detail?.depots || []).find((d) => d.platformId === v.platform) || null
})

const canSubmit = computed(() => {
  const v = s.value
  if (!v || v.busy) return false
  if (!/^\d+$/.test(String(v.depotId || '').trim())) return false
  if (!String(v.contentRoot || '').trim()) return false
  if (dup.value && !v.allowDup) return false
  return true
})

/** 点创建之后会写出什么 */
const willCreate = computed(() => {
  const v = s.value
  if (!v) return { file: '', dir: '' }
  const suffix =
    v.platform === 'win32' ? 'win32' : v.platform === 'linuxarm64' ? 'linuxarm64' : v.platform
  return {
    file: `scripts\\${state.detail?.dirName}\\depot_${String(v.depotId || '').trim() || '<DepotID>'}_${suffix}.vdf`,
    dir: String(v.contentRoot || '').trim()
  }
})

/* ---- 后台那份填什么，抄这段 ---- */

const copied = ref(false)

const backendRows = computed(() => {
  const v = s.value
  const o = state.depotOptions || {}
  const pick = (list, id) => (list || []).find((x) => x.id === id)?.label || id || ''
  return [
    ['App ID', String(state.detail?.appId ?? '').trim()],
    ['Depot Name', String(v?.name || '').trim()],
    ['Depot ID', String(v?.depotId || '').trim()],
    ['OS', pick(o.os, v?.os)],
    ['Architecture', pick(o.arch, v?.arch)],
    ['Language', pick(o.languages, v?.language)]
  ]
})

async function copyBackend() {
  const text = backendRows.value.map(([k, val]) => `${k}\t${val}`).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    /* 剪贴板不可用就算了 */
  }
}
</script>

<template>
  <div v-if="s" class="fixed inset-0 z-50 flex justify-end">
    <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="closeDepotSlide" />

    <aside
      ref="el"
      class="relative h-full w-[460px] max-w-[92vw] bg-panel border-l border-line flex flex-col no-drag"
    >
      <header class="px-5 h-14 shrink-0 border-b border-line flex items-center gap-3">
        <h2 class="text-[14px] font-semibold m-0">新建 Depot</h2>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer"
          @click="closeDepotSlide"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto scroll-thin px-5 py-4 flex flex-col gap-4">
        <!-- 这个 Depot 属于哪个 App —— 填表时一直看得见 -->
        <div class="card-flat px-3.5 py-2.5 flex items-center gap-2.5">
          <div class="min-w-0">
            <div class="text-[10.5px] font-semibold tracking-wider text-faint uppercase">属于这个 App</div>
            <div class="mt-1 flex items-baseline gap-2 min-w-0">
              <span class="num text-[13px] text-ink shrink-0">{{ s.appId || '—' }}</span>
              <span class="text-[12.5px] text-muted truncate">{{ s.appName || '（还不知道名字）' }}</span>
            </div>
            <div class="mt-0.5 text-[11px] text-faint truncate">scripts\{{ state.detail?.dirName }}</div>
          </div>
          <button
            class="ml-auto btn h-7 px-2.5 text-[11px] no-drag shrink-0"
            :disabled="s.lookupBusy"
            title="用 steamcmd + 已保存的 Steam 账号读后台这个 App 的 Depot 列表"
            @click="slideLookupBackend"
          >
            <RefreshCw :size="13" :stroke-width="2" :class="s.lookupBusy ? 'animate-spin' : ''" />
            {{ s.lookupBusy ? '读取中…' : '读后台' }}
          </button>
        </div>

        <div v-if="s.lookupError" class="text-[11px] text-amber -mt-2">{{ s.lookupError }}</div>

        <div class="flex items-baseline gap-2">
          <span class="text-[10.5px] font-semibold tracking-wider text-faint uppercase">Steamworks 后台</span>
          <span class="text-[10.5px] text-faint">只在本地记录，不会写进 vdf</span>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">Depot 名称</span>
          <input
            :value="s.name"
            placeholder="例如 Dashoot Content"
            class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
            @input="s.name = $event.target.value"
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">DepotID</span>
          <input
            ref="idInput"
            :value="s.depotId"
            placeholder="例如 3036851"
            class="h-9 px-3 rounded-[9px] bg-surface border text-[13px] num outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
            :class="s.depotId && !/^\d+$/.test(String(s.depotId).trim()) ? 'border-[#6d3030]' : 'border-line'"
            @input="s.depotId = $event.target.value"
          />
          <span class="text-[11px] text-faint">后台新建时如果留空，Steam 会自动分配一个</span>
          <span
            v-if="idHint"
            class="text-[11px]"
            :class="
              idHint.tone === 'ok'
                ? 'text-success'
                : idHint.tone === 'warn'
                  ? 'text-amber'
                  : idHint.tone === 'idle'
                    ? 'text-faint'
                    : 'text-danger'
            "
          >
            {{ idHint.text }}
          </span>
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-[11.5px] text-muted">操作系统</span>
            <select
              :value="s.os"
              class="h-9 px-2.5 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.45)]"
              @change="setDepotPlatform({ os: $event.target.value })"
            >
              <option v-for="o in state.depotOptions.os" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[11.5px] text-muted">架构</span>
            <select
              :value="s.arch"
              class="h-9 px-2.5 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.45)]"
              @change="setDepotPlatform({ arch: $event.target.value })"
            >
              <option v-for="x in state.depotOptions.arch" :key="x.id" :value="x.id">{{ x.label }}</option>
            </select>
          </label>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">语言</span>
          <select
            v-model="s.language"
            class="h-9 px-2.5 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.45)]"
          >
            <option v-for="l in state.depotOptions.languages" :key="l.id" :value="l.id">{{ l.label }}</option>
          </select>
        </label>

        <div class="card-flat px-3.5 py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-semibold tracking-wider text-faint uppercase">照着填后台</span>
            <button class="ml-auto btn h-7 px-2.5 text-[11px] no-drag" @click="copyBackend">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
          <div class="mt-2 grid grid-cols-[96px_1fr] gap-x-2 gap-y-1">
            <template v-for="(row, i) in backendRows" :key="i">
              <span class="text-[11px] text-faint">{{ row[0] }}</span>
              <span class="text-[11.5px] num truncate">{{ row[1] || '—' }}</span>
            </template>
          </div>
        </div>

        <div class="flex items-baseline gap-2 pt-1 border-t border-line-soft">
          <span class="text-[10.5px] font-semibold tracking-wider text-faint uppercase">本地 · SteamPipe</span>
          <span class="text-[10.5px] text-faint">vdf 里真正生效的部分</span>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">内容目录</span>
          <div class="flex items-center gap-2">
            <input
              :value="s.contentRoot"
              class="flex-1 min-w-0 h-9 px-3 rounded-[9px] bg-surface border border-line text-[12px] font-mono outline-none focus:border-[rgba(102,192,244,.45)]"
              @input="s.contentRoot = $event.target.value"
            />
            <button class="btn h-9 px-3 text-[11.5px] no-drag" @click="pickDepotRoot">选择…</button>
          </div>
        </label>

        <!-- 同平台已经有一个了 -->
        <div
          v-if="dup"
          class="rounded-[10px] border border-[rgba(255,180,84,.26)] bg-[rgba(255,180,84,.06)] px-3.5 py-2.5"
        >
          <div class="text-[11.5px] text-amber">
            这个 App 已经有 {{ dup.platformId }} 的 Depot（{{ dup.id }}）。
          </div>
          <label class="mt-2 flex items-center gap-2 text-[11.5px] text-muted cursor-pointer select-none">
            <input type="checkbox" v-model="s.allowDup" class="accent-[#66c0f4]" />
            确实要再加一个同平台的
          </label>
        </div>

        <div class="card-flat p-3.5">
          <div class="text-[11px] font-semibold tracking-wider text-faint uppercase mb-2">会写出什么</div>
          <div class="font-mono text-[11.5px] text-accent/90 py-0.5 truncate">
            <span class="text-faint">＋ 脚本　</span>{{ willCreate.file }}
          </div>
          <div class="font-mono text-[11.5px] text-accent/90 py-0.5 truncate">
            <span class="text-faint">＋ 目录　</span>{{ willCreate.dir || '（未填）' }}
          </div>
        </div>

        <div
          v-if="s.error"
          class="rounded-[10px] border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-[12px] text-danger"
        >
          {{ s.error }}
        </div>
      </div>

      <footer class="px-5 h-16 shrink-0 border-t border-line flex items-center gap-2">
        <div class="flex-1" />
        <button class="btn" @click="closeDepotSlide">取消</button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submitDepotSlide">
          {{ s.busy ? '创建中…' : '创建 Depot' }}
        </button>
      </footer>
    </aside>
  </div>
</template>
