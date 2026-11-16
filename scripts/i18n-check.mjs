#!/usr/bin/env node
/**
 * 中英文案自检。
 *
 *   node scripts/i18n-check.mjs
 *
 * 检查三件事：
 *   1. 代码里 `t('中文原文')` 出现的每一条，en 字典里都要有对应英文（缺失 = 英文界面会显示中文）；
 *   2. 除了 `t()` 的参数和注释，源码里不该再剩中文字符（剩下 = 英文界面会露中文）；
 *   3. en 字典里没有用到的词条、以及两个文件翻译得不一致的词条（提示性警告）。
 *
 * 纯开发者日志、要匹配外部进程输出的中文串等确实不能翻的地方，在那一行写
 * `// i18n-ignore` 豁免（整行跳过）。
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EN_DIR = join(ROOT, 'src/shared/i18n/en')
const SCAN_DIRS = ['src/main', 'src/preload', 'src/renderer']
const SCAN_FILES = ['src/renderer/index.html']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'release'])
const SKIP_FILES = new Set(['src/shared/i18n/en/index.js', 'src/shared/i18n/core.js', 'src/shared/i18n/index.js'])

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const CJK_ALL = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g

/* ------------------------------------------------------------------ 扫描源码 */

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(join(ROOT, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const rel = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(rel, out)
    } else if (/\.(js|mjs|cjs|vue|html)$/.test(e.name)) {
      out.push(rel)
    }
  }
  return out
}

function normalize(rel) {
  return rel.split(sep).join('/')
}

class Scanner {
  constructor(text) {
    this.text = text
    this.masked = [...text]
    this.starts = [0]
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') this.starts.push(i + 1)
    this.keys = []
    this.hits = [] // 掩码后仍残留中文的位置
  }

  line(index) {
    let lo = 0
    let hi = this.starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.starts[mid] <= index) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  blank(from, to) {
    for (let k = from; k < to && k < this.masked.length; k++) {
      if (this.masked[k] !== '\n') this.masked[k] = ' '
    }
  }

  /** 读完一个字符串字面量，返回 { end, value, closed } */
  readString(start) {
    const quote = this.text[start]
    let i = start + 1
    let value = ''
    while (i < this.text.length) {
      const c = this.text[i]
      if (c === '\\') {
        const next = this.text[i + 1]
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next ?? ''
        i += 2
        continue
      }
      if (c === quote) return { end: i, value, closed: true }
      if (quote !== '`' && c === '\n') return { end: i, value, closed: false }
      value += c
      i++
    }
    return { end: this.text.length - 1, value, closed: false }
  }

  /**
   * 引号前面紧挨着的是不是「这里是词条」的裸调用。
   *
   *   t('…')        —— 常规翻译
   *   problem('…')  —— 主进程 sdk.js 的待处理问题，key 由界面用 problemLabel() 翻译，
   *                    它的中文也是词条，不该再被算成「没迁移的中文」
   */
  isTranslateCall(quoteIndex) {
    let i = quoteIndex - 1
    while (i >= 0 && /\s/.test(this.text[i])) i--
    if (this.text[i] !== '(') return false
    i--
    while (i >= 0 && /\s/.test(this.text[i])) i--
    const end = i
    while (i >= 0 && /[A-Za-z0-9_$]/.test(this.text[i])) i--
    const name = this.text.slice(i + 1, end + 1)
    if (name !== 't' && name !== 'problem') return false
    const before = this.text[i]
    return !(before && /[A-Za-z0-9_$.]/.test(before))
  }

  /** 把 [from,to) 当 JS 扫：注释、字符串、t() 调用 */
  scanCode(from = 0, to = this.text.length) {
    let i = from
    while (i < to) {
      const c = this.text[i]

      if (c === '/' && this.text[i + 1] === '/') {
        const end = this.text.indexOf('\n', i)
        const stop = end === -1 || end > to ? to : end
        this.blank(i, stop)
        i = stop
        continue
      }

      if (c === '/' && this.text[i + 1] === '*') {
        const end = this.text.indexOf('*/', i + 2)
        const stop = end === -1 || end + 2 > to ? to : end + 2
        this.blank(i, stop)
        i = stop
        continue
      }

      if (c === '"' || c === "'" || c === '`') {
        const isKey = this.isTranslateCall(i)
        const { end, value, closed } = this.readString(i)
        const stop = Math.min(closed ? end + 1 : end, to)
        if (isKey) {
          this.keys.push({
            key: value,
            line: this.line(i),
            dynamic: c === '`' && value.includes('${')
          })
          // t() 的中文是「已翻译」的，掩掉
          this.blank(i, stop)
        }
        // 不是 t() 的字符串：内容留着，剩下的中文会被当成「还没走 t()」
        i = stop
        continue
      }

      i++
    }
  }

