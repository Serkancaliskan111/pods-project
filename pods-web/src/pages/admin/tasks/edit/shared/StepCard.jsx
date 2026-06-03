import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Hourglass,
  Lock,
  Save,
  XCircle,
  Zap,
} from 'lucide-react'
import { isStepApprovedStatus, normalizeStepStatus } from '../../../../../lib/taskStatus.js'
import {
  inputClass,
  fieldClass,
  labelClass,
  formatDateTimeLocalInput,
  localInputToIso,
  personName,
} from './utils.js'
import EvidenceFields from './EvidenceFields.jsx'

function statusMeta(rawDurum) {
  const s = String(rawDurum || '').toLowerCase()
  if (s === 'onaylandi' || s === 'tamamlandi') {
    return {
      label: 'Onaylandı',
      bg: '#dcfce7',
      fg: '#15803d',
      border: '#bbf7d0',
      Icon: CheckCircle2,
    }
  }
  if (s === 'reddedildi') {
    return {
      label: 'Reddedildi',
      bg: '#fee2e2',
      fg: '#b91c1c',
      border: '#fecaca',
      Icon: XCircle,
    }
  }
  if (s === 'onay_bekliyor') {
    return {
      label: 'Onay bekliyor',
      bg: '#fef3c7',
      fg: '#92400e',
      border: '#fde68a',
      Icon: Hourglass,
    }
  }
  if (s === 'aktif') {
    return {
      label: 'Aktif',
      bg: '#dbeafe',
      fg: '#1e40af',
      border: '#bfdbfe',
      Icon: Clock,
    }
  }
  return {
    label: 'Sıra bekliyor',
    bg: '#f1f5f9',
    fg: '#475569',
    border: '#e2e8f0',
    Icon: Clock,
  }
}

/**
 * Sıralı Görev adım kartı. Yapılmamış adımlar inline edit, tamamlanmış adımlar kilitli rozet.
 */
