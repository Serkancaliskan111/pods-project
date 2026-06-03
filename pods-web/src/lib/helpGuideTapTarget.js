import { toast } from 'sonner'

/**
 * @param {Element | null} root
 * @returns {HTMLElement | null}
 */
export function resolveHelpGuideClickTarget(root) {
  if (!root || !(root instanceof HTMLElement)) return null

  const interactive = root.matches(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="button"]:not([aria-disabled="true"])',
  )
    ? root
    : null
  if (interactive) return /** @type {HTMLElement} */ (interactive)

  const buttons = root.querySelectorAll(
    'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"])',
  )
  if (buttons.length === 1) return /** @type {HTMLElement} */ (buttons[0])
  return null
}

/**
 * @param {string | undefined} selector
 * @param {string | undefined} clickSelector
 */
export function triggerHelpGuideTap(selector, clickSelector) {
  const sel = clickSelector || selector
  if (!sel || typeof document === 'undefined') return false

  const root = document.querySelector(sel)
  const target = resolveHelpGuideClickTarget(root)
  if (!target) {
    toast.message('Vurgulanan alanın içindeki düğmeye doğrudan tıklayın.')
    return false
  }
  target.click()
  target.focus?.({ preventScroll: true })
  return true
}

/**
 * @param {{ top: number, left: number, width: number, height: number }} rect
 * @param {{ w: number, h: number }} viewport
 */
export function computeHelpGuideArrowPose(rect, viewport) {
  const cx = rect.left + rect.width / 2
  const spaceAbove = rect.top
  const spaceBelow = viewport.h - rect.bottom
  const above = spaceAbove >= 56 || spaceAbove > spaceBelow

  if (above) {
    return {
      left: cx,
      top: rect.top - 12,
      translateY: '-100%',
      rotation: 180,
    }
  }
  return {
    left: cx,
    top: rect.bottom + 12,
    translateY: '0',
    rotation: 0,
  }
}
