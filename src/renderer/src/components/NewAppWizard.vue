<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import gsap from 'gsap'
import {
  state,
  closeWizard,
  submitWizard,
  selectApp,
  wizardAppIdChanged,
  wizardNameChanged,
  wizardTogglePlatform,
  wizardMovePlatform,
  wizardSetDepotId,
  wizardSetRoot,
  wizardPickRoot,
  wizardLookup,
  wizardToggleSteamDepot,
  wizardApplyAllSteam,
  goSettings,
  selectedPicks,
  publicName
} from '../store.js'

const el = ref(null)
const nameInput = ref(null)
const lookedUp = ref('')
const resolvedName = ref('')

onMounted(() => {
  if (!el.value) return
  gsap.fromTo(el.value, { opacity: 0, y: 18, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'power3.out' })
  nextTick(() => nameInput.value?.focus())
})

const w = computed(() => state.wizard)
const appIdOk = computed(() => /^\d+$/.test(String(w.value?.appId || '').trim()))
const picked = computed(() => (w.value ? selectedPicks(w.value) : []))

const knownApps = computed(() => state.knownApps || [])

const canSubmit = computed(() => {
  const v = w.value
  if (!v || v.busy) return false
  if (!v.name.trim() || !appIdOk.value) return false
  if (!picked.value.length) return false
  // DepotID 从后台回来时是数字，统一 String() 再判
  const ids = picked.value.map((p) => String(p.depotId ?? '').trim())
  if (ids.some((x) => !/^\d+$/.test(x))) return false
  if (new Set(ids).size !== ids.length) return false
  return picked.value.every((p) => String(p.contentRoot ?? '').trim())
})

const depotIdDup = computed(() => {
  const ids = picked.value.map((p) => String(p.depotId ?? '').trim()).filter(Boolean)
  return ids.length !== new Set(ids).size
})

const willCreate = computed(() => {
  const v = w.value
  if (!v) return { scripts: [], dirs: [] }
  const folder = v.name.trim() || '<App名>'
  const scripts = [`scripts\\${folder}\\app_${v.appId.trim() || '<AppID>'}.vdf`]
  for (const p of picked.value) {
    scripts.push(`scripts\\${folder}\\depot_${String(p.depotId ?? '').trim() || '<DepotID>'}_${p.id}.vdf`)
  }
  return { scripts, dirs: picked.value.map((p) => String(p.contentRoot ?? '').trim() || '（未填）') }
})

const platLabel = (id) => w.value?.platforms.find((p) => p.id === id)?.label || id

/* ---- AppID：快捷链接 + 已知 App 下拉 + 公开名称 ---- */

function openPartner() {
  const id = String(w.value?.appId || '').trim()
  const url = id ? `https://partner.steamgames.com/apps/${id}` : 'https://partner.steamgames.com/apps/'
  window.api.shell.openExternal(url)
}

function pickKnown(e) {
  const id = e.target.value
  if (!id) return
  wizardAppIdChanged(id)
  resolveName()
}

/** store.steampowered.com 的名称查询不需要密钥，用来确认没填错 AppID */
async function resolveName() {
  const id = String(w.value?.appId || '').trim()
  if (!appIdOk.value) {
    resolvedName.value = ''
    return
  }
  resolvedName.value = '查询中…'
  const n = await publicName(id)
  if (String(w.value?.appId || '').trim() !== id) return
  resolvedName.value = n || ''
}

const lk = computed(() => w.value?.lookup || null)

function onAppIdBlur() {
  const id = String(w.value?.appId || '').trim()
  resolveName()
  if (!appIdOk.value || !(state.hasApiKey || state.hasPassword)) return
  if (lookedUp.value === id) return
  lookedUp.value = id
  wizardLookup()
}

function doLookup(via) {
  lookedUp.value = String(w.value?.appId || '').trim()
  wizardLookup(via === 'steamcmd' ? 'steamcmd' : undefined)
}

