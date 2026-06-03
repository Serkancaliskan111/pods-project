import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AuthContext } from './AuthContext.jsx'
import { useTaskAssign } from './TaskAssignContext.jsx'
import { getHelpGuideById, getVisibleHelpGuides } from '../lib/helpGuides.js'
import { helpRouteMatches } from '../lib/helpGuideRoutes.js'

const HelpGuideContext = createContext(null)

const POLL_MS = 120
const MAX_WAIT_MS = 5000
const GUIDE_STORAGE_KEY = 'pods-help-guide-active'

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function readStoredGuide() {
  try {
    const raw = sessionStorage.getItem(GUIDE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.id || typeof parsed.step !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function HelpGuideProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, personel } = useContext(AuthContext)
  const { openTaskAssign, closeTaskAssign } = useTaskAssign()
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin

  const ctx = useMemo(
    () => ({ permissions, isSystemAdmin, personel }),
    [permissions, isSystemAdmin, personel],
  )

  const visibleGuides = useMemo(() => getVisibleHelpGuides(ctx), [ctx])

  const [activeGuideId, setActiveGuideId] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [targetMissed, setTargetMissed] = useState(false)
  const [stepReady, setStepReady] = useState(false)
  const runIdRef = useRef(0)
  const resumedRef = useRef(false)
  const prevPathnameRef = useRef(location.pathname)

  const activeGuide = activeGuideId ? getHelpGuideById(activeGuideId) : null
  const steps = activeGuide?.steps || []
  const currentStep = steps[stepIndex] || null
  const isActive = !!activeGuide && steps.length > 0
  const isDemoMode = isActive

  const persistGuide = useCallback((id, step) => {
    if (id) {
      sessionStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify({ id, step }))
    } else {
      sessionStorage.removeItem(GUIDE_STORAGE_KEY)
    }
  }, [])

  const stopGuide = useCallback(() => {
    runIdRef.current += 1
    setActiveGuideId(null)
    setStepIndex(0)
    setTargetRect(null)
    setTargetMissed(false)
    setStepReady(false)
    persistGuide(null, 0)
    closeTaskAssign()
  }, [closeTaskAssign, persistGuide])

  const resolveTargetRect = useCallback((selector) => {
    if (!selector || typeof document === 'undefined') return null
    const el = document.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width < 2 && r.height < 2) return null
    return {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    }
  }, [])

  const resolveStepTarget = useCallback(
    async (step, runId) => {
      const deadline = Date.now() + MAX_WAIT_MS
      let rect = null
      while (Date.now() < deadline) {
        if (runId !== runIdRef.current) return null
        rect = step.selector ? resolveTargetRect(step.selector) : null
        if (rect || !step.selector) break
        await wait(POLL_MS)
      }

      if (runId !== runIdRef.current) return null

      if (step.selector) {
        const el = document.querySelector(step.selector)
        el?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        await wait(100)
        rect = resolveTargetRect(step.selector)
      }

      return rect
    },
    [resolveTargetRect],
  )

  const presentStep = useCallback(
    async (guide, index, runId, { navigateIfNeeded }) => {
      const step = guide.steps[index]
      if (!step) return

      setStepReady(false)
      setTargetRect(null)
      setTargetMissed(false)

      const onRoute =
        !step.route || helpRouteMatches(location.pathname, step.route)

      if (navigateIfNeeded && step.route && !onRoute) {
        navigate(step.route)
        const deadline = Date.now() + (step.waitMs ?? 600) + 2400
        while (Date.now() < deadline) {
          if (runId !== runIdRef.current) return
          if (helpRouteMatches(window.location.pathname, step.route)) break
          await wait(POLL_MS)
        }
        await wait(80)
        if (runId !== runIdRef.current) return
      }

      const routeOk =
        !step.route || helpRouteMatches(location.pathname, step.route)

      if (!routeOk) {
        setTargetMissed(!!step.selector)
        setTargetRect(null)
        setStepReady(true)
        return
      }

      if (navigateIfNeeded) {
        if (step.action === 'closeTaskAssign') closeTaskAssign()
        if (step.action === 'openTaskAssign') openTaskAssign()
        const waitMs = step.waitMs ?? (step.action ? 480 : 120)
        await wait(waitMs)
        if (runId !== runIdRef.current) return
      }

      const rect = await resolveStepTarget(step, runId)
      if (runId !== runIdRef.current) return

      setTargetMissed(!!step.selector && !rect)
      setTargetRect(rect)
      setStepReady(true)
    },
    [
      closeTaskAssign,
      openTaskAssign,
      navigate,
      location.pathname,
      resolveStepTarget,
    ],
  )

  const applyStep = useCallback(
    async (guide, index, runId) => {
      await presentStep(guide, index, runId, { navigateIfNeeded: true })
    },
    [presentStep],
  )

  const refreshCurrentStep = useCallback(
    async (guide, index, runId) => {
      await presentStep(guide, index, runId, { navigateIfNeeded: false })
    },
    [presentStep],
  )

  const startGuide = useCallback(
    (guideId, initialStep = 0) => {
      const guide = getHelpGuideById(guideId)
      if (!guide || !guide.steps.length) return
      runIdRef.current += 1
      const runId = runIdRef.current
      const step = Math.max(0, Math.min(initialStep, guide.steps.length - 1))
      prevPathnameRef.current = location.pathname
      setActiveGuideId(guideId)
      setStepIndex(step)
      persistGuide(guideId, step)
      void applyStep(guide, step, runId)
    },
    [applyStep, persistGuide, location.pathname],
  )

  const goToStep = useCallback(
    (nextIndex) => {
      if (!activeGuide) return
      const clamped = Math.max(0, Math.min(nextIndex, activeGuide.steps.length - 1))
      runIdRef.current += 1
      const runId = runIdRef.current
      setStepIndex(clamped)
      persistGuide(activeGuideId, clamped)
      void applyStep(activeGuide, clamped, runId)
    },
    [activeGuide, activeGuideId, applyStep, persistGuide],
  )

  const nextStep = useCallback(() => {
    if (!activeGuide) return
    if (stepIndex >= activeGuide.steps.length - 1) {
      stopGuide()
      return
    }
    goToStep(stepIndex + 1)
  }, [activeGuide, stepIndex, goToStep, stopGuide])

  const prevStep = useCallback(() => {
    if (stepIndex <= 0) return
    goToStep(stepIndex - 1)
  }, [stepIndex, goToStep])

  useEffect(() => {
    if (!isActive || !activeGuide) return undefined
    if (prevPathnameRef.current === location.pathname) return undefined
    prevPathnameRef.current = location.pathname
    const runId = runIdRef.current
    void refreshCurrentStep(activeGuide, stepIndex, runId)
    return undefined
  }, [location.pathname, isActive, activeGuide, stepIndex, refreshCurrentStep])

  useEffect(() => {
    if (resumedRef.current || !visibleGuides.length) return
    resumedRef.current = true
    const saved = readStoredGuide()
    if (!saved?.id) return
    const guide = getHelpGuideById(saved.id)
    if (!guide || !guide.isVisible(ctx)) {
      sessionStorage.removeItem(GUIDE_STORAGE_KEY)
      return
    }
    if (!activeGuideId) {
      startGuide(saved.id, saved.step)
    }
  }, [visibleGuides, ctx, activeGuideId, startGuide])

  useEffect(() => {
    if (!isActive) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        stopGuide()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        nextStep()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        prevStep()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isActive, nextStep, prevStep, stopGuide])

  useEffect(() => {
    if (!isActive || !currentStep?.selector) return undefined
    const update = () => {
      const rect = resolveTargetRect(currentStep.selector)
      setTargetRect(rect)
      setTargetMissed(!rect)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isActive, currentStep, stepIndex, resolveTargetRect])

  useEffect(() => {
    if (!isActive || typeof document === 'undefined') return undefined
    document.body.dataset.helpGuideActive = 'true'
    return () => {
      delete document.body.dataset.helpGuideActive
    }
  }, [isActive])

  const value = useMemo(
    () => ({
      visibleGuides,
      activeGuide,
      activeGuideId,
      stepIndex,
      stepCount: steps.length,
      currentStep,
      targetRect,
      targetMissed,
      stepReady,
      isActive,
      isDemoMode,
      startGuide,
      stopGuide,
      nextStep,
      prevStep,
    }),
    [
      visibleGuides,
      activeGuide,
      activeGuideId,
      stepIndex,
      steps.length,
      currentStep,
      targetRect,
      targetMissed,
      stepReady,
      isActive,
      isDemoMode,
      startGuide,
      stopGuide,
      nextStep,
      prevStep,
    ],
  )

  return (
    <HelpGuideContext.Provider value={value}>{children}</HelpGuideContext.Provider>
  )
}

export function useHelpGuide() {
  const v = useContext(HelpGuideContext)
  if (!v) throw new Error('useHelpGuide HelpGuideProvider içinde kullanılmalı')
  return v
}

export function useHelpGuideOptional() {
  return useContext(HelpGuideContext)
}
