<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
  wizardClearLookup,
  goSettings,
  selectedPicks,
  publicName
} from '../store.js'
import { ExternalLink, GripVertical, ListFilter, X, ChevronDown } from '@lucide/vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const el = ref(null)
const nameInput = ref(null)
const lookedUp = ref('')
const resolvedName = ref('')

onMounted(() => {
  if (!el.value) return
  gsap.fromTo(el.value, { opacity: 0, y: 18, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'power3.out', clearProps: 'transform,opacity' })
  nextTick(() => nameInput.value?.focus())
})

const w = computed(() => state.wizard)

useDialogA11y(el, closeWizard, { isOpen: () => !!w.value })
const appIdOk = computed(() => /^\d+$/.test(String(w.value?.appId || '').trim()))
const picked = computed(() => (w.value ? selectedPicks(w.value) : []))

const knownApps = computed(() => {
  // 合并三处来源：密钥权限内的 App（英文名居多）、用过的 App（可能是中文名）、本地已有的 App 文件夹
  // 本地文件夹名大多是中文，这样输入「阿比亚」也能搜到。
  const byId = new Map()
  for (const a of state.knownApps || []) byId.set(String(a.appId), { ...a })
  for (const app of state.apps || []) {
    const id = String(app.appId || '')
    if (!/^\d+$/.test(id)) continue
    const localName = app.dirName || ''
    const prev = byId.get(id)
    if (prev) {
      if (!prev.localName) prev.localName = localName
      prev.local = true
    } else {
      byId.set(id, { appId: id, name: localName, localName, local: true, from: 'local' })
    }
  }
  return [...byId.values()]
})

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

/* ---- AppID 搜索下拉：密钥权限内 + 用过的 App，输入即筛 ---- */

const appIdRef = ref(null)
const appPick = ref({ open: false, active: -1 })

const filteredKnownApps = computed(() => {
  const q = String(w.value?.appId || '').trim().toLowerCase()
  const list = knownApps.value
  if (!q || !appPick.value.open) return list
  return list.filter(
    (a) =>
      String(a.appId).includes(q) ||
      String(a.name || '').toLowerCase().includes(q) ||
      String(a.localName || '').toLowerCase().includes(q)
  )
})

const knownStatus = computed(() => {
  if (state.knownAppsLoading) return '正在从密钥拉取权限内的 App…'
  if (state.hasApiKey && state.partnerAppCount) return `已拉取 ${state.partnerAppCount} 个 App（Web API 密钥）`
  if (knownApps.value.length) return `用过的 App ${knownApps.value.length} 个`
  return '还没有记录'
})

const appIdKnown = computed(() => {
  const id = String(w.value?.appId || '').trim()
  return !id || knownApps.value.some((a) => String(a.appId) === id)
})

function pickKnownApp(a) {
  wizardAppIdChanged(String(a.appId ?? ''))
  closeAppPick()
  resolveName()
  maybeLookup()
}

function onAppIdInput(value) {
  wizardAppIdChanged(value)
  appPick.value = { open: true, active: -1 }
}

function onAppIdFocus() {
  appPick.value = { open: true, active: -1 }
}

function closeAppPick() {
  appPick.value = { open: false, active: -1 }
}

function onAppIdKey(e) {
  const list = filteredKnownApps.value
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    appPick.value.open = true
    const delta = e.key === 'ArrowDown' ? 1 : -1
    appPick.value.active = list.length ? (appPick.value.active + delta + list.length) % list.length : -1
    return
  }
  if (e.key === 'Enter') {
    if (appPick.value.open && appPick.value.active >= 0 && list[appPick.value.active]) {
      e.preventDefault()
      pickKnownApp(list[appPick.value.active])
      return
    }
    return
  }
  if (e.key === 'Escape' && appPick.value.open) {
    e.stopPropagation()
    closeAppPick()
  }
}

