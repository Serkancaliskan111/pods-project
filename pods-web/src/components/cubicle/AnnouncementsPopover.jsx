import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Megaphone,
} from 'lucide-react'
import getSupabase from '../../lib/supabaseClient'
import {
  countUnreadAnnouncements,
  filterUnreadAnnouncements,
  loadReadAnnouncementIds,
  saveReadAnnouncementIds,
} from '../../lib/announcementRead.js'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { useHelpGuidePopoverZ } from '../../hooks/useHelpGuidePopoverZ.js'

const supabase = getSupabase()
const PANEL_Z_INDEX = 10040
const PANEL_MAX_WIDTH = 352
/** Pop-up’ta gösterilecek okunmamış adayları (okunanlar listeden düşer) */
const POPUP_FETCH_LIMIT = 40
const POPUP_DISPLAY_MAX = 8

function formatRelativeTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'az önce'
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return 'az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  if (diffHour < 24) return `${diffHour} sa önce`
  if (diffDay < 7) return `${diffDay} gün önce`
  return date.toLocaleDateString('tr-TR')
}

export default function AnnouncementsPopover() {
  const { profile, personel, user } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const companyScoped = !isSystemAdmin && !!personel?.ana_sirket_id
  const readScopeId = personel?.id
    ? String(personel.id)
    : user?.id
      ? String(user.id)
      : ''

  const [open, setOpen] = useState(false)
  const panelZ = useHelpGuidePopoverZ(PANEL_Z_INDEX)
  const [readIds, setReadIds] = useState(() => loadReadAnnouncementIds(readScopeId))
  const [loading, setLoading] = useState(false)
  const [allItems, setAllItems] = useState([])
  const [index, setIndex] = useState(0)
  const [slideDir, setSlideDir] = useState('next')
  const [animTick, setAnimTick] = useState(0)
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('duyurular')
        .select('id, metin, created_at, gonderen_personel_id, ana_sirket_id')
        .order('created_at', { ascending: false })
        .limit(POPUP_FETCH_LIMIT)

      if (!isSystemAdmin && personel?.ana_sirket_id) {
        q = q.eq('ana_sirket_id', personel.ana_sirket_id)
      }

      const { data, error } = await q
      if (error) {
        console.error(error)
        setAllItems([])
        return
      }

      const rows = Array.isArray(data) ? data : []
      const senderIds = [...new Set(rows.map((r) => r.gonderen_personel_id).filter(Boolean))]
      const companyIds = [...new Set(rows.map((r) => r.ana_sirket_id).filter(Boolean))]

      let senderMap = {}
      if (senderIds.length) {
        const { data: people } = await supabase
          .from('personeller')
          .select('id, ad, soyad, email')
          .in('id', senderIds)
        ;(people || []).forEach((p) => {
          const name = `${p.ad || ''} ${p.soyad || ''}`.trim()
          senderMap[String(p.id)] = name || p.email || 'Yönetici'
        })
      }

      let companyMap = {}
      if (companyIds.length) {
        const { data: companies } = await supabase
          .from('ana_sirketler')
          .select('id, ana_sirket_adi')
          .in('id', companyIds)
        ;(companies || []).forEach((c) => {
          companyMap[String(c.id)] = c.ana_sirket_adi || 'Bilinmeyen Şirket'
        })
      }

      setAllItems(
        rows.map((row) => ({
          id: row.id,
          text: row.metin || '-',
          senderName: senderMap[String(row.gonderen_personel_id)] || 'Yönetici',
          companyName: companyMap[String(row.ana_sirket_id)] || 'Bilinmeyen Şirket',
          timeRelative: formatRelativeTime(row.created_at),
        })),
      )
      setIndex(0)
    } finally {
      setLoading(false)
    }
  }, [isSystemAdmin, personel?.ana_sirket_id])

  useEffect(() => {
    setReadIds(loadReadAnnouncementIds(readScopeId))
  }, [readScopeId])

  useEffect(() => {
    load()
  }, [load])

  const popupItems = useMemo(
    () => filterUnreadAnnouncements(allItems, readIds).slice(0, POPUP_DISPLAY_MAX),
    [allItems, readIds],
  )

  const unreadCount = useMemo(
    () => countUnreadAnnouncements(allItems, readIds),
    [allItems, readIds],
  )

  const markRead = useCallback(
    (announcementId) => {
      if (!announcementId || !readScopeId) return
      const id = String(announcementId)
      setReadIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        saveReadAnnouncementIds(readScopeId, next)
        return next
      })
    },
    [readScopeId],
  )

  const markAllRead = useCallback(() => {
    if (!readScopeId || !popupItems.length) return
    setReadIds((prev) => {
      const next = new Set(prev)
      for (const item of popupItems) {
        if (item?.id != null) next.add(String(item.id))
      }
      saveReadAnnouncementIds(readScopeId, next)
      return next
    })
    setIndex(0)
  }, [popupItems, readScopeId])

  useEffect(() => {
    if (!open) return undefined
    updateAnchor()
    window.addEventListener('resize', updateAnchor)
    window.addEventListener('scroll', updateAnchor, true)
    return () => {
      window.removeEventListener('resize', updateAnchor)
      window.removeEventListener('scroll', updateAnchor, true)
    }
  }, [open, updateAnchor])

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      const target = e.target
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!popupItems.length) {
      setIndex(0)
      return
    }
    setIndex((prev) => Math.max(0, Math.min(prev, popupItems.length - 1)))
  }, [popupItems.length])

  const current = popupItems[index]
  const count = popupItems.length
  const hasAnyAnnouncements = allItems.length > 0
  const allCaughtUp = hasAnyAnnouncements && count === 0

  const go = (direction) => {
    if (!popupItems.length) return
    if (direction === 'prev') {
      setIndex((prev) => {
        if (prev <= 0) return prev
        setSlideDir('prev')
        setAnimTick((t) => t + 1)
        return prev - 1
      })
      return
    }
    setIndex((prev) => {
      if (prev >= popupItems.length - 1) return prev
      setSlideDir('next')
      setAnimTick((t) => t + 1)
      return prev + 1
    })
  }

  const panelTitle = useMemo(
    () => (companyScoped ? 'Kurumsal duyurular' : 'Tüm şirket duyuruları'),
    [companyScoped],
  )

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Duyurular"
            className="w-[min(calc(100vw-2.5rem),22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
            style={{
              position: 'fixed',
              top: anchor.top,
              left: anchor.left,
              zIndex: panelZ,
            }}
          >
            <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-indigo-900 via-indigo-700 to-indigo-600 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-indigo-100">
                  <Megaphone size={14} strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-white">Duyurular</div>
                  <div className="truncate text-[10px] text-indigo-100/90">{panelTitle}</div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {count > 0 && unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-white/20"
                  >
                    <CheckCheck size={11} strokeWidth={2.5} aria-hidden />
                    Tümünü okundu say
                  </button>
                ) : null}
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-100">
                  {count ? `${index + 1} / ${count}` : 'Boş'}
                </span>
              </div>
            </div>

            <div className="p-2.5">
              {loading ? (
                <div className="py-8 text-center text-[12px] text-slate-500">Yükleniyor…</div>
              ) : count ? (
                <div className="relative px-7">
                  <button
                    type="button"
                    onClick={() => go('prev')}
                    disabled={index <= 0}
                    className="absolute left-0 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm transition disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:shadow-none"
                    aria-label="Önceki duyuru"
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => go('next')}
                    disabled={index >= count - 1}
                    className="absolute right-0 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm transition disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:shadow-none"
                    aria-label="Sonraki duyuru"
                  >
                    <ChevronRight size={14} strokeWidth={2.5} />
                  </button>

                  <div
                    key={`${index}-${animTick}`}
                    className="rounded-lg border border-indigo-300 bg-gradient-to-b from-indigo-50/80 to-white p-2.5 ring-1 ring-indigo-200"
                    style={{
                      animation:
                        slideDir === 'next'
                          ? 'ann-pop-slide-right 220ms ease'
                          : 'ann-pop-slide-left 220ms ease',
                    }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                      {companyScoped ? current?.senderName : current?.companyName}
                    </div>
                    <p className="mt-1 line-clamp-4 text-[12px] leading-snug text-slate-700">
                      {current?.text}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                      <span className="truncate">
                        {!companyScoped ? current?.senderName : 'Kurumsal duyuru'}
                      </span>
                      <span className="shrink-0 font-semibold text-indigo-600">
                        {current?.timeRelative}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-center gap-1.5">
                    {popupItems.map((a, idx) => (
                      <span
                        key={a.id}
                        className="h-1.5 rounded-full transition-all duration-200"
                        style={{
                          width: idx === index ? 16 : 6,
                          backgroundColor: idx === index ? '#4f46e5' : '#818cf8',
                        }}
                      />
                    ))}
                  </div>

                  {current?.id ? (
                    <button
                      type="button"
                      onClick={() => markRead(current.id)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
                    >
                      <CheckCheck size={13} strokeWidth={2.5} aria-hidden />
                      Okundu say
                    </button>
                  ) : null}
                </div>
              ) : allCaughtUp ? (
                <div className="rounded-lg border border-dashed border-indigo-100 bg-indigo-50/50 py-6 text-center">
                  <p className="text-[12px] font-semibold text-indigo-800">
                    Tüm güncel duyurular okundu
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Geçmiş duyurular için tüm duyurular sayfasına gidin.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-[12px] text-slate-400">
                  Şu anda duyuru bulunmuyor.
                </div>
              )}

              <Link
                to="/admin/announcements"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200/80 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-800 transition hover:bg-indigo-100"
              >
                Tüm duyurular
                <ExternalLink size={12} strokeWidth={2.2} />
              </Link>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <style>{`
        @keyframes ann-pop-slide-right {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes ann-pop-slide-left {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div ref={triggerRef} className="relative" data-help="announcements">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => {
              const next = !v
              if (next) {
                requestAnimationFrame(updateAnchor)
              }
              return next
            })
          }}
          className={`relative rounded-lg p-2 transition ${
            open
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
          }`}
          aria-label="Duyurular"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Megaphone size={17} strokeWidth={1.75} />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      </div>
      {panel}
    </>
  )
}
