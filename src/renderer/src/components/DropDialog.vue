<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import gsap from 'gsap'
import { state, closeDrop, dropApply, openDepotSlide, dropLookupBackend, dropSyncDepot } from '../store.js'
import { PLATFORM_LABEL } from '../store.js'
import { fmtSize } from '../format.js'
import { X } from '@lucide/vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const el = ref(null)

const d = computed(() => state.drop.data)

useDialogA11y(el, closeDrop, { isOpen: () => !!d.value })
const busy = computed(() => state.drop.busy || state.drop.busy)

/** 已经等了多少秒 —— 秒数一直在跳，就是在告诉用户「没死，还在动」 */
const elapsed = ref(0)
let tick = null

/** 加载动画上那行字：阶段 + 已数到多少 + 已经等了多久 */
const phaseText = computed(() => {
  const pr = state.drop.progress
  const tail = elapsed.value >= 3 ? ` · 已等 ${elapsed.value} 秒` : ''
  if (!pr) return `正在读${d.value?.name ? ' ' + d.value.name : ''}…${tail}`
  const n = pr.files ? ` · ${pr.files.toLocaleString()} 个文件` : ''
  const sz = pr.bytes ? ` · ${fmtSize(pr.bytes)}` : ''
  return `${pr.text || '正在读…'}${n}${sz}${tail}`
})

onMounted(() => {
  if (el.value) {
    gsap.fromTo(el.value, { opacity: 0, y: 16, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out', clearProps: 'transform,opacity' })
  }
  tick = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - (state.drop.startedAt || Date.now())) / 1000)
  }, 500)
})

onUnmounted(() => {
  clearInterval(tick)
})

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

/** 新建 Depot 时内容落在项目文件夹下的 <平台> 子目录（win64 / macos …） */
const newContentRoot = computed(() => {
  const base = String(state.detail?.contentRoot || '').replace(/[\\/]+$/, '')
  const p = platform.value || suggested.value || 'win64'
  return base ? `${base}\\${p}` : ''
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
  if (effPick.value) return ''
  if (!target.value) {
    return newContentRoot.value
      ? `${src}复制进 ${newContentRoot.value}，并作为新 Depot ${newDepotId.value.trim()} 的内容目录`
      : `${src}当作新 Depot ${newDepotId.value.trim()} 的内容目录`
  }
  const dep = depots.value.find((x) => x.file === target.value)
  if (mode.value === 'copy') {
    return `把里面的内容复制进 ${dep?.contentRoot || '（没内容目录）'}`
  }
  return `把 ${dep?.platformId ? PLATFORM_LABEL[dep.platformId] : ''} Depot ${dep?.id || ''} 的内容目录改成 ${d.value.dir}`
})

/** 会新写出来的脚本文件名 */
const scriptLine = computed(() => {
  const r = effPick.value
  if (r) return `depot_${r.depotId}_${r.platform}.vdf`
  return target.value ? '' : newDepotFile.value
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
  // 本地已经有同平台 Depot 时不查后台 —— 那正是最常见的情形（同一个平台传新包），
  // 而查一次要跑十几秒 steamcmd。只有「本地没有同平台 Depot」时才值得查：
  // 那种情况下默认的「新建」会拿 AppID+1 去撞后台已经存在的 ID。
  if (!target.value) dropLookupBackend()
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
    const made = (state.detail?.depots || []).find((x) => String(x.id) === String(pick.depotId))
    const file = r.file || made?.file || ''
    if (!file) return
    // 后台补进来的 Depot 内容目录默认是 <项目文件夹><平台>，
    // 所以这里是「复制进内容目录」，让 win64 / macos 这些目录真正装下东西。
    const root = String(made?.contentRoot || '').trim()
    await dropApply({
      depotFile: file,
      mode: root ? 'copy' : 'bind',
      platform: pick.platform,
      depotId: '',
      depotName: '',
      contentRoot: root
    })
    return
  }
  const newRoot = newContentRoot.value
  await dropApply({
    depotFile: target.value,
    mode: target.value ? mode.value : newRoot ? 'copy' : 'bind',
    platform: platform.value || suggested.value || 'win64',
    depotId: newDepotId.value,
    depotName: depotName.value,
    contentRoot: target.value
      ? depots.value.find((x) => x.file === target.value)?.contentRoot || ''
      : newRoot
  })
}
</script>

