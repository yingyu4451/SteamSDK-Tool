<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import gsap from 'gsap'
import {
  state,
  closeDrawer,
  saveApp,
  saveDepot,
  deleteDepot,
  openVdf,
  openDeleteDialog,
  renameApp,
  rescan,
  toast,
  ignoreProblem,
  restoreProblemThisRun
} from '../store.js'
import PathLink from './PathLink.vue'
import { X } from '@lucide/vue'

/**
 * 已忽略的待处理提示 —— 从 App 头上搬到这里。
 * App 头上只留「还该当回事」的；忽略过的进这里，随时能恢复。
 */
const ignoredRows = computed(() => {
  const d = state.detail
  if (!d) return []
  const perm = new Set(d.problemsIgnored || [])
  const sess = new Set(state.sessionIgnored?.[d.dirName] || [])
  return (d.problems || [])
    .filter((t) => perm.has(t) || sess.has(t))
    .map((text) => ({ text, perm: perm.has(text) }))
})

/** 「各 Depot 按项目文件夹重排」的状态 */
const syncingRoots = ref(false)
const syncMsg = ref(null)

/** 删除整个 App 走单独的确认弹窗（二次点击确认） */
function askDeleteApp() {
  closeDrawer()
  openDeleteDialog()
}

const el = ref(null)
const busy = ref(false)

/** 改名是独立动作（要动文件夹），不跟其它字段一起保存 */
const nameForm = ref('')
const renaming = ref(false)
const nameDirty = computed(() => {
  const d = detail.value
  if (!d) return false
  const v = nameForm.value.trim()
  return !!v && v !== d.dirName
})

async function doRename() {
  if (!nameDirty.value || renaming.value) return
  renaming.value = true
  try {
    const res = await renameApp(detail.value.dirName, nameForm.value.trim())
    if (res?.ok && res.changed) nameForm.value = res.dirName
    else if (res?.ok) toast('名字没变')
  } finally {
    renaming.value = false
  }
}

const detail = computed(() => state.detail)
const drawer = computed(() => state.drawer)
const isDepot = computed(() => drawer.value?.kind === 'depot')

const depot = computed(() =>
  isDepot.value ? detail.value?.depots?.find((d) => d.file === drawer.value.depotFile) : null
)

/* ---- 本地草稿 ---- */

const depotForm = ref({ depotId: '', platform: 'win64', contentRoot: '', exclusions: [], userConfig: [] })
const newRule = ref('')
const newUserConfig = ref('')
const platforms = ref([])
const defaults = ref([])

function sync() {
  if (!detail.value) return
  if (isDepot.value && depot.value) {
    depotForm.value = {
      depotId: depot.value.id || '',
      platform: depot.value.platformId || 'win64',
      contentRoot: depot.value.contentRoot || '',
      exclusions: [...(depot.value.exclusions || [])],
      userConfig: [...(depot.value.userConfig || [])]
    }
  } else {
    nameForm.value = detail.value.dirName || ''
  }
}

/* ---- 一行一条：默认只读，点右边的按钮才进编辑态 ---- */

const editing = ref(null)
const editValue = ref('')

/** App 的标量字段 */
const appRows = computed(() => {
  const d = detail.value
  if (!d) return []
  return [
    { key: 'appId', label: 'AppID', value: d.appId || '', empty: '未设置', btn: '修改', mono: true, num: true },
    { key: 'desc', label: '描述', value: d.desc || '', empty: '空', btn: '修改' },
    {
      key: 'contentRoot',
      label: '项目文件夹',
      value: d.contentRoot || '',
      empty: '未设置',
      btn: '修改',
      mono: true,
      pick: true
    },
    { key: 'buildOutput', label: 'BuildOutput', value: d.buildOutput || '', empty: '默认', btn: '修改', mono: true },
    {
      key: 'setLive',
      label: 'SetLive',
      value: d.setLive || '',
      empty: '默认分支',
      btn: '修改',
      mono: true,
      placeholder: 'qa / internal（留空 = 默认分支）'
    }
  ]
})

function startEdit(key, current) {
  editing.value = key
  editValue.value = current || ''
  if (key === 'name') nameForm.value = current || ''
}

