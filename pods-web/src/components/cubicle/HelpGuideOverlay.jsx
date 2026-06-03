import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Lightbulb, MapPin, X } from 'lucide-react'
import {
  computeHelpTooltipLayout,
  HELP_GUIDE_CARD_DEFAULT_W,
  HELP_GUIDE_CARD_WIDE_W,
} from '../../lib/helpGuideTooltipLayout.js'
import { HELP_GUIDE_CARD_Z, HELP_GUIDE_OVERLAY_Z, HELP_GUIDE_PULSE_Z } from '../../lib/helpGuideLayers.js'
import { resolveHelpGuideClickRect, shouldShowHelpTapPulse } from '../../lib/helpGuideTapTarget.js'
import { useHelpGuide } from '../../contexts/HelpGuideContext.jsx'

const PAD = 10
const CLICK_PAD = 4
const SHADE_BG = 'rgba(15, 23, 42, 0.68)'

function TapTargetPulse({ rect }) {
  if (!rect) return null
  const top = Math.max(0, rect.top - CLICK_PAD)
  const left = Math.max(0, rect.left - CLICK_PAD)
  const width = rect.width + CLICK_PAD * 2
  const height = rect.height + CLICK_PAD * 2
  return (
    <>
      <div
        className="help-guide-tap-glow pointer-events-none fixed rounded-lg"
        style={{ zIndex: HELP_GUIDE_PULSE_Z, top, left, width, height }}
        aria-hidden
      />
      <div
        className="help-guide-tap-ring pointer-events-none fixed rounded-lg"
        style={{ zIndex: HELP_GUIDE_PULSE_Z, top, left, width, height }}
        aria-hidden
      />
    </>
  )
}

function SpotlightShade({ viewport, spotlight }) {
  if (!viewport.w) return null
  if (!spotlight) {
    return (
      <div
        className="pointer-events-auto fixed inset-0"
        style={{ background: SHADE_BG }}
        aria-hidden
      />
    )
  }
  const { top, left, width, height } = spotlight
  const vw = viewport.w
  const vh = viewport.h
  const panels = [
    { top: 0, left: 0, width: vw, height: top },
    { top, left: 0, width: left, height },
    { top, left: left + width, width: Math.max(0, vw - left - width), height },
    { top: top + height, left: 0, width: vw, height: Math.max(0, vh - top - height) },
  ].filter((p) => p.width > 0.5 && p.height > 0.5)

  return panels.map((p, i) => (
    <div
      key={i}
      className="pointer-events-auto fixed"
      style={{
        top: p.top,
        left: p.left,
        width: p.width,
        height: p.height,
        background: SHADE_BG,
      }}
      aria-hidden
    />
  ))
}

