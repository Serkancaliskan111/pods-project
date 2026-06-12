import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  Award,
  CalendarRange,
  ChevronsRight,
  FileText,
  Image as ImageIcon,
  Link2,
  Plus,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../../../lib/supabaseClient'
import {
  isZincirGorevTuru,
  isZincirOnayTuru,
  zincirGorevStepsReorderEligible,
  zincirOnayStepsReorderEligible,
} from '../../../../../lib/zincirTasks.js'
import { useTaskEditFormState } from '../hooks/useTaskEditFormState.js'
import SectionCard from '../shared/SectionCard.jsx'
import MetaFields from '../shared/MetaFields.jsx'
import AssignmentFields from '../shared/AssignmentFields.jsx'
import TimingFields from '../shared/TimingFields.jsx'
import ScoringField from '../shared/ScoringField.jsx'
import EvidenceFields from '../shared/EvidenceFields.jsx'
import SaveBar from '../shared/SaveBar.jsx'
import {
  formatDateTimeLocalInput,
  inputClass,
  localInputToIso,
  personName,
} from '../shared/utils.js'

const supabase = getSupabase()

function buildBaseline(task) {
  if (!task) return null
  const rowFoto = !!task.foto_zorunlu
  let rowVideo = !!task.video_zorunlu
  if (rowFoto && rowVideo) rowVideo = false
  return {
    baslik: task.baslik || '',
    aciklama: task.aciklama ?? '',
    birim_id: task.birim_id ? String(task.birim_id) : '',
    sorumlu_personel_id: task.sorumlu_personel_id
      ? String(task.sorumlu_personel_id)
      : '',
    baslama_tarihi: task.baslama_tarihi
      ? formatDateTimeLocalInput(new Date(task.baslama_tarihi))
      : '',
    son_tarih: task.son_tarih
      ? formatDateTimeLocalInput(new Date(task.son_tarih))
      : '',
    puan:
      task.puan != null && Number.isFinite(Number(task.puan))
        ? String(task.puan)
        : '',
    foto_zorunlu: rowFoto,
    min_foto_sayisi: Number(task.min_foto_sayisi || 0),
    video_zorunlu: rowVideo,
    min_video_sayisi: rowVideo ? Number(task.min_video_sayisi || 0) : 0,
    max_video_suresi_sn: Math.min(
      60,
      Math.max(5, Number(task.max_video_suresi_sn) || 60),
    ),
    aciklama_zorunlu: !!task.aciklama_zorunlu,
    belge_zorunlu: !!task.belge_zorunlu,
    min_belge_sayisi: Number(task.min_belge_sayisi || 0),
    acil: !!task.acil,
  }
}

