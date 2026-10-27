<script setup>
import { ref, computed } from 'vue'
import { state, goSettings, startOnboard } from '../store.js'
import { ExternalLink, BookOpen, GraduationCap } from '@lucide/vue'

/* 手册纯静态内容。
   写成数据而不是一大坨模板：改文案不用碰结构，加一节只是多一个数组元素。
   第一节刻意做成「能做什么」的功能清单 —— 先让人知道这东西能帮上什么忙，
   再看概念和步骤。 */

const q = ref('')

const SECTIONS = [
  {
    id: 'features',
    title: '能做什么',
    blocks: [
      {
        t: 'dl',
        v: [
          ['游戏包拖进来', '窗口任意位置拖入文件夹或 zip。自动认出平台（看 UnityPlayer.dll / .app / .so），告诉你该导入哪个 Depot；同一个平台还没 Depot，就现场建一个。'],
          ['读后台 Depot', '向导里填 AppID，点「读后台 Depot」，拿回后台真实的 DepotID 和体积，不用照着 AppID+1 猜。'],
          ['同步 Depot', '后台建好、本地还没配的 Depot，勾上一次性补进 scripts。'],
          ['一个 App 管多平台', 'win64 / macOS / linux 各建一个 Depot，一次构建全传。不用为了多平台拆成好几个 App。'],
          ['界面里改 vdf', 'AppID、项目文件夹、构建缓存目录、排除规则、存档保护，都在抽屉里改。写走的是行级替换，你手写的注释不会被动。'],
          ['内容目录就地打包', '把 Unity 的输出目录设成 Depot 的内容目录（输出模式 DirectFolder），打完包不用再复制到任何地方。'],
          ['上传前两道关', '「检查配置」查 vdf，「检查文件」查真实文件 —— 非法字符、超长路径、大小写冲突、符号链接、.app bundle。'],
          ['空跑', 'Preview 走一遍完整构建，但一个字节都不传到 Steam，看 manifest 确认到底传了什么。'],
          ['本机试玩', '本地内容服务器把内容指到本机，Steam 客户端直接读，不用先上传就能试。'],
          ['剥离 Steam 运行库', '导航栏「剥离 Steam」：把打包好的游戏文件夹拖进去，确认后复制一份到旁边，副本里去掉 steam_api64.dll 这类原生运行库（可选 steam_appid.txt），启动时就不再绑定 Steam。原文件夹一个字节都不动。'],
          ['日志留在窗口里', 'steamcmd 和 PowerShell 的输出逐行流回来，随时中止，整棵进程树一起杀。'],
          ['构建历史', 'output 目录下所有日志，按 App 筛、按名字搜。']
        ]
      }
    ]
  },
  {
    id: 'concepts',
    title: '三个词',
    blocks: [
      {
        t: 'dl',
        v: [
          ['App', 'Steam 上的一个「产品」，用 AppID 标识。Demo、正式版、Playtest 是三个不同的 App。'],
          ['Depot', '一个 App 下面的一个内容包，用 DepotID 标识。一个平台一个 Depot。'],
          ['项目文件夹', '你电脑上放构建产物的目录，比如 D:\\SteamBuilds\\MyGame。下面按平台分子目录（win64、macos），每个子目录绑一个 Depot。']
        ]
      },
      {
        t: 'note',
        v: '这三个 ID 只在 Steamworks 后台看得见。工具能读回来，但写不回去 —— 后台的 App 和 Depot 得你自己先建。'
      }
    ]
  },
  {
    id: 'buttons',
    title: '工具条按钮',
    blocks: [
      {
        t: 'dl',
        v: [
          ['检查配置', '跑 check.ps1。核对 vdf 里的 AppID / DepotID / 内容目录 / 排除规则，以及 depot 脚本之间对不对得上。不看实际文件，很快。'],
          ['检查文件', '扫真正会被上传的文件，找非法字符、超长路径、大小写冲突、符号链接、macOS 的 .app bundle。'],
          ['Preview 空跑', '完整走一遍构建，但一个字节都不传到 Steam。'],
          ['正式上传', '真上传。要点两次才生效。'],
          ['同步 Depot', '读后台这个 App 下的 Depot 列表，勾上就把本地没有的补进 scripts。'],
          ['本地服务器', '把内容指到本地 ContentServer，Steam 客户端直接从你机器读。']
        ]
      },
      {
        t: 'note',
        v: '「检查配置」查的是配置，「检查文件」查的是文件。两个都跑 —— 上传失败最常见的原因就是配置对、但路径里有问题。'
      }
    ]
  },
  {
    id: 'exclude',
    title: '什么不该传',
    blocks: [
      {
        t: 'p',
        v: '每个 Depot 都有自己的排除规则（vdf 里的 FileExclusion），在 Depot 卡片右上角「编辑」里改。默认已经挡掉：'
      },
      {
        t: 'ul',
        v: [
          '*.pdb、*.log、*.ps1、*.bat、*.cmd —— 调试和脚本垃圾',
          'logs\\*、tools\\* —— 本地工具目录',
          'steam_appid.txt —— 只在本地测试用',
          '*BurstDebugInformation_DoNotShip\\* —— Unity Burst 的调试信息',
          'macOS 上还有 *.dSYM\\*、*.sym'
        ]
      },
      {
        t: 'note',
        v: '玩家存档（Progress、Settings 这类运行时会改的文件）走另一条路：Depot 编辑里加进「存档保护」，Steam 更新时就不会覆盖玩家改过的文件。'
      }
    ]
  },
  {
    id: 'branch',
    title: '分支和 SetLive',
    blocks: [
      {
        t: 'p',
        v: '分支列表现在直接从 Steamworks 后台读（需要 Web API 密钥）；没密钥时只显示本机写过的分支。vdf 里的 SetLive 写哪个分支名，那次构建就进哪个分支。'
      },
      {
        t: 'note',
        v: 'SetLive 留空 = 不设分支：构建只生成，不会自动上任何分支（包括 default）。default 分支要在后台网页上手动设 live。'
      }
    ]
  }
]

