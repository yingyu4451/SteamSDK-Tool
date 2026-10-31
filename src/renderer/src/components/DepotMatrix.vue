<script setup>
import { computed, ref } from 'vue'
import { fmtSize, fmtInt } from '../format.js'
import { state, openDrawer, reloadDetail, toast, openDepotSlide, setActiveDepot, PLATFORM_LABEL, depotUploadEnabled, toggleDepotUpload } from '../store.js'
import PathLink from './PathLink.vue'
import EmptyState from './EmptyState.vue'
import { ChevronRight, Package, CloudUpload, CloudOff } from '@lucide/vue'

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
  return { tone: 'ok', text: '配置通过' }
}

/** 「就绪」太笼统，悬停时把检查过哪几项写清楚 */
function depotStateHint(d) {
  if (!d) return ''
  if (d.missing) return 'app vdf 引用的 depot 脚本不存在'
  if (!d.idMatches) return '脚本里的 DepotID 与 app vdf 里写的不一致'
  if (!d.analysis?.exists) return 'vdf 里的内容目录不存在：点「创建目录」，或在编辑抽屉里改'
  if (d.analysis.suspicious?.length) {
    return `内容目录里有 ${d.analysis.suspicious.length} 个可疑文件；跑一次「检查文件」看详情`
  }
  return '配置检查通过：脚本存在、DepotID 与文件名一致、内容目录存在、没有可疑文件（来自「检查配置」；实际文件另看「检查文件」）'
}

/** 文件检查（检查文件）的结果：只有真正上传的那些文件的问题，和上面的配置检查是两码事 */
function fileState(d) {
  // 弹层收起后 state.preflight 会清空，这里用最近一次结果的存档
  const pf = state.lastPreflight
  if (!d) return { tone: 'idle', text: '', hint: '' }
  if (!pf || pf.dirName !== state.selectedDir) {
    return { tone: 'idle', text: '文件未检查', hint: '点上方「检查文件」扫一遍真正会被上传的文件' }
  }
  const row = (pf.depots || []).find((x) => String(x.depotId) === String(d.id))
  if (!row) {
    return { tone: 'idle', text: '文件未检查', hint: '这次「检查文件」没有包含这个 Depot（脚本缺失或已被跳过）' }
  }
  const errs = (row.problems || []).filter((p) => p.level === 'error').length
  const warns = (row.problems || []).filter((p) => p.level === 'warn').length
  if (errs) {
    return {
      tone: 'bad',
      text: `文件 ${errs} 个问题`,
      hint: `内容目录里扫出 ${errs} 个会拦住上传的文件问题（非法字符/超长路径/大小写冲突等）；点「检查文件」看详情`
    }
  }
  if (warns) {
    return {
      tone: 'warn',
      text: `文件 ${warns} 个警告`,
      hint: `扫出 ${warns} 个警告（符号链接 / macOS 元数据 / 空目录等），点「检查文件」看详情`
    }
  }
  return { tone: 'ok', text: '文件通过', hint: '最近一次「检查文件」没有发现会拦住上传的问题' }
}

function toneCls(t) {
  return t === 'ok' ? 'pill-ok' : t === 'warn' ? 'pill-warn' : t === 'bad' ? 'pill-bad' : 'pill-idle'
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
  return out
})

