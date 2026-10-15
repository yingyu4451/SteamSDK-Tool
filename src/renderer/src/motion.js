import gsap from 'gsap'
import { ref, watch, nextTick } from 'vue'

const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
export const reducedMotion = () => mq.matches

const D = (n) => (reducedMotion() ? 0 : n)

/* ------------------------------------------------------------------ *
 *  指令：v-reveal  —— 元素入场
 *  v-reveal           默认从下方 14px 淡入
 *  v-reveal="{ delay: .1, y: 24, scale: .96 }"
 * ------------------------------------------------------------------ */
export const reveal = {
  mounted(el, binding) {
    const o = binding.value || {}
    gsap.fromTo(
      el,
      { opacity: 0, y: o.y ?? 14, x: o.x ?? 0, scale: o.scale ?? 1 },
      {
        opacity: 1,
        y: 0,
        x: 0,
        scale: 1,
        duration: D(o.duration ?? 0.5),
        delay: D(o.delay ?? 0),
        ease: o.ease || 'power3.out',
        clearProps: 'transform'
      }
    )
  }
}

/* ------------------------------------------------------------------ *
 *  指令：v-stagger —— 让直接子元素依次入场
 *  v-stagger="{ each: .05, delay: .1 }"
 * ------------------------------------------------------------------ */
export const stagger = {
  mounted(el, binding) {
    const o = binding.value || {}
    const kids = Array.from(el.children)
    if (!kids.length) return
    gsap.fromTo(
      kids,
      { opacity: 0, y: o.y ?? 12 },
      {
        opacity: 1,
        y: 0,
        duration: D(o.duration ?? 0.45),
        delay: D(o.delay ?? 0),
        ease: 'power3.out',
        stagger: D(o.each ?? 0.06),
        clearProps: 'transform'
      }
    )
  }
}

/* ------------------------------------------------------------------ *
 *  数字滚动：值变化时补间过去，而不是硬切
 * ------------------------------------------------------------------ */
export function useCountUp(source, { duration = 0.7 } = {}) {
  const display = ref(typeof source === 'function' ? source() : source.value)
  let tween = null

  const get = () => (typeof source === 'function' ? source() : source.value)

  watch(
    () => get(),
    (to) => {
      const target = Number(to) || 0
      tween?.kill()
      const from = Number(display.value) || 0
      if (reducedMotion() || from === target) {
        display.value = target
        return
      }
      const box = { v: from }
      tween = gsap.to(box, {
        v: target,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          display.value = box.v
        },
        onComplete: () => {
          display.value = target
        }
      })
    },
    { immediate: true }
  )

  return display
}

/* ------------------------------------------------------------------ *
 *  列表入场：数据变化后，对新增的子元素做交错动画
 * ------------------------------------------------------------------ */
export function useListStagger(containerRef, getKey, { each = 0.035, max = 24 } = {}) {
  let seen = new Set()

  const run = async () => {
    await nextTick()
    const root = containerRef.value
    if (!root) return
    const kids = Array.from(root.children)
    const fresh = []
    const nextSeen = new Set()

    for (const el of kids) {
      const key = getKey(el)
      nextSeen.add(key)
      if (!seen.has(key)) fresh.push(el)
    }
    seen = nextSeen

    if (!fresh.length || reducedMotion()) return
    gsap.fromTo(
      fresh.slice(0, max),
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out', stagger: each, clearProps: 'transform' }
    )
  }

  return { run, reset: () => (seen = new Set()) }
}

/* ------------------------------------------------------------------ *
 *  数值变化时闪一下，让「刚刚更新了」这件事可见
 * ------------------------------------------------------------------ */
export function flashValue(el) {
  if (!el || reducedMotion()) return
  gsap.fromTo(
    el,
    { color: '#66c0f4' },
    { color: '', duration: 0.9, ease: 'power2.out', clearProps: 'color' }
  )
}

/* ------------------------------------------------------------------ *
 *  构建中：卡片上流动的光带 + 呼吸
 * ------------------------------------------------------------------ */
export function pulseLoop(el) {
  if (!el || reducedMotion()) return { kill() {} }
  return gsap.to(el, {
    opacity: 0.55,
    duration: 1.1,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut'
  })
}
