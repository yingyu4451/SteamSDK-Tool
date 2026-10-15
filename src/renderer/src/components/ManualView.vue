<script setup>
import { ref, computed } from 'vue'
import { state, goSettings } from '../store.js'
import { ExternalLink, BookOpen } from '@lucide/vue'

/* 手册纯静态内容。
   写成数据而不是一大坨模板：改文案不用碰结构，加一节只是多一个数组元素。 */

const q = ref('')

const SECTIONS = [
  {
    id: 'what',
    title: '这个工具是干什么的',
    blocks: [
      {
        t: 'p',
        v: 'SteamPipe 上传本身不难，难的是它散在 vdf 脚本、steamcmd、后台网页三处，而且出错时只说「失败了」。'
      },
      {
        t: 'p',
        v: '这个工作台把三者放进一个窗口：左边列 App，中间是那个 App 的 Depot 和构建输出，构建直接在界面里跑，日志逐行流回来。'
      }
    ]
  },
  {
    id: 'concepts',
    title: '三个词，先分清楚',
    blocks: [
      {
        t: 'dl',
        v: [
          ['App', 'Steam 上的一个「产品」，用 AppID 标识。Demo、正式版、Playtest 是三个不同的 App，各有各的 AppID。'],
          ['Depot', '一个 App 下面的一个内容包，用 DepotID 标识。Windows 一个、macOS 一个、Linux 一个 —— 一个平台一个 Depot。'],
          ['项目文件夹', '你电脑上放构建产物的目录，比如 D:\\SteamBuilds\\AbyaDemo。它下面按平台分子目录（win64、macos），每个子目录绑一个 Depot。']
        ]
      },
      {
        t: 'note',
        v: '这三个 ID 全都只在 Steamworks 后台看得见。工具能读回来后两个，但写不回去 —— 后台的 App 和 Depot 得你自己建。'
      }
    ]
  },
  {
    id: 'first',
    title: '第一次用：从零到能上传',
    blocks: [
      {
        t: 'ol',
        v: [
          '设置里填 Steam 账号密码（就是平时用 steamcmd 上传的那个账号）。密码用 Windows 的 DPAPI 加密后存本地，只有你这台机器上的这个 Windows 用户能解开。',
          '点侧栏的 ＋ 新建 App：填个本地名字、填后台的 AppID。如果后台已经建过 Depot，点「读取后台 Depot」会把真实 DepotID 拉回来，比照着 AppID+1 猜准。',
          '内容目录填你 Unity 打包的输出目录。工具会立刻把这个目录建出来。',
          '先把 Unity 打包面板的输出目录设成同一个路径（输出模式选 DirectFolder），以后打包完就不用再复制到任何地方。',
          '点「检查配置」确认 vdf 没问题，再点「Preview 空跑」走一遍完整流程但不上传。都没问题，再「正式上传」。'
        ]
      }
    ]
  },
  {
    id: 'buttons',
    title: '工具条上那几个按钮',
    blocks: [
      {
        t: 'dl',
        v: [
          ['检查配置', '跑 check.ps1。核对 vdf 里的 AppID / DepotID / 内容目录 / 排除规则，以及 depot 脚本之间对不对得上。不看实际文件，很快。'],
          ['检查文件', '扫一遍真正会被上传的文件，找非法字符、超长路径、大小写冲突、符号链接、macOS 的 .app bundle。配置没问题但文件有问题时，只有这一关能发现。'],
          ['Preview 空跑', '完整走一遍构建，但一个字节都不传到 Steam。会生成 manifest 让你看清到底会上传什么。'],
          ['正式上传', '真上传。要点两次才生效 —— 第一次按钮变红，第二次才真的跑。'],
          ['同步 Depot', '读后台这个 App 下的 Depot 列表，勾上就把本地没有的补进 scripts。不需要管理员权限，走的是 steamcmd。'],
          ['本地服务器', '把内容指到本地 ContentServer，Steam 客户端会直接从你机器读，不用先上传就能试。']
        ]
      },
      {
        t: 'note',
        v: '「检查配置」查的是配置，「检查文件」查的是文件。两个都要跑 —— 上传失败最常见的原因就是配置对、但路径里有问题。'
      }
    ]
  },
  {
    id: 'daily',
    title: '日常：改完包怎么传',
    blocks: [
      {
        t: 'ol',
        v: [
          'Unity 打包到一个平台子目录（比如 win64）。',
          '回工作台，点「检查文件」看有没有问题。',
          '点「Preview 空跑」，确认 manifest 里没有多出来的东西。',
          '点「正式上传」，点两次。',
          '上传完控制台顶部会出现「打开构建页」，去后台把这次构建设为 live。'
        ]
      },
      {
        t: 'note',
        v: '也可以直接把打包出来的文件夹拖进窗口 —— 工具会认平台、告诉你该放进哪个 Depot，没有就现场建一个。'
      }
    ]
  },
  {
    id: 'exclude',
    title: '什么不该传上去',
    blocks: [
      {
        t: 'p',
        v: '每个 Depot 都有自己的排除规则（vdf 里的 FileExclusion），在 Depot 卡片下面的「编辑」里改。默认已经挡掉了几类：'
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
        v: '玩家存档（Progress、Settings 这类运行时会改的文件）走另一条路：在 Depot 编辑里加进「存档保护」。加了之后 Steam 更新时不会覆盖玩家改过的那个文件。'
      }
    ]
  },
  {
    id: 'branch',
    title: '分支和 SetLive',
    blocks: [
      {
        t: 'p',
        v: '分支必须在 Steamworks 后台先建好，本地读不到列表。vdf 里的 SetLive 写哪个分支名，那次构建就进哪个分支。'
      },
      {
        t: 'note',
        v: 'SetLive 不能写 default —— default 分支要在后台网页上手动设 live。'
      }
    ]
  },
  {
    id: 'trouble',
    title: '出问题了往哪看',
    blocks: [
      {
        t: 'dl',
        v: [
          ['界面里没反应', '看右边「构建输出」，每一行都是原样流回来的。上传失败的原因通常就在最后几行。'],
          ['想知道历史上传了什么', '侧栏「构建历史」，按 App 筛，或者在 groups 里按名字搜。'],
          ['上传失败但看不出为什么', '去 output 目录找那次的 .log，工具的「构建目录」按钮能直接打开。'],
          ['提示密码不对', '设置里重新存一次。Steam Guard 要的是当时那个验证码，不是固定密码。'],
          ['怀疑 vdf 有问题', '用「用系统编辑器打开」直接看文件本身。工具编辑 vdf 时是行级替换，不会动你手写的注释。']
        ]
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
  window.api.shell.openExternal('https://github.com/yingyu4451/SteamSDK-Tool#readme')
}
</script>

<template>
  <div class="p-5 flex flex-col gap-4 min-w-0 max-w-[880px]">
    <div class="card p-4 flex items-center gap-3" v-reveal>
      <BookOpen :size="20" :stroke-width="1.8" class="text-accent shrink-0" />
      <div class="min-w-0">
        <h1 class="text-[15px] font-semibold m-0">使用手册</h1>
        <p class="mt-1 mb-0 text-[11.5px] text-faint">
          从第一次配置到出错排查。下面每一节都可以直接搜。
        </p>
      </div>
      <input
        v-model="q"
        placeholder="搜…"
        class="ml-auto w-[180px] h-8 px-3 rounded-[9px] bg-surface border border-line text-[12px] outline-none focus:border-[rgba(102,192,244,.45)] placeholder:text-faint"
      />
    </div>

    <div
      v-for="(sec, i) in shown"
      :key="sec.id"
      class="card p-4"
      v-reveal="{ delay: Math.min(i * 0.03, 0.18) }"
    >
      <h2 class="text-[13.5px] font-semibold m-0 mb-2.5">{{ sec.title }}</h2>

      <template v-for="(b, j) in sec.blocks" :key="j">
        <p v-if="b.t === 'p'" class="m-0 mb-2 text-[12.5px] text-muted leading-relaxed">
          {{ b.v }}
        </p>

        <ul v-else-if="b.t === 'ul'" class="m-0 mb-2 pl-4 flex flex-col gap-1.5">
          <li v-for="(x, k) in b.v" :key="k" class="text-[12.5px] text-muted leading-relaxed">
            {{ x }}
          </li>
        </ul>

        <ol v-else-if="b.t === 'ol'" class="m-0 mb-2 pl-5 flex flex-col gap-2 list-decimal">
          <li v-for="(x, k) in b.v" :key="k" class="text-[12.5px] text-muted leading-relaxed">
            {{ x }}
          </li>
        </ol>

        <div v-else-if="b.t === 'dl'" class="m-0 mb-2 flex flex-col gap-2">
          <div v-for="(pair, k) in b.v" :key="k" class="grid grid-cols-[92px_1fr] gap-3 items-baseline">
            <span class="text-[12px] text-ink font-medium">{{ pair[0] }}</span>
            <span class="text-[12.5px] text-muted leading-relaxed">{{ pair[1] }}</span>
          </div>
        </div>

        <div
          v-else-if="b.t === 'note'"
          class="mt-1 mb-1 rounded-[9px] border border-[rgba(102,192,244,.22)] bg-[rgba(102,192,244,.05)] px-3 py-2 text-[12px] text-accent/90 leading-relaxed"
        >
          {{ b.v }}
        </div>
      </template>
    </div>

    <div v-if="!shown.length" class="card p-8 text-center text-[12.5px] text-faint">
      没有匹配「{{ q }}」的章节。
    </div>

    <div class="card p-4 flex items-center gap-3" v-reveal>
      <div class="min-w-0">
        <div class="text-[12.5px] text-ink">完整文档在仓库里</div>
        <div class="mt-0.5 text-[11.5px] text-faint">
          中文 README 和 English README 内容更全，含已知限制和开发说明。
        </div>
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