export default function StepCard({ step, staff, onSave, disabled, prevStepBitis, nextStepBitis }) {
  const adimNo = Number(step?.adim_no || 0)
  const rawDurum = String(step?.adim_durum || step?.durum || '').toLowerCase()
  const meta = statusMeta(rawDurum)
  const StatusIcon = meta.Icon
  const lockedDurums = new Set(['onay_bekliyor', 'onaylandi', 'reddedildi', 'tamamlandi'])
  const isLocked =
    lockedDurums.has(rawDurum) ||
    isStepApprovedStatus(normalizeStepStatus(rawDurum))

  const istenenler =
    step?.adim_istenenler && typeof step.adim_istenenler === 'object'
      ? step.adim_istenenler
      : {}
  const baselineKanit =
    istenenler.kanit && typeof istenenler.kanit === 'object' ? istenenler.kanit : {}

  const initialForm = useMemo(
    () => ({
      adim_baslik: step?.adim_baslik || '',
      personel_id: step?.personel_id ? String(step.personel_id) : '',
      denetimci_personel_id: step?.denetimci_personel_id
        ? String(step.denetimci_personel_id)
        : '',
      aciklama: istenenler.aciklama || '',
      baslama_tarihi: istenenler.baslama_tarihi
        ? formatDateTimeLocalInput(istenenler.baslama_tarihi)
        : '',
      bitis_tarihi: istenenler.bitis_tarihi
        ? formatDateTimeLocalInput(istenenler.bitis_tarihi)
        : '',
      puan: Number.isFinite(Number(istenenler.puan)) ? Number(istenenler.puan) : 0,
      acil: !!istenenler.acil,
      aciklama_zorunlu: !!istenenler.aciklama_zorunlu,
      kanit: {
        foto_zorunlu: !!baselineKanit.foto_zorunlu,
        min_foto_sayisi: Number(baselineKanit.min_foto_sayisi || 0),
        video_zorunlu: !!baselineKanit.video_zorunlu,
        min_video_sayisi: Number(baselineKanit.min_video_sayisi || 0),
        max_video_suresi_sn: Number(baselineKanit.max_video_suresi_sn || 60),
        belge_zorunlu: !!baselineKanit.belge_zorunlu,
        min_belge_sayisi: Number(baselineKanit.min_belge_sayisi || 0),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step?.id, step?.adim_durum, step?.durum],
  )

  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isFirst = adimNo === 1
  const startIso = localInputToIso(form.baslama_tarihi)
  const endIso = localInputToIso(form.bitis_tarihi)

  let rangeError = ''
  if (isFirst && startIso && endIso && new Date(endIso) <= new Date(startIso)) {
    rangeError = 'Bitiş, başlangıçtan sonra olmalı.'
  }
  if (!rangeError && endIso && prevStepBitis) {
    if (new Date(endIso) <= new Date(prevStepBitis)) {
      rangeError = 'Bitiş, önceki adımın bitişinden sonra olmalı.'
    }
  }
  if (!rangeError && endIso && nextStepBitis) {
    if (new Date(endIso) >= new Date(nextStepBitis)) {
      rangeError = 'Bitiş, sonraki adımın bitişinden önce olmalı.'
    }
  }

  const handleSave = async () => {
    if (disabled || saving) return
    if (rangeError) {
      setError(rangeError)
      return
    }
    if (!form.personel_id) {
      setError('Adımın sorumlusunu seçin.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const patch = {
        personel_id: form.personel_id,
        denetimci_personel_id: form.denetimci_personel_id || null,
        adim_baslik: form.adim_baslik?.trim() || null,
        adim_istenenler: {
          aciklama: form.aciklama?.trim() || null,
          ...(isFirst ? { baslama_tarihi: startIso } : {}),
          bitis_tarihi: endIso,
          puan: Number(form.puan) || 0,
          acil: !!form.acil,
          aciklama_zorunlu: !!form.aciklama_zorunlu,
          kanit: {
            foto_zorunlu: !!form.kanit.foto_zorunlu,
            min_foto_sayisi: form.kanit.foto_zorunlu
              ? Math.max(0, Math.min(5, Number(form.kanit.min_foto_sayisi) || 0))
              : 0,
            video_zorunlu: !!form.kanit.video_zorunlu,
            min_video_sayisi: form.kanit.video_zorunlu
              ? Math.max(0, Math.min(3, Number(form.kanit.min_video_sayisi) || 1))
              : 0,
            max_video_suresi_sn: Math.min(
              60,
              Math.max(5, Number(form.kanit.max_video_suresi_sn) || 60),
            ),
            belge_zorunlu: !!form.kanit.belge_zorunlu,
            min_belge_sayisi: form.kanit.belge_zorunlu
              ? Math.max(1, Math.min(5, Number(form.kanit.min_belge_sayisi) || 1))
              : 0,
          },
        },
      }
      await onSave?.(adimNo, patch)
    } catch (e) {
      setError(e?.message || 'Adım kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      style={{
        position: 'relative',
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${isLocked ? '#e2e8f0' : '#dbeafe'}`,
        background: isLocked
          ? 'linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)'
          : 'linear-gradient(180deg,#ffffff 0%,#fbfdff 100%)',
        boxShadow: isLocked ? 'none' : '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: isLocked ? '#e2e8f0' : '#eef2ff',
              color: isLocked ? '#475569' : '#4f46e5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
              flexShrink: 0,
              border: `1px solid ${isLocked ? '#cbd5e1' : '#c7d2fe'}`,
            }}
          >
            {adimNo}
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Adım {adimNo}
              {form.adim_baslik?.trim() ? (
                <span style={{ marginLeft: 6, fontWeight: 600, color: '#475569' }}>
                  — {form.adim_baslik.trim()}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>
              {isFirst ? 'İlk adım (başlangıç tarihi tanımlanır)' : 'Önceki adım onaylanınca başlar'}
            </div>
          </div>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 9999,
            backgroundColor: meta.bg,
            color: meta.fg,
            fontSize: 11.5,
            fontWeight: 700,
            border: `1px solid ${meta.border}`,
            flexShrink: 0,
          }}
        >
          <StatusIcon size={12} strokeWidth={2.4} />
          {meta.label}
        </span>
      </header>

      {isLocked ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: '#ffffff',
            color: '#475569',
            fontSize: 12.5,
            border: '1px solid #e2e8f0',
          }}
        >
          <Lock size={14} strokeWidth={2.2} />
          Bu adım yapıldı veya denetimde; düzenlenemez.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={fieldClass}>
              <span className={labelClass}>Adım başlığı</span>
              <input
                className={inputClass}
                value={form.adim_baslik}
                disabled={disabled}
                onChange={(ev) => setForm((f) => ({ ...f, adim_baslik: ev.target.value }))}
                placeholder={`${adimNo}. adım`}
              />
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>Puan</span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.puan}
                disabled={disabled}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, puan: Math.max(0, Number(ev.target.value) || 0) }))
                }
              />
            </label>
          </div>

          <label className={fieldClass}>
            <span className={labelClass}>Adım açıklaması</span>
            <textarea
              className={inputClass}
              rows={2}
              value={form.aciklama}
              disabled={disabled}
              onChange={(ev) => setForm((f) => ({ ...f, aciklama: ev.target.value }))}
              placeholder="Personele iletilecek talimat"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={fieldClass}>
              <span className={labelClass}>Sorumlu</span>
              <select
                className={inputClass}
                value={form.personel_id}
                disabled={disabled}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, personel_id: ev.target.value }))
                }
              >
                <option value="">Seçin</option>
                {(staff || []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {personName(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>Denetimci</span>
              <select
                className={inputClass}
                value={form.denetimci_personel_id}
                disabled={disabled}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, denetimci_personel_id: ev.target.value }))
                }
              >
                <option value="">— (otomatik)</option>
                {(staff || []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {personName(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isFirst ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className={fieldClass}>
                <span className={labelClass}>Başlangıç</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.baslama_tarihi}
                  disabled={disabled}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, baslama_tarihi: ev.target.value }))
                  }
                />
              </label>
              <label className={fieldClass}>
                <span className={labelClass}>Bitiş</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.bitis_tarihi}
                  disabled={disabled}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, bitis_tarihi: ev.target.value }))
                  }
                />
              </label>
            </div>
          ) : (
            <label className={fieldClass}>
              <span className={labelClass}>Bitiş (kronolojiye uygun)</span>
              <input
                type="datetime-local"
                className={inputClass}
                value={form.bitis_tarihi}
                disabled={disabled}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, bitis_tarihi: ev.target.value }))
                }
              />
            </label>
          )}

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: form.acil ? '#b91c1c' : '#0f172a',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={!!form.acil}
              disabled={disabled}
              onChange={(ev) => setForm((f) => ({ ...f, acil: ev.target.checked }))}
            />
            <Zap
              size={14}
              strokeWidth={2.4}
              style={{ color: form.acil ? '#dc2626' : '#94a3b8' }}
            />
            Acil adım
          </label>

          <EvidenceFields
            value={{ ...form.kanit, aciklama_zorunlu: form.aciklama_zorunlu }}
            disabled={disabled}
            fotoMax={5}
            onChange={(next) => {
              const { aciklama_zorunlu, ...kanit } = next
              setForm((f) => ({ ...f, kanit, aciklama_zorunlu: !!aciklama_zorunlu }))
            }}
          />

          {error || rangeError ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 10,
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                fontSize: 12,
                border: '1px solid #fecaca',
              }}
            >
              <AlertCircle size={14} strokeWidth={2.2} />
              {error || rangeError}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              borderTop: '1px dashed #e2e8f0',
              paddingTop: 12,
            }}
          >
            <button
              type="button"
              disabled={disabled || saving || !!rangeError}
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background:
                  disabled || saving || !!rangeError
                    ? '#94a3b8'
                    : 'linear-gradient(180deg,#4f46e5 0%,#4338ca 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12.5,
                cursor:
                  disabled || saving || !!rangeError ? 'not-allowed' : 'pointer',
                boxShadow:
                  disabled || saving || !!rangeError
                    ? 'none'
                    : '0 4px 12px -4px rgba(79,70,229,0.5)',
              }}
            >
              <Save size={14} strokeWidth={2.4} />
              {saving ? 'Kaydediliyor…' : 'Adımı kaydet'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
