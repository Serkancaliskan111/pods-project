import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { Button, Input, Sheet, Textarea } from '../../../ui'
import {
  fetchPersonalTodoTemplateWithItems,
  savePersonalTodoTemplate,
} from '../../../lib/personalTodoApi.js'
import { TODO_MADDE_TIP_OPTIONS, normalizeMaddeTip } from '../../../lib/personalTodoItemTypes.js'

export default function PersonalTodoTemplateSheet({ open, templateId, userId, onClose, onSaved }) {
  const isEdit = !!templateId
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [maddeler, setMaddeler] = useState([{ id: uuidv4(), metin: '', tip: 'metin' }])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !userId) return
    if (!templateId) {
      setBaslik('')
      setAciklama('')
      setMaddeler([{ id: uuidv4(), metin: '', tip: 'metin' }])
      return
    }
    setLoading(true)
    void fetchPersonalTodoTemplateWithItems(templateId, userId)
      .then((tpl) => {
        if (!tpl) {
          toast.error('Şablon bulunamadı')
          onClose?.()
          return
        }
        setBaslik(tpl.baslik || '')
        setAciklama(tpl.aciklama || '')
        setMaddeler(
          (tpl.maddeler || []).length
            ? tpl.maddeler.map((m) => ({
                id: m.id,
                metin: m.metin || '',
                tip: normalizeMaddeTip(m.tip || m.madde_tipi),
              }))
            : [{ id: uuidv4(), metin: '', tip: 'metin' }],
        )
      })
      .catch((e) => toast.error(e?.message || 'Yüklenemedi'))
      .finally(() => setLoading(false))
  }, [open, templateId, userId, onClose])

  const save = async () => {
    if (!userId) return
    const filled = maddeler.filter((m) => String(m.metin || '').trim())
    if (!String(baslik || '').trim()) {
      toast.error('Şablon adı gerekli')
      return
    }
    if (!filled.length) {
      toast.error('En az bir madde ekleyin')
      return
    }
    setSaving(true)
    try {
      await savePersonalTodoTemplate({
        userId,
        id: templateId || null,
        baslik,
        aciklama,
        maddeler: filled,
      })
      toast.success(isEdit ? 'Şablon güncellendi' : 'Şablon oluşturuldu')
      onSaved?.()
      onClose?.()
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title={isEdit ? 'Şablonu düzenle' : 'Yeni şablon'}
      className="px-5 pb-8 pt-2"
      panelClassName="max-w-lg"
    >
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">Yükleniyor…</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-500">
            Sık kullandığınız kontrol listelerini kaydedin; yeni liste açarken maddeler hazır gelsin.
          </p>
          <Input
            label="Şablon adı"
            value={baslik}
            onChange={(e) => setBaslik(e.target.value)}
            placeholder="Örn: Açılış kontrolü"
          />
          <Textarea
            label="Açıklama (isteğe bağlı)"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            rows={2}
          />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                Maddeler
              </span>
              <button
                type="button"
                onClick={() => setMaddeler((s) => [...s, { id: uuidv4(), metin: '', tip: 'metin' }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
              >
                <Plus size={14} /> Madde ekle
              </button>
            </div>
            <ul className="space-y-2">
              {maddeler.map((m, idx) => (
                <li key={m.id} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <span className="mt-2.5 w-5 shrink-0 text-center text-xs font-bold text-slate-400">
                    {idx + 1}
                  </span>
                  <select
                    value={m.tip || 'metin'}
                    onChange={(e) =>
                      setMaddeler((s) =>
                        s.map((row, i) =>
                          i === idx ? { ...row, tip: normalizeMaddeTip(e.target.value) } : row,
                        ),
                      )
                    }
                    className="mt-0.5 w-[108px] shrink-0 rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
                  >
                    {TODO_MADDE_TIP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    value={m.metin}
                    onChange={(e) =>
                      setMaddeler((s) =>
                        s.map((row, i) => (i === idx ? { ...row, metin: e.target.value } : row)),
                      )
                    }
                    placeholder={
                      m.tip === 'video'
                        ? 'Örn: Alan turu videosu'
                        : m.tip === 'foto'
                          ? 'Örn: Vitrin fotoğrafı'
                          : 'Madde metni'
                    }
                  />
                  <button
                    type="button"
                    disabled={maddeler.length <= 1}
                    onClick={() => setMaddeler((s) => s.filter((_, i) => i !== idx))}
                    className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Maddeyi kaldır"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              İptal
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
