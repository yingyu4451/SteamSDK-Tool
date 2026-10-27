import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * 给弹窗 / 滑层补上可访问性：Esc 关闭、Tab 焦点圈定、打开时焦点移入、关闭后还原。
 *
 * 这些弹窗常驻在 App.vue 里、用内部的 v-if 控制显隐，所以要用 isOpen 告诉它
 * 「什么时候算打开」；不传 isOpen 就当成挂载即打开。
 *
 * @param {import('vue').Ref<HTMLElement | null>} rootRef 弹窗根节点（模板里 ref="el"）
 * @param {() => void} onClose 关闭回调（等同点“取消”/点遮罩）
 * @param {{ closeOnEsc?: boolean, isOpen?: () => boolean }} [options]
 */
export function useDialogA11y(rootRef, onClose, options = {}) {
  const { closeOnEsc = true, isOpen = null } = options
  let previousFocus = null
  let keyHandler = null

  const isOpenNow = () =>
    typeof isOpen === 'function' ? !!isOpen() : isOpen ? !!isOpen.value : true

  function focusables() {
    const root = rootRef.value
    if (!root) return []
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    )
  }

  function onKeydown(event) {
    const root = rootRef.value
    if (!root) return
    if (event.key === 'Escape' && closeOnEsc) {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusables()
    if (!items.length) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  async function activate() {
    previousFocus = document.activeElement
    await nextTick()
    const root = rootRef.value
    if (!root) return
    root.setAttribute('tabindex', '-1')
    const items = focusables()
    ;(items[0] || root).focus({ preventScroll: true })
    if (!keyHandler) {
      keyHandler = onKeydown
      document.addEventListener('keydown', keyHandler, true)
    }
  }

  function deactivate() {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true)
      keyHandler = null
    }
    if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
      previousFocus.focus({ preventScroll: true })
    }
    previousFocus = null
  }

  let stop = null
  if (isOpen) {
    stop = watch(isOpenNow, (open) => (open ? activate() : deactivate()))
    onMounted(() => {
      if (isOpenNow()) activate()
    })
  } else {
    onMounted(activate)
  }

  onBeforeUnmount(() => {
    if (stop) stop()
    deactivate()
  })
}
