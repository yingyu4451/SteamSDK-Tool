/**
 * 生成应用图标（build/icon.png 256x256 + build/icon.ico）。
 * 不依赖任何图形库：手写 PNG（zlib + CRC32）和 BMP(DIB)，再拼成 ICO 容器。
 *
 *   node scripts/make-icon.mjs
 *
 * 图形：Steam 蓝底 + 等距立方体（depot / 内容箱）+ 从箱子里升起的上传箭头。
 * 箭头先画、箱子后压上去，看起来就是「把内容推进 Depot 里再传上去」。
 *
 * ICO 里放 7 个尺寸（16/24/32/48/64/128/256）：
 * taskbar、Alt+Tab、资源管理器小图标各用各的尺寸，只放一个 256 会让
 * Windows 自己去缩，缩出来的小图会糊。256 用 PNG 负载，其余用 BMP(DIB)
 * —— shell 对小尺寸的 PNG 条目支持历来不稳，BMP 最保险。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const BASE = 256
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const OUT_DIR = path.resolve('build')

/* ---------------- PNG 编码 ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // 每行前面加一个 filter 字节 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------------- BMP(DIB) 编码（ICO 里的小尺寸用） ---------------- */

/** 32 位 BGRA + 全 0 的 AND 掩码；行序自下而上，这是 ICO 内 BMP 的规矩 */
function encodeDib(rgba, size) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // biSize
  header.writeInt32LE(size, 4) // biWidth
  header.writeInt32LE(size * 2, 8) // biHeight = XOR 高 + AND 高
  header.writeUInt16LE(1, 12) // biPlanes
  header.writeUInt16LE(32, 14) // biBitCount
  header.writeUInt32LE(0, 16) // biCompression = BI_RGB

  const xorStride = size * 4
  const xor = Buffer.alloc(xorStride * size)
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * xorStride // 自下而上
    for (let x = 0; x < size; x++) {
      const s = src + x * 4
      const d = y * xorStride + x * 4
      xor[d] = rgba[s + 2] // B
      xor[d + 1] = rgba[s + 1] // G
      xor[d + 2] = rgba[s] // R
      xor[d + 3] = rgba[s + 3] // A
    }
  }

  const andStride = Math.ceil(size / 32) * 4 // 1bpp，每行补到 4 字节
  const and = Buffer.alloc(andStride * size) // 全 0 = 「不透明」，透明度交给 alpha

  header.writeUInt32LE(xor.length + and.length, 20) // biSizeImage

  return Buffer.concat([header, xor, and])
}

/* ---------------- 画图工具 ---------------- */

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const mix = (a, b, t) => a + (b - a) * t

/** 圆角矩形覆盖度（带 1px 抗锯齿） */
function roundRectCoverage(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  const dx = x - cx
  const dy = y - cy
  const d = Math.sqrt(dx * dx + dy * dy)
  return clamp01(radius - d + 0.5)
}

/** 点是否在三角形内（重心法），返回 0/1 */
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax
  const v0y = cy - ay
  const v1x = bx - ax
  const v1y = by - ay
  const v2x = px - ax
  const v2y = py - ay
  const d00 = v0x * v0x + v0y * v0y
  const d01 = v0x * v1x + v0y * v1y
  const d02 = v0x * v2x + v0y * v2y
  const d11 = v1x * v1x + v1y * v1y
  const d12 = v1x * v2x + v1y * v2y
  const denom = d00 * d11 - d01 * d01
  if (Math.abs(denom) < 1e-9) return 0
  const u = (d11 * d02 - d01 * d12) / denom
  const v = (d00 * d12 - d01 * d02) / denom
  return u >= 0 && v >= 0 && u + v <= 1 ? 1 : 0
}

/** 凸四边形：拆成两个三角形 */
function inQuad(px, py, p) {
  return (
    inTriangle(px, py, p[0], p[1], p[2], p[3], p[4], p[5]) ||
    inTriangle(px, py, p[0], p[1], p[4], p[5], p[6], p[7])
  )
}

/* ---------------- 图形 ---------------- */

// Steam 的蓝
const BG_TOP = [0x2f, 0x51, 0x6e]
const BG_BOT = [0x12, 0x1a, 0x24]
const RIM = [0x66, 0xc0, 0xf4]

const CUBE_TOP = [0x8f, 0xd4, 0xfa] // 顶面最亮
const CUBE_LEFT = [0x3f, 0x92, 0xc9] // 左面中间
const CUBE_RIGHT = [0x24, 0x5c, 0x8c] // 右面最暗
const ARROW = [0xea, 0xf6, 0xff]

/* 写进 Buffer 前必须收口：NaN 会被 Buffer 静默写成 0（曾经因为少写两个逗号，
 * ARROW 变成单元素数组 → g/b 变 NaN → 箭头渲染成纯红，很难看出是数据问题）。 */
const byte = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0)

