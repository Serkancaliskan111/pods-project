import { toast } from 'sonner'

/**
 * @param {Element | null} root
 * @returns {HTMLElement | null}
 */
export function resolveHelpGuideClickTarget(root) {
  if (!root || !(root instanceof HTMLElement)) return null

  if (
    root.matches(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="button"]:not([aria-disabled="true"])',
    )
  ) {
    return root
  }

  const buttons = root.querySelectorAll(
    'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"])',
  )
  if (buttons.length === 1) return /** @type {HTMLElement} */ (buttons[0])
  return null
}

/**
 * @param {string | undefined} selector
 * @param {string | undefined} clickSelector
 * @returns {{ top: number, left: number, width: number, height: number, bottom: number, right: number } | null}
 */
export function resolveHelpGuideClickRect(selector, clickSelector) {
  if (typeof document === 'undefined') return null
  const sel = clickSelector || selector
  if (!sel) return null

  const el = document.querySelector(sel)
  if (!el) return null

  const clickEl = resolveHelpGuideClickTarget(el) || el
  const r = clickEl.getBoundingClientRect()
  if (r.width < 2 && r.height < 2) return null

  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    bottom: r.bottom,
    right: r.right,
  }
}

/**
 * @param {import('./helpGuides.js').HelpGuideStep | null | undefined} step
 * @param {{ top: number, left: number, width: number, height: number } | null} clickRect
 */
export function shouldShowHelpTapPulse(step, clickRect) {
  if (!step?.doThis || !clickRect) return false
  if (step.interaction === 'view' || step.interaction === 'hover') return false
  if (step.interaction === 'click') return true
  if (step.clickSelector) return true
  if (!step.selector || typeof document === 'undefined') return false
  const root = document.querySelector(step.selector)
  return !!resolveHelpGuideClickTarget(root)
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
    toast.message('Bu adımda vurgulanan alana doğrudan tıklayın.')
    return false
  }
  target.click()
  target.focus?.({ preventScroll: true })
  return true
}