export default function HelpGuideOverlay() {
  const {
    isActive,
    activeGuide,
    currentStep,
    stepIndex,
    stepCount,
    targetRect,
    targetMissed,
    stepReady,
    nextStep,
    prevStep,
    stopGuide,
  } = useHelpGuide()

  const cardRef = useRef(null)
  const layoutRafRef = useRef(0)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [layout, setLayout] = useState(null)
  const [clickRect, setClickRect] = useState(null)

  useEffect(() => {
    const sync = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const spotlightStyle = useMemo(() => {
    if (!targetRect || targetMissed) return null
    const top = Math.max(0, targetRect.top - PAD)
    const left = Math.max(0, targetRect.left - PAD)
    const width = Math.min(viewport.w - left, targetRect.width + PAD * 2)
    const height = Math.min(viewport.h - top, targetRect.height + PAD * 2)
    return { top, left, width, height }
  }, [targetRect, targetMissed, viewport])

  const showTarget = targetRect && !targetMissed

  const refreshClickRect = useCallback(() => {
    if (!currentStep?.doThis) {
      setClickRect(null)
      return
    }
    const rect = resolveHelpGuideClickRect(currentStep.selector, currentStep.clickSelector)
    setClickRect(rect)
  }, [currentStep])

  const showTapPulse = useMemo(
    () => shouldShowHelpTapPulse(currentStep, clickRect),
    [currentStep, clickRect],
  )

  const applyLayout = useCallback(() => {
    if (!isActive || !currentStep || !stepReady || !viewport.w) {
      setLayout(null)
      return
    }
    cancelAnimationFrame(layoutRafRef.current)
    layoutRafRef.current = requestAnimationFrame(() => {
      const cardWide = !!currentStep.cardWide
      const maxCardW = cardWide ? HELP_GUIDE_CARD_WIDE_W : HELP_GUIDE_CARD_DEFAULT_W
      const el = cardRef.current
      const measuredH = el?.offsetHeight || 260
      const measuredW = el?.offsetWidth || maxCardW

      const next = computeHelpTooltipLayout({
        vw: viewport.w,
        vh: viewport.h,
        target: showTarget ? targetRect : null,
        placement: showTarget ? currentStep.placement : 'center',
        cardLayout: currentStep.cardLayout,
        cardW: Math.min(maxCardW, measuredW || maxCardW),
        cardH: Math.min(measuredH, viewport.h - 32),
      })
      setLayout((prev) => {
        if (
          prev?.mode === next.mode &&
          prev?.placement === next.placement &&
          JSON.stringify(prev?.style) === JSON.stringify(next.style)
        ) {
          return prev
        }
        return next
      })
      refreshClickRect()
    })
  }, [
    isActive,
    currentStep,
    stepReady,
    viewport,
    targetRect,
    showTarget,
    refreshClickRect,
  ])

  useLayoutEffect(() => {
    applyLayout()
  }, [applyLayout, stepIndex, targetMissed])

  useEffect(() => {
    const el = cardRef.current
    if (!el || !isActive) return undefined
    const ro = new ResizeObserver(() => applyLayout())
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyLayout, isActive, stepIndex])

  useEffect(() => {
    refreshClickRect()
    const onMove = () => refreshClickRect()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [refreshClickRect, stepIndex])

  const progressPct = stepCount > 0 ? ((stepIndex + 1) / stepCount) * 100 : 0

  if (!isActive || !currentStep || !stepReady) return null

  const bullets = currentStep.bullets || []

  const cardWide = !!currentStep?.cardWide
  const cardMaxW = cardWide ? HELP_GUIDE_CARD_WIDE_W : HELP_GUIDE_CARD_DEFAULT_W

  const cardStyle = layout?.style
    ? { ...layout.style, transform: 'none', maxHeight: undefined }
    : {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `min(${cardMaxW}px, calc(100vw - 32px))`,
      }

  const content = (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: HELP_GUIDE_OVERLAY_Z }}
      role="presentation"
    >
      <SpotlightShade viewport={viewport} spotlight={spotlightStyle} />

      {spotlightStyle ? (
        <div
          className={`pointer-events-none absolute rounded-xl ring-4 ring-blue-400/90 shadow-[0_0_24px_rgba(59,130,246,0.35)] ${
            showTapPulse ? '' : 'help-guide-spotlight-ring'
          }`}
          style={{
            top: spotlightStyle.top,
            left: spotlightStyle.left,
            width: spotlightStyle.width,
            height: spotlightStyle.height,
          }}
        />
      ) : null}

      {showTapPulse && clickRect && !targetMissed ? (
        <TapTargetPulse rect={clickRect} />
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-guide-title"
        className={`pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)] ${
          cardWide ? 'max-w-[540px]' : 'max-w-[400px]'
        }`}
        style={{ ...cardStyle, zIndex: HELP_GUIDE_CARD_Z }}
      >
        <div className="h-1 shrink-0 overflow-hidden bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="px-4 pb-3 pt-3">
          <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Yardım · {activeGuide?.title}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-blue-600">
                Adım {stepIndex + 1} / {stepCount}
              </p>
            </div>
            <button
              type="button"
              onClick={stopGuide}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Kılavuzu kapat"
            >
              <X size={18} />
            </button>
          </div>

          {currentStep?.demoScene ? (
            <p className="mb-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
              Bu adımda örnek veriler gösterilir. Gerçek kayıt veya onay işlemi yapılmaz.
            </p>
          ) : null}

          {targetMissed ? (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <span>
                İlgili alan ekranda görünmüyor. Menüden doğru sayfaya gidin; hazır olunca «İleri»
                ile devam edebilirsiniz.
              </span>
            </p>
          ) : null}

          <h3 id="help-guide-title" className="text-[15px] font-bold leading-snug text-slate-900">
            {(currentStep.title || '').replace(/^\d+\s*—\s*/, '')}
          </h3>

          {currentStep?.doThis && !targetMissed ? (
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium leading-snug text-blue-900">
              {currentStep.doThis}
            </p>
          ) : null}

          <p className="mt-2 text-xs leading-relaxed text-slate-600">{currentStep.body}</p>

          {bullets.length ? (
            <ul className="mt-2.5 space-y-1 text-[11px] leading-relaxed text-slate-600">
              {bullets.map((line) => (
                <li key={line} className="flex gap-2 leading-relaxed">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {currentStep.tip ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <span>{currentStep.tip}</span>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={prevStep}
              disabled={stepIndex <= 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Geri
            </button>
            <span className="text-[10px] font-medium text-slate-400">
              Esc · çıkış
            </span>
            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {stepIndex >= stepCount - 1 ? 'Bitir' : 'İleri'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
