<script setup>
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  LayoutDashboard,
  History,
  Settings,
  RefreshCw,
  Plus,
  BookOpen,
  FolderPlus,
  FolderClosed,
  FolderOpen,
  Pencil,
  Trash2,
  Palette,
  GripVertical
} from '@lucide/vue'
import {
  state,
  selectApp,
  rescan,
  openWizard,
  setAppOrder,
  createFolder,
  renameFolder,
  setFolderColor,
  toggleFolder,
  deleteFolder,
  assignAppFolder,
  setFolderAlpha,
  folderAlphaOf,
  FOLDER_COLORS
} from '../store.js'
import { useListStagger } from '../motion.js'
import EmptyState from './EmptyState.vue'
import AppCard from './AppCard.vue'

const listEl = ref(null)
const { run } = useListStagger(listEl, (el) => el.dataset.dir)

watch(
  () => state.apps.map((a) => a.dirName).join('|'),
  () => run(),
  { immediate: true }
)

const nav = [
  { id: 'workbench', label: '工作台', icon: LayoutDashboard },
  { id: 'history', label: '构建历史', icon: History },
  { id: 'manual', label: '使用手册', icon: BookOpen },
  { id: 'settings', label: '设置', icon: Settings }
]

const appCount = computed(() => state.apps.length)

/**
 * 显示顺序：settings.appOrder 里有的按它的顺序排，没记录的（新 App）排最后，
 * 同类内保持扫描返回的顺序。拖动排序只改这个表，不动磁盘。
 */
const apps = computed(() => {
  const rank = new Map((state.appOrder || []).map((d, i) => [d, i]))
  return [...state.apps]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const rx = rank.has(x.a.dirName) ? rank.get(x.a.dirName) : Number.MAX_SAFE_INTEGER
      const ry = rank.has(y.a.dirName) ? rank.get(y.a.dirName) : Number.MAX_SAFE_INTEGER
      return rx - ry || x.i - y.i
    })
    .map((o) => o.a)
})

// ---- Apps 文件夹 + 拖动排序：拖动中实时换位（FLIP）+ 跟随指针的浮层，拖到文件夹上即归类 ----
const drag = ref({
  active: false,
  dir: '',
  fromFolder: '',
  dropFolder: null, // null = 不在文件夹上；'' = 未分类；其它 = 文件夹 id
  pointerId: -1,
  startX: 0,
  startY: 0,
  ghostX: 0,
  ghostY: 0,
  w: 0,
  h: 0,
  grabX: 0,
  grabY: 0,
  preview: []
})
let lastDragEndAt = 0

const appMap = computed(() => new Map(apps.value.map((a) => [a.dirName, a])))
const dragApp = computed(() => (drag.value.active ? appMap.value.get(drag.value.dir) || null : null))

function folderOf(app) {
  const id = state.folderMap?.[app.dirName]
  return id && state.folders.some((f) => f.id === id) ? id : ''
}

/** 某个容器当前应显示的 App（拖动中的容器用 preview 顺序，实现实时让位） */
function containerApps(folderId) {
  const base = apps.value.filter((a) => folderOf(a) === folderId)
  const d = drag.value
  if (d.active && d.fromFolder === folderId && d.preview.length) {
    const map = new Map(base.map((a) => [a.dirName, a]))
    const arr = d.preview.map((x) => map.get(x)).filter(Boolean)
    if (arr.length === base.length) return arr
  }
  return base
}

const folderGroups = computed(() =>
  state.folders.map((f) => ({ folder: f, items: containerApps(f.id) }))
)
const looseApps = computed(() => containerApps(''))
const hasFolders = computed(() => state.folders.length > 0)

/** 渲染清单：文件夹（含子卡片）+ 未分类小标题 + 未分类卡片，交给 TransitionGroup 做 FLIP */
const rows = computed(() => {
  const out = []
  for (const g of folderGroups.value) {
    out.push({ type: 'folder', key: 'f:' + g.folder.id, folder: g.folder, items: g.items })
  }
  // 没有未分类 App 时不占一行；拖动中仍显示，好让「拖出来」有落点
  if (hasFolders.value && (looseApps.value.length > 0 || drag.value.active)) {
    out.push({ type: 'loose-head', key: 'loose-head' })
  }
  for (const a of looseApps.value) out.push({ type: 'app', key: a.dirName, app: a })
  return out
})