function ReorderList({
  label,
  hint,
  ids,
  onMove,
  onAppend,
  pick,
  setPick,
  staff,
  disabled,
  tone,
}) {
  const palette =
    tone === 'purple'
      ? { btn: '#7c3aed', border: '#ddd6fe', chipBg: '#f5f3ff', chipFg: '#6d28d9' }
      : { btn: '#0284c7', border: '#bae6fd', chipBg: '#f0f9ff', chipFg: '#0369a1' }

  const remaining = useMemo(
    () => staff.filter((p) => !ids.some((id) => String(id) === String(p.id))),
    [staff, ids],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: '#475569' }}>{hint}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select
          className={inputClass}
          style={{ flex: '1 1 200px', maxWidth: 360 }}
          value={pick}
          disabled={disabled}
          onChange={(ev) => setPick(ev.target.value)}
        >
          <option value="">{label} ekle…</option>
          {remaining.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {personName(p)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || !pick}
          onClick={onAppend}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: disabled || !pick ? '#94a3b8' : palette.btn,
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            cursor: disabled || !pick ? 'not-allowed' : 'pointer',
            boxShadow:
              disabled || !pick
                ? 'none'
                : `0 6px 16px -10px ${palette.btn}`,
          }}
        >
          <Plus size={13} strokeWidth={2.4} /> Listeye ekle
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          borderRadius: 12,
          padding: 8,
          backgroundColor: '#ffffff',
          border: '1px dashed #e2e8f0',
        }}
      >
        {ids.map((pid, idx) => {
          const person = staff.find((p) => String(p.id) === String(pid))
          const upDisabled = disabled || idx === 0 || ids.length < 2
          const downDisabled =
            disabled || idx >= ids.length - 1 || ids.length < 2
          return (
            <div
              key={`${pid}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                backgroundColor: idx === 0 ? palette.chipBg : '#f8fafc',
                border: `1px solid ${idx === 0 ? palette.border : '#e2e8f0'}`,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 9999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 12,
                  color: idx === 0 ? palette.chipFg : '#475569',
                  backgroundColor: '#fff',
                  border: `1px solid ${idx === 0 ? palette.border : '#e2e8f0'}`,
                }}
              >
                {idx + 1}
              </span>
              <span
                style={{
                  flex: '1 1 0',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0f172a',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {personName(person) || pid}
              </span>
              {idx === 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 9999,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: palette.chipFg,
                    backgroundColor: '#fff',
                    border: `1px solid ${palette.border}`,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <ChevronsRight size={11} strokeWidth={2.6} />
                  Aktif
                </span>
              ) : null}
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <IconBtn
                  disabled={upDisabled}
                  onClick={() => onMove(idx, -1)}
                  ariaLabel="Yukarı"
                >
                  <ArrowUp size={14} strokeWidth={2.4} />
                </IconBtn>
                <IconBtn
                  disabled={downDisabled}
                  onClick={() => onMove(idx, 1)}
                  ariaLabel="Aşağı"
                >
                  <ArrowDown size={14} strokeWidth={2.4} />
                </IconBtn>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IconBtn({ disabled, onClick, ariaLabel, children }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        backgroundColor: '#fff',
        color: disabled ? '#cbd5e1' : '#475569',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Zincir Görev / zincir onay / zincir görev + onay düzenleme formu.
 *
 * Zincir Görev tipinde birim sabittir; sorumlu sadece aktif adım için RPC tarafında değiştirilebilir.
 * Zincir Onayda normal görev gibi birim/sorumlu güncellenir; onay sırası ayrı tabloda yönetilir.
 */
export default function ChainTaskEditForm({
  task,
  units,
  staff,
  disabled,
  gorevSteps,
  onaySteps,
}) {
  const navigate = useNavigate()
  const baseline = useMemo(() => buildBaseline(task), [task])
  const { form, patch, setForm } = useTaskEditFormState(baseline || {})
  const [submitting, setSubmitting] = useState(false)
  const [pickG, setPickG] = useState('')
  const [pickO, setPickO] = useState('')

  const hasWork = isZincirGorevTuru(task?.gorev_turu)
  const hasOnay = isZincirOnayTuru(task?.gorev_turu)
  const gorevReorderAllowed = useMemo(
    () => zincirGorevStepsReorderEligible(gorevSteps),
    [gorevSteps],
  )
  const onayReorderAllowed = useMemo(
    () => zincirOnayStepsReorderEligible(onaySteps),
    [onaySteps],
  )

  const initialG = useMemo(
    () => (gorevSteps || []).map((r) => String(r.personel_id)),
    [gorevSteps],
  )
  const initialO = useMemo(
    () => (onaySteps || []).map((r) => String(r.onaylayici_personel_id)),
    [onaySteps],
  )
  const [gIds, setGIds] = useState(initialG)
  const [oIds, setOIds] = useState(initialO)

  // Yeni veriler geldiğinde sıraları senkronize et
  useEffect(() => {
    setGIds(initialG)
  }, [initialG])
  useEffect(() => {
    setOIds(initialO)
  }, [initialO])

  const moveG = (idx, delta) =>
    setGIds((prev) => {
      const j = idx + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[idx]
      next[idx] = next[j]
      next[j] = t
      if (hasWork && next.length) {
        setForm((f) => ({ ...f, sorumlu_personel_id: String(next[0]) }))
      }
      return next
    })

  const moveO = (idx, delta) =>
    setOIds((prev) => {
      const j = idx + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[idx]
      next[idx] = next[j]
      next[j] = t
      const k = Number(task?.zincir_onay_aktif_adim) || 0
      if (k >= 1 && next[k - 1]) {
        setForm((f) => ({ ...f, sorumlu_personel_id: String(next[k - 1]) }))
      }
      return next
    })

  const appendG = () => {
    const pid = String(pickG || '').trim()
    if (!pid) return toast.error('Eklenecek personeli seçin')
    if (gIds.some((x) => String(x) === pid)) {
      return toast.error('Bu personel zaten zincirde')
    }
    setGIds((prev) => [...prev, pid])
    setPickG('')
  }
  const appendO = () => {
    const pid = String(pickO || '').trim()
    if (!pid) return toast.error('Eklenecek onaylayıcıyı seçin')
    if (oIds.some((x) => String(x) === pid)) {
      return toast.error('Bu kişi zaten onay zincirinde')
    }
    setOIds((prev) => [...prev, pid])
    setPickO('')
  }

  const startIso = localInputToIso(form.baslama_tarihi)
  const endIso = localInputToIso(form.son_tarih)
  const rangeError =
    startIso && endIso && new Date(endIso) <= new Date(startIso)
      ? 'Bitiş, başlangıçtan sonra olmalı.'
      : ''

  const onSubmit = async (e) => {
    e?.preventDefault?.()
    if (!task?.id || disabled || submitting) return
    if (!String(form.baslik || '').trim()) {
      toast.error('Başlık zorunlu')
      return
    }
    if (rangeError) {
      toast.error(rangeError)
      return
    }

    const b = baseline || {}
    const patchPayload = {}
    if (String(form.baslik).trim() !== String(b.baslik || '').trim()) {
      patchPayload.baslik = String(form.baslik).trim()
    }
    const nextAci = String(form.aciklama || '').trim()
    const baseAci =
      b.aciklama == null || b.aciklama === '' ? '' : String(b.aciklama).trim()
    if (nextAci !== baseAci) patchPayload.aciklama = nextAci === '' ? null : nextAci

    // Birim: zincir görevde RPC reddediyor → sadece zincir-onayda gönder
    if (!hasWork) {
      const nextBirim = String(form.birim_id || '').trim() || null
      const baseBirim = b.birim_id ? String(b.birim_id) : ''
      if ((nextBirim || '') !== baseBirim) patchPayload.birim_id = nextBirim
    }

    const nextWorker = String(form.sorumlu_personel_id || '').trim() || null
    const baseWorker = b.sorumlu_personel_id ? String(b.sorumlu_personel_id) : ''
    if ((nextWorker || '') !== baseWorker) {
      if (!nextWorker) {
        toast.error('Sorumlu personel seçin')
        return
      }
      patchPayload.sorumlu_personel_id = nextWorker
    }

    if ((startIso || null) !== (b.baslama_tarihi ? new Date(b.baslama_tarihi).toISOString() : null)) {
      patchPayload.baslama_tarihi = startIso
    }
    if ((endIso || null) !== (b.son_tarih ? new Date(b.son_tarih).toISOString() : null)) {
      patchPayload.son_tarih = endIso
    }

    const pNum =
      form.puan === '' || form.puan == null ? null : Number(form.puan)
    if (pNum != null && (Number.isNaN(pNum) || pNum < 0)) {
      toast.error('Puan negatif olamaz')
      return
    }
    const baseP = b.puan === '' || b.puan == null ? null : Number(b.puan)
    if ((pNum ?? null) !== (baseP ?? null)) patchPayload.puan = pNum

    if (!!form.foto_zorunlu !== !!b.foto_zorunlu) {
      patchPayload.foto_zorunlu = !!form.foto_zorunlu
    }
    const minF = Math.max(0, Math.min(99, Number(form.min_foto_sayisi) || 0))
    if (minF !== Number(b.min_foto_sayisi || 0)) patchPayload.min_foto_sayisi = minF

    if (!!form.video_zorunlu !== !!b.video_zorunlu) {
      patchPayload.video_zorunlu = !!form.video_zorunlu
    }
    const minV = Math.max(0, Math.min(3, Number(form.min_video_sayisi) || 0))
    if (minV !== Number(b.min_video_sayisi || 0)) patchPayload.min_video_sayisi = minV

    const maxSn = Math.min(60, Math.max(5, Number(form.max_video_suresi_sn) || 60))
    if (maxSn !== Number(b.max_video_suresi_sn || 60)) patchPayload.max_video_suresi_sn = maxSn

    if (!!form.aciklama_zorunlu !== !!b.aciklama_zorunlu) {
      patchPayload.aciklama_zorunlu = !!form.aciklama_zorunlu
    }
    if (!!form.belge_zorunlu !== !!b.belge_zorunlu) {
      patchPayload.belge_zorunlu = !!form.belge_zorunlu
    }
    const minB = Math.max(0, Math.min(5, Number(form.min_belge_sayisi) || 0))
    if (minB !== Number(b.min_belge_sayisi || 0)) patchPayload.min_belge_sayisi = minB
    if (!!form.acil !== !!b.acil) patchPayload.acil = !!form.acil

    const gChanged =
      hasWork &&
      gorevReorderAllowed &&
      JSON.stringify(gIds) !== JSON.stringify(initialG)
    const oChanged =
      hasOnay &&
      onayReorderAllowed &&
      JSON.stringify(oIds) !== JSON.stringify(initialO)

    if (!Object.keys(patchPayload).length && !gChanged && !oChanged) {
      toast.info('Değişiklik yok')
      return
    }

    setSubmitting(true)
    try {
      if (gChanged || oChanged) {
        const { error: reErr } = await supabase.rpc(
          'rpc_zincir_operasyon_adimlari_yeniden_sirala',
          {
            p_is_id: task.id,
            p_gorev_personel_ids: gChanged ? gIds : null,
            p_onay_personel_ids: oChanged ? oIds : null,
          },
        )
        if (reErr) throw reErr
      }
      if (Object.keys(patchPayload).length) {
        const { error } = await supabase.rpc('rpc_is_operasyonel_guncelle', {
          p_is_id: task.id,
          p_patch: patchPayload,
        })
        if (error) throw error
      }
      toast.success('Görev güncellendi')
      navigate(`/admin/tasks/${task.id}`, { replace: true })
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Güncelleme başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  const aktifAdim = Number(task?.zincir_aktif_adim) || 1

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {hasWork ? (
        <SectionCard
          tone="info"
          icon={Link2}
          title="Zincir Görev akışı"
          subtitle={`Birim sabittir. Sorumlu personel yalnızca aktif adım (şu an adım ${aktifAdim}) için değişir; tamamlanmış adımlar sunucuda reddedilir.`}
        />
      ) : null}
      {!hasWork && hasOnay ? (
        <SectionCard
          tone="purple"
          icon={ShieldCheck}
          title="Zincir Onay"
          subtitle="Görev yürütmesi standart görev gibi birim ve sorumlu güncellenebilir. Onay sırası aşağıdaki listeyle yönetilir."
        />
      ) : null}

      <SectionCard icon={FileText} title="Görev bilgileri">
        <MetaFields
          baslik={form.baslik}
          aciklama={form.aciklama}
          disabled={disabled || submitting}
          onBaslikChange={(v) => patch('baslik', v)}
          onAciklamaChange={(v) => patch('aciklama', v)}
        />
      </SectionCard>

      <SectionCard icon={UserCog} title="Atama">
        <AssignmentFields
          birimId={form.birim_id}
          sorumluId={form.sorumlu_personel_id}
          units={units}
          staff={staff}
          birimDisabled={disabled || submitting || hasWork}
          sorumluDisabled={disabled || submitting}
          birimHint={hasWork ? 'Zincir Görevde birim değiştirilemez.' : null}
          sorumluHint={
            hasWork
              ? `Yalnızca aktif adım (şu an adım ${aktifAdim}) için güncellenir.`
              : null
          }
          onBirimChange={(v) => patch('birim_id', v)}
          onSorumluChange={(v) => patch('sorumlu_personel_id', v)}
        />
      </SectionCard>

      {hasWork && gorevReorderAllowed && gIds.length > 0 ? (
        <SectionCard tone="accent" icon={Link2} title="Yürütme sırası">
          <ReorderList
            label="Personel"
            hint="Tamamlanmış veya kanıt yüklenmiş adım yokken sırayı değiştirebilir veya listeye yeni personel ekleyebilirsiniz. İlk satır aktif adımdır."
            ids={gIds}
            onMove={moveG}
            onAppend={appendG}
            pick={pickG}
            setPick={setPickG}
            staff={staff}
            disabled={disabled || submitting}
            tone="accent"
          />
        </SectionCard>
      ) : null}

      {hasOnay && onayReorderAllowed && oIds.length > 0 ? (
        <SectionCard tone="purple" icon={ShieldCheck} title="Onay sırası">
          <ReorderList
            label="Onaylayıcı"
            hint="Henüz onay tamamlanmadıysa sırayı değiştirebilir veya yeni onaylayıcı ekleyebilirsiniz."
            ids={oIds}
            onMove={moveO}
            onAppend={appendO}
            pick={pickO}
            setPick={setPickO}
            staff={staff}
            disabled={disabled || submitting}
            tone="purple"
          />
        </SectionCard>
      ) : null}

      <SectionCard icon={CalendarRange} title="Zamanlama & öncelik">
        <TimingFields
          baslama={form.baslama_tarihi}
          son={form.son_tarih}
          acil={form.acil}
          disabled={disabled || submitting}
          rangeError={rangeError}
          onBaslamaChange={(v) => patch('baslama_tarihi', v)}
          onSonChange={(v) => patch('son_tarih', v)}
          onAcilChange={(v) => patch('acil', v)}
        />
      </SectionCard>

      <SectionCard icon={Award} title="Puan">
        <ScoringField
          puan={form.puan}
          disabled={disabled || submitting}
          onChange={(v) => patch('puan', v)}
        />
      </SectionCard>

      <SectionCard icon={ImageIcon} title="Kanıt zorunlulukları">
        <EvidenceFields
          value={{
            foto_zorunlu: form.foto_zorunlu,
            min_foto_sayisi: form.min_foto_sayisi,
            video_zorunlu: form.video_zorunlu,
            min_video_sayisi: form.min_video_sayisi,
            max_video_suresi_sn: form.max_video_suresi_sn,
            aciklama_zorunlu: form.aciklama_zorunlu,
            belge_zorunlu: form.belge_zorunlu,
            min_belge_sayisi: form.min_belge_sayisi,
          }}
          disabled={disabled || submitting}
          onChange={(next) => setForm((f) => ({ ...f, ...next }))}
        />
      </SectionCard>

      <SaveBar
        submitting={submitting}
        disabled={disabled || !!rangeError}
        onCancel={() =>
          navigate(task?.id ? `/admin/tasks/${task.id}` : '/admin/tasks')
        }
      />
    </form>
  )
}
