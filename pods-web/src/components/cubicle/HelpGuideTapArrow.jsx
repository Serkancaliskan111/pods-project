import { createPortal } from 'react-dom'
import { ArrowDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { HELP_GUIDE_ARROW_Z } from '../../lib/helpGuideLayers.js'
import {
  computeHelpGuideArrowPose,
  triggerHelpGuideTap,
} from '../../lib/helpGuideTapTarget.js'

/**
 * @param {object} props
 * @param {{ top: number, left: number, width: number, height: number }} props.targetRect
 * @param {{ w: number, h: number }} props.viewport
 * @param {string | undefined} props.selector
 * @param {string | undefined} props.clickSelector
 */
export default function HelpGuideTapArrow({
  targetRect,
  viewport,
  selector,
  clickSelector,
}) {
  if (!targetRect || !viewport.w) return null

  const pose = computeHelpGuideArrowPose(targetRect, viewport)

  const node = (
    <button
      type="button"
      className={cn(
        'pointer-events-auto fixed flex h-11 w-11 items-center justify-center rounded-full',
        'border-2 border-white bg-blue-600 text-white shadow-lg shadow-blue-600/40',
        'animate-bounce transition hover:scale-105 hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300',
      )}
      style={{
        zIndex: HELP_GUIDE_ARROW_Z,
        left: pose.left,
        top: pose.top,
        transform: `translate(-50%, ${pose.translateY})`,
      }}
      aria-label="Buraya tıklayın"
      title="Buraya tıklayın"
      onClick={(e) => {
        e.stopPropagation()
        triggerHelpGuideTap(selector, clickSelector)
      }}
    >
      <ArrowDown
        size={22}
        strokeWidth={2.5}
        className="shrink-0"
        style={{ transform: `rotate(${pose.rotation}deg)` }}
      />
    </button>
  )

  return typeof document !== 'undefined' ? createPortal(node, document.body) : null
}
