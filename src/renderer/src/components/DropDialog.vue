<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import gsap from 'gsap'
import { state, closeDrop, dropApply, openDepotSlide, dropLookupBackend, dropSyncDepot } from '../store.js'
import { PLATFORM_LABEL } from '../store.js'
import { fmtSize } from '../format.js'
import { X } from '@lucide/vue'

const el = ref(null)

onMounted(() => {
  if (el.value) {
    gsap.fromTo(el.value, { opacity: 0, y: 16, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out' })
  }
})

const d = computed(() => state.drop.data)
const busy = computed(() => state.drop.busy || state.drop.busy)

/** 目标 Depot：'' = 新建，否则是 depotFile */
const target = ref('')
/** bind = 把这个文件夹当成内容目录；copy = 复制进现有内容目录 */
const mode = ref('bind')
/** 新建时的字段 */
const newDepotId = ref('')
const platform = ref('')
const depotName = ref('')

const depots = computed(() => state.detail?.depots || [])

/** 拖进来的东西最可能是哪个平台 —— 优先按分析结果，其次看后台有没有同平台的 */
const suggested = computed(() => d.value?.platform || '')

const platformChoices = computed(() => {
  const used = new Set(depots.value.map((x) => x.platformId))
  return Object.entries(PLATFORM_LABEL).map(([id, label]) => ({
    id,
    label,
    used: used.has(id)
  }))
})

/** 同平台的 depot（最可能是用户要放的那个） */
const samePlatform = computed(() => depots.value.filter((x) => x.platformId === suggested.value))

const newDepotFile = computed(() => {
  if (target.value) return ''
  const p = platform.value || suggested.value || 'win64'
  return newDepotId.value.trim() ? `depot_${newDepotId.value.trim()}_${p}.vdf` : ''
})

const canApply = computed(() => {
  if (!d.value?.ok || state.drop.busy) return false
  if (effPick.value) return true
  if (!target.value) return /^\d+$/.test(newDepotId.value.trim())
  if (mode.value === 'copy') {
    const dep = depots.value.find((x) => x.file === target.value)
    return !!dep?.contentRoot
  }
  return true
})

const willDo = computed(() => {
  if (!d.value?.ok) return ''
  const src = d.value.kind === 'archive' ? `先解压到 ${state.settings?.buildsRoot || ''}，再把` : '把这个文件夹'
  if (effPick.value) {
    const r = effPick.value
    const root = `${String(state.detail?.contentRoot || '').replace(/[\\/]+$/, '')}\\${r.platform}`
    return `先把后台的 Depot ${r.depotId} 补成本地脚本，再把它的内容目录指到 ${root}`
  }
  if (!target.value) {
    return `${src}当作新 Depot ${newDepotId.value.trim()} 的内容目录`
  }
  const dep = depots.value.find((x) => x.file === target.value)
  if (mode.value === 'copy') {
    return `把里面的内容复制进 ${dep?.contentRoot || '（没内容目录）'}`
  }
  return `把 ${dep?.platformId ? PLATFORM_LABEL[dep.platformId] : ''} Depot ${dep?.id || ''} 的内容目录改成 ${d.value.dir}`
})

// 分析结果出来之后，默认选同平台那个 depot；没有就默认新建
watch(d, (v) => {
  backendPick.value = null
  newPick.value = false
  if (!v) return
  mode.value = 'bind'
  platform.value = v.platform || ''
  depotName.value = v.appIdGuess ? `${state.selectedDir || ''} ${PLATFORM_LABEL[v.platform] || ''}`.trim() : ''
  const same = (state.detail?.depots || []).filter((x) => x.platformId === v.platform)
  target.value = same.length === 1 ? same[0].file : ''
  if (!target.value) newDepotId.value = suggestDepotId()
  // 顺带读一次后台：本地缺同平台 Depot 时，默认那个「新建」会撞上后台已有的 ID
  dropLookupBackend()
})

/** 新建 Depot 的默认 ID：AppID + 1 起，跳过已经用掉的 */
function suggestDepotId() {
  const appId = Number(state.detail?.appId || 0)
  if (!appId) return ''
  const used = new Set(depots.value.map((x) => String(x.id)))
  for (let i = 1; i < 50; i++) {
    const id = String(appId + i)
    if (!used.has(id)) return id
  }
  return ''
}

function pickPlatform(id) {
  platform.value = id
  if (!newDepotId.value) newDepotId.value = suggestDepotId()
}

/* ---- 后台同步：后台有、本地还没配的 Depot 直接补进来 ---- */

const bk = computed(() => state.drop.backend)
/** 用户显式点中的后台 Depot（null = 没点，交给 effPick 判断） */
const backendPick = ref(null)
/** 用户显式点了「新建一个 Depot」，压过自动建议 */
const newPick = ref(false)

/** 后台里跟拖进来的东西同平台的那些 —— 最可能是用户要放的目标 */
const backendSamePlatform = computed(() => (bk.value.depots || []).filter((x) => x.platform === suggested.value))

/** 本地没有同平台 Depot、但后台有 —— 这时「新建一个」多半会撞 ID */
const clashWarning = computed(() => !samePlatform.value.length && backendSamePlatform.value.length > 0)

/**
 * 实际生效的后台选择：用户点过就用他的；
 * 没点过而本地又缺同平台 Depot，就直接用后台那条 —— 否则绿色的按钮
 * 默认会拿 AppID+1 去新建一个跟后台撞 ID 的 Depot。
 */
const effPick = computed(() => {
  if (newPick.value) return null
  if (backendPick.value) return backendPick.value
  return clashWarning.value ? backendSamePlatform.value[0] || null : null
})

function pickBackend(row) {
  newPick.value = false
  backendPick.value = row
  target.value = ''
}

/** 补一个后台 Depot 进来，然后把拖进来的东西指过去 */
async function doApply() {
  const pick = effPick.value
  if (pick) {
    const r = await dropSyncDepot(pick.depotId, pick.platform)
    if (!r?.ok) return
    const file =
      r.file || (state.detail?.depots || []).find((x) => String(x.id) === String(pick.depotId))?.file || ''
    if (!file) return
    await dropApply({ depotFile: file, mode: 'bind', platform: pick.platform, depotId: '', depotName: '', contentRoot: '' })
    return
  }
  await dropApply({
    depotFile: target.value,
    mode: mode.value,
    platform: platform.value || suggested.value || 'win64',
    depotId: newDepotId.value,
    depotName: depotName.value,
    contentRoot: depots.value.find((x) => x.file === target.value)?.contentRoot || ''
  })
}
</script>

<template>
  <div v-if="d" class="fixed inset-0 z-[55] grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeDrop" />

    <div ref="el" class="relative card w-full max-w-[680px] max-h-[88vh] overflow-y-auto scroll-thin no-drag">
      <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3">
        <div class="min-w-0">
          <h2 class="text-[15px] font-semibold m-0">放进去</h2>
          <p class="mt-1 mb-0 text-[11.5px] text-faint font-mono truncate" :title="d.target">
            {{ d.target }}
          </p>
        </div>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer shrink-0"
          @click="closeDrop"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="p-5 flex flex-col gap-4">
        <!-- 看错了就直接说 -->
        <div
          v-if="state.drop.error"
          class="rounded-[10px] border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-[12px] text-danger whitespace-pre-wrap"
        >
          {{ state.drop.error }}
        </div>

        <template v-if="d.ok">
          <!-- 分析结果 -->
          <div class="card-flat p-3.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="pill" :class="d.platform ? 'pill-ok' : 'pill-warn'">
                {{ d.platform ? PLATFORM_LABEL[d.platform] : '平台没认出来' }}
              </span>
              <span class="text-[12px] num text-muted">
                {{ d.files.toLocaleString() }} 个文件 · {{ fmtSize(d.bytes) }}
              </span>
              <span v-if="d.kind === 'archive'" class="pill pill-idle">压缩包</span>
              <span v-if="d.appIdGuess" class="pill pill-idle">名字里的 AppID {{ d.appIdGuess }}</span>
            </div>

            <div v-if="d.why?.length" class="mt-2 text-[11.5px] text-faint">
              判断依据：{{ d.why.join(' · ') }}
            </div>
            <div v-if="d.markers?.length" class="mt-1 text-[11.5px] text-faint">
              特征：{{ d.markers.join(' · ') }}
            </div>
            <div v-if="d.truncated" class="mt-1 text-[11.5px] text-amber">
              文件太多，只统计了前 3 万个。
            </div>

            <!-- 平台认错了，让用户改 -->
            <div v-if="!target && !effPick" class="mt-3">
              <div class="text-[11.5px] text-muted mb-1.5">新建 Depot 的平台</div>
              <div class="flex gap-1.5 flex-wrap">
                <button
                  v-for="p in platformChoices"
                  :key="p.id"
                  class="btn h-7 px-2.5 text-[11px]"
                  :class="platform === p.id ? 'border-[rgba(102,192,244,.5)] text-accent' : ''"
                  @click="pickPlatform(p.id)"
                >
                  {{ p.label }}<span v-if="p.used" class="text-faint"> ·已占用</span>
                </button>
              </div>
            </div>

            <!-- 该排除的垃圾 -->
            <div v-if="d.junk?.length" class="mt-3 pt-2.5 border-t border-line-soft">
              <div class="text-[11.5px] text-amber mb-1">里面有这些，建议别传上去：</div>
              <div v-for="(j, i) in d.junk" :key="i" class="text-[11px] text-faint font-mono truncate">
                {{ j.label }} — {{ j.sample }}
                <span v-if="j.rule" class="text-muted">（FileExclusion 写 {{ j.rule }}）</span>
              </div>
            </div>

            <!-- .app bundle -->
            <div v-if="d.hasAppBundle" class="mt-2 text-[11.5px] text-amber">
              macOS 的 .app bundle 传上去容易坏签名 —— 跑「检查文件」能看到详情，Valve 的 tools\ContentPrep 是专门处理这个的。
            </div>
          </div>

          <!-- 放哪个 Depot -->
          <div class="flex flex-col gap-2">
            <span class="text-[11.5px] text-muted">放进哪个 Depot</span>

            <div class="flex flex-col gap-1.5">
              <label
                v-for="dep in depots"
                :key="dep.file"
                class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] border cursor-pointer transition-colors"
                :class="
                  target === dep.file
                    ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.05)]'
                    : 'border-line hover:border-[#2a3644]'
                "
              >
                <input type="radio" value="" :checked="target === dep.file" class="accent-[#66c0f4]" @change="newPick = false; target = dep.file; backendPick = null" />
                <span class="text-[12.5px] text-ink">{{ PLATFORM_LABEL[dep.platformId] || dep.platformId }}</span>
                <span class="font-mono num text-[11.5px] text-faint">{{ dep.id }}</span>
                <span
                  v-if="dep.platformId === suggested"
                  class="pill pill-ok"
                >
                  和你拖的对得上
                </span>
                <span class="ml-auto font-mono text-[11px] text-faint truncate max-w-[240px]" :title="dep.contentRoot">
                  {{ dep.contentRoot || '（没有内容目录）' }}
                </span>
              </label>

              <!-- 后台有、本地没配的 -->
              <label
                v-for="row in bk.depots"
                :key="'bk' + row.depotId"
                class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] border cursor-pointer transition-colors"
                :class="
                  effPick?.depotId === row.depotId
                    ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.05)]'
                    : 'border-line hover:border-[#2a3644]'
                "
              >
                <input
                  type="radio"
                  :checked="effPick?.depotId === row.depotId"
                  class="accent-[#66c0f4]"
                  @change="pickBackend(row)"
                />
                <span class="text-[12.5px] text-ink">{{ row.platformLabel || PLATFORM_LABEL[row.platform] }}</span>
                <span class="font-mono num text-[11.5px] text-faint">{{ row.depotId }}</span>
                <span class="pill pill-idle">后台有，本地没配</span>
                <span v-if="row.platform === suggested" class="pill pill-ok">和你拖的对得上</span>
                <span class="ml-auto text-[11px] text-faint num shrink-0">{{ fmtSize(row.size) }}</span>
              </label>

              <label
                class="flex items-center gap-2.5 px-3 py-2 rounded-[10px] border cursor-pointer transition-colors"
                :class="
                  !target && !effPick ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.05)]' : 'border-line hover:border-[#2a3644]'
                "
              >
                <input type="radio" :checked="!target && !effPick" class="accent-[#66c0f4]" @change="newPick = true; target = ''; backendPick = null" />
                <span class="text-[12.5px] text-ink">新建一个 Depot</span>
                <span v-if="!depots.length" class="text-[11.5px] text-faint">（这个 App 还没有 Depot）</span>
              </label>
            </div>

            <!-- 后台读取状态 -->
            <div v-if="bk.busy" class="text-[11px] text-faint">正在读后台…</div>
            <div v-else-if="bk.error && !bk.depots.length" class="text-[11px] text-faint">
              没读到后台：{{ bk.error }}
              <button class="link-btn" @click="dropLookupBackend">重试</button>
            </div>
            <div v-else-if="bk.done && !bk.depots.length" class="text-[11px] text-faint">
              后台的 Depot 本地都配齐了{{ bk.appName ? `（${bk.appName}）` : '' }}。
            </div>

            <!-- 会撞 ID 的提醒 -->
            <div
              v-if="clashWarning"
              class="rounded-[10px] border border-[rgba(240,169,46,.26)] bg-[rgba(240,169,46,.06)] px-3 py-2 text-[11.5px] text-amber"
            >
              后台已经有 {{ PLATFORM_LABEL[suggested] }} 的 Depot（{{ backendSamePlatform.map((x) => x.depotId).join('、') }}），
              本地没配。新建一个会跟它撞 ID —— 选上面那条「后台有，本地没配」更稳妥。
            </div>

            <!-- 新建的字段 -->
            <div v-if="!target && !effPick" class="grid grid-cols-2 gap-3 pl-3 pt-1">
              <label class="flex flex-col gap-1.5">
                <span class="text-[11.5px] text-muted">DepotID</span>
                <input
                  v-model="newDepotId"
                  placeholder="AppID+1"
                  class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[13px] num outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-[11.5px] text-muted">Depot 名称</span>
                <input
                  v-model="depotName"
                  :placeholder="`${state.selectedDir || ''} Content`"
                  class="h-9 px-3 rounded-[9px] bg-surface border border-line text-[12px] outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                />
              </label>
            </div>

            <!-- 已经有了：直接指过去 or 复制进去 -->
            <div v-if="target" class="flex items-center gap-2 flex-wrap pl-3">
              <label class="flex items-center gap-1.5 text-[11.5px] text-muted cursor-pointer select-none">
                <input type="radio" value="bind" :checked="mode === 'bind'" class="accent-[#66c0f4]" @change="mode = 'bind'" />
                直接指过去（不复制）
              </label>
              <label class="flex items-center gap-1.5 text-[11.5px] text-muted cursor-pointer select-none">
                <input type="radio" value="copy" :checked="mode === 'copy'" class="accent-[#66c0f4]" @change="mode = 'copy'" />
                复制进现有内容目录
              </label>
            </div>
          </div>

          <!-- 会做什么 -->
          <div class="card-flat px-3.5 py-2.5 text-[11.5px] text-muted">
            {{ willDo }}
            <div v-if="!target && newDepotFile" class="mt-1 font-mono text-[11px] text-faint">
              ＋ 脚本 {{ newDepotFile }}
            </div>
          </div>
        </template>
      </div>

      <footer class="px-5 py-4 border-t border-line flex items-center gap-2 shrink-0">
        <div class="flex-1" />
        <button class="btn no-drag" @click="closeDrop">取消</button>
        <button
          class="btn btn-primary no-drag"
          :disabled="!canApply"
          @click="doApply"
        >
          {{ state.drop.busy ? '处理中…' : effPick ? '同步并放进去' : target ? '放进去' : '新建并放进去' }}
        </button>
      </footer>
    </div>
  </div>
</template>