// ---- 文件夹的新建 / 重命名（内联输入，不用弹窗） ----
const creatingFolder = ref(false)
const folderName = ref('')
const folderInput = ref(null)
const editingFolder = ref('')
const editName = ref('')

function beginCreateFolder() {
  creatingFolder.value = true
  folderName.value = ''
  nextTick(() => folderInput.value?.focus())
}
function confirmCreateFolder() {
  if (!creatingFolder.value) return
  const name = folderName.value.trim()
  creatingFolder.value = false
  folderName.value = ''
  if (name) createFolder(name)
}
function cancelCreateFolder() {
  creatingFolder.value = false
  folderName.value = ''
}
function beginRenameFolder(f) {
  creatingFolder.value = false
  editingFolder.value = f.id
  editName.value = f.name
  nextTick(() => {
    const el = listEl.value?.querySelector('input[data-edit-folder]')
    el?.focus()
    el?.select()
  })
}
function confirmRenameFolder() {
  if (!editingFolder.value) return
  renameFolder(editingFolder.value, editName.value)
  editingFolder.value = ''
}
function cancelRenameFolder() {
  editingFolder.value = ''
}

// ---- 文件夹颜色 / 删除二次确认（都做成行内状态，不弹新窗口） ----
const pendingDeleteFolder = ref('')

/** 文件夹主色：没设置时用主题蓝 */
function folderColor(f) {
  return f?.color || 'var(--color-accent)'
}
function folderColorHex(f) {
  const c = f?.color || ''
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#66c0f4'
}
function folderColorLive(id, color) {
  setFolderColor(id, color)
}
const colorPopoverFolder = ref('')
const colorPopoverPos = ref({ top: 0, left: 0 })
const pickHsv = ref({ h: 0.56, s: 0.58, v: 0.96 })
const pickAlpha = ref(0.4)
const pickTarget = ref('')
const pickColor = computed(() => hsvToHex(pickHsv.value.h, pickHsv.value.s, pickHsv.value.v))
const pickHueColor = computed(() => `hsl(${Math.round(pickHsv.value.h * 360)}, 100%, 50%)`)
function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return { r: 102, g: 192, b: 244 }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}
function rgbToHsv(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
    if (h < 0) h += 1
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}
function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return '#' + f(5) + f(3) + f(1)
}
function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsv(r, g, b)
}
function syncPick(f) {
  const { h, s, v } = hexToHsv(folderColorHex(f))
  pickHsv.value = { h, s, v }
  pickAlpha.value = folderAlphaOf(f)
  pickTarget.value = f.id
}
function applyPick() {
  if (!pickTarget.value) return
  setFolderColor(pickTarget.value, pickColor.value)
  setFolderAlpha(pickTarget.value, pickAlpha.value)
}
function svDown(e) {
  if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId)
  svMove(e)
}
function svMove(e) {
  if (e.buttons !== 1) return
  const r = e.currentTarget.getBoundingClientRect()
  const x = clamp01((e.clientX - r.left) / r.width)
  const y = clamp01((e.clientY - r.top) / r.height)
  pickHsv.value = { ...pickHsv.value, s: x, v: 1 - y }
  applyPick()
}
function onHueInput(e) {
  pickHsv.value = { ...pickHsv.value, h: Number(e.target.value) / 360 }
  applyPick()
}
function onAlphaInput(e) {
  pickAlpha.value = Number(e.target.value) / 100
  applyPick()
}
function toggleColorPopover(id, event) {
  if (colorPopoverFolder.value === id) {
    closeColorPopover()
    return
  }
  const r = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null
  if (r) {
    const width = 236
    const height = 224
    const gap = 10
    let left = r.right + gap
    if (left + width > window.innerWidth - 8) left = r.left - width - gap
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8)
    const top = Math.min(Math.max(8, r.top - 12), window.innerHeight - height - 8)
    colorPopoverPos.value = { top, left }
  }
  const target = state.folders.find((f) => f.id === id)
  if (target) syncPick(target)
  colorPopoverFolder.value = id
}
function closeColorPopover() {
  colorPopoverFolder.value = ''
}
function onColorPopoverPointerDown(e) {
  if (!colorPopoverFolder.value) return
  const t = e.target
  if (t && t.closest && (t.closest('.folder-color-pop') || t.closest('[data-color-toggle]'))) return
  closeColorPopover()
}
function onColorPopoverKey(e) {
  if (e.key === 'Escape') closeColorPopover()
}
onMounted(() => {
  window.addEventListener('pointerdown', onColorPopoverPointerDown, true)
  window.addEventListener('keydown', onColorPopoverKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onColorPopoverPointerDown, true)
  window.removeEventListener('keydown', onColorPopoverKey)
})
function folderAlphaPct(f) {
  return Math.round(folderAlphaOf(f) * 100)
}
function setFolderAlphaLive(id, pct) {
  setFolderAlpha(id, Number(pct) / 100)
}
function resetFolderLook(id) {
  setFolderColor(id, '')
  setFolderAlpha(id, 0.4)
  colorPopoverFolder.value = ''
}
function folderBoxStyle(f) {
  const over = drag.active && drag.dropFolder === f.id
  if (over) return { borderColor: 'var(--color-accent)', background: 'rgba(102,192,244,0.14)' }
  const c = f?.color
  if (!c) return {}
  // 只让描边和图标变色，背景保持和未设置颜色时一致
  return { borderColor: `color-mix(in srgb, ${c} ${Math.round(folderAlphaOf(f) * 100)}%, transparent)` }
}
function chooseFolderColor(id, color) {
  setFolderColor(id, color)
}
function askDeleteFolder(id) {
  pendingDeleteFolder.value = pendingDeleteFolder.value === id ? '' : id
}
function cancelDeleteFolder() {
  pendingDeleteFolder.value = ''
}
function doDeleteFolder(id) {
  pendingDeleteFolder.value = ''
  deleteFolder(id)
}