const platLabel = (id) => PLATFORM_LABEL[id] || id || ''

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
      <h2 class="font-semibold tracking-tight m-0">Depot</h2>
      <span class="text-label text-faint num">{{ sortedDepots.length }}</span>
      <button class="ml-auto btn btn-sm px-2.5  no-drag" @click="openDepotSlide()">
        ＋ 新建 Depot
      </button>
    </header>

    <!-- 平台卡片：只列已经建了 Depot 的平台，点一张切换一张 -->
    <div
      v-if="sortedDepots.length"
      class="px-5 pb-4 grid gap-2"
      style="grid-template-columns: repeat(auto-fill, minmax(156px, 1fr))"
    >
      <div v-for="d in sortedDepots" :key="d.id" class="relative min-w-0">
        <button
          class="w-full text-left rounded-card border px-3 py-2 pr-8 transition-colors cursor-pointer min-w-0"
          :class="
            String(d.id) === String(current?.id)
              ? 'border-accent/95 bg-accent/10 shadow-[inset_0_0_0_1px_rgba(102,192,244,.35)]'
              : 'border-rule/40 bg-accent/[0.05] hover:bg-accent/10 hover:border-rule/60'
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
              class="text-body font-normal truncate"
              :class="String(d.id) === String(current?.id) ? 'text-ink' : 'text-muted'"
            >
              {{ platLabel(d.platform) }}
            </span>
          </div>
          <div class="mt-1 flex items-center gap-1.5 text-micro text-faint num min-w-0">
            <span class="font-mono truncate">{{ d.id }}</span>
            <span v-if="!depotUploadEnabled(state.selectedDir, d.id)" class="shrink-0 text-amber">不上传</span>
          </div>
        </button>
        <!-- 只有图标的上传开关：按下=参与构建上传，弹起=构建时跳过 -->
        <button
          class="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-btn border-0 cursor-pointer no-drag transition-all active:translate-y-px active:brightness-90"
          :class="
            depotUploadEnabled(state.selectedDir, d.id)
              ? 'bg-accent/22 text-accent hover:bg-accent/38'
              : 'bg-black/45 text-faint hover:bg-surface-3/80 hover:text-ink'
          "
          :title="
            depotUploadEnabled(state.selectedDir, d.id)
              ? '这个 Depot 会随构建上传；点击改为不上传'
              : '这个 Depot 不会上传；点击改为上传'
          "
          :aria-pressed="depotUploadEnabled(state.selectedDir, d.id)"
          :aria-label="`切换 ${platLabel(d.platform)} Depot 上传`"
          @click.stop="toggleDepotUpload(d.id)"
        >
          <component
            :is="depotUploadEnabled(state.selectedDir, d.id) ? CloudUpload : CloudOff"
            :size="14"
            :stroke-width="1.9"
          />
        </button>
      </div>
    </div>

    <!-- 当前 Depot -->
    <div v-if="current" class="border-t border-line">
      <div class="px-5 py-3">
        <div class="flex items-center gap-2.5 flex-wrap min-w-0">
          <span class="pill" :class="toneCls(depotState(current).tone)" :title="depotStateHint(current)">
            {{ depotState(current).text }}
          </span>
          <span class="pill" :class="toneCls(fileState(current).tone)" :title="fileState(current).hint">
            {{ fileState(current).text }}
          </span>
          <span v-if="metaLine.length" class="text-label text-muted truncate">{{ metaLine[0] }}</span>

          <div class="ml-auto flex items-center gap-1.5">
            <button
              v-if="a && !a.exists"
              class="btn btn-sm px-2.5  no-drag border-amber/30 text-amber hover:bg-amber/8"
              @click="createDir(current)"
            >
              创建目录
            </button>
            <button class="btn btn-sm px-2.5  no-drag" @click="openDrawer('depot', current.file)">
              编辑
            </button>
          </div>
        </div>

        <!-- 数字 -->
        <div v-if="a" class="mt-3 grid grid-cols-4 gap-3">
          <div>
            <div class="text-micro text-faint tracking-wide">磁盘文件</div>
            <div class="num text-lead font-semibold mt-0.5">{{ fmtInt(a.fileCount) }}</div>
          </div>
          <div>
            <div class="text-micro text-faint tracking-wide">总体积</div>
            <div class="num text-lead font-semibold mt-0.5">{{ fmtSize(a.totalBytes) }}</div>
          </div>
          <div>
            <div class="text-micro tracking-wide" :class="a.excludedCount ? 'text-amber' : 'text-faint'">被排除</div>
            <div class="num text-lead font-semibold mt-0.5" :class="a.excludedCount ? 'text-amber' : 'text-faint'">
              {{ fmtInt(a.excludedCount) }}
            </div>
          </div>
          <div>
            <div class="text-micro text-accent tracking-wide">会上传</div>
            <div class="num text-lead font-semibold mt-0.5 text-accent">{{ fmtInt(a.uploadCount) }}</div>
          </div>
        </div>

        <div class="mt-2.5 flex flex-col gap-1">
          <div class="flex items-start gap-2 text-label min-w-0">
            <span class="shrink-0 w-16 pt-1 text-faint">内容目录</span>
            <PathLink
              v-if="a?.contentRoot"
              :path="a.contentRoot"
              kind="folder"
              :exists="!!a.exists"
              class="min-w-0 flex-1"
            />
            <span v-else class="text-faint">未设置</span>
          </div>
          <div class="flex items-start gap-2 text-label min-w-0">
            <span class="shrink-0 w-16 pt-1 text-faint">脚本</span>
            <PathLink :path="scriptPath" kind="file" class="min-w-0 flex-1" />
          </div>
          <div v-if="current.userConfig?.length" class="flex items-start gap-2 text-label min-w-0">
            <span class="shrink-0 w-16 text-faint">存档保护</span>
            <span class="font-mono break-all text-muted">
              {{ current.userConfig.join('、') }}
            </span>
          </div>
          <div v-else class="flex items-center gap-2 text-label min-w-0">
            <span class="shrink-0 w-16 text-faint">存档保护</span>
            <span class="text-amber">没标任何玩家数据文件</span>
          </div>
        </div>
      </div>

      <!-- 可疑文件 -->
      <div v-if="a?.suspicious?.length" class="border-t border-line-soft">
        <button
          class="w-full flex items-center gap-2 px-5 py-2.5 bg-transparent border-0 cursor-pointer text-left hover:bg-surface-2/60 transition-colors"
          @click="showSuspicious = !showSuspicious"
        >
          <ChevronRight
        :size="14"
        :stroke-width="2.4"
        :class="['text-danger transition-transform', showSuspicious && 'rotate-90']"
      />
          <span class="text-label font-normal text-danger">会被上传的可疑文件</span>
          <span class="num text-label text-faint">{{ a.suspicious.length }}</span>
          <span class="ml-auto text-micro text-faint">这些应该加进 FileExclusion</span>
        </button>
        <div class="collapsible" :class="{ 'is-open': showSuspicious }">
          <div>
            <div class="px-5 pb-3 max-h-50 overflow-y-auto scroll-thin">
              <div
                v-for="(f, i) in a.suspicious"
                :key="i"
                class="flex items-center gap-3 py-1.5 border-b border-line-soft last:border-b-0"
              >
                <span class="font-mono text-label text-danger/80 break-all flex-1 min-w-0" :title="f.rel">{{ f.rel }}</span>
                <span class="num text-micro text-faint shrink-0">{{ fmtSize(f.size) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 被排除的文件 -->
      <div class="border-t border-line-soft">
        <button
          class="w-full flex items-center gap-2 px-5 py-2.5 bg-transparent border-0 cursor-pointer text-left hover:bg-surface-2/60 transition-colors"
          @click="showExcluded = !showExcluded"
        >
          <ChevronRight
        :size="14"
        :stroke-width="2.4"
        :class="['text-amber transition-transform', showExcluded && 'rotate-90']"
      />
          <span class="text-label font-normal text-amber">被 FileExclusion 挡下的文件</span>
          <span class="num text-label text-faint">{{ a?.excludedCount || 0 }}</span>
          <span class="ml-auto text-micro text-faint">只不上传，本地都还在</span>
        </button>
        <div class="collapsible" :class="{ 'is-open': showExcluded }">
          <div>
            <div class="px-5 pb-3 max-h-60 overflow-y-auto scroll-thin">
              <div v-for="[rule, files] in excludedByRule" :key="rule" class="mb-2.5 last:mb-0">
                <div class="flex items-center gap-2 mb-1">
                  <code class="text-micro text-accent bg-accent/7 border border-accent/18 rounded px-1.5 py-0.5">
                    {{ rule }}
                  </code>
                  <span class="num text-micro text-faint">{{ files.length }} 个</span>
                </div>
                <div
                  v-for="(f, i) in files.slice(0, 30)"
                  :key="i"
                  class="font-mono text-micro text-faint break-all pl-1 py-0.5"
                  :title="f.rel"
                >
                  {{ f.rel }}
                </div>
                <div v-if="files.length > 30" class="text-micro text-faint pl-1">
                  … 还有 {{ files.length - 30 }} 个
                </div>
              </div>
              <div v-if="!excludedByRule.length" class="text-label text-faint py-1">
                没有文件被排除。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="border-t border-line px-5 py-3">
      <EmptyState compact :icon="Package" title="还没有 Depot" hint="点右上角「新建 Depot」，按平台各建一个 —— 一次构建会全平台一起传。" />
    </div>
  </section>
</template>