<template>
  <Transition name="overlay">
  <div v-if="d" class="fixed inset-0 z-[55] grid place-items-center p-6">
    <div class="absolute inset-0 bg-black/25" @click="closeDrop" />

    <div ref="el" role="dialog" aria-modal="true" aria-labelledby="drop-dialog-title" class="relative card s-modal w-full max-w-[680px] max-h-[88vh] overflow-y-auto scroll-thin no-drag">
      <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3">
        <div class="min-w-0">
          <h2 id="drop-dialog-title" class="text-lead font-semibold m-0">文件导入</h2>
          <p class="mt-1 mb-0 text-label text-faint font-mono break-all" :title="d.target">
            {{ d.target }}
          </p>
        </div>
        <button
          class="ml-auto w-7 h-7 grid place-items-center rounded-input text-faint hover:text-ink hover:bg-surface-2 transition-colors bg-transparent border-0 cursor-pointer shrink-0"
          @click="closeDrop"
        >
          <X :size="16" :stroke-width="2" />
        </button>
      </header>

      <div class="p-5 flex flex-col gap-4">
        <!-- 压缩包要先解开、大文件夹要数一遍，这些都得好几分钟。
             主进程那会儿是忙的，所以这里必须自己动起来 —— 不然用户只会以为卡死了。 -->
        <Transition name="fade-fast">
          <div v-if="d.pending" class="flex flex-col items-center gap-3 py-10">
            <span class="drop-spinner" />
            <div class="text-body text-ink num">{{ phaseText }}</div>
            <div class="text-label text-faint text-center leading-relaxed max-w-[360px]">
              压缩包会先在这里解开再数一遍。包大的话要等几分钟 —— 别关窗口，也别再拖一次。
            </div>
          </div>
        </Transition>

        <!-- 看错了就直接说 -->
        <div
          v-if="state.drop.error"
          class="fade-in-up rounded-card border border-[rgba(255,92,108,.24)] bg-[rgba(255,92,108,.06)] px-3.5 py-2.5 text-label text-danger whitespace-pre-wrap"
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
              <span class="text-label num text-muted">
                {{ d.files.toLocaleString() }} 个文件 · {{ fmtSize(d.bytes) }}
              </span>
              <span v-if="d.kind === 'archive'" class="pill pill-idle">压缩包</span>
              <span v-if="d.appIdGuess" class="pill pill-idle">名字里的 AppID {{ d.appIdGuess }}</span>
            </div>

            <div v-if="d.why?.length" class="mt-2 text-label text-faint">
              判断依据：{{ d.why.join(' · ') }}
            </div>
            <div v-if="d.markers?.length" class="mt-1 text-label text-faint">
              特征：{{ d.markers.join(' · ') }}
            </div>
            <div v-if="d.truncated" class="mt-1 text-label text-amber">
              文件太多，只统计了前 3 万个。
            </div>

            <!-- .app bundle -->
            <div v-if="d.hasAppBundle" class="mt-2 text-label text-amber">
              macOS 的 .app bundle 传上去容易坏签名 —— 跑「检查文件」能看到详情，Valve 的 tools\ContentPrep 是专门处理这个的。
            </div>
          </div>

          <!-- 放哪个 Depot -->
          <div class="flex flex-col gap-2">
            <span class="text-label text-muted">导入哪个 Depot</span>

            <div class="flex flex-col gap-1.5">
              <label
                v-for="dep in depots"
                :key="dep.file"
                class="flex items-center gap-2.5 px-3 py-2 rounded-card border cursor-pointer transition-colors"
                :class="
                  target === dep.file
                    ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.05)]'
                    : 'border-line hover:border-rule'
                "
              >
                <input type="radio" value="" :checked="target === dep.file" class="accent-[#66c0f4]" @change="newPick = false; target = dep.file; backendPick = null" />
                <span class="text-body text-ink">{{ PLATFORM_LABEL[dep.platformId] || dep.platformId }}</span>
                <span class="font-mono num text-label text-faint">{{ dep.id }}</span>
                <span
                  v-if="dep.platformId === suggested"
                  class="pill pill-ok"
                >
                  平台一致
                </span>
                <span class="ml-auto font-mono text-micro text-faint break-all max-w-[240px] text-right" :title="dep.contentRoot">
                  {{ dep.contentRoot || '（没有内容目录）' }}
                </span>
              </label>

              <!-- 后台有、本地没配的 -->
              <label
                v-for="row in bk.depots"
                :key="'bk' + row.depotId"
                class="flex items-center gap-2.5 px-3 py-2 rounded-card border cursor-pointer transition-colors"
                :class="
                  effPick?.depotId === row.depotId
                    ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.05)]'
                    : 'border-line hover:border-rule'
                "
              >
                <input
                  type="radio"
                  :checked="effPick?.depotId === row.depotId"
                  class="accent-[#66c0f4]"
                  @change="pickBackend(row)"
                />
                <span class="text-body text-ink">{{ row.platformLabel || PLATFORM_LABEL[row.platform] }}</span>
                <span class="font-mono num text-label text-faint">{{ row.depotId }}</span>
                <span class="pill pill-idle">未在本地配置</span>
                <span v-if="row.platform === suggested" class="pill pill-ok">平台一致</span>
                <span class="ml-auto text-micro text-faint num shrink-0">{{ fmtSize(row.size) }}</span>
              </label>

              <label
                class="flex items-center gap-2.5 px-3 py-2 rounded-card border cursor-pointer transition-colors"
                :class="
                  !target && !effPick ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.05)]' : 'border-line hover:border-rule'
                "
              >
                <input type="radio" :checked="!target && !effPick" class="accent-[#66c0f4]" @change="newPick = true; target = ''; backendPick = null" />
                <span class="text-body text-ink">新建一个 Depot</span>
                <span v-if="!depots.length" class="text-label text-faint">（这个 App 还没有 Depot）</span>
              </label>
            </div>

            <!-- 后台读取状态 -->
            <div v-if="bk.busy" class="text-micro text-faint">正在读后台…</div>
            <div v-else-if="bk.error && !bk.depots.length" class="text-micro text-faint">
              没读到后台：{{ bk.error }}
              <button class="link-btn" @click="dropLookupBackend">重试</button>
            </div>
            <div v-else-if="bk.done && !bk.depots.length" class="text-micro text-faint">
              后台的 Depot 本地都配齐了{{ bk.appName ? `（${bk.appName}）` : '' }}。
            </div>

            <!-- 新建的字段 -->
            <div v-if="!target && !effPick" class="flex flex-col gap-3 pl-3 pt-1">
              <label class="flex flex-col gap-1.5">
                <span class="text-label text-muted">DepotID</span>
                <input
                  v-model="newDepotId"
                  placeholder="AppID+1"
                  class="h-9 px-3 rounded-input bg-surface border border-line text-body num outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                />
              </label>
              <div class="flex flex-col gap-1.5">
                <span class="text-label text-muted">平台</span>
                <div class="flex gap-1.5 flex-wrap">
                  <button
                    v-for="p in platformChoices"
                    :key="p.id"
                    class="btn btn-sm px-2.5 "
                    :class="platform === p.id ? 'border-[rgba(102,192,244,.5)] text-accent' : ''"
                    @click="pickPlatform(p.id)"
                  >
                    {{ p.label }}<span v-if="p.used" class="text-faint"> ·已占用</span>
                  </button>
                </div>
              </div>
              <label class="flex flex-col gap-1.5">
                <span class="text-label text-muted">Depot 名称</span>
                <input
                  v-model="depotName"
                  :placeholder="`${state.selectedDir || ''} Content`"
                  class="h-9 px-3 rounded-input bg-surface border border-line text-label outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
                />
              </label>
            </div>

            <!-- 已经有了：直接指过去 or 复制进去 -->
            <div v-if="target" class="flex items-center gap-2 flex-wrap pl-3">
              <label class="flex items-center gap-1.5 text-label text-muted cursor-pointer select-none">
                <input type="radio" value="bind" :checked="mode === 'bind'" class="accent-[#66c0f4]" @change="mode = 'bind'" />
                直接指过去（不复制）
              </label>
              <label class="flex items-center gap-1.5 text-label text-muted cursor-pointer select-none">
                <input type="radio" value="copy" :checked="mode === 'copy'" class="accent-[#66c0f4]" @change="mode = 'copy'" />
                复制进现有内容目录
              </label>
            </div>
          </div>

          <!-- 会做什么 -->
          <div v-if="willDo || scriptLine" class="card-flat px-3.5 py-2.5 text-label text-muted">
            <div v-if="willDo">{{ willDo }}</div>
            <div v-if="scriptLine" class="font-mono text-micro text-faint" :class="willDo ? 'mt-1' : ''">
              ＋ 脚本 {{ scriptLine }}
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
          {{ state.drop.busy ? '处理中…' : effPick ? '同步并导入' : target ? '导入' : '新建并导入' }}
        </button>
      </footer>
    </div>
  </div>
  </Transition>
</template>
