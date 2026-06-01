import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const STORAGE = {
  page: 'pods_chat_sidebar_w_page_v2',
  quick: 'pods_chat_sidebar_w_quick_v2',
}

const LIMITS = {
  page: { min: 260, max: 520, minMain: 340, ratio: 0.36, cap: 400 },
  quick: { min: 200, max: 380, minMain: 300, ratio: 0.34, cap: 280 },
}

function clampWidth(w, shellEl, variant) {
  const limits = LIMITS[variant]
  const shellW = shellEl?.getBoundingClientRect().width ?? 9999
  const maxW = Math.min(limits.max, shellW - limits.minMain)
  return Math.min(maxW, Math.max(limits.min, w))
}

/** Kabuk genişliğine göre dengeli varsayılan (eski min(400px, 38%) davranışı) */
export function getDefaultSidebarWidth(shellEl, variant) {
  const limits = LIMITS[variant]
  const shellW = shellEl?.getBoundingClientRect().width ?? 1000
  const target = Math.min(limits.cap, Math.round(shellW * limits.ratio))
  return clampWidth(target, shellEl, variant)
}

function readStored(variant, shellEl) {
  const limits = LIMITS[variant]
  try {
    const raw = localStorage.getItem(STORAGE[variant])
    const v = Number(raw)
    if (Number.isFinite(v)) {
      const w = Math.min(limits.max, Math.max(limits.min, v))
      if (shellEl) return clampWidth(w, shellEl, variant)
      return w
    }
  } catch {
    /* ignore */
  }
  if (shellEl) return getDefaultSidebarWidth(shellEl, variant)
  return variant === 'page' ? 380 : 300
}

export function getChatWaCssVars(chatWa) {
  return {
    '--chat-shell': chatWa.shell,
    '--chat-panel': chatWa.panel,
    '--chat-header': chatWa.header,
    '--chat-border': chatWa.border,
    '--chat-row-hover': chatWa.rowHover,
    '--chat-row-active': chatWa.rowActive,
    '--chat-text': chatWa.text,
    '--chat-text-muted': chatWa.textMuted,
    '--chat-search-bg': chatWa.searchBg,
    '--chat-accent': chatWa.accent,
    '--chat-wallpaper': chatWa.wallpaper,
    '--chat-bubble-out': chatWa.bubbleOut,
    '--chat-bubble-in': chatWa.bubbleIn,
    '--chat-input-bar': chatWa.inputBar,
    '--chat-input-field': chatWa.inputField,
    '--chat-icon': chatWa.icon,
    '--chat-avatar-bg': chatWa.avatarBg,
    '--chat-avatar-text': chatWa.avatarText,
  }
}

/** @param {'page' | 'quick'} variant */
export function useChatSidebarResize(variant) {
  const shellRef = useRef(null)
  const widthRef = useRef(variant === 'page' ? 380 : 300)
  const [sidebarWidth, setSidebarWidth] = useState(() => (variant === 'page' ? 380 : 300))
  const hasSyncedRef = useRef(false)

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const stored = (() => {
      try {
        return localStorage.getItem(STORAGE[variant])
      } catch {
        return null
      }
    })()

    const next = stored != null ? readStored(variant, shell) : getDefaultSidebarWidth(shell, variant)
    widthRef.current = next
    setSidebarWidth(next)
    hasSyncedRef.current = true
  }, [variant])

  useEffect(() => {
    if (!hasSyncedRef.current) return
    widthRef.current = sidebarWidth
    try {
      localStorage.setItem(STORAGE[variant], String(Math.round(sidebarWidth)))
    } catch {
      /* ignore */
    }
  }, [sidebarWidth, variant])

  const clientX = (ev) => ev.touches?.[0]?.clientX ?? ev.clientX

  const onSplitterPointerDown = useCallback(
    (e) => {
      const shell = shellRef.current
      if (!shell) return
      e.preventDefault()
      shell.classList.add('chat-wa-shell--resizing')

      const startX = clientX(e)
      const startW = widthRef.current

      const onMove = (ev) => {
        if (ev.cancelable) ev.preventDefault()
        const delta = clientX(ev) - startX
        const next = clampWidth(startW + delta, shell, variant)
        widthRef.current = next
        setSidebarWidth(next)
      }

      const end = () => {
        shell.classList.remove('chat-wa-shell--resizing')
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', end)
        document.removeEventListener('touchmove', onMove)
        document.removeEventListener('touchend', end)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', end)
      document.addEventListener('touchmove', onMove, { passive: false })
      document.addEventListener('touchend', end)
    },
    [variant],
  )

  const nudgeSidebar = useCallback(
    (delta) => {
      const shell = shellRef.current
      if (!shell) return
      setSidebarWidth((w) => {
        const next = clampWidth(w + delta, shell, variant)
        widthRef.current = next
        return next
      })
    },
    [variant],
  )

  return { shellRef, sidebarWidth, onSplitterPointerDown, nudgeSidebar }
}