/** store.steampowered.com 的名称查询不需要密钥，用来确认没填错 AppID */
async function resolveName() {
  const id = String(w.value?.appId || '').trim()
  if (!appIdOk.value) {
    resolvedName.value = ''
    return
  }
  // 已经拉到的名字（密钥权限内 / 用过的 App）直接用，省一次网络请求
  const known = knownApps.value.find((a) => String(a.appId) === id)
  if (known?.name) {
    resolvedName.value = known.name
    return
  }
  resolvedName.value = ''
  const n = await publicName(id)
  if (String(w.value?.appId || '').trim() !== id) return
  resolvedName.value = n || ''
}

const lk = computed(() => w.value?.lookup || null)

function onAppIdBlur() {
  // 点下拉选项时先 blur：延迟关，保证 mousedown 能选中
  setTimeout(closeAppPick, 150)
  const id = String(w.value?.appId || '').trim()
  resolveName()
  if (!appIdOk.value || !(state.hasApiKey || state.hasPassword)) return
  if (lookedUp.value === id) return
  lookedUp.value = id
  wizardLookup()
}

/** AppID 定了（输入完 / 从下拉里选）就顺手读一次后台，省一次点击 */
function maybeLookup() {
  const id = String(w.value?.appId || '').trim()
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
const anyUnowned = computed(() => !!lk.value?.depots?.some((d) => !d.on))

function toggleDepot(d) {
  wizardToggleSteamDepot(d.depotId)
}

/* ---- 平台行拖拽排序：用指针事件，不用 HTML5 拖放 ----
 * draggable 会触发系统级拖动（鼠标带「移动/复制」光标），窗口里看着像在拖文件。
 * 从上到下的次序就是 DepotID +1 的次序；拖到哪一行就立刻换到哪一行（实时预览）。 */

const dragId = ref('')

function startDrag(id, e) {
  if (e.button !== 0) return
  dragId.value = id
  e.preventDefault()
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDragMove(e) {
  if (!dragId.value) return
  const row = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-plat-id]')
  const id = row?.dataset?.platId
  if (id && id !== dragId.value) wizardMovePlatform(dragId.value, id)
}

function endDrag() {
  dragId.value = ''
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

onBeforeUnmount(endDrag)

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

/* ---- 描述 / 会创建：共用一个位置，用选项卡切换，勾几个平台都不会把弹窗撑长 ---- */

const TABS = [
  { id: 'desc', label: '描述' },
  { id: 'will', label: '会创建' }
]
const descTab = ref('desc')
</script>

<template>
  <Transition name="overlay">
  <div v-if="w" class="fixed inset-0 z-50 grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/25" @click="closeWizard" />

    <div ref="el" role="dialog" aria-modal="true" aria-labelledby="new-app-title" class="relative card w-full max-w-[660px] max-h-[88vh] overflow-y-auto scroll-thin no-drag">
      <header class="px-6 h-14 border-b border-line flex items-center gap-3">
        <h2 id="new-app-title" class="text-lead font-semibold m-0">新建 App</h2>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer"
          @click="closeWizard"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="p-6 flex flex-col gap-4">
        <!-- 名字 -->
        <label class="flex flex-col gap-1.5">
          <span class="text-label text-muted">App 名字</span>
          <input
            ref="nameInput"
            :value="w.name"
            placeholder="例如 MyGame"
            class="h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
            @input="wizardNameChanged($event.target.value)"
          />
        </label>

        <!-- AppID -->
        <div class="flex flex-col gap-1.5">
          <span class="text-label text-muted">AppID</span>
          <div class="relative">
            <div class="flex items-center gap-2">
              <input
                ref="appIdRef"
                :value="w.appId"
                placeholder="例如 1234560；输入可搜索已知 App"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="appPick.open"
                aria-controls="app-pick-list"
                class="flex-1 min-w-0 h-9 px-3 rounded-input bg-surface border text-body num outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                :class="w.appId && !appIdOk ? 'border-[rgba(226,75,75,.55)]' : 'border-line'"
                @input="onAppIdInput($event.target.value)"
                @focus="onAppIdFocus"
                @blur="onAppIdBlur"
                @keydown="onAppIdKey"
                @keyup.enter="doLookup"
              />
              <button
                class="btn btn-sm px-2 h-9 shrink-0"
                title="展开已知 App 列表"
                @mousedown.prevent
                @click="onAppIdFocus()"
              >
                <ChevronDown :size="14" :stroke-width="2" />
              </button>
              <button class="btn btn-sm px-3 h-9 shrink-0" @click="openPartner">
                <ExternalLink :size="14" :stroke-width="2" class="mr-1.5" />
                后台
              </button>
            </div>

            <div
              v-if="appPick.open"
              id="app-pick-list"
              role="listbox"
              aria-label="已知 App"
              class="absolute left-0 right-0 top-full mt-1 z-30 max-h-[240px] overflow-y-auto scroll-thin rounded-card border border-line bg-surface-2 py-1 shadow-[0_16px_40px_rgba(0,0,0,.5)]"
            >
              <div v-if="!filteredKnownApps.length" class="px-3 py-2 text-label text-faint">
                没有匹配的 App —— 可以继续手填 AppID
              </div>
              <button
                v-for="(a, i) in filteredKnownApps"
                :key="a.appId"
                type="button"
                role="option"
                :aria-selected="i === appPick.active"
                class="w-full px-3 py-1.5 text-left flex items-center gap-2 min-w-0 border-0 bg-transparent cursor-pointer"
                :class="i === appPick.active ? 'bg-surface-3' : 'hover:bg-surface-3/60'"
                @mousedown.prevent="pickKnownApp(a)"
              >
                <span class="num text-label text-accent shrink-0">{{ a.appId }}</span>
                <span class="text-label text-muted truncate">{{ a.name || '（没有名字）' }}</span>
                <span
                  v-if="a.localName && a.localName !== a.name"
                  class="text-micro text-faint truncate"
                  :title="`本地文件夹：${a.localName}`"
                >
                  {{ a.localName }}
                </span>
                <span v-if="a.local" class="ml-auto shrink-0 text-micro text-faint">本地已有</span>
              </button>
              <div class="px-3 py-1.5 mt-1 border-t border-line-soft text-micro text-faint">
                {{ knownStatus }} · ↑↓ 选择，Enter 填入
              </div>
            </div>
          </div>

          <span v-if="resolvedName" class="text-label text-accent">{{ resolvedName }}</span>
          <span v-else-if="appIdOk && !appIdKnown" class="text-micro text-amber">
            AppID 不在密钥权限内 —— 还能继续建，但「读后台 Depot」「同步 Depot」会 403。
          </span>

          <div
            v-if="appIdConflict.length"
            class="rounded-card border border-[rgba(255,180,84,.26)] bg-[rgba(255,180,84,.06)] px-3 py-2 flex items-center gap-2 flex-wrap"
          >
            <span class="text-label text-amber">
              AppID {{ w.appId }} 已经被本地 App「{{ appIdConflict.join('、') }}」用了 ——
              再建一个就是两个本地 App 指着同一个 Steam App，构建会传到同一处。
            </span>
            <button class="btn btn-sm px-2 " @click="goExisting">改用它</button>
          </div>
        </div>

        <!-- 从后台读 Depot -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn px-3 " :disabled="!appIdOk || lk?.busy" @click="doLookup">
              <ListFilter :size="14" :stroke-width="1.8" class="mr-1.5" />
              {{ lk?.busy ? '读取中…' : '读后台 Depot' }}
            </button>
            <button
              class="btn px-3 "
              title="在 Steamworks 后台打开这个 App"
              @click="openPartner"
            >
              <ExternalLink :size="14" :stroke-width="2" class="mr-1.5" />
              {{ appIdOk ? '打开后台 App 页' : '打开后台 App 列表' }}
            </button>
            <button v-if="anyUnowned" class="btn px-3 " @click="wizardApplyAllSteam">
              全部勾上
            </button>
          </div>

          <!-- 出错 -->
          <div
            v-if="lk?.error"
            class="rounded-card border px-3.5 py-2.5 text-label leading-relaxed"
            :class="
              lk.needsKey || lk.needsPassword
                ? 'border-[rgba(255,180,84,.26)] bg-[rgba(255,180,84,.06)] text-amber'
                : 'border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] text-danger'
            "
          >
            <div class="whitespace-pre-wrap">{{ lk.error }}</div>
            <div v-if="lk.needsKey || lk.needsPassword" class="mt-2 flex items-center gap-2 flex-wrap">
              <button class="btn btn-sm px-2.5 " @click="closeWizard(); goSettings()">去设置里配</button>
              <button
                v-if="!state.hasApiKey"
                class="btn btn-sm px-2.5 "
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
              <span class="text-micro font-semibold tracking-wider text-faint uppercase">后台 Depot</span>
              <span v-if="lk.appName" class="text-label text-ink">{{ lk.appName }}</span>
              <span v-if="!lk.appIdKnown" class="pill pill-warn">不在密钥权限内</span>
              <button
                class="ml-auto btn btn-sm px-2  shrink-0"
                title="收起这块结果"
                @click="wizardClearLookup"
              >
                关闭
              </button>
            </div>

            <div v-if="!lk.depots.length" class="text-label text-faint">后台这个 App 下还没有任何 Depot。</div>

            <div v-for="d in lk.depots" :key="d.depotId" class="flex items-center gap-2.5 py-1 min-w-0">
              <input
                type="checkbox"
                :checked="d.on"
                class="accent-[#66c0f4] w-3.5 h-3.5 shrink-0"
                @change="toggleDepot(d)"
              />

              <span class="font-mono num text-label shrink-0">{{ d.depotId }}</span>
              <span v-if="d.platform" class="text-label shrink-0" :class="d.on ? 'text-accent' : 'text-muted'">
                {{ d.platformLabel }}
              </span>
              <span v-else-if="d.on && d.appliedAs" class="text-label text-accent shrink-0">
                {{ platLabel(d.appliedAs) }}
              </span>
              <span v-else class="text-micro text-faint shrink-0">平台未知</span>

              <span v-if="d.hasBuild" class="text-micro text-faint truncate">
                build {{ d.buildId || d.manifestId }}<template v-if="d.branch && d.branch !== 'default'"> · {{ d.branch }}</template>
              </span>
              <span v-else class="text-micro text-faint truncate">没有构建记录</span>

              <span class="ml-auto text-micro text-faint num shrink-0">{{ fmtSize(d.size) }}</span>
            </div>
          </div>
        </div>

        <!-- 平台 -->
        <div class="flex flex-col gap-2">
          <span class="text-label text-muted">平台</span>

          <div class="rounded-card border border-line overflow-hidden">
            <div
              class="grid grid-cols-[14px_18px_96px_108px_1fr_62px] items-center gap-2 px-3 h-7 bg-[rgba(255,255,255,.022)] text-micro text-faint tracking-wider uppercase"
            >
              <span />
              <span />
              <span>平台 ↑↓</span>
              <span>DepotID</span>
              <span>内容目录</span>
              <span />
            </div>

            <TransitionGroup name="plat">
              <div
                v-for="p in w.platforms"
                :key="p.id"
                :data-plat-id="p.id"
                class="grid grid-cols-[14px_18px_96px_108px_1fr_62px] items-center gap-2 px-3 h-10 border-t border-line-soft transition-colors"
                :class="[
                  w.picks[p.id].on ? 'bg-[rgba(102,192,244,.035)]' : '',
                  dragId === p.id ? 'bg-[rgba(102,192,244,.09)] opacity-60' : ''
                ]"
              >
                <span
                  class="cursor-grab active:cursor-grabbing text-faint hover:text-muted select-none grid place-items-center touch-none"
                  title="拖动排序：从上到下就是 DepotID +1、+2… 的顺序"
                  @pointerdown="startDrag(p.id, $event)"
                >
                <GripVertical :size="12" :stroke-width="2" />
              </span>
              <input
                type="checkbox"
                :checked="w.picks[p.id].on"
                class="accent-[#66c0f4] w-3.5 h-3.5"
                @change="wizardTogglePlatform(p.id)"
              />
              <label
                class="text-label cursor-pointer select-none truncate"
                :class="w.picks[p.id].on ? 'text-ink' : 'text-faint'"
                @click="wizardTogglePlatform(p.id)"
              >
                {{ p.label }}
              </label>
              <input
                :value="w.picks[p.id].depotId"
                :disabled="!w.picks[p.id].on"
                placeholder="AppID+1"
                class="h-7 px-2 rounded-md bg-surface border border-line text-label num outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint disabled:opacity-35 disabled:cursor-not-allowed"
                @input="wizardSetDepotId(p.id, $event.target.value)"
              />
              <input
                :value="w.picks[p.id].contentRoot"
                :disabled="!w.picks[p.id].on"
                class="h-7 px-2 rounded-md bg-surface border border-line text-micro font-mono outline-none focus:border-[rgba(102,192,244,.45)] disabled:opacity-35 disabled:cursor-not-allowed"
                @input="wizardSetRoot(p.id, $event.target.value)"
              />
              <button
                class="btn btn-sm px-2 "
                :disabled="!w.picks[p.id].on"
                @click="wizardPickRoot(p.id)"
              >
                选择…
              </button>
              </div>
            </TransitionGroup>
          </div>

          <p class="m-0 text-micro text-faint leading-relaxed">
            32 位和 ARM64 的 Depot 只有老项目才需要；新 App 一般只建 Windows 64 / macOS / Linux。
          </p>
        </div>

        <!-- 描述 / 会创建 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-5">
            <button
              v-for="t in TABS"
              :key="t.id"
              class="relative pb-1.5 text-body font-medium bg-transparent border-0 px-0 cursor-pointer transition-colors"
              :class="descTab === t.id ? 'text-accent' : 'text-faint hover:text-muted'"
              @click="descTab = t.id"
            >
              {{ t.label }}
              <span
                v-if="descTab === t.id"
                class="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-accent"
              />
            </button>
            <span v-if="descTab === 'will'" class="ml-auto text-label text-faint num">
              {{ willCreate.scripts.length }} 个脚本 · {{ willCreate.dirs.length }} 个目录
            </span>
          </div>

          <div class="border-t border-line pt-3.5">
            <Transition name="fade-fast" mode="out-in">
            <!-- 描述 -->
            <input
              v-if="descTab === 'desc'"
              key="desc"
              :value="w.desc"
              placeholder="例如 MyGame 正式版"
              class="w-full h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
              @input="w.desc = $event.target.value"
            />

            <!-- 会创建 -->
            <div v-else key="will" class="flex flex-col gap-1">
              <details
                v-for="grp in [
                  { name: '脚本', icon: '＋ 脚本　', rows: willCreate.scripts },
                  { name: '目录', icon: '＋ 目录　', rows: willCreate.dirs }
                ]"
                :key="grp.name"
                class="group"
              >
                <summary
                  class="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-label text-muted hover:text-ink"
                >
                  <span class="text-faint">{{ grp.name }}</span>
                  <span class="num text-faint">{{ grp.rows.length }}</span>
                  <span class="ml-auto text-micro text-faint group-open:hidden">展开</span>
                  <span class="ml-auto text-micro text-faint hidden group-open:inline">收起</span>
                </summary>
                <div class="mt-1">
                  <div
                    v-for="(f, i) in grp.rows"
                    :key="grp.name + i"
                    class="font-mono text-label text-accent py-0.5 break-all"
                  >
                    <span class="text-faint">{{ grp.icon }}</span>{{ f }}
                  </div>
                </div>
              </details>
            </div>
            </Transition>
          </div>
        </div>

        <div v-if="depotIdDup" class="text-label text-danger">
          DepotID 有重复 —— 同一个 App 下每个 DepotID 必须不一样。
        </div>

        <div
          v-if="w.error"
          class="rounded-card border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-label text-danger"
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
  </Transition>
</template>
