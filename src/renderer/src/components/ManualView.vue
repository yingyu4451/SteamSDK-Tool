<script setup>
import { ref, computed } from 'vue'
import { state, goSettings, startOnboard } from '../store.js'
import { t } from '../i18n/index.js'
import { ExternalLink, BookOpen, GraduationCap } from '@lucide/vue'

/* 手册纯静态内容。
   写成数据而不是一大坨模板：改文案不用碰结构，加一节只是多一个数组元素。
   第一节刻意做成「能做什么」的功能清单 —— 先让人知道这东西能帮上什么忙，
   再看概念和步骤。 */

const q = ref('')

const SECTIONS = computed(() => [
  {
    id: 'features',
    title: t('能做什么'),
    blocks: [
      {
        t: 'dl',
        v: [
          [
            t('游戏包拖进来'),
            t('窗口任意位置拖入文件夹或 zip。自动认出平台（看 UnityPlayer.dll / .app / .so），告诉你该导入哪个 Depot；同一个平台还没 Depot，就现场建一个。')
          ],
          [
            t('读后台 Depot'),
            t('向导里填 AppID，点「读后台 Depot」，拿回后台真实的 DepotID 和体积，不用照着 AppID+1 猜。')
          ],
          [t('同步 Depot'), t('后台建好、本地还没配的 Depot，勾上一次性补进 scripts。')],
          [
            t('一个 App 管多平台'),
            t('win64 / macOS / linux 各建一个 Depot，一次构建全传。不用为了多平台拆成好几个 App。')
          ],
          [
            t('界面里改 vdf'),
            t('AppID、项目文件夹、构建缓存目录、排除规则、存档保护，都在抽屉里改。写走的是行级替换，你手写的注释不会被动。')
          ],
          [
            t('内容目录就地打包'),
            t('把 Unity 的输出目录设成 Depot 的内容目录（输出模式 DirectFolder），打完包不用再复制到任何地方。')
          ],
          [
            t('上传前两道关'),
            t('「检查配置」查 vdf，「检查文件」查真实文件 —— 非法字符、超长路径、大小写冲突、符号链接、.app bundle。')
          ],
          [
            t('空跑'),
            t('Preview 走一遍完整构建，但一个字节都不传到 Steam，看 manifest 确认到底传了什么。')
          ],
          [
            t('本机试玩'),
            t('本地内容服务器把内容指到本机，Steam 客户端直接读，不用先上传就能试。')
          ],
          [
            t('日志留在窗口里'),
            t('steamcmd 和 PowerShell 的输出逐行流回来，随时中止，整棵进程树一起杀。')
          ],
          [t('构建历史'), t('output 目录下所有日志，按 App 筛、按名字搜。')]
        ]
      }
    ]
  },
  {
    id: 'concepts',
    title: t('三个词'),
    blocks: [
      {
        t: 'dl',
        v: [
          ['App', t('Steam 上的一个「产品」，用 AppID 标识。Demo、正式版、Playtest 是三个不同的 App。')],
          ['Depot', t('一个 App 下面的一个内容包，用 DepotID 标识。一个平台一个 Depot。')],
          [
            t('项目文件夹'),
            t('你电脑上放构建产物的目录，比如 D:\\SteamBuilds\\MyGame。下面按平台分子目录（win64、macos），每个子目录绑一个 Depot。')
          ]
        ]
      },
      {
        t: 'note',
        v: t('这三个 ID 只在 Steamworks 后台看得见。工具能读回来，但写不回去 —— 后台的 App 和 Depot 得你自己先建。')
      }
    ]
  },
  {
    id: 'buttons',
    title: t('工具条按钮'),
    blocks: [
      {
        t: 'dl',
        v: [
          [
            t('检查配置'),
            t('跑 check.ps1。核对 vdf 里的 AppID / DepotID / 内容目录 / 排除规则，以及 depot 脚本之间对不对得上。不看实际文件，很快。')
          ],
          [
            t('检查文件'),
            t('扫真正会被上传的文件，找非法字符、超长路径、大小写冲突、符号链接、macOS 的 .app bundle。')
          ],
          [t('Preview 空跑'), t('完整走一遍构建，但一个字节都不传到 Steam。')],
          [t('正式上传'), t('真上传。要点两次才生效。')],
          [
            t('同步 Depot'),
            t('读后台这个 App 下的 Depot 列表，勾上就把本地没有的补进 scripts。')
          ],
          [t('本地服务器'), t('把内容指到本地 ContentServer，Steam 客户端直接从你机器读。')]
        ]
      },
      {
        t: 'note',
        v: t('「检查配置」查的是配置，「检查文件」查的是文件。两个都跑 —— 上传失败最常见的原因就是配置对、但路径里有问题。')
      }
    ]
  },
  {
    id: 'exclude',
    title: t('什么不该传'),
    blocks: [
      {
        t: 'p',
        v: t('每个 Depot 都有自己的排除规则（vdf 里的 FileExclusion），在 Depot 卡片右上角「编辑」里改。默认已经挡掉：')
      },
      {
        t: 'ul',
        v: [
          t('*.pdb、*.log、*.ps1、*.bat、*.cmd —— 调试和脚本垃圾'),
          t('logs\\*、tools\\* —— 本地工具目录'),
          t('steam_appid.txt —— 只在本地测试用'),
          t('*BurstDebugInformation_DoNotShip\\* —— Unity Burst 的调试信息'),
          t('macOS 上还有 *.dSYM\\*、*.sym')
        ]
      },
      {
        t: 'note',
        v: t('玩家存档（Progress、Settings 这类运行时会改的文件）走另一条路：Depot 编辑里加进「存档保护」，Steam 更新时就不会覆盖玩家改过的文件。')
      }
    ]
  },
  {
    id: 'branch',
    title: t('分支和 SetLive'),
    blocks: [
      {
        t: 'p',
        v: t('分支列表现在直接从 Steamworks 后台读（需要 Web API 密钥）；没密钥时只显示本机写过的分支。vdf 里的 SetLive 写哪个分支名，那次构建就进哪个分支。')
      },
      {
        t: 'note',
        v: t('SetLive 留空 = 不设分支：构建只生成，不会自动上任何分支（包括 default）。default 分支要在后台网页上手动设 live。')
      }
    ]
  }
])

