import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Building2, Check, Megaphone, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import {
  buildBirimHierarchyCtx,
  createAnnouncement,
  fetchAnnouncementUnits,
  notifyAnnouncementsChanged,
} from '../../lib/announcementCreateApi.js'
import { Button, Modal, Spinner, Textarea } from '../../ui'
import { cn } from '../../lib/cn'

function StepBadge({ n, children }) {
  return (
    <div className="mb-2 flex shrink-0 items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
        {n}
      </span>
      <h3 className="text-sm font-bold text-slate-900">{children}</h3>
    </div>
  )
}

export default function CreateAnnouncementModal({ open, onClose }) {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}

  const [units, setUnits] = useState([])
  const [audienceMode, setAudienceMode] = useState('pick')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [unitSearch, setUnitSearch] = useState('')
  const [text, setText] = useState('')
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadUnits = useCallback(async () => {
    if (!personel?.ana_sirket_id) return
    setLoadingUnits(true)
    try {
      const ctx = buildBirimHierarchyCtx({ isSystemAdmin, personel, permissions })
      const rows = await fetchAnnouncementUnits({
        anaSirketId: personel.ana_sirket_id,
        birimHierarchyCtx: ctx,
      })
      setUnits(rows)
    } catch (e) {
      toast.error(e?.message || 'Birimler yüklenemedi')
      setUnits([])
    } finally {
      setLoadingUnits(false)
    }
  }, [isSystemAdmin, personel, permissions])

  useEffect(() => {
    if (!open) return
    setText('')
    setUnitSearch('')
    setAudienceMode('pick')
    setSelectedUnitIds([])
    void loadUnits()
  }, [open, loadUnits])

  const effectiveUnitIds = useMemo(() => {
    if (audienceMode === 'all') return units.map((u) => u.id)
    return selectedUnitIds
  }, [audienceMode, units, selectedUnitIds])

  const filteredUnits = useMemo(() => {
    const term = unitSearch.trim().toLowerCase()
    if (!term) return units
    return units.filter((u) => (u.name || '').toLowerCase().includes(term))
  }, [units, unitSearch])

  const selectedCount = effectiveUnitIds.length

  const toggleUnit = (unitId) => {
    const id = String(unitId)
    setAudienceMode('pick')
    setSelectedUnitIds((prev) => {
      if (prev.some((x) => String(x) === id)) {
        return prev.filter((x) => String(x) !== id)
      }
      return [...prev, unitId]
    })
  }

  const handleSubmit = async () => {
    if (!personel?.ana_sirket_id || !personel?.id) return
    setSubmitting(true)
    try {
      const { pushSent, pushSkipped } = await createAnnouncement({
        anaSirketId: personel.ana_sirket_id,
        gonderenPersonelId: personel.id,
        metin: text,
        hedefBirimIds: effectiveUnitIds,
      })
      notifyAnnouncementsChanged()
      if (pushSkipped) {
        toast.success('Duyuru yayınlandı', {
          description: pushSent
            ? undefined
            : 'Mobil bildirim gönderilemedi; kayıt duyuru listesinde görünür.',
        })
      } else {
        toast.success(`Duyuru yayınlandı (${pushSent} mobil bildirim)`)
      }
      onClose?.()
    } catch (e) {
      toast.error(e?.message || 'Duyuru gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    text.trim().length > 0 && selectedCount > 0 && !loadingUnits && !submitting

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni duyuru yayınla"
      size="xl"
      className="!max-w-5xl"
    >
      <div className="flex h-[min(480px,78vh)] flex-col overflow-hidden">
        <p className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-xs leading-relaxed text-slate-600">
          Sol tarafta metni yazın, sağ tarafta hedef birimleri seçin. Yalnızca birim listesi kaydırılır.
        </p>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:divide-x md:divide-slate-100">
          {/* Sol: metin */}
          <section className="flex min-h-0 flex-col overflow-hidden px-5 py-4">
            <StepBadge n={1}>Duyuru metni</StepBadge>
            <div className="flex min-h-0 flex-1 flex-col">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Örn: Yarın 09:00’da toplantı salonunda tüm ekip toplanacaktır."
                rows={6}
                disabled={submitting}
                className="!mt-0 min-h-[140px] flex-1 resize-none"
              />
              <p className="mt-2 shrink-0 text-right text-[11px] text-slate-400">
                {text.trim().length} karakter
              </p>
            </div>
          </section>

          {/* Sağ: hedef */}
          <section className="flex min-h-0 flex-col overflow-hidden px-5 py-4">
            <StepBadge n={2}>Kime gönderilsin?</StepBadge>

            {loadingUnits ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            ) : units.length === 0 ? (
              <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 text-center text-sm text-amber-900">
                Erişebildiğiniz birim bulunamadı.
              </p>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  <label
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-xl border-2 p-3 transition',
                      audienceMode === 'all'
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="audience"
                      className="mt-0.5 shrink-0 accent-indigo-600"
                      checked={audienceMode === 'all'}
                      onChange={() => setAudienceMode('all')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <Users size={15} className="text-indigo-600" />
                        Tüm birimler
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                        {units.length} birim
                      </span>
                    </span>
                    {audienceMode === 'all' ? (
                      <Check size={16} className="shrink-0 text-indigo-600" strokeWidth={2.5} />
                    ) : null}
                  </label>

                  <label
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-xl border-2 p-3 transition',
                      audienceMode === 'pick'
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="audience"
                      className="mt-0.5 shrink-0 accent-indigo-600"
                      checked={audienceMode === 'pick'}
                      onChange={() => setAudienceMode('pick')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <Building2 size={15} className="text-indigo-600" />
                        Seçili birimler
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                        Listeden işaretle
                      </span>
                    </span>
                    {audienceMode === 'pick' && selectedUnitIds.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {selectedUnitIds.length}
                      </span>
                    ) : null}
                  </label>
                </div>

                {audienceMode === 'all' ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 text-center">
                    <Users size={28} className="text-indigo-400" strokeWidth={1.5} />
                    <p className="mt-2 text-sm font-semibold text-indigo-900">
                      {units.length} birimin tamamı hedeflenecek
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-slate-600">
                      Kapsamınızdaki tüm birimlerdeki personel duyuruyu görecek.
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
                    <div className="relative shrink-0 border-b border-slate-100 p-2">
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="search"
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                        placeholder="Birim ara…"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                      {filteredUnits.length === 0 ? (
                        <li className="py-6 text-center text-xs text-slate-500">Eşleşen birim yok</li>
                      ) : (
                        <li className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {filteredUnits.map((u) => {
                            const checked = selectedUnitIds.some(
                              (id) => String(id) === String(u.id),
                            )
                            return (
                              <label
                                key={u.id}
                                className={cn(
                                  'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition',
                                  checked
                                    ? 'border-indigo-300 bg-white shadow-sm'
                                    : 'border-transparent bg-white/90 hover:border-slate-200',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 shrink-0 rounded accent-indigo-600"
                                  checked={checked}
                                  onChange={() => toggleUnit(u.id)}
                                />
                                <span className="min-w-0 truncate text-xs font-medium text-slate-800">
                                  {u.name}
                                </span>
                              </label>
                            )
                          })}
                        </li>
                      )}
                    </ul>
                    {selectedUnitIds.length === 0 ? (
                      <p className="shrink-0 border-t border-amber-100 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-medium text-amber-900">
                        En az bir birim işaretleyin
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 bg-white px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Megaphone size={16} />
            </span>
            <span className="min-w-0 truncate">
              {selectedCount > 0 ? (
                <>
                  <strong className="text-slate-900">{selectedCount} birim</strong>
                  {audienceMode === 'all' ? ' (tümü)' : ''}
                  {' · '}
                  <strong className="text-slate-900">{text.trim().length}</strong> karakter
                </>
              ) : (
                <span className="text-amber-800">Hedef birim seçin</span>
              )}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              İptal
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {submitting ? 'Yayınlanıyor…' : 'Yayınla'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
