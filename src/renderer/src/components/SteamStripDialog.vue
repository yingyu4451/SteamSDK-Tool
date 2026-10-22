<script setup>
import { computed, onMounted, ref } from 'vue'
import gsap from 'gsap'
import {
  state,
  PLATFORM_LABEL,
  dismissSteamStrip,
  setStripRemoveConfig,
  applySteamStrip,
  restoreSteamStrip,
  toast
} from '../store.js'
import { fmtSize } from '../format.js'
import PathLink from './PathLink.vue'
import { X } from '@lucide/vue'

const el = ref(null)

onMounted(() => {
  if (el.value) {
    gsap.fromTo(
      el.value,
      { opacity: 0, y: 18, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out' }
    )
  }
})

const s = computed(() => state.strip)
const scan = computed(() => s.value?.scan || null)
const natives = computed(() => scan.value?.native || [])
const configs = computed(() => scan.value?.config || [])
const managed = computed(() => scan.value?.managed || [])
const backups = computed(() => scan.value?.backups || [])

const platformLabel = computed(
  () => PLATFORM_LABEL[s.value?.depot?.platform] || s.value?.depot?.platform || ''
)

const managedNames = computed(() => {
  const names = managed.value.map((f) => f.name || f.rel.split('/').pop())
  return names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')} 等 ${names.length} 个`
})

const strippable = computed(
  () => natives.value.length + (s.value?.removeConfig ? configs.value.length : 0)
)
const canApply = computed(() => !s.value?.busy && strippable.value > 0)

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function openPath(p) {
  if (!p) return
  const r = await window.api.shell.openPath(p)
  if (!r.ok) toast(r.error || '打不开', 'bad')
}
</script>

<template>
  <div v-if="s.open" class="fixed inset-0 z-50 grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="dismissSteamStrip" />

    <div
      ref="el"
      class="relative card w-full max-w-[640px] max-h-[86vh] overflow-y-auto scroll-thin no-drag"
    >
      <header class="px-6 pt-5 pb-4 border-b border-line flex items-start gap-3">
        <div class="min-w-0">
          <h2 class="text-[16px] font-semibold m-0">剥离 Steam 运行库</h2>
          <div class="mt-1 text-[12px] text-faint flex items-center gap-2 min-w-0">
            <span class="shrink-0">{{ platformLabel }}</span>
            <span class="text-rule">·</span>
            <span class="font-mono truncate">{{ s.depot?.id }}</span>
          </div>
        </div>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer shrink-0"
          @click="dismissSteamStrip"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="p-6 flex flex-col gap-4">
        <div class="flex items-start gap-2 text-[12px] min-w-0">
          <span class="shrink-0 w-[64px] whitespace-nowrap text-faint/70">内容目录</span>
          <PathLink v-if="s.root" :path="s.root" kind="folder" class="min-w-0 flex-1" />
          <span v-else class="text-faint">—</span>
        </div>

        <div
          v-if="s.error"
          class="rounded-[10px] border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-[12px] text-danger"
        >
          {{ s.error }}
        </div>

        <div v-if="s.busy && !scan" class="text-[12px] text-faint py-2">正在扫描内容目录…</div>

        <template v-else-if="scan">
          <!-- 没东西可剥离 -->
          <div
            v-if="!strippable"
            class="card-flat p-3.5 text-[12px] leading-[1.7] text-muted"
          >
            {{
              backups.length
                ? '这个目录里已经没有 Steam 运行库了，下面的备份可以还原。'
                : '这个目录里没有 Steam 运行库（steam_api64.dll / steam_api.dll / libsteam_api.so / libsteam_api.dylib）。'
            }}
          </div>

          <template v-else>
            <div class="card-flat p-3.5">
              <div class="text-[11px] font-semibold tracking-wider text-faint uppercase mb-2">
                要挪走的文件 · {{ strippable }}
              </div>
              <div
                v-for="f in natives"
                :key="f.rel"
                class="flex items-center gap-3 py-1.5 border-b border-line-soft last:border-b-0"
              >
                <span class="font-mono text-[12px] text-ink/90 truncate flex-1 min-w-0" :title="f.rel">
                  {{ f.rel }}
                </span>
                <span class="num text-[11px] text-faint shrink-0">{{ fmtSize(f.size) }}</span>
              </div>

              <label
                v-if="configs.length"
                class="mt-2.5 pt-2.5 border-t border-line-soft flex items-start gap-2 text-[12px] text-muted cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  class="accent-[#66c0f4] w-3.5 h-3.5 mt-[1px] shrink-0"
                  :checked="s.removeConfig"
                  @change="setStripRemoveConfig($event.target.checked)"
                />
                <span>
                  同时挪走 steam_appid.txt（{{ configs.length }} 个）
                  <span class="text-faint">—— 有它时 SteamAPI_Init 会拿写死的 AppID 绑 Steam</span>
                </span>
              </label>
            </div>

            <div class="flex items-start gap-2 text-[12px] min-w-0">
              <span class="shrink-0 w-[64px] whitespace-nowrap text-faint/70">托管 DLL</span>
              <span class="text-muted min-w-0">
                {{
                  managed.length
                    ? `保留 ${managedNames}（游戏代码还引用它，删了会启动报错）`
                    : '没有托管 Steamworks DLL'
                }}
              </span>
            </div>

            <div class="flex items-start gap-2 text-[12px] min-w-0">
              <span class="shrink-0 w-[64px] whitespace-nowrap text-faint/70">挪到</span>
              <PathLink :path="scan.backupRoot" kind="folder" class="min-w-0 flex-1" />
              <span class="text-faint shrink-0">内容目录外，不会上传</span>
            </div>
          </template>

          <!-- 刚剥离完的结果 -->
          <div
            v-if="s.result && s.result.moved?.length"
            class="rounded-[10px] border border-[rgba(102,192,244,.24)] bg-[rgba(102,192,244,.06)] px-3.5 py-2.5 text-[12px] text-accent flex items-center gap-2 min-w-0"
          >
            <span class="shrink-0">
              已剥离 {{ s.result.moved.length }} 个文件 · {{ fmtSize(s.result.totalBytes) }}
            </span>
            <PathLink :path="s.result.backupDir" kind="folder" class="min-w-0 flex-1" />
          </div>

          <!-- 已有备份 -->
          <div v-if="backups.length" class="card-flat p-3.5">
            <div class="text-[11px] font-semibold tracking-wider text-faint uppercase mb-1.5">
              备份 · {{ backups.length }}
            </div>
            <div
              v-for="b in backups"
              :key="b.backupDir"
              class="flex items-center gap-2 py-1.5 border-b border-line-soft last:border-b-0"
            >
              <button
                class="min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                :title="b.backupDir"
                @click="openPath(b.backupDir)"
              >
                <div class="text-[12px] text-ink/90 truncate">{{ b.name }}</div>
                <div class="num text-[11px] text-faint mt-0.5">
                  {{ fmtTime(b.createdAt) }} · {{ b.files }} 个文件 · {{ fmtSize(b.bytes) }}
                </div>
              </button>
              <button class="btn h-7 px-2.5 text-[12px] shrink-0" @click="openPath(b.backupDir)">
                打开
              </button>
              <button
                class="btn h-7 px-2.5 text-[12px] shrink-0"
                :disabled="s.busy"
                @click="restoreSteamStrip(b.backupDir)"
              >
                还原
              </button>
            </div>
          </div>
        </template>
      </div>

      <footer class="px-6 py-4 border-t border-line flex items-center gap-2">
        <span class="text-[11px] text-faint">只动内容目录里的文件，不改 vdf</span>
        <div class="flex-1" />
        <button class="btn" @click="dismissSteamStrip">关闭</button>
        <button class="btn btn-primary" :disabled="!canApply" @click="applySteamStrip">
          {{ s.busy ? '剥离中…' : '开始剥离' }}
        </button>
      </footer>
    </div>
  </div>
</template>
