import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ClipboardList, Clock, AlertTriangle } from 'lucide-react'
import { useTaskNotifications } from '../../hooks/useTaskNotifications.js'
import { useHelpGuidePopoverZ } from '../../hooks/useHelpGuidePopoverZ.js'
import { AuthContext } from '../../contexts/AuthContext.jsx'

const PANEL_Z_INDEX = 10040
const PANEL_MAX_WIDTH = 380

const TONE_STYLES = {
  info: { bg: '#eff6ff', border: '#bfdbfe', icon: '#2563eb' },
  warning: { bg: '#fffbeb', border: '#fde68a', icon: '#d97706' },
  danger: { bg: '#fef2f2', border: '#fecaca', icon: '#dc2626' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', icon: '#16a34a' },
}

function NotifIcon({ type }) {
  if (type === 'overdue') return <AlertTriangle size={16} />
  if (type === 'due_soon') return <Clock size={16} />
  if (type === 'audit_pending') return <CheckCheck size={16} />
  return <ClipboardList size={16} />
}

export default function NotificationsPopover() {
  const { personel } = useContext(AuthContext)
  const navigate = useNavigate()
  const {
    loading,
    notifications,
    unreadCount,
    reload,
    markRead,
    markAllRead,
    readIds,
  } = useTaskNotifications()

  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const panelZ = useHelpGuidePopoverZ(PANEL_Z_INDEX)

  const updateAnchor = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 24)
    let left = rect.left
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12)
    }
    setAnchor({ top: rect.bottom + 8, left })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    updateAnchor()
    const onScroll = () => updateAnchor()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updateAnchor])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (
        panelRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload])

  const onOpen = () => {
    updateAnchor()
    setOpen((v) => !v)
  }

  const onItemClick = (item) => {
    markRead(item.id)
    setOpen(false)
    if (item.href) navigate(item.href)
  }

  const panel =
    open && personel?.id ? (
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Bildirimler"
        className="fixed max-h-[min(420px,70vh)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        style={{
          zIndex: panelZ,
          top: anchor.top,
          left: anchor.left,
          width: Math.min(PANEL_MAX_WIDTH, window.innerWidth - 24),
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Bildirimler</p>
            <p className="text-[11px] text-slate-500">
              Görev atama, çalışma durumu, süre ve gecikme uyarıları
            </p>
          </div>
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Tümünü okundu say
            </button>
          ) : null}
        </div>
        <div className="overflow-y-auto overscroll-contain p-2">
          {loading && !notifications.length ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Yükleniyor…</p>
          ) : null}
          {!loading && !notifications.length ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              Yeni bildirim yok.
            </p>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {notifications.map((item) => {
              const unread = !readIds.has(item.id)
              const tone = TONE_STYLES[item.tone] || TONE_STYLES.info
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(item)}
                    className={`flex w-full gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:brightness-[0.98] ${
                      unread ? 'ring-1 ring-indigo-200' : 'opacity-80'
                    }`}
                    style={{
                      backgroundColor: tone.bg,
                      borderColor: tone.border,
                    }}
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80"
                      style={{ color: tone.icon }}
                    >
                      <NotifIcon type={item.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-slate-800">
                        {item.title}
                        {unread ? (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 align-middle" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-600">
                        {item.detail}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-help="notifications-bell"
        onClick={onOpen}
        className="relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={16} strokeWidth={1.75} />
        Bildirimler
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
      {typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </>
  )
}