function cardEls() {
  return listEl.value ? [...listEl.value.querySelectorAll('[data-dir]')] : []
}
function folderEls() {
  return listEl.value ? [...listEl.value.querySelectorAll('[data-folder-head]')] : []
}

/** 指针是否落在某个文件夹头上 */
function folderAt(clientY) {
  for (const el of folderEls()) {
    const r = el.getBoundingClientRect()
    if (clientY >= r.top - 3 && clientY <= r.bottom + 3) return el.dataset.folderHead
  }
  return null
}

/** 在指定容器的卡片里算插入槽位（offsetTop 不受 FLIP transform 影响） */
function insertionIn(folderId, clientY) {
  const list = listEl.value
  const base = list ? list.getBoundingClientRect().top - list.scrollTop : 0
  const cards = cardEls().filter((el) => (el.dataset.folder || '') === folderId)
  for (let i = 0; i < cards.length; i++) {
    const el = cards[i]
    if (clientY < base + el.offsetTop + el.offsetHeight / 2) return i
  }
  return cards.length
}

/** 指针落在哪个文件夹容器的矩形里（含空白区，卡片之间也能判定） */
function folderBoxAt(clientY) {
  const list = listEl.value
  if (!list) return null
  for (const el of list.querySelectorAll('[data-folder-box]')) {
    const r = el.getBoundingClientRect()
    if (clientY >= r.top && clientY <= r.bottom) return el.dataset.folderBox
  }
  return null
}

/** 指针落在哪张卡上（返回它属于哪个容器、以及该容器里的插入槽位） */
function containerAt(clientY) {
  for (const el of cardEls()) {
    const r = el.getBoundingClientRect()
    if (clientY >= r.top - 2 && clientY <= r.bottom + 2) {
      const folderId = el.dataset.folder || ''
      return { folderId, index: insertionIn(folderId, clientY) }
    }
  }
  // 卡片之间的空隙：算在所在文件夹容器里，槽位按 Y 推算
  const box = folderBoxAt(clientY)
  if (box !== null && box !== undefined) return { folderId: box, index: insertionIn(box, clientY) }
  return null
}

