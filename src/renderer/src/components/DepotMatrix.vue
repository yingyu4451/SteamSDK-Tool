<script setup>
import { computed, ref } from 'vue'
import { fmtSize, fmtInt } from '../format.js'
import { state, openDrawer, reloadDetail, toast, openDepotSlide, setActiveDepot, PLATFORM_LABEL } from '../store.js'
import PathLink from './PathLink.vue'

const props = defineProps({ depots: { type: Array, default: () => [] } })

const showExcluded = ref(false)
const showSuspicious = ref(true)

/** 选项卡固定按 DepotID 从小到大排 —— 就是新建时从上到下 +1、+2 的那个顺序 */
const sortedDepots = computed(() =>
  [...props.depots].sort((x, y) => {
    const a1 = Number(x.id)
    const b1 = Number(y.id)
    if (Number.isFinite(a1) && Number.isFinite(b1) && a1 !== b1) return a1 - b1
    return String(x.id).localeCompare(String(y.id))
  })
)

const current = computed(() => {
  const list = sortedDepots.value
  if (!list.length) return null
  return list.find((d) => String(d.id) === String(state.activeDepot)) || list[0]
})

function depotState(d) {
  if (!d) return { tone: 'idle', text: '' }
  if (d.missing) return { tone: 'bad', text: '脚本缺失' }
  if (!d.idMatches) return { tone: 'bad', text: 'DepotID 不一致' }
  if (!d.analysis?.exists) return { tone: 'warn', text: '内容目录不存在' }
  if (d.analysis.suspicious?.length) return { tone: 'warn', text: `${d.analysis.suspicious.length} 个可疑文件` }
  return { tone: 'ok', text: '就绪' }
}

const a = computed(() => current.value?.analysis || null)

/** depot 脚本的完整路径：vdf 里可能写的是绝对路径，也可能只是文件名 */
const scriptPath = computed(() => {
  const f = current.value?.file
  if (!f) return ''
  if (/^[a-zA-Z]:[\\/]/.test(f) || f.startsWith('\\\\')) return f
  const dir = state.detail?.dir || ''
  return dir ? `${dir}\\${f}` : f
})

/** 按命中的规则分组，比一长串文件名好读 */
const excludedByRule = computed(() => {
  const map = new Map()
  for (const f of a.value?.excluded || []) {
    const key = f.rule
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(f)
  }
  return [...map.entries()].sort((x, y) => y[1].length - x[1].length)
})

const metaLine = computed(() => {
  const m = current.value?.meta
  if (!m) return []
  const out = []
  if (m.name) out.push(m.name)
  if (m.language && m.language !== 'all') out.push(m.language)
  return out
})

const osLabel = (id) => state.depotOptions.os.find((o) => o.id === id)?.label || id || ''
const platLabel = (id) => PLATFORM_LABEL[id] || id || ''
const archLabel = (id) => state.depotOptions.arch.find((o) => o.id === id)?.label || id || ''
const langLabel = (id) =>
  state.depotOptions.languages.find((l) => l.id === id)?.label || (id === 'all' ? '所有语言' : id || '')

async function createDir(d) {
  const res = await window.api.app.ensureContentDir(state.selectedDir, d.file)
  if (!res.ok) return toast(res.error || '创建失败', 'bad')
  await reloadDetail()
  toast(res.created ? `已创建 ${res.contentRoot}` : `${res.contentRoot} 早就存在`)
}

async function openPath(p) {
  if (!p) return
  const r = await window.api.shell.openPath(p)
  if (!r.ok) toast(r.error || '打不开', 'bad')
}
</script>