const shown = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k) return SECTIONS
  return SECTIONS.filter((s) => {
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
  <div class="p-5 flex flex-col gap-4 min-w-0 max-w-[880px]">
    <div class="card p-4 flex items-center gap-3" v-reveal>
      <BookOpen :size="20" :stroke-width="1.8" class="text-accent shrink-0" />
      <div class="min-w-0">
        <h1 class="text-lead font-semibold m-0">使用手册</h1>
        <p class="mt-1 mb-0 text-label text-faint">每个按钮是干什么的、怎么开始。</p>
      </div>
      <input
        v-model="q"
        placeholder="搜…"
        class="ml-auto w-[180px] h-9 px-3 rounded-input bg-surface border border-line text-label outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
      />
      <button class="btn no-drag shrink-0" title="从头走一遍设置流程" @click="startOnboard">
        <GraduationCap :size="14" :stroke-width="1.9" />
        新手教程
      </button>
    </div>

    <div
      v-for="(sec, i) in shown"
      :key="sec.id"
      class="card px-5 py-4"
      v-reveal="{ delay: Math.min(i * 0.03, 0.18) }"
    >
      <h2 class="text-copy font-semibold m-0 mb-3.5">{{ sec.title }}</h2>

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
          <div v-for="(pair, k) in b.v" :key="k" class="grid grid-cols-[110px_1fr] gap-x-5 items-baseline">
            <span class="text-body text-ink font-medium">{{ pair[0] }}</span>
            <span class="text-body text-muted leading-[1.75]">{{ pair[1] }}</span>
          </div>
        </div>

        <div
          v-else-if="b.t === 'note'"
          class="mt-1.5 mb-2 rounded-input border border-[rgba(102,192,244,.22)] bg-[rgba(102,192,244,.05)] px-3.5 py-2.5 text-body text-accent leading-[1.7]"
        >
          {{ b.v }}
        </div>
      </template>
    </div>

    <div v-if="!shown.length" class="card p-8 text-center text-body text-faint">
      没有匹配「{{ q }}」的章节。
    </div>

    <div class="card p-4 flex items-center gap-3" v-reveal>
      <div class="min-w-0">
        <div class="text-body text-ink">完整文档在仓库里</div>
        <div class="mt-0.5 text-label text-faint">中文和 English README 内容更全，含已知限制和开发说明。</div>
      </div>
      <div class="ml-auto flex items-center gap-2 shrink-0">
        <button class="btn no-drag" @click="openRepo">
          <ExternalLink :size="14" :stroke-width="1.9" />
          打开 README
        </button>
        <button class="btn no-drag" @click="goSettings">去设置</button>
      </div>
    </div>
  </div>
</template>