  /** Vue 模板：掩掉注释、标签本身和属性值，属性值当表达式再扫一遍 */
  scanTemplate(from, to) {
    const attrValues = []
    let i = from
    while (i < to) {
      const c = this.text[i]

      // <!-- 注释 -->
      if (c === '<' && this.text[i + 1] === '!' && this.text[i + 2] === '-' && this.text[i + 3] === '-') {
        const end = this.text.indexOf('-->', i + 4)
        const stop = end === -1 || end + 3 > to ? to : end + 3
        this.blank(i, stop)
        i = stop
        continue
      }

      // 标签：整段隐掉，属性值单独记下来
      if (c === '<' && /[A-Za-z/]/.test(this.text[i + 1] || '')) {
        const tagStart = i
        let j = i + 1
        while (j < to) {
          const d = this.text[j]
          if (d === '>') {
            j++
            break
          }
          if (d === '"' || d === "'") {
            const { end, closed } = this.readString(j)
            const stop = Math.min(closed ? end + 1 : end, to)
            if (closed) attrValues.push([j + 1, end])
            this.blank(j, stop)
            j = stop
            continue
          }
          j++
        }
        this.blank(tagStart, j)
        i = j
        continue
      }

      i++
    }
    // 属性值里可能是表达式（:title="t('关 闭')"），当代码扫一遍
    for (const [start, end] of attrValues) this.scanCode(start, end)
  }

  finish(ignoredLines) {
    const flat = this.masked.join('')
    const violations = []
    const seen = new Set()
    CJK_ALL.lastIndex = 0
    let m
    while ((m = CJK_ALL.exec(flat))) {
      const line = this.line(m.index)
      if (ignoredLines.has(line) || seen.has(line)) continue
      seen.add(line)
      violations.push({ line, text: (this.text.split('\n')[line - 1] || '').trim().slice(0, 200) })
    }
    return { keys: this.keys, violations: violations.sort((a, b) => a.line - b.line) }
  }
}

/** 找出 .vue 里最外层 <template> 的范围。
 *  不能用正则数嵌套层数：模板里偶有被折行的 `</template\n>`，而且 <template v-if>
 *  这些自闭合/不闭合写法都合法。最外层一定是第一个 <template 和最后一个 </template。 */
function templateRange(text) {
  const openStart = text.indexOf('<template')
  if (openStart === -1) return null
  const openEnd = text.indexOf('>', openStart)
  if (openEnd === -1) return null
  const closeStart = text.lastIndexOf('</template')
  if (closeStart <= openEnd) return null
  return [openEnd + 1, closeStart]
}

function analyze(text) {
  const scanner = new Scanner(text)
  const ignoredLines = new Set()
  text.split('\n').forEach((line, idx) => {
    if (line.includes('i18n-ignore')) ignoredLines.add(idx + 1)
  })

  // <style> 整段不参与（里面只有 CSS 和注释）
  const styleRe = /<style[^>]*>[\s\S]*?<\/style>/g
  let sm
  while ((sm = styleRe.exec(text))) scanner.blank(sm.index, sm.index + sm[0].length)

  const range = templateRange(text)
  if (range) scanner.scanTemplate(range[0], range[1])
  // 剩下的（script、文本节点、{{ }}）统一按代码扫
  scanner.scanCode(0, text.length)

  return scanner.finish(ignoredLines)
}

/* -------------------------------------------------------------- 读取 en 字典 */

/** en 领域文件只有一句 `export default {...}`，去掉前缀直接求值 */
async function loadEnModule(file) {
  const src = await readFile(file, 'utf8')
  const body = src.replace(/^\s*export\s+default\s*/m, '')
  if (body === src) throw new Error(`${file} 里没有 export default`)
  const expr = body.replace(/;\s*$/, '')
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict"; return (${expr})`)()
}

async function loadDictionary() {
  const files = (await readdir(EN_DIR)).filter((f) => f.endsWith('.js') && f !== 'index.js').sort()
  const merged = new Map()
  const conflicts = []
  const errors = []
  for (const file of files) {
    let mod
    try {
      mod = await loadEnModule(join(EN_DIR, file))
    } catch (err) {
      errors.push(`${file}: 解析失败（${err.message}）`)
      continue
    }
    for (const [key, value] of Object.entries(mod || {})) {
      if (typeof value !== 'string') {
        errors.push(`${file}: 词条 "${key}" 的值不是字符串`)
        continue
      }
      if (CJK.test(value)) errors.push(`${file}: 译文里还有中文 → "${key}" = "${value}"`)
      if (merged.has(key)) {
        const prev = merged.get(key)
        if (prev.value !== value) conflicts.push({ key, kept: prev.file, dropped: file })
        continue
      }
      merged.set(key, { value, file })
    }
  }
  return { merged, conflicts, errors }
}

/* -------------------------------------------------------------------- 主流程 */