function fmtSize(n) {
  const b = Number(n) || 0
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

/** 还有哪些后台 depot 没被勾上 */
const anyUnowned = computed(() => !!lk.value?.depots?.some((d) => d.platform && !d.on))

function toggleDepot(d) {
  wizardToggleSteamDepot(d.depotId)
}

function onPickPlatform(d, e) {
  const plat = e.target.value
  e.target.value = ''
  if (plat) wizardToggleSteamDepot(d.depotId, plat)
}

/* ---- 平台行拖拽排序：从上到下的次序就是 DepotID +1 的次序 ---- */

const dragId = ref('')
const overId = ref('')

function onDragStart(id, e) {
  dragId.value = id
  try {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  } catch {
    /* 某些环境不给设，忽略 */
  }
}

function onDragOver(id) {
  if (!dragId.value || dragId.value === id) return
  overId.value = id
}

function onDrop(id) {
  const from = dragId.value
  dragId.value = ''
  overId.value = ''
  if (from && from !== id) wizardMovePlatform(from, id)
}

function onDragEnd() {
  dragId.value = ''
  overId.value = ''
}

/* ---- AppID 撞车：本地已经有 App 用这个 AppID ---- */

const appIdConflict = computed(() => {
  const id = String(w.value?.appId || '').trim()
  if (!/^\d+$/.test(id)) return []
  return (state.apps || []).filter((a) => String(a.appId) === id).map((a) => a.dirName)
})

function goExisting() {
  const dir = appIdConflict.value[0]
  closeWizard()
  if (dir) selectApp(dir)
}
</script>

<template>
  <div v-if="w" class="fixed inset-0 z-50 grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeWizard" />

    <div ref="el" class="relative card w-full max-w-[660px] max-h-[88vh] overflow-y-auto scroll-thin no-drag">
      <header class="px-6 h-14 border-b border-line flex items-center gap-3">
        <h2 class="text-[15px] font-semibold m-0">新建 App</h2>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer"
          @click="closeWizard"
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div class="p-6 flex flex-col gap-4">
        <!-- 名字 -->
        <label class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">App 名字</span>
          <input
            ref="nameInput"
            :value="w.name"
            placeholder="例如 Dashoot"
            class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(46,230,197,.45)] placeholder:text-faint"
            @input="wizardNameChanged($event.target.value)"
          />
        </label>

        <!-- AppID -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">AppID</span>
          <div class="flex items-center gap-2">
            <input
              :value="w.appId"
              list="known-apps"
              placeholder="例如 2670430"
              class="flex-1 min-w-0 h-9 px-3 rounded-[9px] bg-surface border text-[13px] num outline-none focus:border-[rgba(46,230,197,.45)] placeholder:text-faint"
              :class="w.appId && !appIdOk ? 'border-[#6d2f39]' : 'border-line'"
              @input="wizardAppIdChanged($event.target.value)"
              @blur="onAppIdBlur"
              @keyup.enter="doLookup"
            />
            <datalist id="known-apps">
              <option v-for="a in knownApps" :key="a.appId" :value="a.appId">
                {{ a.name }}{{ a.local ? '（本地已有）' : '' }}
              </option>
            </datalist>
            <select
              class="h-9 px-2 rounded-[9px] bg-surface border border-line text-[11.5px] outline-none max-w-[190px]"
              @change="pickKnown($event); $event.target.value = ''"
            >
              <option value="">已知的 App…</option>
              <option v-for="a in knownApps" :key="'s' + a.appId" :value="a.appId">
                {{ a.appId }} · {{ a.name || '（没名字）' }}
              </option>
            </select>
            <button class="btn h-9 px-2.5 no-drag" title="在 Steamworks 后台打开" @click="openPartner">
              <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none">
                <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <span v-if="resolvedName === '查询中…'" class="text-[11px] text-faint">查询中…</span>
          <span v-else-if="resolvedName" class="text-[11.5px] text-accent">{{ resolvedName }}</span>

          <div
            v-if="appIdConflict.length"
            class="rounded-[10px] border border-[rgba(255,180,84,.26)] bg-[rgba(255,180,84,.06)] px-3 py-2 flex items-center gap-2 flex-wrap"
          >
            <span class="text-[11.5px] text-amber">
              AppID {{ w.appId }} 已经被本地 App「{{ appIdConflict.join('、') }}」用了 ——
              再建一个就是两个本地 App 指着同一个 Steam App，构建会传到同一处。
            </span>
            <button class="btn h-6 px-2 text-[11px]" @click="goExisting">改用它</button>
          </div>
        </div>

        <!-- 从后台读 Depot -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn h-8 px-3 text-[11.5px]" :disabled="!appIdOk || lk?.busy" @click="doLookup">
              <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 mr-1.5" fill="none">
                <path d="M4 7h16M4 12h10M4 17h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              {{ lk?.busy ? '读取中…' : '读取后台 Depot' }}
            </button>
            <button v-if="anyUnowned" class="btn h-8 px-3 text-[11.5px]" @click="wizardApplyAllSteam">
              全部勾上
            </button>
          </div>

          <!-- 出错 -->
          <div
            v-if="lk?.error"
            class="rounded-[10px] border px-3.5 py-2.5 text-[11.5px] leading-relaxed"
            :class="
              lk.needsKey || lk.needsPassword
                ? 'border-[rgba(255,180,84,.26)] bg-[rgba(255,180,84,.06)] text-amber'
                : 'border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] text-danger'
            "
          >
            <div class="whitespace-pre-wrap">{{ lk.error }}</div>
            <div v-if="lk.needsKey || lk.needsPassword" class="mt-2 flex items-center gap-2 flex-wrap">
              <button class="btn h-7 px-2.5 text-[11px]" @click="closeWizard(); goSettings()">去设置里配</button>
              <button
                v-if="!state.hasApiKey"
                class="btn h-7 px-2.5 text-[11px]"
                :disabled="lk.busy"
                @click="doLookup('steamcmd')"
              >
                用 steamcmd 再试一次
              </button>
            </div>
          </div>

          <!-- 查到了 -->
          <div v-if="lk?.done" class="card-flat p-3.5">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span class="text-[11px] font-semibold tracking-wider text-faint uppercase">后台 Depot</span>
              <span v-if="lk.appName" class="text-[12px] text-ink">{{ lk.appName }}</span>
              <span v-if="!lk.appIdKnown" class="pill pill-warn">不在密钥权限内</span>
            </div>

            <div v-if="!lk.depots.length" class="text-[11.5px] text-faint">后台这个 App 下还没有任何 Depot。</div>

            <div v-for="d in lk.depots" :key="d.depotId" class="flex items-center gap-2.5 py-1 min-w-0">
              <input
                v-if="d.platform"
                type="checkbox"
                :checked="d.on"
                class="accent-[#2ee6c5] w-3.5 h-3.5 shrink-0"
                @change="toggleDepot(d)"
              />
              <select
                v-else-if="!d.on"
                class="h-6 px-1.5 rounded-md bg-surface border border-line text-[10.5px] shrink-0"
                @change="onPickPlatform(d, $event)"
              >
                <option value="">平台…</option>
                <option v-for="p in w.platforms" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
              <span v-else class="text-[10.5px] text-accent shrink-0">{{ platLabel(d.appliedAs) }}</span>

              <span class="font-mono num text-[12px] shrink-0">{{ d.depotId }}</span>
              <span v-if="d.platform" class="text-[11.5px] shrink-0" :class="d.on ? 'text-accent' : 'text-muted'">
                {{ d.platformLabel }}
              </span>
              <span v-else class="text-[11px] text-faint shrink-0">平台未知</span>

              <span v-if="d.hasBuild" class="text-[11px] text-faint truncate">
                build {{ d.buildId || d.manifestId }}<template v-if="d.branch && d.branch !== 'default'"> · {{ d.branch }}</template>
              </span>
              <span v-else class="text-[11px] text-faint truncate">没有构建记录</span>

              <span class="ml-auto text-[11px] text-faint num shrink-0">{{ fmtSize(d.size) }}</span>
            </div>
          </div>
        </div>

        <!-- 平台 -->
        <div class="flex flex-col gap-2">
          <span class="text-[11.5px] text-muted">平台</span>

          <div class="rounded-[10px] border border-line overflow-hidden">
            <div
              class="grid grid-cols-[14px_18px_96px_108px_1fr_62px] items-center gap-2 px-3 h-7 bg-[rgba(255,255,255,.022)] text-[10.5px] text-faint tracking-wider uppercase"
            >
              <span />
              <span />
              <span>平台 ↑↓</span>
              <span>DepotID</span>
              <span>内容目录</span>
              <span />
            </div>

            <div
              v-for="p in w.platforms"
              :key="p.id"
              class="grid grid-cols-[14px_18px_96px_108px_1fr_62px] items-center gap-2 px-3 h-10 border-t border-line-soft transition-colors"
              :class="[
                w.picks[p.id].on ? 'bg-[rgba(46,230,197,.035)]' : '',
                overId === p.id ? 'shadow-[inset_0_2px_0_0_#2ee6c5]' : '',
                dragId === p.id ? 'opacity-45' : ''
              ]"
              @dragover.prevent="onDragOver(p.id)"
              @drop.prevent="onDrop(p.id)"
            >
              <span
                class="cursor-grab active:cursor-grabbing text-faint hover:text-muted select-none grid place-items-center"
                draggable="true"
                title="拖动排序：从上到下就是 DepotID +1、+2… 的顺序"
                @dragstart="onDragStart(p.id, $event)"
                @dragend="onDragEnd"
              >
                <svg viewBox="0 0 16 16" class="w-3 h-3" fill="currentColor">
                  <circle cx="5.5" cy="4" r="1.15" />
                  <circle cx="10.5" cy="4" r="1.15" />
                  <circle cx="5.5" cy="8" r="1.15" />
                  <circle cx="10.5" cy="8" r="1.15" />
                  <circle cx="5.5" cy="12" r="1.15" />
                  <circle cx="10.5" cy="12" r="1.15" />
                </svg>
              </span>
              <input
                type="checkbox"
                :checked="w.picks[p.id].on"
                class="accent-[#2ee6c5] w-3.5 h-3.5"
                @change="wizardTogglePlatform(p.id)"
              />
              <label
                class="text-[12px] cursor-pointer select-none truncate"
                :class="w.picks[p.id].on ? 'text-ink' : 'text-faint'"
                @click="wizardTogglePlatform(p.id)"
              >
                {{ p.label }}
              </label>
              <input
                :value="w.picks[p.id].depotId"
                :disabled="!w.picks[p.id].on"
                placeholder="AppID+1"
                class="h-7 px-2 rounded-md bg-surface border border-line text-[11.5px] num outline-none focus:border-[rgba(46,230,197,.45)] placeholder:text-faint disabled:opacity-35 disabled:cursor-not-allowed"
                @input="wizardSetDepotId(p.id, $event.target.value)"
              />
              <input
                :value="w.picks[p.id].contentRoot"
                :disabled="!w.picks[p.id].on"
                class="h-7 px-2 rounded-md bg-surface border border-line text-[11px] font-mono outline-none focus:border-[rgba(46,230,197,.45)] disabled:opacity-35 disabled:cursor-not-allowed"
                @input="wizardSetRoot(p.id, $event.target.value)"
              />
              <button
                class="btn h-7 px-2 text-[11px]"
                :disabled="!w.picks[p.id].on"
                @click="wizardPickRoot(p.id)"
              >
                选择…
              </button>
            </div>
          </div>
        </div>

        <!-- 描述 -->
        <label class="flex flex-col gap-1.5">
          <span class="text-[11.5px] text-muted">描述</span>
          <input
            :value="w.desc"
            placeholder="例如 阿比亚：弹射之旅 正式版"
            class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(46,230,197,.45)] placeholder:text-faint"
            @input="w.desc = $event.target.value"
          />
        </label>

        <label class="flex items-center gap-2 text-[12px] text-muted cursor-pointer select-none">
          <input type="checkbox" v-model="w.preview" class="accent-[#2ee6c5]" />
          先设成 preview（空跑）
        </label>

        <!-- 预览：默认收起，勾几个平台都不会把弹窗撑长 -->
        <details class="card-flat px-3.5 py-2.5 group">
          <summary
            class="flex items-center gap-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
          >
            <span class="text-[11px] font-semibold tracking-wider text-faint uppercase">会创建</span>
            <span class="text-[11.5px] text-muted num">
              {{ willCreate.scripts.length }} 个脚本 · {{ willCreate.dirs.length }} 个目录
            </span>
            <span class="ml-auto text-[11px] text-faint group-open:hidden">展开</span>
            <span class="ml-auto text-[11px] text-faint hidden group-open:inline">收起</span>
          </summary>

          <div class="mt-2 flex flex-col">
            <div
              v-for="(f, i) in willCreate.scripts"
              :key="'s' + i"
              class="font-mono text-[11.5px] text-accent/90 py-0.5 truncate"
            >
              <span class="text-faint">＋ 脚本　</span>{{ f }}
            </div>
            <div
              v-for="(d, i) in willCreate.dirs"
              :key="'d' + i"
              class="font-mono text-[11.5px] text-accent/90 py-0.5 truncate"
            >
              <span class="text-faint">＋ 目录　</span>{{ d }}
            </div>
          </div>
        </details>

        <div v-if="depotIdDup" class="text-[11.5px] text-danger">
          DepotID 有重复 —— 同一个 App 下每个 DepotID 必须不一样。
        </div>

        <div
          v-if="w.error"
          class="rounded-[10px] border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-[12px] text-danger"
        >
          {{ w.error }}
        </div>
      </div>

      <footer class="px-6 py-4 border-t border-line flex items-center gap-2">
        <div class="flex-1" />
        <button class="btn" @click="closeWizard">取消</button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="submitWizard">
          {{ w.busy ? '创建中…' : `创建（${picked.length} 个 Depot）` }}
        </button>
      </footer>
    </div>
  </div>
</template>
