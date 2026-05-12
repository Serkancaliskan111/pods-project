import { useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Award,
  CalendarRange,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../../../lib/supabaseClient'
import { AuthContext } from '../../../../../contexts/AuthContext.jsx'
import { canMarkBirebirGorev } from '../../../../../lib/permissions.js'
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
  localInputToIso,
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
    ozel_gorev: !!task.ozel_gorev,
    acil: !!task.acil,
  }
}

/**
 * Normal görev düzenleme formu.
 *
 * - `is_sablon_id` doluysa üstte bilgi rozeti (şablon kopyası olduğu hatırlatılır)
 * - `grup_id` doluysa havuz rozeti; birim/sorumlu salt-okunur (havuz yapısı korunur)
 * - Bireysel tamamlama (`ozel_gorev`) yalnızca normal görevde
 */
export default function NormalTaskEditForm({ task, units, staff, disabled }) {
  const navigate = useNavigate()
  const { profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const mayMarkBirebir = useMemo(
    () => canMarkBirebirGorev(profile?.yetkiler || {}, isSystemAdmin),
    [profile?.yetkiler, isSystemAdmin],
  )
  const baseline = useMemo(() => buildBaseline(task), [task])
  const { form, patch, setForm } = useTaskEditFormState(baseline || {})
  const [submitting, setSubmitting] = useState(false)

  const isPool = !!task?.grup_id
  const isTemplated = !!task?.is_sablon_id

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

    if (!isPool) {
      const nextBirim = String(form.birim_id || '').trim() || null
      const baseBirim = b.birim_id ? String(b.birim_id) : ''
      if ((nextBirim || '') !== baseBirim) patchPayload.birim_id = nextBirim

      const nextWorker = String(form.sorumlu_personel_id || '').trim() || null
      const baseWorker = b.sorumlu_personel_id ? String(b.sorumlu_personel_id) : ''
      if ((nextWorker || '') !== baseWorker) {
        if (!nextWorker) {
          toast.error('Sorumlu personel seçin')
          return
        }
        patchPayload.sorumlu_personel_id = nextWorker
      }
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
    if (!!form.ozel_gorev !== !!b.ozel_gorev) patchPayload.ozel_gorev = !!form.ozel_gorev
    if (!!form.acil !== !!b.acil) patchPayload.acil = !!form.acil

    if (!Object.keys(patchPayload).length) {
      toast.info('Değişiklik yok')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('rpc_is_operasyonel_guncelle', {
        p_is_id: task.id,
        p_patch: patchPayload,
      })
      if (error) throw error
      toast.success('Görev güncellendi')
      navigate(`/admin/tasks/${task.id}`, { replace: true })
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Güncelleme başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isTemplated ? (
        <SectionCard
          tone="info"
          icon={LayoutTemplate}
          title="Şablondan oluşturuldu"
          subtitle="Bu görev bir şablondan üretildi; burada yapılan değişiklik şablonu etkilemez."
        />
      ) : null}
      {isPool ? (
        <SectionCard
          tone="purple"
          icon={Users}
          title="Havuz görevi"
          subtitle="Bu görev birden çok personelin sorumlu olduğu bir havuza atandı; birim ve sorumlu yapısı korunur."
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
          birimDisabled={disabled || submitting || isPool}
          sorumluDisabled={disabled || submitting || isPool}
          birimHint={isPool ? 'Havuz görevinde birim kilitlidir.' : null}
          sorumluHint={isPool ? 'Havuz görevinde sorumlu kilitlidir.' : null}
          onBirimChange={(v) => patch('birim_id', v)}
          onSorumluChange={(v) => patch('sorumlu_personel_id', v)}
        />
      </SectionCard>

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
          }}
          disabled={disabled || submitting}
          onChange={(next) => setForm((f) => ({ ...f, ...next }))}
        />
      </SectionCard>

      <SectionCard
        icon={ShieldCheck}
        title="Bireysel tamamlama"
        subtitle="Bire bir görev seçeneği yalnızca normal görev tipinde kullanılır; aktifken görevi yalnızca atayan ve sorumlu görür."
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            color: form.ozel_gorev ? '#3730a3' : '#0f172a',
            cursor:
              disabled || submitting || (!mayMarkBirebir && !form.ozel_gorev)
                ? 'not-allowed'
                : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          <input
            type="checkbox"
            checked={!!form.ozel_gorev}
            disabled={disabled || submitting || (!mayMarkBirebir && !form.ozel_gorev)}
            onChange={(ev) => patch('ozel_gorev', ev.target.checked)}
          />
          Bire bir görev
        </label>
        {!mayMarkBirebir && !form.ozel_gorev ? (
          <span style={{ fontSize: 11, color: '#64748b' }}>
            «Birebir (özel) görev» yetkisi olmadan açılamaz.
          </span>
        ) : null}
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