/** 按目标尺寸画一张 RGBA 图。几何坐标按 size/256 缩放，小尺寸多超采样一点。 */
function render(size) {
  const k = size / BASE
  const SS = size <= 32 ? 8 : 4
  const px = Buffer.alloc(size * size * 4)

  /** 4x4（或 8x8）超采样，边缘平滑很多（图标缩到 16px 也不毛） */
  function cover(fn, x, y) {
    let hit = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        hit += fn(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
      }
    }
    return hit / (SS * SS)
  }

  // 等距立方体：顶面中心 (128,118)，半宽 58，菱形半高 34，侧面下沉 50
  const C = { x: 128 * k, y: 118 * k, hw: 58 * k, hh: 34 * k, drop: 50 * k }
  const topC = [C.x, C.y]
  const topR = [C.x + C.hw, C.y + C.hh]
  const topB = [C.x, C.y + C.hh * 2]
  const topL = [C.x - C.hw, C.y + C.hh]
  const botL = [topL[0], topL[1] + C.drop]
  const botB = [topB[0], topB[1] + C.drop]
  const botR = [topR[0], topR[1] + C.drop]

  const FACE_TOP = [...topC, ...topR, ...topB, ...topL]
  const FACE_LEFT = [...topL, ...topB, ...botB, ...botL]
  const FACE_RIGHT = [...topB, ...topR, ...botR, ...botB]

  // 箭头：杆 + 三角头，画在箱子下面，被箱子盖住下半截
  const SHAFT = [119 * k, 40 * k, 137 * k, 150 * k]
  const HEAD = [96 * k, 74 * k, 160 * k, 74 * k, 128 * k, 22 * k]

  const inArrow = (x, y) =>
    (x >= SHAFT[0] && x < SHAFT[2] && y >= SHAFT[1] && y < SHAFT[3] ? 1 : 0) ||
    inTriangle(x, y, HEAD[0], HEAD[1], HEAD[2], HEAD[3], HEAD[4], HEAD[5])

  const radius = 54 * k
  const rimY = 3 * k
  const rimSize = size - 6 * k
  const rimRadius = 51 * k
  const glowCx = 92 * k
  const glowCy = 40 * k
  const glowR = 210 * k

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4

      const bg = cover((qx, qy) => roundRectCoverage(qx, qy, size, radius), x, y)
      if (bg <= 0) continue

      const t = y / (size - 1)
      let r = mix(BG_TOP[0], BG_BOT[0], t)
      let g = mix(BG_TOP[1], BG_BOT[1], t)
      let b = mix(BG_TOP[2], BG_BOT[2], t)

      // 顶部一盏冷光，让图标不是死板的纯渐变
      const glow = clamp01(1 - Math.hypot(x - glowCx, y - glowCy) / glowR) ** 2
      r = mix(r, RIM[0], glow * 0.16)
      g = mix(g, RIM[1], glow * 0.16)
      b = mix(b, RIM[2], glow * 0.16)

      // 1px 内描边
      const inner = bg - cover((qx, qy) => roundRectCoverage(qx, qy - rimY, rimSize, rimRadius), x + rimY, y)
      const rim = clamp01(inner) * 0.3
      r = mix(r, RIM[0], rim)
      g = mix(g, RIM[1], rim)
      b = mix(b, RIM[2], rim)

      // 箭头
      const a = cover(inArrow, x, y)
      if (a > 0) {
        r = mix(r, ARROW[0], a)
        g = mix(g, ARROW[1], a)
        b = mix(b, ARROW[2], a)
      }

      // 箱子压在最上面
      const ft = cover((qx, qy) => inQuad(qx, qy, FACE_TOP), x, y)
      const fl = cover((qx, qy) => inQuad(qx, qy, FACE_LEFT), x, y)
      const fr = cover((qx, qy) => inQuad(qx, qy, FACE_RIGHT), x, y)

      if (ft > 0) {
        r = mix(r, CUBE_TOP[0], ft)
        g = mix(g, CUBE_TOP[1], ft)
        b = mix(b, CUBE_TOP[2], ft)
      }
      if (fl > 0) {
        r = mix(r, CUBE_LEFT[0], fl)
        g = mix(g, CUBE_LEFT[1], fl)
        b = mix(b, CUBE_LEFT[2], fl)
      }
      if (fr > 0) {
        r = mix(r, CUBE_RIGHT[0], fr)
        g = mix(g, CUBE_RIGHT[1], fr)
        b = mix(b, CUBE_RIGHT[2], fr)
      }

      px[i] = byte(r)
      px[i + 1] = byte(g)
      px[i + 2] = byte(b)
      px[i + 3] = byte(bg * 255)
    }
  }

  return px
}

/* ---------------- 拼 ICO ---------------- */

function buildIco(entries) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type = icon
  dir.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const table = []
  const blobs = []
  for (const e of entries) {
    const row = Buffer.alloc(16)
    row[0] = e.size >= 256 ? 0 : e.size // 256 用 0 表示
    row[1] = e.size >= 256 ? 0 : e.size
    row[2] = 0 // palette
    row[3] = 0 // reserved
    row.writeUInt16LE(1, 4) // planes
    row.writeUInt16LE(32, 6) // bit count
    row.writeUInt32LE(e.data.length, 8)
    row.writeUInt32LE(offset, 12)
    table.push(row)
    blobs.push(e.data)
    offset += e.data.length
  }

  return Buffer.concat([dir, ...table, ...blobs])
}

/* ---------------- 写文件 ---------------- */

fs.mkdirSync(OUT_DIR, { recursive: true })

const rendered = new Map()
for (const size of SIZES) rendered.set(size, render(size))

const png256 = encodePng(256, 256, rendered.get(256))
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png256)

const entries = SIZES.map((size) => ({
  size,
  // 256 用 PNG，其余用 BMP —— shell 对小尺寸 PNG 条目的支持历来不稳
  data: size >= 256 ? png256 : encodeDib(rendered.get(size), size)
}))

const ico = buildIco(entries)
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)

console.log('build/icon.png', png256.length, 'bytes')
console.log('build/icon.ico', ico.length, 'bytes ——', entries.length, '个尺寸')
for (const e of entries) {
  console.log(`   ${String(e.size).padStart(3)}x${String(e.size).padEnd(3)}  ${String(e.data.length).padStart(6)} bytes  ${e.size >= 256 ? 'PNG' : 'BMP'}`)
}
