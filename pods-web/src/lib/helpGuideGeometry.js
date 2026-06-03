/** @typedef {{ top: number, left: number, width: number, height: number, bottom?: number, right?: number }} HelpRect */

export const HELP_VIEWPORT_MARGIN = 16
export const HELP_SIDEBAR_RAIL_MAX = 120

/**
 * @param {HelpRect} rect
 * @param {number} vw
 * @param {number} vh
 * @param {number} [margin]
 */
export function clampRectToViewport(rect, vw, vh, margin = HELP_VIEWPORT_MARGIN) {
  const top = Math.max(margin, Math.min(rect.top, vh - margin - 24))
  const left = Math.max(margin, Math.min(rect.left, vw - margin - 24))
  const maxW = vw - left - margin
  const maxH = vh - top - margin
  const width = Math.max(24, Math.min(rect.width, maxW))
  const height = Math.max(24, Math.min(rect.height, maxH))
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
  }
}

/**
 * @param {string | undefined} selector
 * @param {HelpRect | null} raw
 * @param {number} vw
 * @param {number} vh
 */
export function normalizeHelpTargetRect(selector, raw, vw, vh) {
  if (!raw) return null

  const sel = selector || ''

  if (sel.includes('nav-sidebar')) {
    const railW = Math.min(Math.max(raw.width, 72), HELP_SIDEBAR_RAIL_MAX)
    const top = Math.max(64, raw.top + 56)
    const height = Math.min(vh - top - 80, Math.max(120, vh - 144))
    return clampRectToViewport(
      { top, left: raw.left, width: railW, height },
      vw,
      vh,
      0,
    )
  }

  if (sel.includes('task-assign-') && raw.height > 380) {
    const height = Math.min(360, raw.height, vh * 0.52)
    const top = raw.top + Math.max(0, (raw.height - height) * 0.12)
    return clampRectToViewport({ ...raw, top, height }, vw, vh)
  }

  if (raw.height > vh * 0.82) {
    const top = Math.max(HELP_VIEWPORT_MARGIN, raw.top)
    const height = Math.min(raw.height, vh - top - HELP_VIEWPORT_MARGIN)
    return clampRectToViewport({ ...raw, top, height }, vw, vh)
  }

  if (raw.width > vw * 0.55 && raw.height > vh * 0.45) {
    return clampRectToViewport(
      {
        top: raw.top + 48,
        left: raw.left + 12,
        width: raw.width - 24,
        height: Math.min(raw.height - 96, vh * 0.55),
      },
      vw,
      vh,
    )
  }

  return clampRectToViewport(raw, vw, vh)
}

/**
 * @param {HelpRect | null} rect
 */
export function isSidebarRailTarget(rect) {
  if (!rect) return false
  return rect.left < HELP_SIDEBAR_RAIL_MAX + 8 && rect.width <= HELP_SIDEBAR_RAIL_MAX + 24
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} vw
 * @param {number} vh
 * @param {number} [size]
 */
export function clampPointToViewport(cx, cy, vw, vh, size = 36) {
  const half = size / 2 + 4
  return {
    x: Math.min(vw - half, Math.max(half, cx)),
    y: Math.min(vh - half, Math.max(half, cy)),
  }
}
