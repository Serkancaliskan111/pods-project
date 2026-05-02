import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canOperationallyEditAssignedTask } from '../../../lib/permissions.js'
import {
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
  isUnitInScope,
} from '../../../lib/supabaseScope.js'
import { taskOperationalEditEligible } from '../../../lib/taskStatus.js'
import {
  GOREV_TURU,
  isZincirGorevTuru,
  isZincirOnayTuru,
  zincirGorevStepsReorderEligible,
  zincirOnayStepsReorderEligible,
} from '../../../lib/zincirTasks.js'
import Spinner from '../../../components/ui/Spinner.jsx'

const supabase = getSupabase()

function formatDateTimeLocalInput(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

function localInputToIso(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function personName(p) {
  if (!p) return ''
  const n = [p.ad, p.soyad].filter(Boolean).join(' ').trim()
  return n || p.email || String(p.id)
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'

export default function TaskEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const scopeReady = isSystemAdmin || personel?.scopeReady !== false

  const permissions = profile?.yetkiler || {}
  const mayEditRole =
    isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)

  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState(null)
  const [blockedReason, setBlockedReason] = useState(null)
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    baslik: '',
    aciklama: '',
    birim_id: '',
    sorumlu_personel_id: '',
    baslama_tarihi: '',
    son_tarih: '',
    puan: '',
    foto_zorunlu: false,
    min_foto_sayisi: 0,
    aciklama_zorunlu: false,
    ozel_gorev: false,
  })

  const baselineRef = useRef(null)
  const chainBaselineRef = useRef({ gorev: [], onay: [] })

  const [loadedGorevSteps, setLoadedGorevSteps] = useState([])
  const [loadedOnaySteps, setLoadedOnaySteps] = useState([])
  const [gorevOrderIds, setGorevOrderIds] = useState([])
  const [onayOrderIds, setOnayOrderIds] = useState([])
  const [pickAddGorevPid, setPickAddGorevPid] = useState('')
  const [pickAddOnayPid, setPickAddOnayPid] = useState('')

  const gorevReorderAllowed = useMemo(
    () => zincirGorevStepsReorderEligible(loadedGorevSteps),
    [loadedGorevSteps],
  )
  const onayReorderAllowed = useMemo(
    () => zincirOnayStepsReorderEligible(loadedOnaySteps),
    [loadedOnaySteps],
  )

  /** Yalnızca normal görevde özel görev anahtarı mantıklı (oluşturma ekranıyla aynı). */
  const strictNormalTask = useMemo(() => {
    const t = String(task?.gorev_turu || '').trim()
    return !t || t === GOREV_TURU.NORMAL
  }, [task?.gorev_turu])

  const chainWorkRestricted = useMemo(
    () => isZincirGorevTuru(task?.gorev_turu),
    [task?.gorev_turu],
  )

  const canEditBirimField = strictNormalTask || isZincirOnayTuru(task?.gorev_turu)
  const canEditAssigneeField =
    strictNormalTask || isZincirOnayTuru(task?.gorev_turu) || chainWorkRestricted

  const loadScopeLists = useCallback(
    async (companyId) => {
      if (!companyId) return
      const scope = {
        isSystemAdmin,
        currentCompanyId: companyId,
        accessibleUnitIds,
      }
      const [{ data: u }, { data: s }] = await Promise.all([
        scopeBirimlerQuery(
          supabase
            .from('birimler')
            .select('id,birim_adi')
            .eq('ana_sirket_id', companyId)
            .is('silindi_at', null),
          scope,
        ).order('birim_adi', { ascending: true }),
        scopePersonelQuery(
          supabase
            .from('personeller')
            .select('id,ad,soyad,email,birim_id')
            .eq('ana_sirket_id', companyId)
            .is('silindi_at', null),
          scope,
        ).order('ad', { ascending: true }),
      ])
      setUnits(Array.isArray(u) ? u : [])
      setStaff(Array.isArray(s) ? s : [])
    },
    [isSystemAdmin, accessibleUnitIds],
  )

  useEffect(() => {
    if (!mayEditRole) {
      navigate('/unauthorized', { replace: true })
      return
    }
    if (!id || !scopeReady) return

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setBlockedReason(null)
      setLoadedGorevSteps([])
      setLoadedOnaySteps([])
      setGorevOrderIds([])
      setOnayOrderIds([])
      chainBaselineRef.current = { gorev: [], onay: [] }
      try {
        let q = supabase.from('isler').select('*').eq('id', id)
        q = scopeIslerQuery(q, {
          isSystemAdmin,
          currentCompanyId,
          accessibleUnitIds,
        })
        const { data: job, error: jobErr } = await q.maybeSingle()

        if (cancelled) return

        if (jobErr || !job) {
          toast.error('Görev yüklenemedi')
          navigate('/admin/tasks', { replace: true })
          return
        }

        if (!isSystemAdmin && currentCompanyId) {
          if (String(job.ana_sirket_id) !== String(currentCompanyId)) {
            navigate('/unauthorized', { replace: true })
            return
          }
          if (
            accessibleUnitIds &&
            accessibleUnitIds.length &&
            job.birim_id &&
            !isUnitInScope(accessibleUnitIds, job.birim_id)
          ) {
            navigate('/unauthorized', { replace: true })
            return
          }
        }

        const { data: pendingDel } = await supabase
          .from('isler_silme_talepleri')
          .select('id')
          .eq('is_id', job.id)
          .eq('durum', 'bekliyor')
          .maybeSingle()

        if (pendingDel?.id) {
          setBlockedReason(
            'Bu görev için bekleyen silme talebi var; düzenleme yapılamaz.',
          )
        } else if (!taskOperationalEditEligible(job)) {
          setBlockedReason(
            'Bu görev onay bekliyor, onaylı, reddedilmiş veya tekrar gönderilmiş; operasyonel düzenleme yapılamaz.',
          )
        }

        setTask(job)
        await loadScopeLists(job.ana_sirket_id)

        let gorevRows = []
        let onayRows = []
        if (isZincirGorevTuru(job.gorev_turu)) {
          const { data: zr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select(
              'id,adim_no,personel_id,durum,kanit_resim_ler,tamamlandi_at',
            )
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          gorevRows = Array.isArray(zr) ? zr : []
        }
        if (isZincirOnayTuru(job.gorev_turu)) {
          const { data: orows } = await supabase
            .from('isler_zincir_onay_adimlari')
            .select('id,adim_no,onaylayici_personel_id,durum,onaylandi_at')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          onayRows = Array.isArray(orows) ? orows : []
        }

        if (cancelled) return

        setLoadedGorevSteps(gorevRows)
        setLoadedOnaySteps(onayRows)
        const gid = gorevRows.map((r) => String(r.personel_id))
        const oid = onayRows.map((r) => String(r.onaylayici_personel_id))
        chainBaselineRef.current = { gorev: gid.slice(), onay: oid.slice() }
        setGorevOrderIds(gid)
        setOnayOrderIds(oid)

        const baseline = {
          baslik: job.baslik || '',
          aciklama: job.aciklama ?? '',
          birim_id: job.birim_id ?? '',
          sorumlu_personel_id: job.sorumlu_personel_id ?? '',
          baslama_tarihi: job.baslama_tarihi || null,
          son_tarih: job.son_tarih || null,
          puan: job.puan != null ? Number(job.puan) : null,
          foto_zorunlu: !!job.foto_zorunlu,
          min_foto_sayisi: Number(job.min_foto_sayisi || 0),
          aciklama_zorunlu: !!job.aciklama_zorunlu,
          ozel_gorev: !!job.ozel_gorev,
        }
        baselineRef.current = baseline

        setForm({
          baslik: baseline.baslik,
          aciklama: baseline.aciklama == null ? '' : String(baseline.aciklama),
          birim_id: baseline.birim_id ? String(baseline.birim_id) : '',
          sorumlu_personel_id: baseline.sorumlu_personel_id
            ? String(baseline.sorumlu_personel_id)
            : '',
          baslama_tarihi: baseline.baslama_tarihi
            ? formatDateTimeLocalInput(new Date(baseline.baslama_tarihi))
            : '',
          son_tarih: baseline.son_tarih
            ? formatDateTimeLocalInput(new Date(baseline.son_tarih))
            : '',
          puan: baseline.puan != null && Number.isFinite(baseline.puan)
            ? String(baseline.puan)
            : '',
          foto_zorunlu: baseline.foto_zorunlu,
          min_foto_sayisi: baseline.min_foto_sayisi,
          aciklama_zorunlu: baseline.aciklama_zorunlu,
          ozel_gorev: baseline.ozel_gorev,
        })
      } catch (e) {
        console.error(e)
        if (!cancelled) toast.error('Görev yüklenemedi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    id,
    mayEditRole,
    scopeReady,
    isSystemAdmin,
    currentCompanyId,
    navigate,
    accessibleUnitIds,
    loadScopeLists,
  ])

  const fieldDisabled = !!blockedReason || !task

  const moveGorevStep = (idx, delta) => {
    setGorevOrderIds((prev) => {
      const j = idx + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[idx]
      next[idx] = next[j]
      next[j] = t
      if (chainWorkRestricted && next.length) {
        setForm((f) => ({ ...f, sorumlu_personel_id: String(next[0]) }))
      }
      return next
    })
  }

  const staffNotInGorevChain = useMemo(
    () =>
      staff.filter((p) => !gorevOrderIds.some((id) => String(id) === String(p.id))),
    [staff, gorevOrderIds],
  )
  const staffNotInOnayChain = useMemo(
    () =>
      staff.filter((p) => !onayOrderIds.some((id) => String(id) === String(p.id))),
    [staff, onayOrderIds],
  )

  const appendGorevToChain = () => {
    const pid = String(pickAddGorevPid || '').trim()
    if (!pid) {
      toast.error('Eklenecek personeli seçin')
      return
    }
    if (gorevOrderIds.some((x) => String(x) === pid)) {
      toast.error('Bu personel zaten zincirde')
      return
    }
    setGorevOrderIds((prev) => [...prev, pid])
    setPickAddGorevPid('')
  }

  const appendOnayToChain = () => {
    const pid = String(pickAddOnayPid || '').trim()
    if (!pid) {
      toast.error('Eklenecek onaylayıcıyı seçin')
      return
    }
    if (onayOrderIds.some((x) => String(x) === pid)) {
      toast.error('Bu kişi zaten onay zincirinde')
      return
    }
    setOnayOrderIds((prev) => [...prev, pid])
    setPickAddOnayPid('')
  }

  const moveOnayStep = (idx, delta) => {
    setOnayOrderIds((prev) => {
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
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!task?.id || fieldDisabled || submitting) return

    const b = baselineRef.current
    if (!b) return

    const patch = {}
    if (form.baslik.trim() !== (b.baslik || '').trim()) {
      patch.baslik = form.baslik.trim()
    }
    const nextAciklama = form.aciklama.trim()
    const baseAciklama =
      b.aciklama == null || b.aciklama === '' ? '' : String(b.aciklama).trim()
    if (nextAciklama !== baseAciklama) {
      patch.aciklama = nextAciklama === '' ? null : nextAciklama
    }

    if (canEditBirimField) {
      const nextBirim = form.birim_id.trim() || null
      const baseBirim = b.birim_id ? String(b.birim_id) : ''
      if ((nextBirim || '') !== baseBirim) {
        patch.birim_id = nextBirim
      }
    }

    if (canEditAssigneeField) {
      const nextWorker = form.sorumlu_personel_id.trim() || null
      const baseWorker = b.sorumlu_personel_id ? String(b.sorumlu_personel_id) : ''
      if ((nextWorker || '') !== baseWorker) {
        if (!nextWorker) {
          toast.error('Sorumlu personel seçin')
          return
        }
        patch.sorumlu_personel_id = nextWorker
      }
    }

    const nb = localInputToIso(form.baslama_tarihi)
    const sb = b.baslama_tarihi || null
    if (nb !== sb) patch.baslama_tarihi = nb

    const ns = localInputToIso(form.son_tarih)
    const ss = b.son_tarih || null
    if (ns !== ss) patch.son_tarih = ns

    const pNum =
      form.puan === '' || form.puan == null ? null : Number(form.puan)
    const baseP = b.puan
    if (
      (pNum == null && baseP != null) ||
      (pNum != null && baseP == null) ||
      (pNum != null &&
        baseP != null &&
        Number(pNum) !== Number(baseP))
    ) {
      patch.puan = pNum
    }

    if (!!form.foto_zorunlu !== !!b.foto_zorunlu) {
      patch.foto_zorunlu = !!form.foto_zorunlu
    }

    const minF = Math.max(0, Math.min(99, Number(form.min_foto_sayisi) || 0))
    if (minF !== Number(b.min_foto_sayisi || 0)) {
      patch.min_foto_sayisi = minF
    }

    if (!!form.aciklama_zorunlu !== !!b.aciklama_zorunlu) {
      patch.aciklama_zorunlu = !!form.aciklama_zorunlu
    }

    if (
      strictNormalTask &&
      !!form.ozel_gorev !== !!b.ozel_gorev
    ) {
      patch.ozel_gorev = !!form.ozel_gorev
    }

    const baseChain = chainBaselineRef.current || { gorev: [], onay: [] }
    const gChainChanged =
      isZincirGorevTuru(task.gorev_turu) &&
      gorevReorderAllowed &&
      JSON.stringify(gorevOrderIds) !== JSON.stringify(baseChain.gorev)
    const oChainChanged =
      isZincirOnayTuru(task.gorev_turu) &&
      onayReorderAllowed &&
      JSON.stringify(onayOrderIds) !== JSON.stringify(baseChain.onay)

    if (!Object.keys(patch).length && !gChainChanged && !oChainChanged) {
      toast.info('Değişiklik yok')
      return
    }

    setSubmitting(true)
    try {
      if (gChainChanged || oChainChanged) {
        const { error: reorderErr } = await supabase.rpc(
          'rpc_zincir_operasyon_adimlari_yeniden_sirala',
          {
            p_is_id: task.id,
            p_gorev_personel_ids: gChainChanged ? gorevOrderIds : null,
            p_onay_personel_ids: oChainChanged ? onayOrderIds : null,
          },
        )
        if (reorderErr) throw reorderErr
      }

      if (Object.keys(patch).length) {
        const { error } = await supabase.rpc('rpc_is_operasyonel_guncelle', {
          p_is_id: task.id,
          p_patch: patch,
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

  if (!mayEditRole) {
    return null
  }

  return (
    <div style={{ padding: '24px 32px 40px', backgroundColor: '#f3f4f6', minHeight: '100%' }}>
      <button
        type="button"
        onClick={() =>
          navigate(task?.id ? `/admin/tasks/${task.id}` : '/admin/tasks')
        }
        style={{
          marginBottom: 16,
          padding: '6px 12px',
          borderRadius: 9999,
          border: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        ← Geri
      </button>

      <div
        style={{
          maxWidth: 720,
          borderRadius: 20,
          border: '1px solid #dbe5f0',
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
          boxShadow: '0 20px 40px -32px rgba(15,23,42,0.45)',
          padding: 22,
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
          Görevi düzenle
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
          Onaylı / reddedilmiş / tekrar sürecindeki işler düzenlenemez. Normal ve zincir onayda birim
          ile sorumlu güncellenebilir. Zincir görevde birim sabittir; yalnızca aktif adımdaki sorumlu
          değiştirilebilir.           Hiçbir zincir adımı tamamlanmadıysa yürütme veya onay sırasını değiştirebilir, mevcut
          kişileri koruyarak yeni personel ekleyebilirsiniz (çıkarma sunucuda reddedilir). Özel görev
          seçeneği yalnızca normal görev tipinde kullanılır.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={8} />
          </div>
        ) : blockedReason ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              color: '#92400e',
              fontSize: 13,
            }}
          >
            {blockedReason}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {chainWorkRestricted ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1e40af',
                  fontSize: 12.5,
                }}
              >
                Zincir görev akışı: birim değiştirilemez. Sorumlu personel alanı{' '}
                <strong>yalnızca aktif adım</strong> (şu an adım {Number(task?.zincir_aktif_adim) || 1}) için
                güncellenir; tamamlanmış veya kilitli adımlarda sunucu reddeder.
              </div>
            ) : null}
            {!strictNormalTask && !chainWorkRestricted ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  color: '#5b21b6',
                  fontSize: 12.5,
                }}
              >
                Zincir onay: görev yürütmesi normal iş gibi birim ve sorumlu güncellenebilir; onay
                sırası ayrı tabloda tutulur.
              </div>
            ) : null}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Başlık</span>
              <input
                className={inputClass}
                value={form.baslik}
                disabled={fieldDisabled}
                onChange={(ev) => setForm((f) => ({ ...f, baslik: ev.target.value }))}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Açıklama</span>
              <textarea
                className={inputClass}
                rows={4}
                value={form.aciklama}
                disabled={fieldDisabled}
                onChange={(ev) => setForm((f) => ({ ...f, aciklama: ev.target.value }))}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Birim</span>
              <select
                className={inputClass}
                value={form.birim_id}
                disabled={fieldDisabled || !canEditBirimField}
                onChange={(ev) => setForm((f) => ({ ...f, birim_id: ev.target.value }))}
              >
                <option value="">Seçin</option>
                {units.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.birim_adi || u.id}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Sorumlu personel
              </span>
              <select
                className={inputClass}
                value={form.sorumlu_personel_id}
                disabled={fieldDisabled || !canEditAssigneeField}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, sorumlu_personel_id: ev.target.value }))
                }
              >
                <option value="">Seçin</option>
                {staff.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {personName(p)}
                  </option>
                ))}
              </select>
            </label>

            {gorevReorderAllowed && isZincirGorevTuru(task?.gorev_turu) && gorevOrderIds.length > 0 ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #bae6fd',
                  backgroundColor: '#f0f9ff',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#0369a1',
                    marginBottom: 8,
                  }}
                >
                  Zincir görev — yürütme sırası
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#0c4a6e', lineHeight: 1.45 }}>
                  Tamamlanmış veya kanıt yüklenmiş adım yokken sırayı değiştirebilir veya sonuna yeni
                  personel ekleyebilirsiniz (↑↓ ile konumu ayarlayın). İlk satır aktif adımdır;
                  kayıtta birim birinci adıma göre güncellenir.
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <select
                    className={inputClass}
                    style={{ flex: '1 1 200px', maxWidth: 360 }}
                    value={pickAddGorevPid}
                    disabled={fieldDisabled}
                    onChange={(ev) => setPickAddGorevPid(ev.target.value)}
                  >
                    <option value="">Personel ekle…</option>
                    {staffNotInGorevChain.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {personName(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={fieldDisabled || !pickAddGorevPid}
                    onClick={appendGorevToChain}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: fieldDisabled || !pickAddGorevPid ? '#94a3b8' : '#0284c7',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: fieldDisabled || !pickAddGorevPid ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Listeye ekle
                  </button>
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gorevOrderIds.map((pid, idx) => (
                    <li
                      key={`${pid}-${idx}`}
                      style={{
                        fontSize: 13,
                        color: '#0f172a',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ flex: '1 1 140px' }}>
                        {personName(staff.find((p) => String(p.id) === String(pid))) || pid}
                      </span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          disabled={fieldDisabled || idx === 0 || gorevOrderIds.length < 2}
                          onClick={() => moveGorevStep(idx, -1)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid #7dd3fc',
                            backgroundColor: '#fff',
                            fontSize: 12,
                            cursor:
                              fieldDisabled ||
                              idx === 0 ||
                              gorevOrderIds.length < 2
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={
                            fieldDisabled ||
                            idx >= gorevOrderIds.length - 1 ||
                            gorevOrderIds.length < 2
                          }
                          onClick={() => moveGorevStep(idx, 1)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid #7dd3fc',
                            backgroundColor: '#fff',
                            fontSize: 12,
                            cursor:
                              fieldDisabled ||
                              idx >= gorevOrderIds.length - 1 ||
                              gorevOrderIds.length < 2
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          ↓
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {onayReorderAllowed && isZincirOnayTuru(task?.gorev_turu) && onayOrderIds.length > 0 ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #ddd6fe',
                  backgroundColor: '#faf5ff',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#6d28d9',
                    marginBottom: 8,
                  }}
                >
                  Zincir onay — sıra
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: '#5b21b6', lineHeight: 1.45 }}>
                  Henüz onay tamamlanmadıysa sırayı değiştirebilir veya listeye yeni onaylayıcı
                  ekleyebilirsiniz. Onay süreci başladıysa “sorumlu” alanı güncel adıma göre eşlenir.
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <select
                    className={inputClass}
                    style={{ flex: '1 1 200px', maxWidth: 360 }}
                    value={pickAddOnayPid}
                    disabled={fieldDisabled}
                    onChange={(ev) => setPickAddOnayPid(ev.target.value)}
                  >
                    <option value="">Onaylayıcı ekle…</option>
                    {staffNotInOnayChain.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {personName(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={fieldDisabled || !pickAddOnayPid}
                    onClick={appendOnayToChain}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: fieldDisabled || !pickAddOnayPid ? '#94a3b8' : '#7c3aed',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: fieldDisabled || !pickAddOnayPid ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Listeye ekle
                  </button>
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {onayOrderIds.map((pid, idx) => (
                    <li
                      key={`${pid}-${idx}`}
                      style={{
                        fontSize: 13,
                        color: '#0f172a',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ flex: '1 1 140px' }}>
                        {personName(staff.find((p) => String(p.id) === String(pid))) || pid}
                      </span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          disabled={
                            fieldDisabled || idx === 0 || onayOrderIds.length < 2
                          }
                          onClick={() => moveOnayStep(idx, -1)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid #c4b5fd',
                            backgroundColor: '#fff',
                            fontSize: 12,
                            cursor:
                              fieldDisabled ||
                              idx === 0 ||
                              onayOrderIds.length < 2
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={
                            fieldDisabled ||
                            idx >= onayOrderIds.length - 1 ||
                            onayOrderIds.length < 2
                          }
                          onClick={() => moveOnayStep(idx, 1)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid #c4b5fd',
                            backgroundColor: '#fff',
                            fontSize: 12,
                            cursor:
                              fieldDisabled ||
                              idx >= onayOrderIds.length - 1 ||
                              onayOrderIds.length < 2
                                ? 'not-allowed'
                                : 'pointer',
                          }}
                        >
                          ↓
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  Başlangıç
                </span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.baslama_tarihi}
                  disabled={fieldDisabled}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, baslama_tarihi: ev.target.value }))
                  }
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Bitiş</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={form.son_tarih}
                  disabled={fieldDisabled}
                  onChange={(ev) => setForm((f) => ({ ...f, son_tarih: ev.target.value }))}
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Puan</span>
              <input
                type="number"
                className={inputClass}
                value={form.puan}
                disabled={fieldDisabled}
                onChange={(ev) => setForm((f) => ({ ...f, puan: ev.target.value }))}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.foto_zorunlu}
                disabled={fieldDisabled}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, foto_zorunlu: ev.target.checked }))
                }
              />
              Fotoğraf zorunlu
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Minimum foto sayısı
              </span>
              <input
                type="number"
                min={0}
                max={99}
                className={inputClass}
                value={form.min_foto_sayisi}
                disabled={fieldDisabled}
                onChange={(ev) =>
                  setForm((f) => ({
                    ...f,
                    min_foto_sayisi: Number(ev.target.value) || 0,
                  }))
                }
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.aciklama_zorunlu}
                disabled={fieldDisabled}
                onChange={(ev) =>
                  setForm((f) => ({ ...f, aciklama_zorunlu: ev.target.checked }))
                }
              />
              Açıklama zorunlu
            </label>

            {strictNormalTask ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.ozel_gorev}
                  disabled={fieldDisabled}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, ozel_gorev: ev.target.checked }))
                  }
                />
                Özel görev (yalnızca atayan ve sorumlu görür)
              </label>
            ) : null}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="submit"
                disabled={fieldDisabled || submitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: submitting ? '#94a3b8' : '#4f46e5',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: fieldDisabled || submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  navigate(task?.id ? `/admin/tasks/${task.id}` : '/admin/tasks')
                }
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#fff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                İptal
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
