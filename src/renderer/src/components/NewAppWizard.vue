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
  wizardClearLookup,
  goSettings,
  selectedPicks,
  publicName
} from '../store.js'
import { ExternalLink, GripVertical, ListFilter, X } from '@lucide/vue'
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

/* ---- 平台行拖拽排序：从上到下的次序就是 DepotID +1 的次序 ----
 * 拖到哪一行就立刻换到哪一行（实时预览），不然 5 行拖起来完全不知道自己会落在哪。
 * 换完 autoAssign 会重排 DepotID，所以数字也跟着实时变。 */

const dragId = ref('')

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
  wizardMovePlatform(dragId.value, id)
}

function onDragEnd() {
  dragId.value = ''
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
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeWizard" />

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
          <div class="flex items-center gap-2">
            <input
              :value="w.appId"
              list="known-apps"
              placeholder="例如 1234560"
              class="flex-1 min-w-0 h-9 px-3 rounded-input bg-surface border text-body num outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
              :class="w.appId && !appIdOk ? 'border-[rgba(226,75,75,.55)]' : 'border-line'"
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
              class="h-9 px-2 rounded-input bg-surface border border-line text-label outline-none max-w-[190px] disabled:opacity-45"
              :disabled="!knownApps.length"
              :title="
                state.partnerAppCount
                  ? `Web API 密钥权限内的 ${state.partnerAppCount} 个 App，外加你用过的`
                  : knownApps.length
                    ? '你用过的 App 里，能从 Steam 查到产品名的那些。要列出账号能发布的全部 App，需要 Publisher 级别的 Web API 密钥'
                    : '还没有记录 —— 填一个 AppID，读到名字之后就会记在这里'
              "
              @change="pickKnown($event); $event.target.value = ''"
            >
              <option value="">
                {{ knownApps.length ? (state.partnerAppCount ? '密钥权限内的 App…' : '用过的 App…') : '还没有记录' }}
              </option>
              <option v-for="a in knownApps" :key="'s' + a.appId" :value="a.appId">
                {{ a.appId }} · {{ a.name }}
              </option>
            </select>
          </div>
          <span v-if="resolvedName === '查询中…'" class="text-micro text-faint">查询中…</span>
          <span v-else-if="resolvedName" class="text-label text-accent">{{ resolvedName }}</span>

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
                v-if="d.platform"
                type="checkbox"
                :checked="d.on"
                class="accent-[#66c0f4] w-3.5 h-3.5 shrink-0"
                @change="toggleDepot(d)"
              />
              <select
                v-else-if="!d.on"
                class="h-6 px-1.5 rounded-md bg-surface border border-line text-micro shrink-0"
                @change="onPickPlatform(d, $event)"
              >
                <option value="">平台…</option>
                <option v-for="p in w.platforms" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
              <span v-else class="text-micro text-accent shrink-0">{{ platLabel(d.appliedAs) }}</span>

              <span class="font-mono num text-label shrink-0">{{ d.depotId }}</span>
              <span v-if="d.platform" class="text-label shrink-0" :class="d.on ? 'text-accent' : 'text-muted'">
                {{ d.platformLabel }}
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
                class="grid grid-cols-[14px_18px_96px_108px_1fr_62px] items-center gap-2 px-3 h-10 border-t border-line-soft transition-colors"
                :class="[
                  w.picks[p.id].on ? 'bg-[rgba(102,192,244,.035)]' : '',
                  dragId === p.id ? 'bg-[rgba(102,192,244,.09)] opacity-60' : ''
                ]"
                @dragover.prevent="onDragOver(p.id)"
              >
                <span
                  class="cursor-grab active:cursor-grabbing text-faint hover:text-muted select-none grid place-items-center"
                  draggable="true"
                  title="拖动排序：从上到下就是 DepotID +1、+2… 的顺序"
                  @dragstart="onDragStart(p.id, $event)"
                  @dragend="onDragEnd"
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
