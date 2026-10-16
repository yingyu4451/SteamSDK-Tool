/**
 * 极简 Valve KeyValues (VDF) 解析器。
 *
 * 只做读取，不做序列化 —— 写回 VDF 一律用定点行替换（见 sdk.js 的 setAppField），
 * 这样文件里的注释和格式不会在保存时被抹掉。
 *
 * 关键点：VDF 允许同一个 key 出现多次（FileExclusion 就是），
 * 所以节点模型用「有序 entries 数组」而不是普通对象，重复键不会被吞掉。
 */

const WHITESPACE = new Set([' ', '\t', '\r', '\n', '\uFEFF'])

function tokenize(src) {
  const tokens = []
  let i = 0
  const n = src.length

  while (i < n) {
    const c = src[i]

    if (WHITESPACE.has(c)) {
      i++
      continue
    }

    // 行注释
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }

    if (c === '{' || c === '}') {
      tokens.push({ t: c })
      i++
      continue
    }

    if (c === '"') {
      i++
      let s = ''
      while (i < n && src[i] !== '"') {
        // Valve 自己的脚本里就写着 D:\content\depot1002 这种单反斜杠路径，
        // 所以只有 \\ 和 \" 才算转义序列，其余 \x 原样保留。
        if (src[i] === '\\' && (src[i + 1] === '\\' || src[i + 1] === '"')) {
          s += src[i + 1]
          i += 2
          continue
        }
        s += src[i]
        i++
      }
      i++ // 跳过收尾引号
      tokens.push({ t: 'str', v: s })
      continue
    }

    // 容忍未加引号的裸 token
    let s = ''
    while (i < n && !WHITESPACE.has(src[i]) && src[i] !== '"' && src[i] !== '{' && src[i] !== '}') {
      s += src[i]
      i++
    }
    if (s) tokens.push({ t: 'str', v: s })
    else i++
  }

  return tokens
}

function parseObject(tokens, pos) {
  const entries = []

  while (pos < tokens.length) {
    const tk = tokens[pos]

    if (tk.t === '}') {
      return { node: { type: 'object', entries }, pos: pos + 1 }
    }

    if (tk.t !== 'str') {
      pos++
      continue
    }

    const key = tk.v
    pos++
    const next = tokens[pos]

    if (next && next.t === '{') {
      const inner = parseObject(tokens, pos + 1)
      entries.push({ key, value: inner.node })
      pos = inner.pos
    } else if (next && next.t === 'str') {
      entries.push({ key, value: next.v })
      pos++
    } else {
      entries.push({ key, value: '' })
    }
  }

  return { node: { type: 'object', entries }, pos }
}

/** 解析 VDF 文本 -> 根块 */
export function parseVdf(text) {
  const tokens = tokenize(String(text ?? ''))
  const root = parseObject(tokens, 0).node

  // VDF 文档惯例：整个文件包在一个根键里
  //   "AppBuild" { ... }   /   "DepotBuildConfig" { ... }
  // 直接把根键的内容返回，调用方就不必每次多查一层。
  if (root.entries.length === 1 && root.entries[0].value?.type === 'object') {
    return root.entries[0].value
  }
  return root
}

/** 取第一个同名 key 的值（字符串或子节点），没有则返回 undefined */
export function get(node, key) {
  if (!node || node.type !== 'object') return undefined
  const found = node.entries.find((e) => e.key.toLowerCase() === String(key).toLowerCase())
  return found ? found.value : undefined
}

/** 取某个 key 的字符串值，非字符串返回 fallback */
export function getString(node, key, fallback = '') {
  const v = get(node, key)
  return typeof v === 'string' ? v : fallback
}

/** 取所有同名 key 的字符串值（FileExclusion 会有多个） */
export function getAllStrings(node, key) {
  if (!node || node.type !== 'object') return []
  const k = String(key).toLowerCase()
  return node.entries
    .filter((e) => e.key.toLowerCase() === k && typeof e.value === 'string')
    .map((e) => e.value)
}

/** 取子节点（块），没有则返回 undefined */
export function getBlock(node, key) {
  const v = get(node, key)
  return v && v.type === 'object' ? v : undefined
}

/**
 * 把某个块里的 "key" "value" 对拍平成数组。
 * 用于读 Depots 块 —— 形如 "1234561" "depot_1234561_win64.vdf"。
 */
export function pairs(block) {
  if (!block || block.type !== 'object') return []
  return block.entries
    .filter((e) => typeof e.value === 'string')
    .map((e) => ({ key: e.key, value: e.value }))
}
