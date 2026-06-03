/** @typedef {'top'|'bottom'|'left'|'right'|'center'|'auto'} HelpPlacementInput */

import { isSidebarRailTarget } from './helpGuideGeometry.js'

const MARGIN = 16
const GAP = 14
const SIDEBAR_SAFE = 108
const DEFAULT_CARD_W = 480
const DEFAULT_CARD_H = 260
export const HELP_GUIDE_LAYOUT_HEIGHT_CAP = 680
const CARD_MAX_W = 560
export const HELP_GUIDE_CARD_WIDE_W = 540
export const HELP_GUIDE_CARD_DEFAULT_W = 400

/**
 * @param {HelpPlacementInput | undefined} requested
 * @param {{ top: number, left: number, width: number, height: number } | null} target
 * @param {{ w: number, h: number }} viewport
 */
export function resolveHelpPlacement(requested, target, viewport) {
  if (!target) return 'center'
  if (requested && requested !== 'auto') return requested

  const right = target.left + target.width
  const bottom = target.top + target.height
  const cx = target.left + target.width / 2
  const inSidebar = right < SIDEBAR_SAFE + 48
  const nearTop = target.top < 88
  const nearBottom = bottom > viewport.h - 100
  const nearRight = right > viewport.w - CARD_MAX_W - 32

  if (inSidebar) return 'right'
  if (nearRight) return 'left'
  if (nearBottom && target.height < 120) return 'top'
  if (nearTop) return 'bottom'
  if (nearBottom) return 'top'
  if (cx < viewport.w * 0.38) return 'right'
  if (cx > viewport.w * 0.62) return 'left'
  return bottom > viewport.h * 0.55 ? 'top' : 'bottom'
}

/**
 * @param {object} p
 * @param {number} p.vw
 * @param {number} p.vh
 * @param {{ top: number, left: number, width: number, height: number } | null} p.target
 * @param {HelpPlacementInput | undefined} p.placement
 * @param {'anchor'|'center'|'corner'|undefined} [p.cardLayout]
 * @param {number} [p.cardW]
 * @param {number} [p.cardH]
 */
export function computeHelpTooltipLayout({
  vw,
  vh,
  target,
  placement: placementIn,
  cardLayout,
  cardW = DEFAULT_CARD_W,
  cardH = DEFAULT_CARD_H,
}) {
  const layoutH = Math.min(cardH, HELP_GUIDE_LAYOUT_HEIGHT_CAP)
  const width = Math.min(Math.max(cardW, 300), CARD_MAX_W, vw - MARGIN * 2)

  if (target && isSidebarRailTarget(target)) {
    const top = clamp((vh - layoutH) / 2, MARGIN, vh - layoutH - MARGIN)
    const left = clamp(
      target.left + target.width + GAP,
      target.right + GAP,
      vw - width - MARGIN,
    )
    return {
      mode: 'anchored',
      placement: 'right',
      style: cardStyle(top, left, width, Math.min(cardH, vh - top - MARGIN)),
    }
  }

  if (!target || placementIn === 'center' || cardLayout === 'center') {
    return centerLayout(vw, vh, width, layoutH, cardH)
  }

  if (cardLayout === 'corner') {
    return adaptiveFallback(vw, vh, target, width, layoutH, cardH)
  }

  const placement = resolveHelpPlacement(placementIn, target, { w: vw, h: vh })
  const candidates = [placement, 'right', 'left', 'bottom', 'top'].filter(
    (v, i, a) => a.indexOf(v) === i,
  )

  for (const tryPlace of candidates) {
    const box = anchorBox(target, tryPlace, width, layoutH, GAP)
    if (fits(box, vw, vh, MARGIN, layoutH)) {
      const clamped = clampBox(box, vw, vh, MARGIN, width, layoutH)
      return {
        mode: 'anchored',
        placement: tryPlace,
        style: cardStyle(clamped.top, clamped.left, width, Math.min(cardH, vh - clamped.top - MARGIN)),
      }
    }
  }

  return adaptiveFallback(vw, vh, target, width, layoutH, cardH)
}

function centerLayout(vw, vh, width, layoutH, cardH) {
  const left = Math.max(MARGIN, (vw - width) / 2)
  const top = Math.max(MARGIN, (vh - layoutH) / 2)
  return {
    mode: 'center',
    placement: 'center',
    style: cardStyle(top, left, width, Math.min(cardH, vh - MARGIN * 2)),
  }
}

