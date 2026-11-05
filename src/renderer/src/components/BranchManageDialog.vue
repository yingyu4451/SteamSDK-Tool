<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import gsap from 'gsap'
import { GitBranch } from '@lucide/vue'
import { state, selectedApp, loadBuildPanel } from '../store.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const el = ref(null)
const inputEl = ref(null)
const draft = ref('')
const busy = ref(false)
const error = ref('')

const appId = computed(() => state.detail?.appId || selectedApp.value?.appId || '')
const current = computed(() => state.detail?.setLive || '')

/** 跟 store.setBranch 记本机历史用的是同一个 key（拿不到 appId 时归到 unknown） */
const localKey = computed(() => String(appId.value || 'unknown'))

/** 本机记过的分支：setBranch 写成功后记一份 */
const localKnown = computed(() => state.settings?.branches?.[localKey.value] || [])

/** 后台分支只认和当前 App 对得上的那份数据 */
const panelMatches = computed(
  () => !!appId.value && String(state.buildPanel.appId) === String(appId.value)
)

const backendBetas = computed(() => {
  if (!panelMatches.value || !state.buildPanel.data) return []
  return (state.buildPanel.data.betas || []).filter((b) => b.betakey)
})

const backendBusy = computed(() => panelMatches.value && state.buildPanel.busy)

const backendLoaded = computed(
  () => panelMatches.value && !state.buildPanel.busy && !!state.buildPanel.data
)

const backendError = computed(() =>
  panelMatches.value && !state.buildPanel.busy && !state.buildPanel.data
    ? state.buildPanel.error || ''
    : ''
)

/** 顶部一行后台状态：读取中 / 读到几个 / 失败 / 没密钥，别让本机记录看起来像「后台不存在」 */
const backendStatus = computed(() => {
  if (!appId.value) return { bad: false, text: '还没选 App' }
  if (backendBusy.value) return { bad: false, text: '后台分支读取中…' }
  if (backendLoaded.value) {
    return {
      bad: false,
      text: backendBetas.value.length
        ? `后台 ${backendBetas.value.length} 个分支`
        : '后台没有 beta 分支'
    }
  }
  if (backendError.value) return { bad: true, text: `后台读取失败：${backendError.value}` }
  if (!state.hasApiKey) return { bad: false, text: '没有 Web API 密钥，读不到后台分支' }
  return { bad: false, text: '后台分支未读取' }
})

/** 合并：当前 SetLive 在最前，其余按后台顺序、最后补本机独有的；同名忽略大小写去重 */
const rows = computed(() => {
  const list = []
  const seen = new Set()

  const localByKey = new Map()
  for (const k of localKnown.value) {
    const id = String(k || '').toLowerCase()
    if (id && !localByKey.has(id)) localByKey.set(id, String(k))
  }

  const betaByKey = new Map()
  for (const b of backendBetas.value) betaByKey.set(String(b.betakey).toLowerCase(), b)

  function push(name) {
    const key = String(name || '')
    const id = key.toLowerCase()
    if (!id || seen.has(id)) return
    seen.add(id)
    list.push({
      key,
      id,
      isCurrent: !!current.value && id === String(current.value).toLowerCase(),
      isLocal: localByKey.has(id),
      beta: betaByKey.get(id) || null
    })
  }

  if (current.value) push(current.value)
  for (const b of backendBetas.value) push(b.betakey)
  for (const k of localKnown.value) push(k)
  return list
})

function rowStatus(row) {
  if (row.isCurrent) return { cls: 'pill-warn', text: '当前 SetLive' }
  if (row.beta) return { cls: 'pill-idle', text: '后台' }
  if (backendLoaded.value) return { cls: '', text: '仅本机' }
  return { cls: '', text: '本机记录' }
}

function rowTitle(row) {
  if (!row.beta) return ''
  const desc = row.beta.description ? ` · ${row.beta.description}` : ''
  return `后台 BuildID ${row.beta.buildid || ''}${desc}`
}

function close() {
  emit('close')
}

useDialogA11y(el, close, { isOpen: () => props.open })

/** 打开时补拉一次后台分支；构建面板已经在读（或别的 App 在读）就不抢 */
function ensureBackend() {
  if (!appId.value || !state.hasApiKey) return
  const p = state.buildPanel
  if (String(p.appId) === String(appId.value) && (p.busy || p.data)) return
  if (p.busy) return
  void loadBuildPanel()
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      error.value = ''
      draft.value = ''
      return
    }
    error.value = ''
    await nextTick()
    if (el.value) {
      gsap.fromTo(
        el.value,
        { opacity: 0, y: 16, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' }
      )
    }
    ensureBackend()
    inputEl.value?.focus()
  }
)