function cancelEdit() {
  editing.value = null
  editValue.value = ''
  sync()
}

async function commitEdit(key) {
  if (key === 'name') {
    await doRename()
    if (!nameDirty.value) editing.value = null
    return
  }
  const v = editValue.value.trim()
  if (key === 'appId' && !v) return toast('AppID 不能空', 'bad')
  if (key === 'buildOutput' && !v) return toast('BuildOutput 不能空 —— 日志和构建缓存都放这儿', 'bad')
  busy.value = true
  try {
    await saveApp({ [key]: v })
    editing.value = null
    sync()
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  const d = await window.api.app.defaults({ platform: 'win64' })
  platforms.value = d.platforms
  defaults.value = d.allDefaultExclusions
  sync()
  if (el.value) {
    gsap.fromTo(el.value, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out' })
  }
})

watch(() => drawer.value?.depotFile, sync)
watch(() => state.selectedDir, () => (state.drawer = null))

/* ---- 操作 ---- */

async function pickRoot() {
  const current = isDepot.value ? depotForm.value.contentRoot : editValue.value
  const res = await window.api.settings.pickFolder(current)
  if (!res.ok) return
  if (isDepot.value) depotForm.value.contentRoot = res.path
  else editValue.value = res.path
}

/**
 * 把每个 Depot 的内容目录重排成「项目文件夹\平台」。
 * 一个 App 一个项目文件夹、下面按平台分子目录，是 Steam 的原生玩法 ——
 * 换了项目文件夹之后，各 Depot 的路径要跟着走，否则会指到旧地方。
 */
async function syncDepotRoots() {
  const dir = detail.value?.dirName
  if (!dir) return
  const base = String(detail.value?.contentRoot || '').trim()
  if (!base) return toast('先把项目文件夹填上', 'bad')
  syncingRoots.value = true
  syncMsg.value = null
  const res = await window.api.app.syncDepotRoots(dir, base)
  syncingRoots.value = false
  if (!res?.ok) {
    syncMsg.value = { ok: false, text: res?.error || '重排失败' }
    return
  }
  syncMsg.value = {
    ok: true,
    text: res.changed.length
      ? `已重排 ${res.changed.length} 个 Depot：${res.changed.map((c) => c.depotId).join('、')}`
      : '各 Depot 已经就是这个结构，没有改动'
  }
  sync()
  await rescan()
}

async function submit() {
  busy.value = true
  try {
    if (isDepot.value) {
      await saveDepot(drawer.value.depotFile, {
        depotId: depotForm.value.depotId.trim(),
        platform: depotForm.value.platform,
        contentRoot: depotForm.value.contentRoot.trim(),
        exclusions: depotForm.value.exclusions.map((s) => s.trim()).filter(Boolean),
        userConfig: depotForm.value.userConfig.map((s) => s.trim()).filter(Boolean)
      })
    } else {
      // App 那边是一行一条、点了按钮就单独保存，这里没有需要一起提交的东西
    }
    sync()
  } finally {
    busy.value = false
  }
}

function addRule() {
  const v = newRule.value.trim()
  if (!v) return
  if (depotForm.value.exclusions.includes(v)) return toast('这条规则已经有了', 'bad')
  depotForm.value.exclusions.push(v)
  newRule.value = ''
}

function removeRule(i) {
  depotForm.value.exclusions.splice(i, 1)
}

function resetRules() {
  depotForm.value.exclusions = [...defaults.value]
}

function addUserConfig() {
  const v = newUserConfig.value.trim().replace(/\\/g, '/')
  if (!v) return
  if (depotForm.value.userConfig.includes(v)) return toast('这条已经有了', 'bad')
  depotForm.value.userConfig.push(v)
  newUserConfig.value = ''
}

function removeUserConfig(i) {
  depotForm.value.userConfig.splice(i, 1)
}

/* 删 Depot 也是二次点击：第一次上膛，5 秒内再点一次才真删 */
const depotArmed = ref(false)
const depotLeft = ref(0)
let depotTick = null

function depotDisarm() {
  depotArmed.value = false
  depotLeft.value = 0
  clearInterval(depotTick)
  depotTick = null
}

function doDelete() {
  if (!depotArmed.value) {
    depotArmed.value = true
    depotLeft.value = 5
    clearInterval(depotTick)
    depotTick = setInterval(() => {
      depotLeft.value -= 1
      if (depotLeft.value <= 0) depotDisarm()
    }, 1000)
    return
  }
  depotDisarm()
  busy.value = true
  deleteDepot(drawer.value.depotFile).finally(() => {
    busy.value = false
  })
}

onUnmounted(depotDisarm)
</script>

<template>
  <div v-if="drawer" class="fixed inset-0 z-40 flex justify-end">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-[2px]" @click="closeDrawer" />

    <aside
      ref="el"
      class="relative w-[500px] max-w-[92vw] h-full bg-[#0c1016] border-l border-line flex flex-col min-h-0"
    >
      <header class="px-5 py-4 border-b border-line flex items-center gap-3 shrink-0">
        <div>
          <h2 class="text-[14.5px] font-semibold m-0">
            {{ isDepot ? `编辑 Depot ${depot?.id ?? ''}` : '编辑 App' }}
          </h2>
          <div class="mt-1 text-[11px] font-mono text-faint truncate max-w-[360px]">
            {{ isDepot ? drawer.depotFile : detail?.appFile }}
          </div>
        </div>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer"
          @click="closeDrawer"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="flex-1 min-h-0 overflow-y-auto scroll-thin p-5 flex flex-col gap-4">
        <!-- ============ App ============ -->
        <template v-if="!isDepot">
          <!-- 一行一条：平时只读，点右边的按钮才进编辑态 -->
          <div class="card-flat divide-y divide-[#22334a]">
            <div class="px-3 py-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-[88px] shrink-0 text-[11.5px] text-faint">App 名字</span>
                <template v-if="editing !== 'name'">
                  <span class="min-w-0 flex-1 text-[12.5px] truncate">{{ detail?.dirName }}</span>
                  <button
                    class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0"
                    @click="startEdit('name', detail?.dirName)"
                  >
                    改名
                  </button>
                </template>
                <template v-else>
                  <input
                    v-model="nameForm"
                    class="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-surface border border-line text-[12.5px] outline-none focus:border-[rgba(102,192,244,.45)]"
                    @keyup.enter="doRename"
                  />
                  <button
                    class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0"
                    :disabled="!nameDirty || renaming"
                    @click="doRename"
                  >
                    {{ renaming ? '改名中…' : '确定' }}
                  </button>
                  <button class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0" @click="cancelEdit">取消</button>
                </template>
              </div>
              <div v-if="editing === 'name' && nameDirty" class="mt-1.5 pl-[96px] text-[11px] text-faint leading-relaxed">
                会把 <span class="font-mono">scripts\{{ detail?.dirName }}</span> 整个文件夹改成
                <span class="font-mono">scripts\{{ nameForm.trim() }}</span>，脚本文件跟着重命名。内容目录<strong class="text-muted">不动</strong>。
              </div>
            </div>

            <div v-for="row in appRows" :key="row.key" class="px-3 py-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-[88px] shrink-0 text-[11.5px] text-faint">{{ row.label }}</span>
                <template v-if="editing !== row.key">
                  <span
                    class="min-w-0 flex-1 text-[12.5px] truncate"
                    :class="[row.mono ? 'font-mono' : '', row.value ? 'text-ink' : 'text-faint']"
                    :title="row.value || ''"
                    >{{ row.value || row.empty }}</span
                  >
                  <button class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0" @click="startEdit(row.key, row.value)">
                    {{ row.btn }}
                  </button>
                </template>
                <template v-else>
                  <input
                    v-model="editValue"
                    :placeholder="row.placeholder || ''"
                    class="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-surface border border-line text-[12.5px] outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                    :class="[row.mono ? 'font-mono' : '', row.num ? 'num' : '']"
                    @keyup.enter="commitEdit(row.key)"
                  />
                  <button v-if="row.pick" class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0" @click="pickRoot">
                    选择…
                  </button>
                  <button
                    class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0"
                    :disabled="busy"
                    @click="commitEdit(row.key)"
                  >
                    保存
                  </button>
                  <button class="btn h-7 px-2.5 text-[11.5px] no-drag shrink-0" @click="cancelEdit">取消</button>
                </template>
              </div>

              <template v-if="row.key === 'contentRoot' && editing !== 'contentRoot'">
                <div v-if="detail?.depots?.length" class="mt-2 pl-[96px] flex flex-col gap-1">
                  <div v-for="d in detail.depots" :key="'pd' + d.id" class="flex items-center gap-2 min-w-0">
                    <span class="w-[74px] shrink-0 text-[11px] text-faint">{{ d.platform || d.id }}</span>
                    <PathLink :path="d.contentRoot" kind="folder" class="min-w-0 flex-1" />
                  </div>
                </div>
                <button
                  v-if="detail?.depots?.length && detail.contentRoot"
                  class="btn h-7 px-2.5 text-[11.5px] no-drag mt-2 ml-[96px]"
                  :disabled="syncingRoots"
                  @click="syncDepotRoots"
                >
                  {{ syncingRoots ? '重排中…' : '各 Depot 按项目文件夹重排' }}
                </button>
                <div
                  v-if="syncMsg"
                  class="mt-1.5 pl-[96px] text-[11px]"
                  :class="syncMsg.ok ? 'text-accent/90' : 'text-danger'"
                >
                  {{ syncMsg.text }}
                </div>
              </template>
            </div>
          </div>

          <!-- 已忽略的提示：App 头上不再显示它们，来这里恢复 -->
          <div v-if="ignoredRows.length" class="pt-3 border-t border-line">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[11.5px] font-semibold text-muted">已忽略的提示</span>
              <span class="text-[11px] text-faint num">{{ ignoredRows.length }} 条</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <div v-for="(r, i) in ignoredRows" :key="i" class="flex items-start gap-2">
                <span class="text-[11.5px] leading-relaxed min-w-0 flex-1 text-faint">{{ r.text }}</span>
                <span class="text-[10px] shrink-0 text-faint pt-[2px]">
                  {{ r.perm ? '永久忽略' : '本次忽略' }}
                </span>
                <button
                  class="link-btn shrink-0"
                  title="恢复之后会重新出现在 App 头上的待处理里"
                  @click="r.perm ? ignoreProblem(r.text, false) : restoreProblemThisRun(r.text)"
                >
                  恢复提示
                </button>
              </div>
            </div>
          </div>

          <div class="pt-3 border-t border-line flex items-center gap-2 flex-wrap">
            <button class="btn no-drag" @click="openVdf(null)">用系统编辑器打开</button>
            <button class="btn btn-danger no-drag ml-auto" @click="askDeleteApp">删除这个 App</button>
          </div>
        </template>

        <!-- ============ Depot ============ -->
        <template v-else>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-[11.5px] text-muted">DepotID</span>
              <input
                v-model="depotForm.depotId"
                class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] num outline-none focus:border-[rgba(102,192,244,.45)]"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[11.5px] text-muted">平台</span>
              <select
                v-model="depotForm.platform"
                class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] outline-none focus:border-[rgba(102,192,244,.45)]"
              >
                <option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </label>
          </div>
          <span class="text-[11px] text-faint -mt-2">
            改 DepotID 或平台会自动重命名脚本文件，并同步 app 脚本里的引用。
          </span>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11.5px] text-muted">内容目录</span>
            <div class="flex gap-2">
              <input
                v-model="depotForm.contentRoot"
                class="flex-1 h-9 px-3 rounded-[9px] bg-surface border border-line text-[12px] font-mono outline-none focus:border-[rgba(102,192,244,.45)]"
              />
              <button class="btn no-drag" @click="pickRoot">选择…</button>
            </div>
          </label>

          <!-- FileExclusion -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="text-[11.5px] text-muted">FileExclusion（{{ depotForm.exclusions.length }} 条）</span>
              <button class="ml-auto btn h-7 px-2.5 text-[11.5px] no-drag" @click="resetRules">恢复默认</button>
            </div>

            <div class="card-flat divide-y divide-[#22334a] max-h-[260px] overflow-y-auto scroll-thin">
              <div
                v-for="(rule, i) in depotForm.exclusions"
                :key="i"
                class="flex items-center gap-2 px-2.5 py-1.5 group"
              >
                <input
                  v-model="depotForm.exclusions[i]"
                  class="flex-1 bg-transparent border-0 outline-none text-[12px] font-mono text-accent"
                />
                <button
                  class="w-6 h-6 grid place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-[rgba(255,92,108,.1)] transition-all bg-transparent border-0 cursor-pointer"
                  @click="removeRule(i)"
                >
                  <X :size="14" :stroke-width="2" />
                </button>
              </div>
              <div v-if="!depotForm.exclusions.length" class="px-3 py-3 text-[11.5px] text-faint">
                没有任何排除规则 —— 内容目录里的日志、符号文件都会被传上去。
              </div>
            </div>

            <div class="flex gap-2">
              <input
                v-model="newRule"
                placeholder="加一条，例如 *.pdb 或 logs\*"
                class="flex-1 h-8 px-3 rounded-lg bg-surface border border-line text-[12px] font-mono outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                @keydown.enter="addRule"
              />
              <button class="btn h-8 no-drag" :disabled="!newRule.trim()" @click="addRule">添加</button>
            </div>
          </div>

          <!-- FileProperties / userconfig -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="text-[11.5px] text-muted">
                FileProperties / userconfig（{{ depotForm.userConfig.length }} 条）
              </span>
              <span
                class="pill pill-idle"
                title="玩家运行时会改的文件：Steam 首次安装时放一份，之后升级不再覆盖"
              >
                保护存档
              </span>
            </div>

            <div class="card-flat divide-y divide-[#22334a] max-h-[200px] overflow-y-auto scroll-thin">
              <div
                v-for="(row, i) in depotForm.userConfig"
                :key="'uc' + i"
                class="flex items-center gap-2 px-2.5 py-1.5 group"
              >
                <input
                  v-model="depotForm.userConfig[i]"
                  placeholder="ABYA_PB_Data/Progress/Progress_0.PBProg"
                  class="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px] font-mono text-accent placeholder:text-faint"
                />
                <button
                  class="w-6 h-6 grid place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-[rgba(255,92,108,.1)] transition-all bg-transparent border-0 cursor-pointer shrink-0"
                  @click="removeUserConfig(i)"
                >
                  <X :size="14" :stroke-width="2" />
                </button>
              </div>
              <div v-if="!depotForm.userConfig.length" class="px-3 py-3 text-[11.5px] text-faint">
                没有标记为玩家数据的文件 —— 玩家存档在升级时会被覆盖掉。
              </div>
            </div>

            <div class="flex gap-2">
              <input
                v-model="newUserConfig"
                placeholder="相对内容目录，例如 ABYA_PB_Data/Progress"
                class="flex-1 h-8 px-3 rounded-lg bg-surface border border-line text-[12px] font-mono outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                @keydown.enter="addUserConfig"
              />
              <button class="btn h-8 no-drag" :disabled="!newUserConfig.trim()" @click="addUserConfig">
                添加
              </button>
            </div>
          </div>

          <div class="pt-3 border-t border-line flex items-center gap-2 flex-wrap">
            <button class="btn no-drag" @click="openVdf(drawer.depotFile)">用系统编辑器打开</button>
            <button
              class="btn no-drag ml-auto"
              :class="depotArmed ? 'btn-danger-solid' : 'btn-danger'"
              :disabled="busy"
              @click="doDelete"
            >
              {{ depotArmed ? `确认删除 Depot（${depotLeft}）` : '删除这个 Depot' }}
            </button>
          </div>
          <div v-if="depotArmed" class="mt-2 text-[11px] text-[#ff8a8a] leading-relaxed">
            会删掉文件 {{ drawer.depotFile }}，并从 app 脚本里移除引用。
            Steam 上已经传过的 depot 不受影响。5 秒内再点一次才真删。
          </div>
        </template>
      </div>

      <footer class="px-5 py-4 border-t border-line flex items-center gap-2 shrink-0">
        <div class="flex-1" />
        <template v-if="isDepot">
          <button class="btn no-drag" @click="closeDrawer">取消</button>
          <button class="btn btn-primary no-drag" :disabled="busy" @click="submit">
            {{ busy ? '保存中…' : '保存' }}
          </button>
        </template>
        <button v-else class="btn no-drag" @click="closeDrawer">关闭</button>
      </footer>
    </aside>
  </div>
</template>
