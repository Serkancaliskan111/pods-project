import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Lightbulb, MapPin, X } from 'lucide-react'
import HelpGuideTapArrow from './HelpGuideTapArrow.jsx'
import { cn } from '../../lib/cn'
import {
  computeHelpTooltipLayout,
  HELP_GUIDE_LAYOUT_HEIGHT_CAP,
} from '../../lib/helpGuideTooltipLayout.js'
import { HELP_GUIDE_CARD_Z, HELP_GUIDE_OVERLAY_Z } from '../../lib/helpGuideLayers.js'
import { useHelpGuide } from '../../contexts/HelpGuideContext.jsx'

const PAD = 10
const RADIUS = 12
const SHADE_BG = 'rgba(15, 23, 42, 0.68)'

/** Spotlight deliğinden gerçek UI öğelerine tıklanabilsin diye dört parça gölge */
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
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [cardSize, setCardSize] = useState({ w: 400, h: 260 })
  const [layout, setLayout] = useState(null)

  useEffect(() => {
    const sync = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight })
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

  const applyLayout = useCallback(() => {
    if (!isActive || !currentStep || !stepReady || !viewport.w) {
      setLayout(null)
      return
    }
    const el = cardRef.current
    const measuredH = el?.offsetHeight || 260
    const measuredW = el?.offsetWidth || 400
    setCardSize({ w: measuredW, h: measuredH })

    const next = computeHelpTooltipLayout({
      vw: viewport.w,
      vh: viewport.h,
      target: showTarget ? targetRect : null,
      placement: showTarget ? currentStep.placement : 'center',
      cardLayout: currentStep.cardLayout,
      cardW: Math.min(440, measuredW || 400),
      cardH: Math.min(measuredH, HELP_GUIDE_LAYOUT_HEIGHT_CAP + 80),
    })
    setLayout(next)
  }, [
    isActive,
    currentStep,
    stepReady,
    viewport,
    targetRect,
    showTarget,
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

  const progressPct = stepCount > 0 ? ((stepIndex + 1) / stepCount) * 100 : 0

  if (!isActive || !currentStep || !stepReady) return null

  const bullets = currentStep.bullets || []
  const cornerCard = layout?.mode === 'corner'

  const cardStyle = layout?.style
    ? {
        ...layout.style,
        transform: 'none',
      }
    : {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(440px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 32px)',
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
          className="pointer-events-none absolute rounded-xl ring-4 ring-blue-400/90 shadow-[0_0_24px_rgba(59,130,246,0.35)]"
          style={{
            top: spotlightStyle.top,
            left: spotlightStyle.left,
            width: spotlightStyle.width,
            height: spotlightStyle.height,
          }}
        />
      ) : null}

      {currentStep?.doThis && showTarget ? (
        <HelpGuideTapArrow
          targetRect={targetRect}
          viewport={viewport}
          selector={currentStep.selector}
          clickSelector={currentStep.clickSelector}
        />
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-guide-title"
        className={cn(
          'pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.24)]',
          cornerCard && 'max-w-[420px]',
        )}
        style={{ ...cardStyle, zIndex: HELP_GUIDE_CARD_Z }}
      >
        <div className="h-1 shrink-0 overflow-hidden bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pt-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                {activeGuide?.title}
              </p>
              <p className="text-[11px] font-semibold tabular-nums text-slate-400">
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
            <p className="mb-3 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-[11px] font-medium text-blue-800">
              Örnek veriler gösteriliyor; tur bitince kaybolur. Gerçek işlem yapmazsınız.
            </p>
          ) : null}

          {targetMissed ? (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <span>
                Vurgulanan alan şu an görünmüyor. Sol menüden ilgili sayfaya gidin veya «İleri» ile
                devam edin.
              </span>
            </p>
          ) : null}

          <h3 id="help-guide-title" className="text-base font-extrabold leading-snug text-slate-900">
            {currentStep.title}
          </h3>
          {currentStep?.doThis ? (
            <p className="mt-2 text-sm font-semibold leading-relaxed text-blue-800">
              {showTarget && !targetMissed
                ? 'Mavi oku veya vurgulanan alanı kullanın: '
                : ''}
              {currentStep.doThis}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{currentStep.body}</p>

          {bullets.length ? (
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-slate-600">
              {bullets.map((line) => (
                <li key={line} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}

          {currentStep.tip ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <span>{currentStep.tip}</span>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
          <p className="mb-2 text-center text-[11px] text-slate-400">
            ← → adımlar · Esc ile çıkış
            {stepIndex < stepCount - 1 ? ' · İleri: sonraki adım' : ''}
          </p>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={prevStep}
              disabled={stepIndex <= 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Geri
            </button>
            <div className="flex max-w-[40%] flex-wrap justify-center gap-1" aria-hidden>
              {Array.from({ length: Math.min(stepCount, 12) }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition',
                    i === stepIndex ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-200',
                  )}
                />
              ))}
              {stepCount > 12 ? (
                <span className="text-[10px] text-slate-400">+{stepCount - 12}</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
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
