/** @typedef {'top'|'bottom'|'left'|'right'|'center'|'auto'} HelpPlacementInput */
/** @typedef {'anchor'|'center'|'corner'} HelpCardLayoutMode */

const MARGIN = 16
const GAP = 14
const SIDEBAR_SAFE = 108
const DEFAULT_CARD_W = 400
const DEFAULT_CARD_H = 280
/** Yerleşim hesabında kullanılan üst yükseklik (kart içi kaydırılabilir) */
export const HELP_GUIDE_LAYOUT_HEIGHT_CAP = 360
const CORNER_CARD_MAX_W = 420

/**
 * @param {HelpPlacementInput | undefined} requested
 * @param {{ top: number, left: number, width: number, height: number, right?: number, bottom?: number } | null} target
 * @param {{ w: number, h: number }} viewport
 */
export function resolveHelpPlacement(requested, target, viewport) {
  if (!target) return 'center'
  if (requested && requested !== 'auto') return requested

  const right = target.left + target.width
  const bottom = target.top + target.height
  const cx = target.left + target.width / 2
  const cy = target.top + target.height / 2
  const inSidebar = right < SIDEBAR_SAFE + 40
  const nearTop = target.top < 100
  const nearBottom = bottom > viewport.h - 120
  const nearRight = right > viewport.w - 220
  const targetTall = target.height > viewport.h * 0.45
  const targetWide = target.width > viewport.w * 0.55

  if (targetTall || targetWide) return 'corner'
  if (inSidebar) return 'right'
  if (nearRight) return 'left'
  if (nearTop && !inSidebar) return 'bottom'
  if (nearBottom) return 'top'
  if (cx < viewport.w * 0.35) return 'right'
  if (cx > viewport.w * 0.65) return 'left'
  return cy > viewport.h * 0.55 ? 'top' : 'bottom'
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
  const width = Math.min(Math.max(cardW, 320), CORNER_CARD_MAX_W, vw - MARGIN * 2)

  if (cardLayout === 'corner' || placementIn === 'corner') {
    return computeCornerLayout(vw, vh, width, layoutH)
  }

  if (!target || placementIn === 'center' || cardLayout === 'center') {
    const left = Math.max(MARGIN, (vw - width) / 2)
    const top = Math.max(MARGIN, (vh - layoutH) / 2)
    return {
      mode: 'center',
      placement: 'center',
      style: {
        top,
        left,
        width,
        maxHeight: Math.min(cardH, vh - MARGIN * 2),
        transform: 'none',
      },
    }
  }

  const placement = resolveHelpPlacement(placementIn, target, { w: vw, h: vh })

  if (placement === 'corner') {
    return computeCornerLayout(vw, vh, width, layoutH)
  }

  const candidates = [placement, 'right', 'left', 'top', 'bottom'].filter(
    (v, i, a) => a.indexOf(v) === i,
  )

  for (const tryPlace of candidates) {
    const box = anchorBox(target, tryPlace, width, layoutH, GAP)
    if (fits(box, vw, vh, MARGIN, layoutH)) {
      const clamped = clampBox(box, vw, vh, MARGIN, width, layoutH)
      return {
        mode: 'anchored',
        placement: tryPlace,
        style: {
          top: clamped.top,
          left: clamped.left,
          width,
          maxHeight: Math.min(cardH, vh - clamped.top - MARGIN),
          transform: 'none',
        },
      }
    }
  }

  return computeCornerLayout(vw, vh, width, layoutH)
}

/**
 * @param {number} vw
 * @param {number} vh
 * @param {number} width
 * @param {number} layoutH
 */
function computeCornerLayout(vw, vh, width, layoutH) {
  const maxH = Math.min(layoutH, Math.floor(vh * 0.52), vh - MARGIN * 2)
  const left = Math.max(MARGIN, vw - width - MARGIN)
  const top = Math.max(MARGIN, vh - maxH - MARGIN)
  return {
    mode: 'corner',
    placement: 'corner',
    style: {
      top,
      left,
      width,
      maxHeight: maxH,
      transform: 'none',
    },
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