const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k) return SECTIONS.value
  return SECTIONS.value.filter((s) => {
    const hay = s.title + ' ' + JSON.stringify(s.blocks)
    return hay.toLowerCase().includes(k)
  })
})

function openRepo() {
  // 仓库地址由主进程从 package.json 的 repository 推出来，fork 之后不用改这里
  const repo = state.update?.repo || ''
  if (repo) window.api.shell.openExternal(`${repo}#readme`)
}
</script>

<template>
  <div class="p-5 flex flex-col gap-6 min-w-0 max-w-215">
    <div class="card px-5 py-4 flex items-center gap-3" v-reveal>
      <BookOpen :size="20" :stroke-width="1.8" class="text-accent shrink-0" />
      <div class="min-w-0">
        <h1 class="text-display font-semibold m-0 text-ink">{{ t('使用手册') }}</h1>
        <p class="mt-1 mb-0 text-body text-muted">{{ t('每个按钮是干什么的、怎么开始。') }}</p>
      </div>
      <input
        v-model="q"
        :placeholder="t('搜…')"
        class="ml-auto w-45 h-9 px-3 rounded-input bg-surface border border-line text-body outline-none focus:border-accent/45 placeholder:text-faint"
      />
      <button class="btn no-drag shrink-0" :title="t('从头走一遍设置流程')" @click="startOnboard">
        <GraduationCap :size="14" :stroke-width="1.9" />
        {{ t('新手教程') }}
      </button>
    </div>

    <div
      v-for="(sec, i) in shown"
      :key="sec.id"
      class="card px-5 py-4"
      v-reveal="{ delay: Math.min(i * 0.03, 0.18) }"
    >
      <h2 class="font-semibold m-0 mb-3.5">{{ sec.title }}</h2>

      <template v-for="(b, j) in sec.blocks" :key="j">
        <p v-if="b.t === 'p'" class="m-0 mb-3 text-body text-muted leading-[1.75]">
          {{ b.v }}
        </p>

        <ul v-else-if="b.t === 'ul'" class="m-0 mb-3 pl-5 flex flex-col gap-2.5">
          <li v-for="(x, k) in b.v" :key="k" class="text-body text-muted leading-[1.75]">
            {{ x }}
          </li>
        </ul>

        <ol v-else-if="b.t === 'ol'" class="m-0 mb-3 pl-5 flex flex-col gap-3 list-decimal">
          <li v-for="(x, k) in b.v" :key="k" class="text-body text-muted leading-[1.75] pl-1">
            {{ x }}
          </li>
        </ol>

        <div v-else-if="b.t === 'dl'" class="m-0 mb-3 flex flex-col gap-3.5">
          <div v-for="(pair, k) in b.v" :key="k" class="grid grid-cols-[150px_1fr] gap-x-5 items-baseline">
            <span class="text-body text-ink">{{ pair[0] }}</span>
            <span class="text-body text-muted leading-[1.75]">{{ pair[1] }}</span>
          </div>
        </div>

        <div
          v-else-if="b.t === 'note'"
          class="mt-1.5 mb-2 rounded-input border border-accent/22 bg-accent/5 px-3.5 py-2.5 text-body text-accent leading-[1.7]"
        >
          {{ b.v }}
        </div>
      </template>
    </div>

    <div v-if="!shown.length" class="card p-8 text-center text-body text-faint">
      {{ t('没有匹配「{q}」的章节。', { q }) }}
    </div>

    <div class="card px-5 py-4 flex items-center gap-3" v-reveal>
      <div class="min-w-0">
        <div class="text-body text-ink">{{ t('完整文档在仓库里') }}</div>
        <div class="mt-0.5 text-label text-faint">{{ t('中文和 English README 内容更全，含已知限制和开发说明。') }}</div>
      </div>
      <div class="ml-auto flex items-center gap-2 shrink-0">
        <button class="btn no-drag" @click="openRepo">
          <ExternalLink :size="14" :stroke-width="1.9" />
          {{ t('打开 README') }}
        </button>
        <button class="btn no-drag" @click="goSettings">{{ t('去设置') }}</button>
      </div>
    </div>
  </div>
</template>