/**
 * Hedef büyükse veya kenar yerleşimi sığmazsa — hedefin karşı tarafına veya üst-ortaya yerleşir.
 */
function adaptiveFallback(vw, vh, target, width, layoutH, cardH) {
  const maxH = Math.min(cardH, vh - MARGIN * 2)

  if (target) {
    const targetCx = target.left + target.width / 2
    const targetCy = target.top + target.height / 2
    const isWide = target.width > vw * 0.42
    const isTall = target.height > vh * 0.55 && target.width > vw * 0.25

    if (isWide || isTall) {
      const gapLeft = target.left - SIDEBAR_SAFE - MARGIN
      if (gapLeft >= 260) {
        const panelW = Math.min(width, gapLeft - MARGIN)
        const top = clamp(target.top, MARGIN, vh - maxH - MARGIN)
        return {
          mode: 'panel-left',
          placement: 'left',
          style: cardStyle(top, SIDEBAR_SAFE + MARGIN, panelW, maxH),
        }
      }

      if (targetCx > vw * 0.5) {
        const left = MARGIN
        const top = clamp(targetCy - maxH / 2, MARGIN, vh - maxH - MARGIN)
        return {
          mode: 'floating',
          placement: 'left',
          style: cardStyle(top, left, width, maxH),
        }
      }

      const left = vw - width - MARGIN
      const top = clamp(targetCy - maxH / 2, MARGIN, vh - maxH - MARGIN)
      return {
        mode: 'floating',
        placement: 'right',
        style: cardStyle(top, left, width, maxH),
      }
    }

    if (targetCy < vh * 0.45) {
      const top = clamp(target.bottom + GAP + 24, MARGIN, vh - maxH - MARGIN)
      const left = clamp(targetCx - width / 2, MARGIN, vw - width - MARGIN)
      if (top + maxH <= vh - MARGIN) {
        return {
          mode: 'floating',
          placement: 'bottom',
          style: cardStyle(top, left, width, maxH),
        }
      }
    }

    const top = clamp(target.top - maxH - GAP - 8, MARGIN, vh - maxH - MARGIN)
    const left = clamp(targetCx - width / 2, MARGIN, vw - width - MARGIN)
    if (top >= MARGIN) {
      return {
        mode: 'floating',
        placement: 'top',
        style: cardStyle(top, left, width, maxH),
      }
    }
  }

  const top = MARGIN + 12
  const left = clamp((vw - width) / 2, MARGIN, vw - width - MARGIN)
  return {
    mode: 'top-center',
    placement: 'top',
    style: cardStyle(top, left, width, maxH),
  }
}

function cardStyle(top, left, width, maxHeight) {
  return {
    top,
    left,
    width,
    maxHeight,
    transform: 'none',
  }
}

/** @param {{ top: number, left: number, width: number, height: number }} target */
function anchorBox(target, placement, cardW, cardH, gap) {
  const cx = target.left + target.width / 2
  const cy = target.top + target.height / 2
  switch (placement) {
    case 'top':
      return {
        top: target.top - gap - cardH,
        left: cx - cardW / 2,
        width: cardW,
        height: cardH,
      }
    case 'left':
      return {
        top: cy - cardH / 2,
        left: target.left - gap - cardW,
        width: cardW,
        height: cardH,
      }
    case 'right':
      return {
        top: cy - cardH / 2,
        left: target.left + target.width + gap,
        width: cardW,
        height: cardH,
      }
    default:
      return {
        top: target.top + target.height + gap,
        left: cx - cardW / 2,
        width: cardW,
        height: cardH,
      }
  }
}

function fits(box, vw, vh, margin, effectiveH) {
  return (
    box.left >= margin &&
    box.top >= margin &&
    box.left + box.width <= vw - margin &&
    box.top + effectiveH <= vh - margin
  )
}

function clampBox(box, vw, vh, margin, cardW, cardH) {
  let { top, left } = box
  if (left + cardW > vw - margin) left = vw - margin - cardW
  if (left < margin) left = margin
  if (top + cardH > vh - margin) top = vh - margin - cardH
  if (top < margin) top = margin
  return { top, left }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
