/**
 * 生成应用图标（build/icon.png 256x256 + build/icon.ico）。
 * 不依赖任何图形库：手写 PNG（zlib + CRC32），再把 PNG 直接塞进 ICO 容器
 * （ICO 允许 256x256 条目用 PNG 负载）。
 *
 *   node scripts/make-icon.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const SIZE = 256
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

/* ---------------- 画图 ---------------- */

const pixels = Buffer.alloc(SIZE * SIZE * 4)

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

function rectCoverage(x, y, x0, y0, x1, y1) {
  const cx = clamp01(Math.min(x + 1, x1) - Math.max(x, x0))
  const cy = clamp01(Math.min(y + 1, y1) - Math.max(y, y0))
  return cx * cy
}

// 背景渐变：薄荷青 -> 深青（和界面里的品牌色一致）
const TOP = [0x45, 0xf0, 0xd2]
const BOTTOM = [0x12, 0x8f, 0x7c]
const INK = [0x04, 0x23, 0x1e]

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4

    const bg = roundRectCoverage(x + 0.5, y + 0.5, SIZE, 58)
    if (bg <= 0) continue

    const t = y / (SIZE - 1)
    let r = mix(TOP[0], BOTTOM[0], t)
    let g = mix(TOP[1], BOTTOM[1], t)
    let b = mix(TOP[2], BOTTOM[2], t)

    // 向下箭头的杆
    let arrow = rectCoverage(x, y, 118, 56, 138, 152)
    // 箭头三角
    arrow = Math.max(arrow, inTriangle(x + 0.5, y + 0.5, 84, 140, 172, 140, 128, 190))
    // 底部基线
    arrow = Math.max(arrow, rectCoverage(x, y, 74, 200, 182, 214))

    if (arrow > 0) {
      r = mix(r, INK[0], arrow)
      g = mix(g, INK[1], arrow)
      b = mix(b, INK[2], arrow)
    }

    pixels[i] = Math.round(r)
    pixels[i + 1] = Math.round(g)
    pixels[i + 2] = Math.round(b)
    pixels[i + 3] = Math.round(bg * 255)
  }
}

/* ---------------- 写文件 ---------------- */

fs.mkdirSync(OUT_DIR, { recursive: true })

const png = encodePng(SIZE, SIZE, pixels)
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png)

// ICO 容器：1 个 256x256 条目，负载直接用 PNG
const dir = Buffer.alloc(6)
dir.writeUInt16LE(0, 0) // reserved
dir.writeUInt16LE(1, 2) // type = icon
dir.writeUInt16LE(1, 4) // count

const entry = Buffer.alloc(16)
entry[0] = 0 // width 256
entry[1] = 0 // height 256
entry[2] = 0 // palette
entry[3] = 0 // reserved
entry.writeUInt16LE(1, 4) // planes
entry.writeUInt16LE(32, 6) // bit count
entry.writeUInt32LE(png.length, 8) // size
entry.writeUInt32LE(6 + 16, 12) // offset

const ico = Buffer.concat([dir, entry, png])
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)

console.log('build/icon.png', png.length, 'bytes')
console.log('build/icon.ico', ico.length, 'bytes')
