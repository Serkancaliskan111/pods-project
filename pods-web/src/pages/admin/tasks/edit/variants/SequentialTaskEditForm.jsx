import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ListOrdered, ListTree, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../../../lib/supabaseClient'
import { useTaskEditFormState } from '../hooks/useTaskEditFormState.js'
import SectionCard from '../shared/SectionCard.jsx'
import MetaFields from '../shared/MetaFields.jsx'
import ScoringField from '../shared/ScoringField.jsx'
import StepCard from '../shared/StepCard.jsx'

const supabase = getSupabase()

function buildBaseline(task) {
  if (!task) return null
  return {
    baslik: task.baslik || '',
    aciklama: task.aciklama ?? '',
    puan:
      task.puan != null && Number.isFinite(Number(task.puan))
        ? String(task.puan)
        : '',
  }
}

/**
 * Sıralı Görev düzenleme:
 *  - Üst başlık, açıklama ve toplam puan üst görev üzerinden güncellenir.
 *  - Her adım için ayrı kart; tamamlanmış adımlar salt-okunur.
 *  - Adım kaydı tek tek `rpc_sirali_adim_guncelle` ile yapılır.
 *  - Adım sırası değiştirilemez (kontrat).
 */
export default function SequentialTaskEditForm({
  task,
  staff,
  disabled,
  siraliSteps,
  setSiraliSteps,
}) {
  const navigate = useNavigate()
  const baseline = useMemo(() => buildBaseline(task), [task])
  const { form, patch } = useTaskEditFormState(baseline || {})
  const [submitting, setSubmitting] = useState(false)

  const stepsSorted = useMemo(
    () =>
      Array.isArray(siraliSteps)
        ? [...siraliSteps].sort(
            (a, b) => Number(a?.adim_no || 0) - Number(b?.adim_no || 0),
          )
        : [],
    [siraliSteps],
  )

  const onTopSubmit = async (e) => {
    e?.preventDefault?.()
    if (!task?.id || disabled || submitting) return
    if (!String(form.baslik || '').trim()) {
      toast.error('Başlık zorunlu')
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

    const pNum =
      form.puan === '' || form.puan == null ? null : Number(form.puan)
    if (pNum != null && (Number.isNaN(pNum) || pNum < 0)) {
      toast.error('Puan negatif olamaz')
      return
    }
    const baseP = b.puan === '' || b.puan == null ? null : Number(b.puan)
    if ((pNum ?? null) !== (baseP ?? null)) patchPayload.puan = pNum

    if (!Object.keys(patchPayload).length) {
      toast.info('Üst bilgilerde değişiklik yok')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('rpc_is_operasyonel_guncelle', {
        p_is_id: task.id,
        p_patch: patchPayload,
      })
      if (error) throw error
      toast.success('Görev üst bilgileri güncellendi')
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Güncelleme başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStepSave = async (adimNo, stepPatch) => {
    if (!task?.id) throw new Error('Görev kimliği yok')
    const { error } = await supabase.rpc('rpc_sirali_adim_guncelle', {
      p_is_id: task.id,
      p_adim_no: adimNo,
      p_patch: stepPatch,
    })
    if (error) throw error

    const { data: fresh } = await supabase
      .from('isler_zincir_gorev_adimlari')
      .select(
        'id, adim_no, personel_id, denetimci_personel_id, adim_baslik, adim_istenenler, adim_durum, durum, kanit_resim_ler, tamamlandi_at, adim_gonderim_at, adim_onay_at, adim_onay_notu',
      )
      .eq('is_id', task.id)
      .eq('adim_no', adimNo)
      .maybeSingle()
    if (fresh && typeof setSiraliSteps === 'function') {
      setSiraliSteps((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) =>
          Number(r?.adim_no) === Number(adimNo) ? { ...r, ...fresh } : r,
        ),
      )
    }
    toast.success(`Adım ${adimNo} güncellendi`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionCard
        tone="info"
        icon={ListOrdered}
        title="Sıralı Görev"
        subtitle="Adımlar birbirini bekler. Yapılmış / denetimde olan adımlar düzenlenemez; adım sırası değiştirilemez."
      />

      <form
        onSubmit={onTopSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <SectionCard
          icon={FileText}
          title="Görev üst bilgileri"
          subtitle="Bu bilgiler görevin tamamı için geçerlidir; her adımın kendi puanı ve zamanlaması aşağıdaki adım kartlarındadır."
        >
          <MetaFields
            baslik={form.baslik}
            aciklama={form.aciklama}
            disabled={disabled || submitting}
            onBaslikChange={(v) => patch('baslik', v)}
            onAciklamaChange={(v) => patch('aciklama', v)}
          />
          <ScoringField
            puan={form.puan}
            disabled={disabled || submitting}
            onChange={(v) => patch('puan', v)}
            label="Toplam puan"
          />
        </SectionCard>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
          }}
        >
          <button
            type="button"
            onClick={() =>
              navigate(task?.id ? `/admin/tasks/${task.id}` : '/admin/tasks')
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#475569',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            <X size={13} strokeWidth={2.4} /> Görev detayına dön
          </button>
          <button
            type="submit"
            disabled={disabled || submitting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 10,
              border: 'none',
              background:
                disabled || submitting
                  ? '#94a3b8'
                  : 'linear-gradient(180deg,#4f46e5 0%,#4338ca 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: disabled || submitting ? 'not-allowed' : 'pointer',
              boxShadow:
                disabled || submitting
                  ? 'none'
                  : '0 8px 20px -10px rgba(79,70,229,0.6)',
            }}
          >
            <Save size={13} strokeWidth={2.4} />
            {submitting ? 'Kaydediliyor…' : 'Üst bilgileri kaydet'}
          </button>
        </div>
      </form>

      <SectionCard
        icon={ListTree}
        title="Adımlar"
        subtitle="Her adımı ayrı kaydedebilirsiniz. Tamamlanmış veya denetimdeki adımlar kilitlidir; adım sırası kontratı korunur."
        action={
          stepsSorted.length ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 9999,
                backgroundColor: '#eef2ff',
                color: '#3730a3',
                fontSize: 11,
                fontWeight: 700,
                border: '1px solid #c7d2fe',
                letterSpacing: '0.02em',
              }}
            >
              {stepsSorted.length} adım
            </span>
          ) : null
        }
      >
        {stepsSorted.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: '#f8fafc',
              color: '#64748b',
              fontSize: 12.5,
              border: '1px dashed #e2e8f0',
              textAlign: 'center',
            }}
          >
            Bu görev için adım bulunamadı.
          </div>
        ) : (
          stepsSorted.map((step, idx) => {
            const prev = stepsSorted[idx - 1]
            const next = stepsSorted[idx + 1]
            const prevBitis = prev?.adim_istenenler?.bitis_tarihi || null
            const nextBitis = next?.adim_istenenler?.bitis_tarihi || null
            return (
              <StepCard
                key={step.id || step.adim_no}
                step={step}
                staff={staff}
                disabled={disabled || submitting}
                prevStepBitis={prevBitis}
                nextStepBitis={nextBitis}
                onSave={handleStepSave}
              />
            )
          })
        )}
      </SectionCard>
    </div>
  )
}