function onCardPointerDown(e, app) {
  if (e.button !== 0) return
  // 事件经 AppCard 透传，currentTarget 可能为空；退回按坐标找卡片根元素
  const rootEl = e.currentTarget?.getBoundingClientRect
    ? e.currentTarget
    : e.target?.closest?.('[data-dir]')
  if (!rootEl) return
  const rect = rootEl.getBoundingClientRect()
  const fromFolder = folderOf(app)
  drag.value = {
    active: false,
    dir: app.dirName,
    fromFolder,
    dropFolder: null,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    ghostX: rect.left,
    ghostY: rect.top,
    w: rect.width,
    h: rect.height,
    grabX: e.clientX - rect.left,
    grabY: e.clientY - rect.top,
    preview: []
  }
  const move = (ev) => {
    if (ev.pointerId !== drag.value.pointerId) return
    const d = drag.value
    if (!d.active) {
      if (Math.abs(ev.clientY - d.startY) < 4 && Math.abs(ev.clientX - d.startX) < 4) return
      d.active = true
      d.preview = apps.value.filter((a) => folderOf(a) === fromFolder).map((a) => a.dirName)
    }
    d.ghostX = ev.clientX - d.grabX
    d.ghostY = ev.clientY - d.grabY

    const overFolder = folderAt(ev.clientY)
    if (overFolder !== null) {
      // 指到文件夹头上才算「要放进去」；同容器时不提示
      d.dropFolder = overFolder === fromFolder ? null : overFolder
      if (overFolder !== fromFolder) d.preview = []
      ev.preventDefault()
      return
    }

    const hit = containerAt(ev.clientY)
    const container = hit ? hit.folderId : ''
    d.dropFolder = container === fromFolder ? null : container
    if (container === fromFolder) {
      const cur = d.preview.indexOf(d.dir)
      let target = hit ? hit.index : d.preview.length
      if (cur < target) target -= 1
      target = Math.max(0, Math.min(target, d.preview.length - 1))
      if (target !== cur) {
        const next = d.preview.filter((x) => x !== d.dir)
        next.splice(target, 0, d.dir)
        d.preview = next
      }
    } else {
      d.preview = []
    }
    ev.preventDefault()
  }
  const up = (ev) => {
    if (ev.pointerId !== drag.value.pointerId) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const d = drag.value
    if (d.active) {
      lastDragEndAt = Date.now()
      const overHeader = folderAt(ev.clientY)
      const target = overHeader !== null ? overHeader : d.dropFolder
      if (target !== null && target !== d.fromFolder) {
        assignAppFolder(d.dir, target || null)
      } else if (d.preview.length) {
        // 同一容器内改顺序：按「文件夹顺序 + 未分类」重组全局顺序
        const next = []
        for (const f of state.folders) {
          const list =
            f.id === d.fromFolder
              ? d.preview
              : apps.value.filter((a) => folderOf(a) === f.id).map((a) => a.dirName)
          next.push(...list)
        }
        const loose =
          d.fromFolder === ''
            ? d.preview
            : apps.value.filter((a) => folderOf(a) === '').map((a) => a.dirName)
        next.push(...loose)
        if (next.join('|') !== apps.value.map((a) => a.dirName).join('|')) setAppOrder(next)
      }
    }
    drag.value = {
      active: false,
      dir: '',
      fromFolder: '',
      dropFolder: null,
      pointerId: -1,
      startX: 0,
      startY: 0,
      ghostX: 0,
      ghostY: 0,
      w: 0,
      h: 0,
      grabX: 0,
      grabY: 0,
      preview: []
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onCardClick(app) {
  // 刚拖动完的那一下 click 不要当成「切换 App」
  if (Date.now() - lastDragEndAt < 350) return
  selectApp(app.dirName)
}

/**
 * 三态：红 = 结构性坏了（脚本缺了 / 没有 AppID / AppID 撞车），
 * 黄 = 有待处理但不致命，绿 = 干净。
 *
 * 三个状态用**同一个形状**（圆点），只换颜色 —— 之前黄的是地球、红的是三角、
 * 绿的是圆点，同一个语义轴三种形状，看着像三回事。
 */
/**
 * 还被当回事的待处理条数 —— 永久忽略和「本次忽略」的都不算。
 * 待处理清单本身现在是常驻的（忽略项也留在列表里），所以这里得自己减。
 */
function activeProblems(app) {
  const perm = new Set(app.problemsIgnored || [])
  const sess = new Set(state.sessionIgnored?.[app.dirName] || [])
  return (app.problems || []).filter((t) => !perm.has(t) && !sess.has(t)).length
}

function healthOf(app) {
  if ((app.depots || []).some((d) => d.missing)) return 'bad'
  if (!app.appId) return 'bad'
  if (app.appId && state.duplicates?.some((d) => String(d.appId) === String(app.appId))) return 'bad'
  // 只数「还当回事」的问题。内容目录不存在这类事 collectProblems 已经算进去了，
  // 再单独看一眼 analysis.exists 会让「全部忽略完」之后灯还是黄的。
  if (activeProblems(app)) return 'warn'
  return 'ok'
}

/** 颜色之外再给一句大白话，别只靠颜色传达状态 */
function healthTitle(app) {
  const h = healthOf(app)
  if (h === 'bad') {
    if ((app.depots || []).some((d) => d.missing)) return '有 Depot 的脚本文件不在了'
    if (!app.appId) return '没有 AppID'
    return 'AppID 和别的本地 App 撞车'
  }
  if (h === 'warn') {
    const n = activeProblems(app)
    return n ? `有待处理 ${n} 项` : '项目文件夹不存在'
  }
  return '一切正常'
}
</script>

<template>
  <aside class="w-59 shrink-0 s-sidebar flex flex-col min-h-0">
    <!-- 视图切换 -->
    <nav class="p-3 flex flex-col gap-1" v-stagger="{ each: 0.04 }">
      <button
        v-for="n in nav"
        :key="n.id"
        class="s-nav-item group"
        :class="state.view === n.id ? 'is-active' : ''"
        @click="state.view = n.id"
      >
        <component :is="n.icon" :size="16" :stroke-width="1.8" class="shrink-0" />
        {{ n.label }}
      </button>
    </nav>

    <div class="h-px bg-line mx-3" />

    <!-- App 列表（头部 pb 与列表 gap 一致：1.5 = 6px，保证第一个条目上边距与文件夹之间一致） -->
    <div class="px-3 pt-3 pb-1.5 flex items-center gap-2">
      <span class="text-micro font-semibold tracking-wider text-faint uppercase">Apps</span>
      <span class="num text-micro text-faint">{{ appCount }}</span>
      <button
        class="ml-auto w-7 h-7 grid place-items-center rounded-btn text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="新建文件夹（把 App 拖进去分类）"
        aria-label="新建文件夹"
        @click="beginCreateFolder"
      >
        <FolderPlus :size="14" :stroke-width="2" />
      </button>
      <button
        class="w-7 h-7 grid place-items-center rounded-btn text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="重新扫描 scripts 目录"
        aria-label="重新扫描 scripts 目录"
        @click="rescan"
      >
        <RefreshCw
          :size="14"
          :stroke-width="2"
          :class="state.scanning && 'animate-spin'"
        />
      </button>
      <button
        class="w-7 h-7 grid place-items-center rounded-btn text-faint hover:text-accent hover:bg-surface-2 transition-colors cursor-pointer border-0 bg-transparent"
        title="新建 App（Demo / 正式版 / 新平台）"
        aria-label="新建 App"
        @click="openWizard"
      >
        <Plus :size="14" :stroke-width="2.2" />
      </button>
    </div>

    <div ref="listEl" class="relative flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3">
      <!-- 新建文件夹：内联输入 -->
      <div
        v-if="creatingFolder"
        class="mb-1.5 flex items-center gap-1.5 h-8 px-2 rounded-card border border-accent/60 bg-accent/10"
      >
        <FolderClosed :size="13" class="shrink-0 text-accent" :stroke-width="1.9" />
        <input
          ref="folderInput"
          v-model="folderName"
          class="flex-1 min-w-0 bg-transparent border-0 outline-none text-body text-ink"
          placeholder="文件夹名称，回车创建"
          @keydown.enter.prevent="confirmCreateFolder"
          @keydown.esc.prevent="cancelCreateFolder"
          @blur="confirmCreateFolder"
        />
      </div>

      <TransitionGroup name="app-reorder" tag="div" class="flex flex-col gap-1.5">
        <!-- 文件夹：容器包住子卡片，展开/折叠用 grid-rows 过渡 -->
        <template v-for="row in rows" :key="row.key">
          <div
            v-if="row.type === 'folder'"
            :key="row.key"
            :data-folder-box="row.folder.id"
            class="rounded-card folder-box border relative transition-all"
            :class="[
              drag.active && drag.dropFolder === row.folder.id
                ? 'is-drop'
                : row.folder.collapsed
                  ? 'bg-black/18 border-line/70'
                  : 'folder-box-open border-line/70'
            ]"
            :style="folderBoxStyle(row.folder)"
          >
            <div
              :data-folder-head="row.folder.id"
              class="group relative flex items-center gap-1.5 h-9 px-2.5 py-1 transition-colors select-none"
              :class="[
                drag.active ? 'cursor-copy' : 'cursor-pointer hover:bg-surface-3/35',
                drag.active && drag.dropFolder === row.folder.id ? 'bg-accent/12' : ''
              ]"
              role="button"
              tabindex="0"
              :aria-expanded="!row.folder.collapsed"
              :title="`${row.folder.collapsed ? '展开' : '折叠'}「${row.folder.name}」；把 App 拖到这里分类`"
              @click="toggleFolder(row.folder.id)"
              @keydown.enter.prevent="toggleFolder(row.folder.id)"
              @keydown.space.prevent="toggleFolder(row.folder.id)"
            >
              <FolderOpen
                v-if="!row.folder.collapsed"
                :size="14"
                class="shrink-0"
                :style="{ color: folderColor(row.folder) }"
                :stroke-width="2.1"
              />
              <FolderClosed
                v-else
                :size="14"
                class="shrink-0"
                :style="{ color: folderColor(row.folder) }"
                :stroke-width="1.9"
              />
              <input
                v-if="editingFolder === row.folder.id"
                v-model="editName"
                data-edit-folder="1"
                class="flex-1 min-w-0 bg-transparent border-0 outline-none text-body text-ink"
                @click.stop
                @keydown.enter.prevent="confirmRenameFolder"
                @keydown.esc.prevent="cancelRenameFolder"
                @blur="confirmRenameFolder"
              />
              <template v-else>
                <span class="text-body font-normal truncate">{{ row.folder.name }}</span>
                <span class="num text-micro text-faint">{{ row.items.length }}</span>
                <span
                  v-if="pendingDeleteFolder === row.folder.id"
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-btn bg-black/60 px-1.5 py-0.5"
                  @click.stop
                >
                  <span class="text-micro text-muted">删除？</span>
                  <button
                    class="text-micro text-faint hover:text-ink bg-transparent border-0 cursor-pointer px-1"
                    @click="cancelDeleteFolder"
                  >
                    取消
                  </button>
                  <button
                    class="text-micro text-danger hover:text-ink bg-transparent border-0 cursor-pointer px-1 font-semibold"
                    title="删除文件夹（里面的 App 回到未分类，App 本身不受影响）"
                    @click="doDeleteFolder(row.folder.id)"
                  >
                    删除
                  </button>
                </span>
                <span
                  v-else
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-btn bg-gradient-to-l from-black/70 via-black/55 to-transparent pl-3 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    class="w-6 h-6 grid place-items-center rounded-btn text-faint hover:text-ink hover:bg-surface-3 border-0 bg-transparent cursor-pointer"
                    title="调色：颜色与边框亮度"
                    data-color-toggle="1"
                    @click.stop="toggleColorPopover(row.folder.id, $event)"
                  >
                    <Palette :size="12" :stroke-width="2" />
                  </button>
                  <button
                    class="w-6 h-6 grid place-items-center rounded-btn text-faint hover:text-ink hover:bg-surface-3 border-0 bg-transparent cursor-pointer"
                    title="重命名文件夹"
                    @click.stop="beginRenameFolder(row.folder)"
                  >
                    <Pencil :size="12" :stroke-width="2" />
                  </button>
                  <button
                    class="w-6 h-6 grid place-items-center rounded-btn text-faint hover:text-danger hover:bg-danger/14 border-0 bg-transparent cursor-pointer"
                    title="删除文件夹（会先确认；里面的 App 回到未分类）"
                    @click.stop="askDeleteFolder(row.folder.id)"
                  >
                    <Trash2 :size="12" :stroke-width="2" />
                  </button>
                </span>
              </template>
            </div>

            <!-- 调色弹窗：自绘拾色器（饱和度/明度 + 色相 + 透明度） -->
            <Teleport to="body">
              <div
                v-if="colorPopoverFolder === row.folder.id"
                class="folder-color-pop"
                :style="{ top: colorPopoverPos.top + 'px', left: colorPopoverPos.left + 'px' }"
                @click.stop
              >
                <div
                  class="pick-sv"
                  :style="{ backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pickHueColor})` }"
                  @pointerdown="svDown"
                  @pointermove="svMove"
                >
                  <div
                    class="pick-sv-cursor"
                    :style="{ left: pickHsv.s * 100 + '%', top: (1 - pickHsv.v) * 100 + '%' }"
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  class="pick-range pick-hue mt-2.5"
                  :value="Math.round(pickHsv.h * 360)"
                  aria-label="色相"
                  @input="onHueInput"
                />
                <div class="mt-2 flex items-center gap-2">
                  <span class="text-micro text-faint shrink-0">透明度</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    class="pick-range pick-alpha flex-1"
                    :style="{ '--pick-color': pickColor }"
                    :value="Math.round(pickAlpha * 100)"
                    aria-label="透明度（文件夹边框不透明度）"
                    @input="onAlphaInput"
                  />
                  <span class="text-micro num text-ink w-9 text-right">{{ Math.round(pickAlpha * 100) }}%</span>
                </div>
                <div class="mt-2.5 flex items-center gap-2">
                  <span class="pick-preview" :style="{ background: pickColor }" />
                  <span class="text-micro num text-faint">{{ pickColor.toUpperCase() }}</span>
                  <button
                    class="ml-auto text-micro text-faint hover:text-ink bg-transparent border-0 cursor-pointer whitespace-nowrap"
                    @click="resetFolderLook(row.folder.id)"
                  >
                    恢复默认
                  </button>
                </div>
              </div>
            </Teleport>

            <div class="folder-body" :class="row.folder.collapsed ? 'is-collapsed' : ''">
              <div class="folder-inner">
                <div class="flex flex-col gap-1.5 p-2 pt-1.5">
                  <AppCard
                    v-for="app in row.items"
                    :key="app.dirName"
                    :app="app"
                    :folder="row.folder.id"
                    :selected="state.selectedDir === app.dirName"
                    :dimmed="drag.active && drag.dir === app.dirName"
                    @pointerdown="(e) => onCardPointerDown(e, app)"
                    @click="onCardClick(app)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 未分类小标题（有文件夹时才显示，也作为拖出文件夹的落点） -->
          <div
            v-else-if="row.type === 'loose-head'"
            :key="row.key"
            data-folder-head=""
            class="flex items-center gap-1.5 h-6 px-1 mt-1 text-micro text-faint select-none"
            :class="drag.active && drag.dropFolder === '' ? 'text-accent' : ''"
          >
            <span class="tracking-wider uppercase">未分类</span>
            <span class="num">{{ looseApps.length }}</span>
            <span class="ml-auto text-faint/70">{{ drag.active ? '拖到这里移出文件夹' : '' }}</span>
          </div>

          <!-- 未分类的 App 卡片 -->
          <AppCard
            v-else
            :key="row.key"
            :app="row.app"
            folder=""
            :selected="state.selectedDir === row.app.dirName"
            :dimmed="drag.active && drag.dir === row.app.dirName"
            @pointerdown="(e) => onCardPointerDown(e, row.app)"
            @click="onCardClick(row.app)"
          />
        </template>

      </TransitionGroup>
    </div>

    <!-- 拖动时跟随指针的浮层（原卡片留在列表里占位并透明） -->
    <div
      v-if="drag.active && dragApp"
      class="fixed z-[60] pointer-events-none rounded-card border border-accent bg-surface-3 px-3 py-2.5 shadow-pop"
      :style="{ left: drag.ghostX + 'px', top: drag.ghostY + 'px', width: drag.w + 'px' }"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="
            healthOf(dragApp) === 'bad'
              ? 'bg-danger'
              : healthOf(dragApp) === 'warn'
                ? 'bg-amber'
                : 'bg-success'
          "
        />
        <span class="text-body font-normal truncate text-ink">{{ dragApp.dirName }}</span>
        <GripVertical class="ml-auto shrink-0 text-faint/70" :size="12" :stroke-width="2" />
      </div>
      <div v-if="dragApp.setLive" class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro num">
        <span class="text-amber break-all">{{ dragApp.setLive }}</span>
      </div>
    </div>

    <div v-if="!state.apps.length && !state.scanning" class="px-3 pb-3">
        <EmptyState compact :icon="FolderPlus" title="还没有 App" hint="点右上角 + 新建一个，或把游戏文件夹拖进窗口。">
          <button class="btn btn-sm" @click="openWizard">新建 App</button>
        </EmptyState>
      </div>

    <div v-if="state.scanErrors?.length" class="px-3 pb-3 flex flex-col gap-1">
        <div
          v-for="(e, i) in state.scanErrors"
          :key="i"
          class="text-micro text-danger/80 bg-danger/7 border border-danger/20 rounded-btn px-2.5 py-2"
        >
          {{ e.error }}
        </div>
      </div>
  </aside>
</template>