// 调试单个文件：node scripts/i18n-check.mjs --dump <相对路径>
const dumpIndex = process.argv.indexOf('--dump')
if (dumpIndex !== -1) {
  const target = normalize(process.argv[dumpIndex + 1] || '')
  const text = await readFile(join(ROOT, target), 'utf8')
  const scanner = new Scanner(text)
  const ignored = new Set()
  text.split('\n').forEach((line, idx) => {
    if (line.includes('i18n-ignore')) ignored.add(idx + 1)
  })
  const styleRe = /<style[^>]*>[\s\S]*?<\/style>/g
  let sm
  while ((sm = styleRe.exec(text))) scanner.blank(sm.index, sm.index + sm[0].length)
  const range = templateRange(text)
  console.log('templateRange =', range)
  if (range) scanner.scanTemplate(range[0], range[1])
  scanner.scanCode(0, text.length)
  const { keys, violations } = scanner.finish(ignored)
  console.log(`keys ${keys.length}, violations ${violations.length}`)
  const lines = text.split('\n')
  for (const v of violations.slice(0, 25)) {
    const masked = scanner.masked.join('').split('\n')[v.line - 1] || ''
    console.log(`\n--- 行 ${v.line}`)
    console.log('原文: ' + (lines[v.line - 1] || '').slice(0, 160))
    console.log('掩码: ' + masked.slice(0, 160))
  }
  process.exit(0)
}

const files = []
for (const dir of SCAN_DIRS) await walk(dir, files)
files.push(...SCAN_FILES)
const scanned = files.map(normalize).filter((f) => !SKIP_FILES.has(f))

const used = new Map()
const violations = []

for (const rel of scanned) {
  let text
  try {
    text = await readFile(join(ROOT, rel), 'utf8')
  } catch {
    continue
  }
  const { keys, violations: bad } = analyze(text)
  for (const k of keys) {
    if (!used.has(k.key)) used.set(k.key, [])
    used.get(k.key).push({ file: rel, line: k.line, dynamic: k.dynamic })
  }
  for (const v of bad) violations.push({ file: rel, ...v })
}

const { merged, conflicts, errors: dictErrors } = await loadDictionary()

const dynamic = []
for (const [key, places] of used) {
  if (places.some((p) => p.dynamic)) dynamic.push({ key, file: places[0].file, line: places[0].line })
}

const missing = []
for (const [key, places] of used) {
  if (key.includes('${')) continue
  if (!merged.has(key)) missing.push({ key, file: places[0].file, line: places[0].line })
}

const unused = []
for (const [key, meta] of merged) if (!used.has(key)) unused.push({ key, file: meta.file })

console.log(`扫描 ${scanned.length} 个文件，t() 文案 ${used.size} 条，en 字典 ${merged.size} 条。`)

const show = (list, limit = 60) => (process.argv.includes('--all') ? list : list.slice(0, limit))

if (dynamic.length) {
  console.log(`\n✗ 动态拼接的 t()（运行时查不到字典，改成 {参数}）: ${dynamic.length} 条`)
  for (const d of show(dynamic)) console.log(`   ${d.file}:${d.line}  ${d.key}`)
}

if (missing.length) {
  console.log(`\n✗ 缺英文词条: ${missing.length} 条`)
  for (const m of show(missing)) console.log(`   ${m.file}:${m.line}  「${m.key}」`)
}

if (violations.length) {
  console.log(`\n✗ 仍未走 t() 的中文: ${violations.length} 处`)
  for (const v of show(violations)) console.log(`   ${v.file}:${v.line}  ${v.text}`)
}

if (dictErrors.length) {
  console.log(`\n✗ 字典问题: ${dictErrors.length} 条`)
  for (const e of dictErrors) console.log(`   ${e}`)
}

if (conflicts.length) {
  console.log(`\n⚠ 词条重复且译文不一致: ${conflicts.length} 条`)
  for (const c of conflicts) console.log(`   「${c.key}」 ${c.kept} vs ${c.dropped}`)
}

if (unused.length) {
  console.log(`\n⚠ 没被用到的词条: ${unused.length} 条（多余，或 key 拼错）`)
  for (const u of show(unused, 60)) console.log(`   「${u.key}」 来自 en/${u.file}`)
}

const failing = dynamic.length + missing.length + violations.length + dictErrors.length

// 按文件汇总：几个人分头翻的时候看这张表就知道谁还没做完
if (violations.length || missing.length) {
  const byFile = new Map()
  for (const v of violations) byFile.set(v.file, (byFile.get(v.file) || 0) + 1)
  const rows = [...byFile.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n按文件剩余: ${rows.length} 个文件`)
  for (const [file, n] of rows) console.log(`   ${String(n).padStart(4)}  ${file}`)
}

if (failing === 0) {
  const note = unused.length + conflicts.length ? `（另有 ${unused.length + conflicts.length} 条警告）` : ''
  console.log(`\n✓ 文案检查通过${note}`)
  process.exit(0)
}
console.log(`\n共 ${failing} 个问题需要修。`)
process.exit(1)