<template>
  <section class="card overflow-hidden min-w-0" v-reveal="{ delay: 0.04 }">
    <header class="px-5 pt-4 pb-3 flex items-center gap-3 flex-wrap">
      <h2 class="text-[13px] font-semibold tracking-tight m-0">Depot</h2>
      <span class="text-[11.5px] text-faint num">{{ sortedDepots.length }}</span>
      <button class="ml-auto btn h-7 px-2.5 text-[11.5px] no-drag" @click="openDepotSlide()">
        ＋ 新建 Depot
      </button>
    </header>

    <!-- 平台卡片：只列已经建了 Depot 的平台，点一张切换一张 -->
    <div
      v-if="sortedDepots.length"
      class="px-5 pb-4 grid gap-2"
      style="grid-template-columns: repeat(auto-fill, minmax(156px, 1fr))"
    >
      <button
        v-for="d in sortedDepots"
        :key="d.id"
        class="text-left rounded-[10px] border px-3 py-2 transition-colors cursor-pointer min-w-0 bg-transparent"
        :class="
          String(d.id) === String(current?.id)
            ? 'border-[rgba(102,192,244,.4)] bg-[rgba(102,192,244,.06)]'
            : 'border-line hover:bg-surface-2/60'
        "
        @click="setActiveDepot(d.id)"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="{
              'bg-accent': depotState(d).tone === 'ok',
              'bg-amber': depotState(d).tone === 'warn',
              'bg-danger': depotState(d).tone === 'bad'
            }"
          />
          <span
            class="text-[12.5px] font-medium truncate"
            :class="String(d.id) === String(current?.id) ? 'text-ink' : 'text-muted'"
          >
            {{ platLabel(d.platform) }}
          </span>
        </div>
        <div class="mt-1 flex items-center gap-1.5 text-[11px] text-faint num min-w-0">
          <span class="font-mono truncate">{{ d.id }}</span>
          <span class="text-line">·</span>
          <span class="shrink-0">{{ fmtSize(d.analysis?.totalBytes) }}</span>
        </div>
      </button>
    </div>

    <!-- 当前 Depot -->
    <div v-if="current" class="border-t border-line">
      <div class="px-5 py-3">
        <div class="flex items-center gap-2.5 flex-wrap min-w-0">
          <span
            class="pill"
            :class="{
              'pill-ok': depotState(current).tone === 'ok',
              'pill-warn': depotState(current).tone === 'warn',
              'pill-bad': depotState(current).tone === 'bad'
            }"
          >
            {{ depotState(current).text }}
          </span>
          <span class="text-[11.5px] text-muted">{{ osLabel(current.meta?.os) }} {{ archLabel(current.meta?.arch) }}</span>
          <span class="text-[11.5px] text-faint">{{ langLabel(current.meta?.language) }}</span>
          <span v-if="metaLine.length" class="text-[12px] text-muted truncate">{{ metaLine[0] }}</span>

          <div class="ml-auto flex items-center gap-1.5">
            <button
              v-if="a && !a.exists"
              class="btn h-7 px-2.5 text-[11.5px] no-drag border-[rgba(255,180,84,.3)] text-amber hover:bg-[rgba(255,180,84,.08)]"
              @click="createDir(current)"
            >
              创建目录
            </button>
            <button class="btn h-7 px-2.5 text-[11.5px] no-drag" @click="openDrawer('depot', current.file)">
              编辑
            </button>
          </div>
        </div>

        <!-- 数字 -->
        <div v-if="a" class="mt-3 grid grid-cols-4 gap-3">
          <div>
            <div class="text-[10.5px] text-faint tracking-wide">磁盘文件</div>
            <div class="num text-[15px] font-semibold mt-0.5">{{ fmtInt(a.fileCount) }}</div>
          </div>
          <div>
            <div class="text-[10.5px] text-faint tracking-wide">总体积</div>
            <div class="num text-[15px] font-semibold mt-0.5">{{ fmtSize(a.totalBytes) }}</div>
          </div>
          <div>
            <div class="text-[10.5px] text-amber/80 tracking-wide">被排除</div>
            <div class="num text-[15px] font-semibold mt-0.5" :class="a.excludedCount ? 'text-amber' : 'text-faint'">
              {{ fmtInt(a.excludedCount) }}
            </div>
          </div>
          <div>
            <div class="text-[10.5px] text-accent/80 tracking-wide">会上传</div>
            <div class="num text-[15px] font-semibold mt-0.5 text-accent">{{ fmtInt(a.uploadCount) }}</div>
          </div>
        </div>

        <div class="mt-2.5 flex flex-col gap-1">
          <div class="flex items-center gap-2 text-[11.5px] min-w-0">
            <span class="shrink-0 w-[52px] text-faint/70">内容目录</span>
            <PathLink
              v-if="a?.contentRoot"
              :path="a.contentRoot"
              kind="folder"
              :exists="!!a.exists"
              class="min-w-0 flex-1"
            />
            <span v-else class="text-faint">未设置</span>
          </div>
          <div class="flex items-center gap-2 text-[11.5px] min-w-0">
            <span class="shrink-0 w-[52px] text-faint/70">脚本</span>
            <PathLink :path="scriptPath" kind="file" class="min-w-0 flex-1" />
          </div>
          <div v-if="current.userConfig?.length" class="flex items-start gap-2 text-[11.5px] min-w-0">
            <span class="shrink-0 w-[52px] text-faint/70">存档保护</span>
            <span class="font-mono break-all text-muted">
              {{ current.userConfig.join('、') }}
            </span>
          </div>
          <div v-else class="flex items-center gap-2 text-[11.5px] min-w-0">
            <span class="shrink-0 w-[52px] text-faint/70">存档保护</span>
            <span class="text-amber/80">没标任何玩家数据文件</span>
          </div>
        </div>
      </div>

      <!-- 可疑文件 -->
      <div v-if="a?.suspicious?.length" class="border-t border-line-soft">
        <button
          class="w-full flex items-center gap-2 px-5 py-2.5 bg-transparent border-0 cursor-pointer text-left hover:bg-surface-2/60 transition-colors"
          @click="showSuspicious = !showSuspicious"
        >
          <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 text-danger transition-transform"
            :class="showSuspicious && 'rotate-90'" fill="none">
            <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="text-[12px] font-medium text-danger">会被上传的可疑文件</span>
          <span class="num text-[11.5px] text-faint">{{ a.suspicious.length }}</span>
          <span class="ml-auto text-[11px] text-faint">这些应该加进 FileExclusion</span>
        </button>
        <div v-show="showSuspicious" class="px-5 pb-3 max-h-[200px] overflow-y-auto scroll-thin">
          <div
            v-for="(f, i) in a.suspicious"
            :key="i"
            class="flex items-center gap-3 py-1.5 border-b border-line-soft last:border-b-0"
          >
            <span class="font-mono text-[11.5px] text-[#ffb0b8] truncate flex-1 min-w-0" :title="f.rel">{{ f.rel }}</span>
            <span class="num text-[10.5px] text-faint shrink-0">{{ fmtSize(f.size) }}</span>
          </div>
        </div>
      </div>

      <!-- 被排除的文件 -->
      <div class="border-t border-line-soft">
        <button
          class="w-full flex items-center gap-2 px-5 py-2.5 bg-transparent border-0 cursor-pointer text-left hover:bg-surface-2/60 transition-colors"
          @click="showExcluded = !showExcluded"
        >
          <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 text-amber transition-transform"
            :class="showExcluded && 'rotate-90'" fill="none">
            <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="text-[12px] font-medium text-amber">被 FileExclusion 挡下的文件</span>
          <span class="num text-[11.5px] text-faint">{{ a?.excludedCount || 0 }}</span>
          <span class="ml-auto text-[11px] text-faint">只不上传，本地都还在</span>
        </button>
        <div v-show="showExcluded" class="px-5 pb-3 max-h-[240px] overflow-y-auto scroll-thin">
          <div v-for="[rule, files] in excludedByRule" :key="rule" class="mb-2.5 last:mb-0">
            <div class="flex items-center gap-2 mb-1">
              <code class="text-[11px] text-accent bg-[rgba(102,192,244,.07)] border border-[rgba(102,192,244,.18)] rounded px-1.5 py-0.5">
                {{ rule }}
              </code>
              <span class="num text-[11px] text-faint">{{ files.length }} 个</span>
            </div>
            <div
              v-for="(f, i) in files.slice(0, 30)"
              :key="i"
              class="font-mono text-[11px] text-faint truncate pl-1 py-0.5"
              :title="f.rel"
            >
              {{ f.rel }}
            </div>
            <div v-if="files.length > 30" class="text-[11px] text-faint pl-1">
              … 还有 {{ files.length - 30 }} 个
            </div>
          </div>
          <div v-if="!excludedByRule.length" class="text-[11.5px] text-faint py-1">
            没有文件被排除。
          </div>
        </div>
      </div>
    </div>

    <div v-else class="border-t border-line px-5 py-6 text-[12.5px] text-faint">
      这个 App 还没有 Depot。
    </div>
  </section>
</template>
