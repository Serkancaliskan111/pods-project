import { useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { isZincirGorevTuru, isZincirOnayTuru } from '../../../lib/zincirTasks.js'
import {
  TASK_STATUS,
  normalizeTaskStatus,
  isApprovedTaskStatus,
  taskOperationalEditEligible,
} from '../../../lib/taskStatus.js'
import { canOperationallyEditAssignedTask } from '../../../lib/permissions.js'
import { logTaskTimelineEvent } from '../../../lib/taskTimeline.js'

const supabase = getSupabase()

export default function TaskShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const scopeReady = isSystemAdmin || personel?.scopeReady !== false
  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState(null)
  const [company, setCompany] = useState(null)
  const [person, setPerson] = useState(null)
  const [assigner, setAssigner] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [chainGorevSteps, setChainGorevSteps] = useState([])
  const [chainOnaySteps, setChainOnaySteps] = useState([])
  const [chainNameMap, setChainNameMap] = useState({})
  const [expandedChainPerson, setExpandedChainPerson] = useState(null)
  const [expandedChecklistItemId, setExpandedChecklistItemId] = useState(null)
  const [rejectingStepId, setRejectingStepId] = useState(null)
  const [pendingDeletion, setPendingDeletion] = useState(null)
  const [submittingChecklistReview, setSubmittingChecklistReview] = useState(false)
  const [checklistDraftDecisions, setChecklistDraftDecisions] = useState({})
  const permissions = profile?.yetkiler || {}
  const canRejectChainStep =
    isSystemAdmin ||
    permissions?.gorev_onayla === true ||
    permissions?.denetim?.reddet === true ||
    permissions?.['denetim.reddet'] === true ||
    permissions?.is_admin === true ||
    permissions?.is_manager === true

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setLoading(true)
      try {
        const [{ data: job, error: jobErr }] = await Promise.all([
          supabase.from('isler').select('*').eq('id', id).single(),
        ])

        if (jobErr || !job) {
          console.error(jobErr)
          toast.error('Görev detayları yüklenemedi')
          return
        }

        if (!isSystemAdmin && currentCompanyId) {
          if (String(job.ana_sirket_id) !== String(currentCompanyId)) {
            toast.error('Bu göreve erişim yetkiniz yok')
            navigate('/unauthorized', { replace: true })
            return
          }
          if (
            scopeReady &&
            accessibleUnitIds &&
            accessibleUnitIds.length &&
            job.birim_id &&
            !accessibleUnitIds.some(
              (uid) => String(uid) === String(job.birim_id),
            )
          ) {
            toast.error('Bu göreve erişim yetkiniz yok')
            navigate('/unauthorized', { replace: true })
            return
          }
        }

        setTask(job)

        setChainGorevSteps([])
        setChainOnaySteps([])
        if (job?.id && isZincirGorevTuru(job.gorev_turu)) {
          const { data: zg } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('id, adim_no, personel_id, durum, kanit_resim_ler, kanit_foto_durumlari, aciklama')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          if (zg?.length) {
            setChainGorevSteps(zg)
            const ids = [...new Set(zg.map((r) => r.personel_id).filter(Boolean))]
            if (ids.length) {
              const { data: people } = await supabase
                .from('personeller')
                .select('id, ad, soyad')
                .in('id', ids)
              const m = {}
              ;(people || []).forEach((p) => {
                m[p.id] = p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id)
              })
              setChainNameMap(m)
            }
          }
        }
        if (job?.id && isZincirOnayTuru(job.gorev_turu)) {
          const { data: zo } = await supabase
            .from('isler_zincir_onay_adimlari')
            .select('id, adim_no, onaylayici_personel_id, durum, onaylandi_at')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          if (zo?.length) {
            setChainOnaySteps(zo)
            const ids = [...new Set(zo.map((r) => r.onaylayici_personel_id).filter(Boolean))]
            if (ids.length) {
              const { data: people } = await supabase
                .from('personeller')
                .select('id, ad, soyad')
                .in('id', ids)
              setChainNameMap((prev) => {
                const m = { ...prev }
                ;(people || []).forEach((p) => {
                  m[p.id] = p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id)
                })
                return m
              })
            }
          }
        }

        if (job.ana_sirket_id) {
          const { data: comp } = await supabase
            .from('ana_sirketler')
            .select('id,ana_sirket_adi')
            .eq('id', job.ana_sirket_id)
            .maybeSingle()
          setCompany(comp || null)
        }

        const pidContact = [...new Set([job.sorumlu_personel_id, job.atayan_personel_id].filter(Boolean))]
        let assigneeRow = null
        let assignerRow = null
        if (pidContact.length) {
          const { data: contactPeople } = await supabase
            .from('personeller')
            .select('id,ad,soyad,email')
            .in('id', pidContact)
          const byId = {}
          for (const r of contactPeople || []) {
            if (r?.id) byId[String(r.id)] = r
          }
          assigneeRow = job.sorumlu_personel_id ? byId[String(job.sorumlu_personel_id)] || null : null
          assignerRow = job.atayan_personel_id ? byId[String(job.atayan_personel_id)] || null : null
        }
        setPerson(assigneeRow)
        setAssigner(assignerRow)
      } catch (e) {
        console.error(e)
        toast.error('Görev detayları yüklenemedi')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [
    id,
    isSystemAdmin,
    currentCompanyId,
    scopeReady,
    JSON.stringify(accessibleUnitIds || []),
    navigate,
  ])

  useEffect(() => {
    if (!task?.id) {
      setPendingDeletion(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('isler_silme_talepleri')
        .select('id,talep_aciklama,created_at')
        .eq('is_id', task.id)
        .eq('durum', 'bekliyor')
        .maybeSingle()
      if (!cancelled) setPendingDeletion(data || null)
    })()
    return () => {
      cancelled = true
    }
  }, [task?.id])

  const extractPhotoUrls = (job) => {
    if (!job) return []

    let raw =
      job.kanit_resim_ler ??
      job.kanit_fotograflari ??
      job.fotograflar ??
      job.gorseller ??
      job.resimler ??
      job.fotograf_url ??
      job.foto_url ??
      job.photo_url ??
      job.images ??
      job.image_urls ??
      job.media

    if (!raw) return []

    if (Array.isArray(raw)) return raw.filter(Boolean)

    if (typeof raw === 'string') {
      const trimmed = raw.trim()

      try {
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            return parsed.filter(Boolean)
          }
        }
      } catch (e) {
        // ignore, aşağıda devam
      }

      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }

      return [trimmed]
    }

    return []
  }

  const photoUrls = extractPhotoUrls(task)
  const isChainGorevTask = isZincirGorevTuru(task?.gorev_turu)
  const isChainOnayTask = isZincirOnayTuru(task?.gorev_turu)
  const isHybridChainTask =
    String(task?.gorev_turu || '') === 'zincir_gorev_ve_onay'
  const isChecklistTask =
    !!task?.is_sablon_id ||
    (Array.isArray(task?.checklist_cevaplari) &&
      task.checklist_cevaplari.length > 0)
  const normalizedStatus = normalizeTaskStatus(task?.durum)
  const isApproved = isApprovedTaskStatus(task?.durum)
  const isReadOnlyApprovedTask = isApproved
  const isSelfAssignedTask = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
  const isReviewLockedByOwnership = isSelfAssignedTask

  const description =
    task?.aciklama || task?.aciklama_metni || task?.gorev_aciklamasi || ''

  const fullName = (p) =>
    p ? `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || '-' : '-'

  const fullNameOrPersonelRef = (row, personelId) =>
    row
      ? fullName(row)
      : personelId
        ? `Personel (ref: ${String(personelId).slice(0, 8)}…)`
        : '—'

  const taskTypeLabel = (() => {
    const t = String(task?.gorev_turu || '')
    if (!t || t === 'normal') return 'Normal'
    if (t === 'zincir_gorev') return 'Zincir görev'
    if (t === 'zincir_onay') return 'Zincir onay'
    if (t === 'zincir_gorev_ve_onay') return 'Zincir görev ve onay'
    return t.replaceAll('_', ' ')
  })()

  const formatTs = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('tr-TR')
  }

  const statusPillStyle = (() => {
    if (normalizedStatus === TASK_STATUS.REJECTED) {
      return { bg: '#fee2e2', color: '#991b1b' }
    }
    if (normalizedStatus === TASK_STATUS.RESUBMITTED) {
      return { bg: '#e0e7ff', color: '#3730a3' }
    }
    if (isApproved) {
      return { bg: '#dcfce7', color: '#166534' }
    }
    return { bg: '#e2e8f0', color: '#334155' }
  })()

  const showOperationalEdit =
    !!task &&
    !pendingDeletion &&
    (isSystemAdmin ||
      canOperationallyEditAssignedTask(permissions, false)) &&
    taskOperationalEditEligible(task)

  const managerNote = String(
    task?.yonetici_notu ||
      task?.denetim_notu ||
      task?.red_nedeni ||
      task?.review_note ||
      '',
  ).trim()

  const completerNote = String(
    task?.tamamlayan_aciklama ||
      task?.personel_aciklama ||
      task?.aciklama ||
      task?.aciklama_metni ||
      task?.gorev_aciklamasi ||
      '',
  ).trim()

  const completionHistory = Array.isArray(task?.tamamlama_gecmisi)
    ? task.tamamlama_gecmisi
    : []
  const reviewHistory = Array.isArray(task?.denetim_gecmisi)
    ? task.denetim_gecmisi
    : []
  const resubmissionCount = Number(task?.tekrar_gonderim_sayisi || 0)

  const extractChecklistPhotoUrls = (raw) => {
    if (!raw) return []
    if (Array.isArray(raw)) {
      return raw.flatMap((v) => extractChecklistPhotoUrls(v)).filter(Boolean)
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) return []
      try {
        if (
          (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
          (trimmed.startsWith('{') && trimmed.endsWith('}'))
        ) {
          return extractChecklistPhotoUrls(JSON.parse(trimmed))
        }
      } catch (_) {
        // ignore parse failure, continue as plain string
      }
      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      }
      return [trimmed]
    }
    if (typeof raw === 'object') {
      const directCandidates = [
        raw.url,
        raw.path,
        raw.src,
        raw.photo_url,
        raw.photo_urls,
        raw.foto_url,
        raw.foto_urls,
        raw.fotos,
        raw.fotograflar,
        raw.images,
        raw.files,
      ]
      const direct = directCandidates
        .flatMap((v) => extractChecklistPhotoUrls(v))
        .filter(Boolean)
      return Array.from(new Set(direct))
    }
    return []
  }

  const checklistItems = Array.isArray(task?.checklist_cevaplari)
    ? task.checklist_cevaplari.map((item, idx) => {
        const soru =
          item?.soru_metni || item?.soru || item?.question || `Madde ${idx + 1}`
        const cevap =
          item?.cevap_metni ??
          item?.cevap ??
          item?.value ??
          item?.yanit ??
          item?.answer ??
          ''
        const karar = item?.denetim_karari || item?.audit_decision || ''
        const soruTipi = String(
          item?.soru_tipi || item?.question_type || item?.type || '',
        )
          .trim()
          .toUpperCase()
        const photos = extractChecklistPhotoUrls(
          item?.fotograflar ??
            item?.fotos ??
            item?.foto_urls ??
            item?.photo_urls ??
            item?.images ??
            item?.files ??
            item?.photo_url ??
            item?.foto_url ??
            null,
        )
        return {
          id: item?.id || item?.soru_id || idx,
          key: String(item?.id || item?.soru_id || idx),
          index: idx,
          soru: String(soru || `Madde ${idx + 1}`),
          soruTipi,
          cevap: String(cevap || '').trim(),
          karar: String(karar || '').trim(),
          photos,
        }
      })
    : []

  useEffect(() => {
    const initial = {}
    checklistItems.forEach((item) => {
      if (item.karar === 'accept' || item.karar === 'reject') {
        initial[item.key] = item.karar
      }
    })
    setChecklistDraftDecisions(initial)
  }, [task?.id, checklistItems.length])

  const getChecklistDecision = (item) =>
    checklistDraftDecisions[item.key] || item.karar || ''

  const getChecklistDecisionFromDraft = (item, draftMap) =>
    draftMap[item.key] || item.karar || ''

  const rejectedChecklistItems = checklistItems.filter(
    (item) => getChecklistDecision(item) === 'reject',
  )

  const submitChecklistReview = useCallback(async () => {
    if (isReadOnlyApprovedTask || isReviewLockedByOwnership) return
    if (!task?.id || !Array.isArray(task?.checklist_cevaplari)) return
    if (!rejectedChecklistItems.length) {
      toast.error('En az bir madde reddedilmeden görev tekrar gönderilemez')
      return
    }
    const nextRows = task.checklist_cevaplari.map((row, idx) => {
      const item = checklistItems[idx]
      const decision = item && getChecklistDecision(item) === 'reject'
        ? 'reject'
        : 'accept'
      return {
        ...row,
        denetim_karari: decision,
      }
    })
    const rejectedLabels = rejectedChecklistItems
      .map((item) => item.soru)
      .filter(Boolean)
      .join(', ')
    setSubmittingChecklistReview(true)
    try {
      const { error } = await supabase
        .from('isler')
        .update({
          checklist_cevaplari: nextRows,
          durum: TASK_STATUS.REJECTED,
          red_nedeni: rejectedLabels
            ? `Checklist reddedilen maddeler: ${rejectedLabels}`
            : 'Checklist maddesi reddedildi',
        })
        .eq('id', task.id)
      if (error) throw error
      setTask((prev) =>
        prev
          ? {
              ...prev,
              checklist_cevaplari: nextRows,
              durum: TASK_STATUS.REJECTED,
              red_nedeni: rejectedLabels
                ? `Checklist reddedilen maddeler: ${rejectedLabels}`
                : 'Checklist maddesi reddedildi',
            }
          : prev,
      )
      await logTaskTimelineEvent(task.id, 'review', personel?.id, 'checklist-reject')
      toast.success(
        `Görev tekrar gönderildi (${rejectedChecklistItems.length} madde reddedildi)`,
      )
    } catch (e) {
      console.error(e)
      toast.error('Checklist değerlendirmesi kaydedilemedi')
    } finally {
      setSubmittingChecklistReview(false)
    }
  }, [isReadOnlyApprovedTask, isReviewLockedByOwnership, task, checklistItems, rejectedChecklistItems, getChecklistDecision])

  const submitChecklistApproveAll = useCallback(
    async (draftMap) => {
      if (isReadOnlyApprovedTask || isReviewLockedByOwnership) return
      if (!task?.id || !Array.isArray(task?.checklist_cevaplari)) return
      const nextRows = task.checklist_cevaplari.map((row, idx) => {
        const item = checklistItems[idx]
        const decision =
          item && getChecklistDecisionFromDraft(item, draftMap) === 'reject'
            ? 'reject'
            : 'accept'
        return {
          ...row,
          denetim_karari: decision,
        }
      })
      setSubmittingChecklistReview(true)
      try {
        const { error } = await supabase
          .from('isler')
          .update({
            checklist_cevaplari: nextRows,
            durum: TASK_STATUS.APPROVED,
            red_nedeni: null,
          })
          .eq('id', task.id)
        if (error) throw error
        setTask((prev) =>
          prev
            ? {
                ...prev,
                checklist_cevaplari: nextRows,
                durum: TASK_STATUS.APPROVED,
                red_nedeni: null,
              }
            : prev,
        )
        await logTaskTimelineEvent(task.id, 'review', personel?.id, 'checklist-approve-all')
        toast.success('Tum maddeler kabul edildi, gorev otomatik onaylandi')
      } catch (e) {
        console.error(e)
        toast.error('Gorev otomatik onaylanamadi')
      } finally {
        setSubmittingChecklistReview(false)
      }
    },
    [isReadOnlyApprovedTask, isReviewLockedByOwnership, task, checklistItems],
  )

  const rejectChainStep = useCallback(
    async (row) => {
      if (isReadOnlyApprovedTask) {
        toast.error('Onaylanan görevde değişiklik yapılamaz')
        return
      }
      if (isReviewLockedByOwnership) {
        toast.error('Görevi yapan kişi kendi görevini onaylayamaz/reddedemez')
        return
      }
      if (!row?.id || !task?.id) return
      if (!canRejectChainStep) {
        toast.error('Bu işlem için yetkiniz yok')
        return
      }
      const reason = window.prompt('Red nedeni girin:')
      if (reason == null) return
      const trimmed = String(reason || '').trim()
      if (!trimmed) {
        toast.error('Red nedeni boş olamaz')
        return
      }
      setRejectingStepId(row.id)
      try {
        const { error: stepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .update({ durum: 'reddedildi', aciklama: trimmed })
          .eq('id', row.id)
        if (stepErr) throw stepErr

        const { error: taskErr } = await supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.REJECTED,
            red_nedeni: trimmed,
            sorumlu_personel_id: row.personel_id || task?.sorumlu_personel_id || null,
            zincir_aktif_adim: Number(row.adim_no) || 1,
          })
          .eq('id', task.id)
        if (taskErr) throw taskErr

        setChainGorevSteps((prev) =>
          prev.map((s) => (s.id === row.id ? { ...s, durum: 'reddedildi', aciklama: trimmed } : s)),
        )
        setTask((prev) =>
          prev
            ? {
                ...prev,
                durum: TASK_STATUS.REJECTED,
                red_nedeni: trimmed,
                sorumlu_personel_id: row.personel_id || prev.sorumlu_personel_id,
                zincir_aktif_adim: Number(row.adim_no) || prev.zincir_aktif_adim,
              }
            : prev,
        )
        await logTaskTimelineEvent(task.id, 'review', personel?.id, `chain-step-reject:${trimmed}`)
        toast.success('Adım reddedildi')
      } catch (e) {
        console.error(e)
        toast.error('Adım reddedilemedi')
      } finally {
        setRejectingStepId(null)
      }
    },
    [isReadOnlyApprovedTask, isReviewLockedByOwnership, canRejectChainStep, task?.id, task?.sorumlu_personel_id],
  )

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/admin/tasks')}
          style={{
            padding: '6px 12px',
            borderRadius: 9999,
            border: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ← Görevlere Dön
        </button>
        {!loading && showOperationalEdit ? (
          <button
            type="button"
            onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              border: '1px solid rgba(79,70,229,0.45)',
              backgroundColor: 'rgba(79,70,229,0.06)',
              color: '#4338ca',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Düzenle
          </button>
        ) : null}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
      ) : !task ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Görev bulunamadı.
        </div>
      ) : (
        <div
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
            borderRadius: 24,
            border: '1px solid #dbe5f0',
            boxShadow: '0 20px 40px -32px rgba(15,23,42,0.45)',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                }}
              >
                {task.baslik || 'Görev Detayı'}{' '}
                {task.gorev_turu && task.gorev_turu !== 'normal' ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#4338ca',
                      marginLeft: 6,
                    }}
                  >
                    {task.gorev_turu === 'zincir_gorev' && '🔗 Zincir görev'}
                    {task.gorev_turu === 'zincir_onay' && '🔗 Zincir onay'}
                    {task.gorev_turu === 'zincir_gorev_ve_onay' && '🔗 Zincir görev + onay'}
                  </span>
                ) : null}
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: '#6b7280',
                  marginTop: 4,
                }}
              >
                {company?.ana_sirket_adi || '—'} •{' '}
                {fullNameOrPersonelRef(person, task?.sorumlu_personel_id)}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 8,
              }}
            >
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: statusPillStyle.bg,
                  color: statusPillStyle.color,
                }}
              >
                {normalizedStatus || '-'}
              </span>
              <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 9999,
                    backgroundColor: '#eef2ff',
                    border: '1px solid #c7d2fe',
                    color: '#3730a3',
                    fontWeight: 700,
                  }}
                >
                  Görev tipi: {taskTypeLabel}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              Zaman geçmişi
            </div>
            <div style={{ fontSize: 12, color: '#334155', marginBottom: 8 }}>
              Tekrar sayısı: <strong>{resubmissionCount}</strong>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>Tamamlama zamanları</div>
              {completionHistory.length === 0 ? (
                <div>-</div>
              ) : (
                completionHistory.map((row, idx) => (
                  <div key={`cmp-${idx}`}>
                    {idx + 1}. tamamlama: {formatTs(row?.at)}
                  </div>
                ))
              )}
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: 6 }}>Denetim zamanları</div>
              {reviewHistory.length === 0 ? (
                <div>-</div>
              ) : (
                reviewHistory.map((row, idx) => (
                  <div key={`rvw-${idx}`}>
                    {idx + 1}. denetim: {formatTs(row?.at)}
                  </div>
                ))
              )}
            </div>
          </div>

          {pendingDeletion && (
            <div
              style={{
                border: '1px solid #fecaca',
                borderRadius: 14,
                backgroundColor: '#fff7ed',
                padding: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9a3412', marginBottom: 8 }}>
                İş silme
              </div>
              <div style={{ fontSize: 13, color: '#78350f' }}>
                Silme talebi onaya gönderildi; onay bekleniyor (oluşturulma:{' '}
                {pendingDeletion.created_at
                  ? formatTs(pendingDeletion.created_at)
                  : '—'}
                ).
                {pendingDeletion.talep_aciklama ? (
                  <span>
                    {' '}
                    Silme nedeni: {pendingDeletion.talep_aciklama}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* Öz bilgiler */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
              gap: 12,
              fontSize: 13,
              color: '#334155',
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            {[
              ['Sorumlu Personel', fullNameOrPersonelRef(person, task?.sorumlu_personel_id)],
              [
                'Görev Atayan',
                task?.atayan_personel_id
                  ? fullNameOrPersonelRef(assigner, task.atayan_personel_id)
                  : 'Kayıtta yok (eski kayıt)',
              ],
              ['Başlangıç tarihi', formatTs(task.baslama_tarihi)],
              ['Bitiş tarihi', formatTs(task.son_tarih)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  backgroundColor: '#ffffff',
                }}
              >
                <span
                  style={{
                    color: '#64748b',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    color: '#0f172a',
                    fontWeight: 600,
                    textAlign: 'right',
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: 13,
              color: '#334155',
              lineHeight: 1.55,
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              border: '1px solid #cbd5e1',
              borderRadius: 14,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: 6,
              }}
            >
              Yönetici / Denetimci notu
            </div>
            {managerNote || 'Yönetici veya denetimci notu bulunmuyor.'}
          </div>

          <div
            style={{
              fontSize: 13,
              color: '#334155',
              lineHeight: 1.55,
              background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
              border: '1px solid #cbd5e1',
              borderRadius: 14,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: 6,
              }}
            >
              Personel notu
            </div>
            {completerNote || 'Tamamlayan kişi tarafından yazılmış açıklama bulunmuyor.'}
          </div>

          {isChecklistTask && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#0f172a',
                  marginBottom: 10,
                }}
              >
                Checklist maddeleri
              </div>
              {!isReadOnlyApprovedTask && !isReviewLockedByOwnership && rejectedChecklistItems.length > 0 && (
                <div
                  style={{
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 10,
                    backgroundColor: '#fff7ed',
                    border: '1px solid #fed7aa',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#9a3412', fontWeight: 700 }}>
                    {rejectedChecklistItems.length} madde reddedildi
                  </div>
                  <button
                    type="button"
                    disabled={submittingChecklistReview}
                    onClick={submitChecklistReview}
                    style={{
                      border: 'none',
                      borderRadius: 9999,
                      backgroundColor: '#dc2626',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '6px 12px',
                      cursor: submittingChecklistReview ? 'not-allowed' : 'pointer',
                      opacity: submittingChecklistReview ? 0.6 : 1,
                    }}
                  >
                    Görevi tekrar gönder
                  </button>
                </div>
              )}
              {checklistItems.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Checklist maddesi bulunmuyor.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {checklistItems.map((item) => (
                    (() => {
                      const decision = getChecklistDecision(item)
                      const isAccepted = decision === 'accept'
                      const isRejected = decision === 'reject'
                      const decisionLocked =
                        item.karar === 'accept' ||
                        item.karar === 'reject' ||
                        decision === 'accept' ||
                        isReadOnlyApprovedTask ||
                        isReviewLockedByOwnership
                      return (
                    <div
                      key={item.id}
                      style={{
                        border: isAccepted
                          ? '1px solid #86efac'
                          : isRejected
                            ? '1px solid #fca5a5'
                            : '1px solid #e2e8f0',
                        borderRadius: 10,
                        backgroundColor: isAccepted
                          ? '#f0fdf4'
                          : isRejected
                            ? '#fff1f2'
                            : '#f8fafc',
                        padding: '9px 10px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedChecklistItemId((prev) =>
                            prev === item.id ? null : item.id,
                          )
                        }
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}
                        >
                          {item.soru}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                          {expandedChecklistItemId === item.id ? '▲' : '▼'}
                        </span>
                      </button>

                      {expandedChecklistItemId === item.id && (
                        <>
                          {item.soruTipi !== 'FOTOGRAF' ? (
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>
                              Cevap: {item.cevap || 'Yanıt girilmemiş'}
                            </div>
                          ) : null}
                          {item.photos.length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginTop: 8,
                              }}
                            >
                              {item.photos.map((url, pidx) => (
                                <img
                                  key={`${item.key}-${pidx}`}
                                  src={url}
                                  alt="Checklist kanıt fotoğrafı"
                                  style={{
                                    width: 84,
                                    height: 84,
                                    borderRadius: 10,
                                    objectFit: 'cover',
                                    border: '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => setPreviewPhoto(url)}
                                />
                              ))}
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginTop: 8,
                            }}
                          >
                            <button
                              type="button"
                              disabled={decisionLocked || submittingChecklistReview}
                              onClick={async () => {
                                if (isReadOnlyApprovedTask || isReviewLockedByOwnership) return
                                const nextDraft = {
                                  ...checklistDraftDecisions,
                                  [item.key]: 'accept',
                                }
                                setChecklistDraftDecisions(nextDraft)
                                const allAccepted = checklistItems.every(
                                  (it) =>
                                    getChecklistDecisionFromDraft(it, nextDraft) ===
                                    'accept',
                                )
                                if (allAccepted && !submittingChecklistReview) {
                                  await submitChecklistApproveAll(nextDraft)
                                }
                              }}
                              style={{
                                border: '1px solid #86efac',
                                backgroundColor: isAccepted ? '#dcfce7' : '#f0fdf4',
                                color: '#166534',
                                borderRadius: 9999,
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '5px 10px',
                                cursor:
                                  decisionLocked || submittingChecklistReview
                                    ? 'not-allowed'
                                    : 'pointer',
                                opacity:
                                  decisionLocked || submittingChecklistReview
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              Kabul Et
                            </button>
                            <button
                              type="button"
                              disabled={decisionLocked || submittingChecklistReview}
                              onClick={() =>
                                !isReadOnlyApprovedTask &&
                                !isReviewLockedByOwnership &&
                                setChecklistDraftDecisions((prev) => ({
                                  ...prev,
                                  [item.key]: 'reject',
                                }))
                              }
                              style={{
                                border: '1px solid #fca5a5',
                                backgroundColor: isRejected ? '#fee2e2' : '#fff1f2',
                                color: '#991b1b',
                                borderRadius: 9999,
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '5px 10px',
                                cursor:
                                  decisionLocked || submittingChecklistReview
                                    ? 'not-allowed'
                                    : 'pointer',
                                opacity:
                                  decisionLocked || submittingChecklistReview
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              Reddet
                            </button>
                          </div>
                          {decisionLocked && (isAccepted || isRejected) ? (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                color: isAccepted ? '#166534' : '#991b1b',
                              }}
                            >
                              {isAccepted
                                ? 'Bu madde onaylandı ve kilitlendi.'
                                : 'Bu madde reddedildi ve kilitlendi.'}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                      )
                    })()
                  ))}
                </div>
              )}
            </div>
          )}

          {!isChainGorevTask && !isChecklistTask && photoUrls.length > 0 && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#0f172a',
                  marginBottom: 10,
                }}
              >
                Fotoğraflar
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                {photoUrls.map((url, idx) => (
                  <img
                    key={`${task.id}-${idx}`}
                    src={url}
                    alt="Görev görseli"
                    style={{
                      width: 110,
                      height: 110,
                      borderRadius: 14,
                      objectFit: 'cover',
                      border: '1px solid #e5e7eb',
                      cursor: 'pointer',
                    }}
                    onClick={() => setPreviewPhoto(url)}
                  />
                ))}
              </div>
            </div>
          )}

          {chainGorevSteps.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                border: '1px solid #e0e7ff',
                backgroundColor: '#f5f3ff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3730a3', marginBottom: 10 }}>
                🔗 Zincir görev — personel bazlı adım takibi
              </div>
              {chainGorevSteps.map((row) => {
                const pid = row.personel_id
                const name = chainNameMap[pid] || pid
                const urls = Array.isArray(row.kanit_resim_ler) ? row.kanit_resim_ler : []
                const open = expandedChainPerson === row.id
                return (
                  <div
                    key={row.id}
                    style={{
                      marginBottom: 8,
                      borderRadius: 12,
                      border: '1px solid #c7d2fe',
                      backgroundColor: '#fff',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedChainPerson(open ? null : row.id)
                      }
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: '#eef2ff',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#312e81',
                        cursor: 'pointer',
                      }}
                    >
                      {row.adim_no}. {name}{' '}
                      <span style={{ fontWeight: 500, color: '#64748b' }}>
                        ({row.durum || '—'})
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: 12 }}>
                        {row?.aciklama ? (
                          <div
                            style={{
                              marginBottom: 10,
                              padding: '8px 10px',
                              borderRadius: 10,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              fontSize: 12,
                              color: '#334155',
                            }}
                          >
                            Açıklama: {String(row.aciklama)}
                          </div>
                        ) : null}
                        {urls.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#64748b' }}>Fotoğraf yok</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {urls.map((url, uidx) => (
                              <div
                                key={url}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                  alignItems: 'center',
                                }}
                              >
                                <img
                                  src={url}
                                  alt=""
                                  style={{
                                    width: 100,
                                    height: 100,
                                    borderRadius: 12,
                                    objectFit: 'cover',
                                    border: '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => setPreviewPhoto(url)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {canRejectChainStep && !isReadOnlyApprovedTask && !isReviewLockedByOwnership ? (
                          <button
                            type="button"
                            onClick={() => rejectChainStep(row)}
                            disabled={rejectingStepId === row.id}
                            style={{
                              marginTop: 10,
                              fontSize: 12,
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: 'none',
                              backgroundColor: '#dc2626',
                              color: '#fff',
                              cursor: rejectingStepId === row.id ? 'not-allowed' : 'pointer',
                              opacity: rejectingStepId === row.id ? 0.6 : 1,
                            }}
                          >
                            {rejectingStepId === row.id ? 'Reddediliyor...' : 'Bu kişiyi reddet'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {chainOnaySteps.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                border: '1px solid #dbeafe',
                backgroundColor: '#eff6ff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', marginBottom: 8 }}>
                🔗 Zincir onay sırası
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                {chainOnaySteps.map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>
                    {r.adim_no}. {chainNameMap[r.onaylayici_personel_id] || r.onaylayici_personel_id} —{' '}
                    {r.durum}
                    {r.onaylandi_at
                      ? ` (${new Date(r.onaylandi_at).toLocaleString('tr-TR')})`
                      : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}

        </div>
      )}

      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
          }}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #1f2937',
              backgroundColor: '#020617',
            }}
          >
            <img
              src={previewPhoto}
              alt="Büyük görev görseli"
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