/** 先改界面再落盘，失败整份退回去 */
async function persist(list) {
  const key = localKey.value
  if (!state.settings) {
    error.value = '设置还没加载好，稍后再试'
    return false
  }
  const prev = state.settings.branches || {}
  const next = { ...prev }
  if (list.length) next[key] = list
  else delete next[key]

  state.settings.branches = next
  busy.value = true
  try {
    // IPC 走结构化克隆，不能把 Vue 的响应式代理直接递过去（会报 could not be cloned）
    const plain = JSON.parse(JSON.stringify(next))
    const res = await window.api.settings.save({ branches: plain })
    if (!res?.ok) throw new Error(res?.error || '保存失败')
    return true
  } catch (e) {
    state.settings.branches = prev
    error.value = `保存失败：${e?.message || e}`
    return false
  } finally {
    busy.value = false
  }
}

async function addBranch() {
  if (busy.value) return
  const name = draft.value.trim()
  if (!name) return
  if (rows.value.some((r) => r.id === name.toLowerCase())) {
    error.value = '这个分支已经在列表里了'
    return
  }
  if (await persist([...localKnown.value, name])) {
    draft.value = ''
    error.value = ''
    inputEl.value?.focus()
  }
}

async function removeBranch(row) {
  if (busy.value || !row.isLocal || row.isCurrent) return
  const list = localKnown.value.filter((k) => String(k).toLowerCase() !== row.id)
  if (await persist(list)) error.value = ''
}

/** 切 App 时收起弹窗：数据已经不是这一份了 */
watch(appId, () => {
  if (props.open) close()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div v-if="open" class="fixed inset-0 z-[60] grid place-items-center p-6 no-drag">
        <div class="absolute inset-0 bg-black/25" @click="close" />

        <div
          ref="el"
          role="dialog"
          aria-modal="true"
          aria-labelledby="branch-manage-title"
          class="relative card s-modal w-full max-w-170 max-h-[86vh] overflow-hidden flex flex-col"
        >
          <header class="px-5 pt-4 pb-3 border-b border-line flex items-start gap-3">
            <GitBranch :size="18" class="text-accent shrink-0 mt-0.5" />
            <div class="min-w-0 flex-1">
              <h2 id="branch-manage-title" class="text-title font-semibold m-0">管理分支</h2>
              <p
                class="mt-1 mb-0 text-label truncate"
                :class="backendStatus.bad ? 'text-danger' : 'text-faint'"
                :title="backendStatus.text"
              >
                {{ backendStatus.text }}
              </p>
            </div>
          </header>

          <div class="p-4 flex flex-col gap-3 overflow-y-auto scroll-thin">
            <div class="flex gap-2">
              <input
                ref="inputEl"
                v-model="draft"
                type="text"
                aria-label="新分支名"
                placeholder="分支名，例如 qa / internal"
                class="flex-1 h-8 px-3 rounded-input bg-surface border border-line text-body text-ink placeholder:text-faint outline-none focus:border-accent/45 transition-colors"
                :disabled="busy"
                @keydown.enter="addBranch"
              />
              <button class="btn px-3" :disabled="busy || !draft.trim()" @click="addBranch">
                添加
              </button>
            </div>

            <div
              v-if="error"
              role="alert"
              class="text-label rounded-card px-3 py-2 border text-danger border-danger/24 bg-danger/6"
            >
              {{ error }}
            </div>

            <div v-if="rows.length" class="rounded-card border border-line divide-y divide-line overflow-hidden">
              <div v-for="row in rows" :key="row.id" class="flex items-center gap-2 px-3.5 py-2.5">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono text-label text-ink break-all" :title="rowTitle(row)">
                      {{ row.key }}
                    </span>
                    <span class="pill" :class="rowStatus(row).cls">{{ rowStatus(row).text }}</span>
                  </div>
                  <div
                    v-if="row.beta && (row.beta.buildid || row.beta.description)"
                    class="mt-0.5 text-micro text-faint truncate"
                  >
                    <template v-if="row.beta.buildid">BuildID {{ row.beta.buildid }}</template>
                    <template v-if="row.beta.buildid && row.beta.description"> · </template>
                    <template v-if="row.beta.description">{{ row.beta.description }}</template>
                  </div>
                </div>

                <button
                  v-if="row.isLocal"
                  class="link-btn is-danger shrink-0"
                  :class="row.isCurrent ? 'opacity-40 cursor-not-allowed' : ''"
                  :disabled="busy || row.isCurrent"
                  :title="
                    row.isCurrent
                      ? '先切走当前 SetLive，再删这条本机记录'
                      : '只删本机记录，不影响后台'
                  "
                  @click="removeBranch(row)"
                >
                  删除
                </button>
              </div>
            </div>

            <div v-else class="text-label text-faint py-2">还没有记录过分支</div>
          </div>

          <footer class="px-5 py-3 border-t border-line flex items-center gap-2">
            <div class="flex-1 text-micro text-faint">只管理本机记录；后台分支由 Steamworks 决定</div>
            <button class="btn" @click="close">关闭</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
