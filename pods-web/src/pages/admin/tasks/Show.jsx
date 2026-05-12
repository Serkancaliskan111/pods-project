import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { isSiraliGorevTuru, isZincirGorevTuru, isZincirOnayTuru } from '../../../lib/zincirTasks.js'
import {
  TASK_STATUS,
  normalizeTaskStatus,
  normalizeStepStatus,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  isStepApprovedStatus,
  taskOperationalEditEligible,
} from '../../../lib/taskStatus.js'
import {
  canApproveTask,
  canAuditTaskStep,
  canOperationallyEditAssignedTask,
  canRequestTaskDeletion,
} from '../../../lib/permissions.js'
import { isUnitInScope } from '../../../lib/supabaseScope.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import { logTaskTimelineEvent } from '../../../lib/taskTimeline.js'

const supabase = getSupabase()

function normalizeTimelineArray(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

function samePersonelId(a, b) {
  const x = String(a ?? '').trim()
  const y = String(b ?? '').trim()
  if (!x || !y) return false
  return x === y
}

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
  const [confirmCtx, setConfirmCtx] = useState(null)
  const [actioningTaskId, setActioningTaskId] = useState(null)
  const [denetimActorNames, setDenetimActorNames] = useState({})
  const [taskReferenceMedia, setTaskReferenceMedia] = useState([])
  const [stepReferenceMediaMap, setStepReferenceMediaMap] = useState({})
  const permissions = profile?.yetkiler || {}
  const canSubmitDeletionRequest = canRequestTaskDeletion(permissions)
  const canOpEditTasks =
    isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)
  const canRejectChainStep =
    isSystemAdmin ||
    permissions?.gorev_onayla === true ||
    permissions?.denetim?.reddet === true ||
    permissions?.['denetim.reddet'] === true ||
    permissions?.is_admin === true ||
    permissions?.is_manager === true

  const loadTask = useCallback(async () => {
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
      if (job?.id && (isZincirGorevTuru(job.gorev_turu) || isSiraliGorevTuru(job.gorev_turu))) {
        const { data: zg } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select(
            'id, adim_no, personel_id, denetimci_personel_id, adim_baslik, adim_istenenler, adim_durum, adim_gonderim_at, adim_onay_at, adim_onay_notu, durum, kanit_resim_ler, kanit_videolar, kanit_foto_durumlari, aciklama',
          )
          .eq('is_id', job.id)
          .order('adim_no', { ascending: true })
        if (zg?.length) {
          setChainGorevSteps(zg)
          const ids = [
            ...new Set(
              zg
                .flatMap((r) => [r.personel_id, r.denetimci_personel_id])
                .filter(Boolean),
            ),
          ]
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
  }, [
    id,
    isSystemAdmin,
    currentCompanyId,
    scopeReady,
    JSON.stringify(accessibleUnitIds || []),
    navigate,
  ])

  useEffect(() => {
    void loadTask()
  }, [loadTask])

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

  useEffect(() => {
    const rows = normalizeTimelineArray(task?.denetim_gecmisi)
    const ids = [
      ...new Set(rows.map((r) => r?.actor_id).filter(Boolean).map(String)),
    ]
    if (!ids.length) {
      setDenetimActorNames({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('personeller')
        .select('id,ad,soyad,email')
        .in('id', ids)
      if (cancelled) return
      const m = {}
      for (const p of data || []) {
        if (!p?.id) continue
        const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
        m[String(p.id)] = n || p.email || String(p.id)
      }
      setDenetimActorNames(m)
    })()
    return () => {
      cancelled = true
    }
  }, [task?.id, task?.denetim_gecmisi])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!task?.id) {
        setTaskReferenceMedia([])
        setStepReferenceMediaMap({})
        return
      }
      const taskRefs = await resolveReferenceMediaUrls(task?.referans_medya)
      const stepEntries = await Promise.all(
        (chainGorevSteps || []).map(async (step) => {
          const refs = await resolveReferenceMediaUrls(step?.adim_istenenler?.referans_medya)
          return [String(step.id), refs]
        }),
      )
      if (cancelled) return
      setTaskReferenceMedia(taskRefs)
      setStepReferenceMediaMap(Object.fromEntries(stepEntries))
    })()
    return () => {
      cancelled = true
    }
  }, [task?.id, task?.referans_medya, chainGorevSteps])

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

  function normalizeKanitVideoEntry(v) {
    if (v == null) return null
    if (typeof v === 'string') {
      const u = v.trim()
      return u ? { url: u } : null
    }
    if (typeof v === 'object' && v.url) {
      return {
        url: String(v.url),
        duration_sec:
          v.duration_sec != null && Number.isFinite(Number(v.duration_sec))
            ? Number(v.duration_sec)
            : null,
      }
    }
    return null
  }

  function extractKanitVideosFromJob(job) {
    const raw = job?.kanit_videolar
    if (!raw || !Array.isArray(raw)) return []
    return raw.map(normalizeKanitVideoEntry).filter(Boolean)
  }

  function extractChecklistVideoList(raw) {
    if (!raw) return []
    if (Array.isArray(raw)) {
      return raw.map(normalizeKanitVideoEntry).filter(Boolean)
    }
    if (typeof raw === 'string') {
      const t = raw.trim()
      try {
        const p = JSON.parse(t)
        if (Array.isArray(p)) return p.map(normalizeKanitVideoEntry).filter(Boolean)
      } catch (_) {
        // ignore
      }
      const u = normalizeKanitVideoEntry(t)
      return u ? [u] : []
    }
    return []
  }

  function normalizeReferenceMediaList(raw) {
    if (!raw) return []
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) return []
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed.filter(Boolean) : []
      } catch {
        return []
      }
    }
    return []
  }

  const resolveReferenceMediaUrls = async (items) => {
    const list = normalizeReferenceMediaList(items)
    const out = []
    for (const item of list) {
      const path = String(item?.path || item?.yol || '').trim()
      if (!path) continue
      const { data } = await supabase.storage
        .from('task-reference-media')
        .createSignedUrl(path, 60 * 60 * 24)
      const signedUrl = data?.signedUrl || null
      if (!signedUrl) continue
      out.push({
        ...item,
        signedUrl,
        type: String(item?.type || item?.tip || ''),
        mimeType: String(item?.mimeType || item?.mime || ''),
        name: String(item?.name || item?.ad || ''),
      })
    }
    return out
  }

  const photoUrls = extractPhotoUrls(task)
  const taskVideoEvidence = extractKanitVideosFromJob(task)
  const isChainGorevTask = isZincirGorevTuru(task?.gorev_turu)
  const isChainOnayTask = isZincirOnayTuru(task?.gorev_turu)
  const isSiraliTask = isSiraliGorevTuru(task?.gorev_turu)
  const isHybridChainTask =
    String(task?.gorev_turu || '') === 'zincir_gorev_ve_onay'
  const isChecklistTask =
    !!task?.is_sablon_id ||
    (Array.isArray(task?.checklist_cevaplari) &&
      task.checklist_cevaplari.length > 0)
  // Sıralı görevde isler.durum bazı RPC akışlarında geç güncellenebiliyor.
  // Bu yüzden tüm adımlar onaylandığında görevi client tarafında "Onaylandı"
  // olarak türetiyoruz; statusPill yeşili / "Onaylandı" etiketi tutarsız
  // kalmasın diye.
  const derivedTaskStatusForSirali = useMemo(() => {
    if (!isSiraliGorevTuru(task?.gorev_turu)) return null
    const steps = chainGorevSteps || []
    if (!steps.length) return null
    const allApproved = steps.every((s) =>
      isStepApprovedStatus(s?.adim_durum || s?.durum),
    )
    if (allApproved) return TASK_STATUS.APPROVED
    return null
  }, [task?.gorev_turu, chainGorevSteps])

  const effectiveTaskDurum = derivedTaskStatusForSirali || task?.durum
  const normalizedStatus = normalizeTaskStatus(effectiveTaskDurum)
  const isApproved = isApprovedTaskStatus(effectiveTaskDurum)
  const isRejected = normalizedStatus === TASK_STATUS.REJECTED
  const isReadOnlyApprovedTask = isApproved
  const isSelfAssignedTask = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
  const isReviewLockedByOwnership = isSelfAssignedTask

  const permTruthy = (key) => {
    const v = permissions?.[key]
    return v === true || v === 'true' || v === 1 || v === '1'
  }
  /** Mobil TaskDetail ile aynı: görev onayı yetkisi tek başına tam zincir görünümü vermez */
  const isBroadHierarchyManager =
    isSystemAdmin ||
    permTruthy('is_admin') ||
    permTruthy('is_manager') ||
    permTruthy('personel.yonet') ||
    permTruthy('personel_yonet') ||
    permTruthy('sube.yonet') ||
    permTruthy('sirket.yonet') ||
    permTruthy('rol.yonet')

  const chainOverviewEligible =
    (chainGorevSteps || []).length > 0 || (chainOnaySteps || []).length > 0

  const viewerHasChainRole = useMemo(() => {
    if (!personel?.id) return false
    const pid = personel.id
    const gs = chainGorevSteps || []
    const os = chainOnaySteps || []
    return (
      gs.some(
        (s) =>
          samePersonelId(s?.personel_id, pid) || samePersonelId(s?.denetimci_personel_id, pid),
      ) || os.some((s) => samePersonelId(s?.onaylayici_personel_id, pid))
    )
  }, [personel?.id, chainGorevSteps, chainOnaySteps])

  const viewerOwnFinishedChainAssignee =
    isApproved &&
    String(task?.sorumlu_personel_id || '') === String(personel?.id || '') &&
    (isZincirGorevTuru(task?.gorev_turu) || isSiraliGorevTuru(task?.gorev_turu))
  const viewerScopedOwnStepsOnly =
    chainOverviewEligible &&
    (viewerHasChainRole || viewerOwnFinishedChainAssignee) &&
    (!isBroadHierarchyManager || viewerOwnFinishedChainAssignee)

  const chainGorevStepsForViewer = useMemo(() => {
    const steps = chainGorevSteps || []
    if (isBroadHierarchyManager || !viewerScopedOwnStepsOnly) return steps
    const pid = personel?.id
    let mine = steps.filter(
      (s) =>
        samePersonelId(s?.personel_id, pid) || samePersonelId(s?.denetimci_personel_id, pid),
    )
    if (
      !mine.length &&
      isApproved &&
      task &&
      samePersonelId(task?.sorumlu_personel_id, pid)
    ) {
      const completedMine = steps
        .filter((s) => samePersonelId(s?.personel_id, pid) && s?.tamamlandi_at)
        .sort(
          (a, b) =>
            new Date(b.tamamlandi_at).getTime() - new Date(a.tamamlandi_at).getTime(),
        )
      if (completedMine.length) mine = [completedMine[0]]
    }
    const onayMine = (chainOnaySteps || []).some((s) =>
      samePersonelId(s?.onaylayici_personel_id, pid),
    )
    if (mine.length) return mine
    if (onayMine) return []
    return []
  }, [
    isBroadHierarchyManager,
    viewerScopedOwnStepsOnly,
    chainGorevSteps,
    chainOnaySteps,
    personel?.id,
    isApproved,
    task,
  ])

  const chainOnayStepsForViewer = useMemo(() => {
    const steps = chainOnaySteps || []
    if (isBroadHierarchyManager || !viewerScopedOwnStepsOnly) return steps
    const pid = personel?.id
    return steps.filter((s) => samePersonelId(s?.onaylayici_personel_id, pid))
  }, [isBroadHierarchyManager, viewerScopedOwnStepsOnly, chainOnaySteps, personel?.id])

  const suppressGeneralTaskAciklamaForScopedApproved =
    viewerScopedOwnStepsOnly && isApproved && chainOverviewEligible

  const activeSiraliStep = useMemo(() => {
    if (!isSiraliTask || !chainGorevSteps.length) return null
    return (
      chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'aktif') ||
      chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'onay_bekliyor') ||
      chainGorevSteps.find((s) => Number(s?.adim_no || 0) === Number(task?.zincir_aktif_adim || 1)) ||
      null
    )
  }, [isSiraliTask, chainGorevSteps, task?.zincir_aktif_adim])
  const canSiraliComplete =
    isSiraliTask &&
    activeSiraliStep &&
    String(activeSiraliStep?.adim_durum || '') === 'aktif' &&
    String(activeSiraliStep?.personel_id || '') === String(personel?.id || '')
  const canSiraliAudit =
    isSiraliTask &&
    activeSiraliStep &&
    String(activeSiraliStep?.adim_durum || '') === 'onay_bekliyor' &&
    String(activeSiraliStep?.denetimci_personel_id || '') === String(personel?.id || '') &&
    canAuditTaskStep(permissions || {})

  /**
   * Sıralı görevde viewer'ın rolü ve hangi adıma sahip olduğu.
   *  - worker: kendi aktif adımı (henüz yapacak)
   *  - auditor: kendi onay bekleyen adımı (denetleyici)
   *  - pending: kendi yaptığı, denetim sürecindeki adım
   *  - approved: kendi onaylanmış adımı
   *  - rejected: kendi reddedilmiş adımı
   *  - waiting: kendine ait olup henüz sırası gelmemiş adım
   *  - null: yönetici / atayan (herhangi bir adım sahibi değil)
   */
  const siraliViewerStepInfo = useMemo(() => {
    if (!isSiraliTask || !personel?.id) return null
    const steps = chainGorevSteps || []
    if (!steps.length) return null
    const pid = String(personel.id)
    const has = (s, key, val) => String(s?.[key] || '') === val
    const durum = (s) => String(s?.adim_durum || s?.durum || '').toLowerCase()

    const workerActive = steps.find(
      (s) => durum(s) === 'aktif' && has(s, 'personel_id', pid),
    )
    if (workerActive) return { role: 'worker', step: workerActive }

    const auditorPending = steps.find(
      (s) => durum(s) === 'onay_bekliyor' && has(s, 'denetimci_personel_id', pid),
    )
    if (auditorPending) return { role: 'auditor', step: auditorPending }

    const myPending = steps.find(
      (s) => durum(s) === 'onay_bekliyor' && has(s, 'personel_id', pid),
    )
    if (myPending) return { role: 'pending', step: myPending }

    const myRejected = steps.find(
      (s) => durum(s) === 'reddedildi' && has(s, 'personel_id', pid),
    )
    if (myRejected) return { role: 'rejected', step: myRejected }

    const myApproved = steps
      .filter(
        (s) =>
          (durum(s) === 'onaylandi' || durum(s) === 'tamamlandi') &&
          has(s, 'personel_id', pid),
      )
      .sort((a, b) => (Number(b?.adim_no) || 0) - (Number(a?.adim_no) || 0))[0]
    if (myApproved) return { role: 'approved', step: myApproved }

    const myWaiting = steps.find(
      (s) => has(s, 'personel_id', pid) && !['onaylandi', 'tamamlandi'].includes(durum(s)),
    )
    if (myWaiting) return { role: 'waiting', step: myWaiting }

    return null
  }, [isSiraliTask, personel?.id, chainGorevSteps])

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
    if (t === 'sirali_gorev') return 'Sıralı görev'
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

  const deleteScopeOk =
    !accessibleUnitIds ||
    !accessibleUnitIds.length ||
    isUnitInScope(accessibleUnitIds, task?.birim_id)
  const editScopeOk = deleteScopeOk

  const canManageTask =
    !!task &&
    (isSystemAdmin || canApproveTask(permissions)) &&
    deleteScopeOk
  // Sıralı görev için derivedTaskStatusForSirali (tüm adımlar onaylandığında
  // hesaplanır) DB'deki isler.durum'a göre öncelikli. Bu sayede sıralı görev
  // "Onaylandı" olarak görünmüşse hâlâ "düzenle" / "onayla" butonları
  // tetiklenmez.
  const taskForStatusChecks = task
    ? derivedTaskStatusForSirali
      ? { ...task, durum: derivedTaskStatusForSirali }
      : task
    : null
  const showApproveBtn = canManageTask && isPendingApprovalTaskStatus(effectiveTaskDurum)

  const showDeleteTaskBtn =
    !!task && canSubmitDeletionRequest && deleteScopeOk && !pendingDeletion

  const approveDisabled =
    actioningTaskId === task?.id || isApproved || isSelfAssignedTask
  const rejectDisabled =
    actioningTaskId === task?.id || isApproved || isRejected

  const showOperationalEdit =
    !!task &&
    !pendingDeletion &&
    canOpEditTasks &&
    editScopeOk &&
    taskOperationalEditEligible(taskForStatusChecks)

  const managerNote = String(task?.red_nedeni || task?.aciklama || '').trim()

  const completerNote = String(
    task?.personel_tamamlama_notu ||
      task?.tamamlayan_aciklama ||
      task?.personel_aciklama ||
      '',
  ).trim()

  const completionHistory = normalizeTimelineArray(task?.tamamlama_gecmisi)
  const reviewHistory = normalizeTimelineArray(task?.denetim_gecmisi)
  const resubmissionCount = Number(task?.tekrar_gonderim_sayisi || 0)

  const denetimActorLabel = (row) => {
    const aid = row?.actor_id
    if (!aid) return 'Denetçi kaydı yok'
    const k = String(aid)
    if (denetimActorNames[k]) return denetimActorNames[k]
    if (person?.id && k === String(person.id)) {
      const n = fullName(person)
      return n !== '-' ? n : `Personel (ref: ${k.slice(0, 8)}…)`
    }
    if (assigner?.id && k === String(assigner.id)) {
      const n = fullName(assigner)
      return n !== '-' ? n : `Personel (ref: ${k.slice(0, 8)}…)`
    }
    return `Personel (ref: ${k.slice(0, 8)}…)`
  }

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
        const videos = extractChecklistVideoList(
          item?.videolar ?? item?.videos ?? item?.video_urls ?? null,
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
          videos,
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

  const completeSiraliStep = useCallback(async () => {
    if (!task?.id || !activeSiraliStep?.adim_no || !canSiraliComplete) return
    setActioningTaskId(task.id)
    try {
      const { error } = await supabase.rpc('rpc_sirali_adim_tamamla', {
        p_is_id: task.id,
        p_adim_no: Number(activeSiraliStep.adim_no),
        p_aciklama: null,
      })
      if (error) throw error
      await logTaskTimelineEvent(task.id, 'completion', personel?.id, `sirali-step-complete:${activeSiraliStep.adim_no}`)
      toast.success('Adım denetime gönderildi')
      await loadTask()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Adım tamamlanamadı')
    } finally {
      setActioningTaskId(null)
    }
  }, [task?.id, activeSiraliStep?.adim_no, canSiraliComplete, personel?.id, loadTask])

  const reviewSiraliStep = useCallback(
    async (karar) => {
      if (!task?.id || !activeSiraliStep?.adim_no || !canSiraliAudit) return
      let yorum = null
      if (karar === 'reddet') {
        yorum = window.prompt('Red nedeni girin:')
        if (yorum == null) return
        yorum = String(yorum || '').trim()
        if (!yorum) {
          toast.error('Red nedeni boş olamaz')
          return
        }
      }
      setActioningTaskId(task.id)
      try {
        const { error } = await supabase.rpc('rpc_sirali_adim_onayla_reddet', {
          p_is_id: task.id,
          p_adim_no: Number(activeSiraliStep.adim_no),
          p_karar: karar,
          p_yorum: yorum,
        })
        if (error) throw error
        await logTaskTimelineEvent(
          task.id,
          'review',
          personel?.id,
          `sirali-step-${karar}:${activeSiraliStep.adim_no}`,
        )
        toast.success(karar === 'onayla' ? 'Adım onaylandı' : 'Adım reddedildi')
        await loadTask()
      } catch (e) {
        console.error(e)
        toast.error(e?.message || 'Adım denetimi başarısız')
      } finally {
        setActioningTaskId(null)
      }
    },
    [task?.id, activeSiraliStep?.adim_no, canSiraliAudit, personel?.id, loadTask],
  )

  const executeApprove = useCallback(
    async (job) => {
      if (!job?.id) return
      setActioningTaskId(job.id)
      try {
        const { error } = await supabase
          .from('isler')
          .update({ durum: TASK_STATUS.APPROVED })
          .eq('id', job.id)
        if (error) throw error
        await logTaskTimelineEvent(job.id, 'review', personel?.id, 'approve')
        toast.success('Görev onaylandı')
        await loadTask()
      } catch (e) {
        console.error(e)
        toast.error('Görev onaylanamadı')
      } finally {
        setActioningTaskId(null)
      }
    },
    [personel?.id, loadTask],
  )

  const executeReject = useCallback(
    async (job, trimmed) => {
      if (!job?.id) return
      setActioningTaskId(job.id)
      try {
        if (
          job.gorev_turu === 'zincir_gorev' ||
          job.gorev_turu === 'zincir_gorev_ve_onay'
        ) {
          const activeStepNo = Number(job.zincir_aktif_adim) || 1
          const { data: currentStep, error: stepErr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('id')
            .eq('is_id', job.id)
            .eq('adim_no', activeStepNo)
            .maybeSingle()
          if (stepErr) throw stepErr
          if (currentStep?.id) {
            const { error: updStepErr } = await supabase
              .from('isler_zincir_gorev_adimlari')
              .update({
                durum: 'reddedildi',
                aciklama: trimmed,
              })
              .eq('id', currentStep.id)
            if (updStepErr) throw updStepErr
          }
        }

        const { error } = await supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.REJECTED,
            red_nedeni: trimmed,
          })
          .eq('id', job.id)
        if (error) {
          const { error: fallbackErr } = await supabase
            .from('isler')
            .update({
              durum: TASK_STATUS.REJECTED,
              aciklama: trimmed,
            })
            .eq('id', job.id)
          if (fallbackErr) throw fallbackErr
        }
        await logTaskTimelineEvent(job.id, 'review', personel?.id, `reject:${trimmed}`)
        toast.success('Görev reddedildi')
        await loadTask()
      } catch (e) {
        console.error(e)
        toast.error('Görev reddedilemedi')
      } finally {
        setActioningTaskId(null)
      }
    },
    [personel?.id, loadTask],
  )

  const executeRequestDeletion = useCallback(
    async (job, talepAciklama) => {
      if (!job?.id || !canSubmitDeletionRequest) return
      const aciklama = String(talepAciklama || '').trim()
      if (!aciklama) {
        toast.error('Silme nedeni zorunludur')
        return
      }
      setActioningTaskId(job.id)
      try {
        const { error } = await supabase.rpc('rpc_is_silme_talebi_olustur', {
          p_is_id: job.id,
          p_aciklama: aciklama,
        })
        if (error) throw error
        toast.success('Silme talebi onaya gönderildi')
        const { data } = await supabase
          .from('isler_silme_talepleri')
          .select('id,talep_aciklama,created_at')
          .eq('is_id', job.id)
          .eq('durum', 'bekliyor')
          .maybeSingle()
        setPendingDeletion(data || null)
        await loadTask()
      } catch (e) {
        console.error(e)
        toast.error(e?.message || 'Silme talebi oluşturulamadı')
      } finally {
        setActioningTaskId(null)
      }
    },
    [canSubmitDeletionRequest, loadTask],
  )

  const requestApprove = () => {
    if (!task?.id) return
    if (String(task?.sorumlu_personel_id || '') === String(personel?.id || '')) {
      toast.error('Görevi yapan kişi kendi görevini onaylayamaz')
      return
    }
    setConfirmCtx({ type: 'approve', task })
  }

  const requestReject = () => {
    if (!task?.id) return
    setConfirmCtx({ type: 'reject', task })
  }

  const requestDeletion = () => {
    if (!task?.id || !canSubmitDeletionRequest) return
    setConfirmCtx({ type: 'delete', task })
  }

  const handleConfirmDialogConfirm = (reason) => {
    if (!confirmCtx?.task) return
    const { type, task: t } = confirmCtx
    setConfirmCtx(null)
    if (type === 'approve') void executeApprove(t)
    else if (type === 'reject')
      void executeReject(t, String(reason || '').trim())
    else if (type === 'delete')
      void executeRequestDeletion(t, String(reason || '').trim())
  }

  const confirmDialogConfig = useMemo(() => {
    if (!confirmCtx) return null
    if (confirmCtx.type === 'approve') {
      return {
        title: 'Görevi onayla',
        message: 'Bu görevi onaylamak istediğinize emin misiniz?',
        confirmLabel: 'Evet, onayla',
        variant: 'primary',
        reasonInput: false,
      }
    }
    if (confirmCtx.type === 'reject') {
      return {
        title: 'Görevi reddet',
        message:
          'Bu görevi reddetmek istediğinize emin misiniz? Devam etmek için aşağıya red nedenini yazın.',
        confirmLabel: 'Reddet',
        variant: 'danger',
        reasonInput: true,
        reasonRequired: true,
        reasonLabel: 'Red nedeni',
        reasonPlaceholder: 'Red gerekçesini yazın…',
      }
    }
    return {
      title: 'Silme talebi',
      message:
        'Bu iş için silme talebini onaya göndermek üzeresiniz. Onaylayıcı onayından sonra iş kalıcı olarak silinebilir. Devam etmek için silme nedenini yazın.',
      confirmLabel: 'Onaya gönder',
      variant: 'warning',
      reasonInput: true,
      reasonRequired: true,
      reasonLabel: 'Silme nedeni',
      reasonPlaceholder: 'Silme talebinin gerekçesini yazın…',
    }
  }, [confirmCtx])

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

          {(canManageTask || showOperationalEdit || showDeleteTaskBtn) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              }}
            >
              {isSiraliTask && canSiraliComplete ? (
                <button
                  type="button"
                  onClick={completeSiraliStep}
                  disabled={actioningTaskId === task?.id}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: 'none',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: actioningTaskId === task?.id ? 'not-allowed' : 'pointer',
                    opacity: actioningTaskId === task?.id ? 0.6 : 1,
                  }}
                >
                  Görevi Tamamla
                </button>
              ) : null}
              {isSiraliTask && canSiraliAudit ? (
                <>
                  <button
                    type="button"
                    onClick={() => void reviewSiraliStep('onayla')}
                    disabled={actioningTaskId === task?.id}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: actioningTaskId === task?.id ? 'not-allowed' : 'pointer',
                      opacity: actioningTaskId === task?.id ? 0.6 : 1,
                    }}
                  >
                    Onayla
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewSiraliStep('reddet')}
                    disabled={actioningTaskId === task?.id}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: actioningTaskId === task?.id ? 'not-allowed' : 'pointer',
                      opacity: actioningTaskId === task?.id ? 0.6 : 1,
                    }}
                  >
                    Reddet
                  </button>
                </>
              ) : null}
              {canManageTask ? (
                <>
                  {showApproveBtn ? (
                    <button
                      type="button"
                      disabled={approveDisabled}
                      onClick={requestApprove}
                      title={
                        isApproved
                          ? 'Bu görev zaten onaylandı'
                          : isSelfAssignedTask
                            ? 'Görevi yapan kişi kendi görevini onaylayamaz'
                            : 'Görevi onayla'
                      }
                      style={{
                        padding: '8px 14px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: approveDisabled ? 'not-allowed' : 'pointer',
                        opacity: approveDisabled ? 0.55 : 1,
                      }}
                    >
                      Onayla
                    </button>
                  ) : null}
                  {showApproveBtn ? (
                    <button
                      type="button"
                      disabled={rejectDisabled}
                      onClick={requestReject}
                      title={
                        isApproved
                          ? 'Onaylanmış görev reddedilemez'
                          : isRejected
                            ? 'Bu görev zaten reddedildi'
                            : 'Görevi reddet'
                      }
                      style={{
                        padding: '8px 14px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: rejectDisabled ? 'not-allowed' : 'pointer',
                        opacity: rejectDisabled ? 0.55 : 1,
                      }}
                    >
                      Reddet
                    </button>
                  ) : null}
                </>
              ) : null}
              {showOperationalEdit ? (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}
                  title="Görev içeriğini düzenle"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: '1px solid rgba(59,130,246,0.45)',
                    backgroundColor: 'rgba(59,130,246,0.06)',
                    color: '#1d4ed8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Düzenle
                </button>
              ) : null}
              {showDeleteTaskBtn ? (
                <button
                  type="button"
                  disabled={actioningTaskId === task.id}
                  onClick={requestDeletion}
                  title="Silme talebini onaya gönder"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: '1px solid rgba(220,38,38,0.35)',
                    backgroundColor: '#ffffff',
                    color: '#b91c1c',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: actioningTaskId === task.id ? 'not-allowed' : 'pointer',
                    opacity: actioningTaskId === task.id ? 0.55 : 1,
                  }}
                >
                  Sil
                </button>
              ) : null}
            </div>
          )}

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
                    <span style={{ color: '#64748b', fontWeight: 600 }}>
                      {' '}
                      · {denetimActorLabel(row)}
                    </span>
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

          {(taskReferenceMedia.length > 0 ||
            Object.values(stepReferenceMediaMap).some((rows) => Array.isArray(rows) && rows.length > 0)) && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                Referans medya
              </div>
              {taskReferenceMedia.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {taskReferenceMedia.map((ref, idx) => {
                    const isVideo =
                      ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')
                    const isImage =
                      ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')
                    if (isVideo) {
                      return (
                        <video
                          key={`task-ref-${idx}`}
                          src={ref.signedUrl}
                          controls
                          playsInline
                          style={{
                            width: 220,
                            maxHeight: 160,
                            borderRadius: 12,
                            border: '1px solid #e5e7eb',
                            background: '#0f172a',
                          }}
                        />
                      )
                    }
                    if (isImage) {
                      return (
                        <div key={`task-ref-${idx}`} style={{ display: 'grid', gap: 4 }}>
                          <img
                            src={ref.signedUrl}
                            alt={ref.name || 'Referans görseli'}
                            onClick={() => setPreviewPhoto(ref.signedUrl)}
                            style={{
                              width: 100,
                              height: 100,
                              borderRadius: 12,
                              objectFit: 'cover',
                              border: '1px solid #e5e7eb',
                              cursor: 'pointer',
                            }}
                          />
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>Referans fotoğraf</div>
                        </div>
                      )
                    }
                    return (
                      <a
                        key={`task-ref-${idx}`}
                        href={ref.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}
                      >
                        {ref.name || 'Dosya'}
                      </a>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b' }}>Görev seviyesinde referans yok.</div>
              )}
            </div>
          )}

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
                          {item.soruTipi !== 'FOTOGRAF' && item.soruTipi !== 'VIDEO' ? (
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>
                              Cevap: {item.cevap || 'Yanıt girilmemiş'}
                            </div>
                          ) : null}
                          {item.videos.length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                gap: 10,
                                flexWrap: 'wrap',
                                marginTop: 8,
                              }}
                            >
                              {item.videos.map((v, vidx) => (
                                <div
                                  key={`${item.key}-v-${vidx}`}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                    maxWidth: 280,
                                  }}
                                >
                                  <video
                                    src={v.url}
                                    controls
                                    playsInline
                                    style={{
                                      width: '100%',
                                      maxHeight: 200,
                                      borderRadius: 10,
                                      border: '1px solid #e2e8f0',
                                      background: '#0f172a',
                                    }}
                                  />
                                  {v.duration_sec != null ? (
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                      ~{Math.round(v.duration_sec)} sn
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
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

          {!isChainGorevTask && !isChecklistTask && (photoUrls.length > 0 || taskVideoEvidence.length > 0) ? (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                backgroundColor: '#fff',
                padding: 14,
              }}
            >
              {photoUrls.length > 0 ? (
                <>
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
                </>
              ) : null}
              {taskVideoEvidence.length > 0 ? (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0f172a',
                      marginBottom: 10,
                      marginTop: photoUrls.length > 0 ? 14 : 0,
                    }}
                  >
                    Video kanıtları
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {taskVideoEvidence.map((v, vidx) => (
                      <div key={`tv-${vidx}`} style={{ maxWidth: 280 }}>
                        <video
                          src={v.url}
                          controls
                          playsInline
                          style={{
                            width: '100%',
                            maxHeight: 220,
                            borderRadius: 12,
                            border: '1px solid #e5e7eb',
                            background: '#0f172a',
                          }}
                        />
                        {v.duration_sec != null ? (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            ~{Math.round(v.duration_sec)} sn
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {(chainGorevSteps.length > 0 || chainOnaySteps.length > 0) &&
          String(task?.aciklama || '').trim() &&
          !suppressGeneralTaskAciklamaForScopedApproved ? (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px solid #c7d2fe',
                backgroundColor: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#4338ca',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                Görev açıklaması
              </div>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {String(task.aciklama).trim()}
              </div>
            </div>
          ) : null}

          {/*
           * SIRALI GÖREV — adım takip bloğu (web)
           *
           * Mobile TaskDetail ile aynı UX prensibi:
           *  - Viewer (worker/auditor/owner) için üst banner: hangi adımda
           *    olduğunu, ne yapması gerektiğini ve denetimci/yapan kişiyi
           *    görür.
           *  - Adım listesi: her adım kart olarak; aktif adım vurgulu, durum
           *    pill'i yanında. Kanıt foto/video adım sahibinde kendisi,
           *    yönetici/atayan da hepsini görür.
           *  - Buton dili klasik: "Görevi Tamamla", "Onayla", "Reddet".
           */}
          {isSiraliTask && chainGorevStepsForViewer.length > 0 && (() => {
            const v = siraliViewerStepInfo
            const sortedSteps = [...(chainGorevSteps || [])].sort(
              (a, b) => (Number(a?.adim_no) || 0) - (Number(b?.adim_no) || 0),
            )
            return (
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {v ? (() => {
                  const step = v.step || {}
                  const adimNo = Number(step?.adim_no) || 0
                  const stepTitle = String(step?.adim_baslik || '').trim() || `Adım ${adimNo || '-'}`
                  const ist = step?.adim_istenenler && typeof step.adim_istenenler === 'object'
                    ? step.adim_istenenler
                    : {}
                  const stepAciklama = String(ist?.aciklama || step?.aciklama || '').trim()
                  const stepBitis = ist?.bitis_tarihi || null
                  const stepAcil = !!ist?.acil
                  const yapanName =
                    chainNameMap[String(step?.personel_id)] ||
                    fullNameOrPersonelRef(null, step?.personel_id)
                  const denetimciName = step?.denetimci_personel_id
                    ? chainNameMap[String(step?.denetimci_personel_id)] ||
                      fullNameOrPersonelRef(null, step.denetimci_personel_id)
                    : '—'
                  const palette = (() => {
                    if (v.role === 'worker') return { bg: '#ecfeff', border: '#67e8f9', accent: '#0e7490' }
                    if (v.role === 'auditor' || v.role === 'pending') return { bg: '#eef2ff', border: '#c7d2fe', accent: '#3730a3' }
                    if (v.role === 'approved') return { bg: '#ecfdf5', border: '#a7f3d0', accent: '#047857' }
                    if (v.role === 'rejected') return { bg: '#fef2f2', border: '#fecaca', accent: '#b91c1c' }
                    return { bg: '#f8fafc', border: '#e2e8f0', accent: '#475569' } // waiting
                  })()
                  const headerText =
                    v.role === 'worker' ? 'Aktif adımınız' :
                    v.role === 'auditor' ? 'Onayınızı bekleyen adım' :
                    v.role === 'pending' ? 'Adımınız denetimde' :
                    v.role === 'approved' ? 'Adımınız onaylandı' :
                    v.role === 'rejected' ? 'Adımınız reddedildi' :
                    'Sıranızı bekliyor'
                  const hintText =
                    v.role === 'worker'
                      ? 'Görevi tamamlamak için yukarıdaki "Görevi Tamamla" düğmesini kullanın.'
                      : v.role === 'auditor'
                        ? 'Kanıtları inceleyip "Onayla" veya "Reddet" düğmelerini kullanın.'
                        : v.role === 'pending'
                          ? 'Denetimci onayı bekleniyor; onaylandığında sıralı görev sıradaki adıma geçer.'
                          : v.role === 'approved'
                            ? 'Bu adım sizin için tamamlandı; sıralı görev sonraki adımlarla yürümeye devam ediyor.'
                            : v.role === 'rejected'
                              ? 'Denetimci adımınızı reddetti; gerekçeye göre yeniden gönderim mobil uygulama üzerinden yapılır.'
                              : 'Önceki adım onaylandığında sıra otomatik olarak size geçecek.'
                  return (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        border: `1px solid ${palette.border}`,
                        backgroundColor: palette.bg,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9999,
                            backgroundColor: palette.accent,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {adimNo || '-'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: palette.accent, fontSize: 13 }}>{headerText}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Adım {adimNo || '-'} / {sortedSteps.length}
                          </div>
                        </div>
                        {stepAcil ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '4px 8px',
                              borderRadius: 9999,
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            Acil
                          </span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                        {stepTitle}
                      </div>
                      {stepAciklama ? (
                        <div style={{ marginTop: 6, fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                          {stepAciklama}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                        {v.role === 'auditor' ? (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Yapan</div>
                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{yapanName}</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Denetimci</div>
                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{denetimciName}</div>
                          </div>
                        )}
                        {stepBitis ? (
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Bitiş</div>
                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{formatTs(stepBitis)}</div>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: palette.accent, fontStyle: 'italic' }}>{hintText}</div>
                    </div>
                  )
                })() : null}

                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: '1px solid #e0e7ff',
                    backgroundColor: '#f5f3ff',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3730a3', marginBottom: 10 }}>
                    📋 Sıralı görev — adım takibi
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {chainGorevStepsForViewer.map((row) => {
                      const pid = row.personel_id
                      const stepName = chainNameMap[pid] || fullNameOrPersonelRef(null, pid)
                      const denetimciName2 = row?.denetimci_personel_id
                        ? chainNameMap[String(row.denetimci_personel_id)] ||
                          fullNameOrPersonelRef(null, row.denetimci_personel_id)
                        : '—'
                      const ist2 = row?.adim_istenenler && typeof row.adim_istenenler === 'object'
                        ? row.adim_istenenler
                        : {}
                      const rowTitle = String(row?.adim_baslik || '').trim() || `Adım ${row?.adim_no || '-'}`
                      const rowAciklama = String(ist2?.aciklama || row?.aciklama || '').trim()
                      const rowBitis = ist2?.bitis_tarihi || null
                      const durumRaw = String(row?.adim_durum || row?.durum || '').toLowerCase()
                      const isActive = durumRaw === 'aktif'
                      const isViewerOwn = v && Number(v.step?.adim_no) === Number(row?.adim_no)
                      // Tek tip kaynak: normalizeStepStatus → tüm sistemde aynı
                      // yazım ("Onaylandı", "Onay Bekliyor", "Aktif",
                      // "Beklemede", "Reddedildi").
                      const durumLabel =
                        normalizeStepStatus(row?.adim_durum || row?.durum) || 'Beklemede'
                      const durumPalette = (() => {
                        if (durumRaw === 'onaylandi' || durumRaw === 'tamamlandi') return { bg: '#dcfce7', color: '#166534' }
                        if (durumRaw === 'reddedildi') return { bg: '#fee2e2', color: '#991b1b' }
                        if (durumRaw === 'onay_bekliyor') return { bg: '#fef3c7', color: '#92400e' }
                        if (durumRaw === 'aktif') return { bg: '#ecfeff', color: '#0e7490' }
                        return { bg: '#e2e8f0', color: '#475569' }
                      })()
                      const urls = Array.isArray(row.kanit_resim_ler) ? row.kanit_resim_ler : []
                      const stepVideos = extractKanitVideosFromJob(row)
                      const stepRefs = stepReferenceMediaMap[String(row.id)] || []
                      return (
                        <div
                          key={row.id}
                          style={{
                            borderRadius: 12,
                            border: `1px solid ${isActive ? '#c7d2fe' : '#e2e8f0'}`,
                            backgroundColor: '#fff',
                            padding: 12,
                            boxShadow: isActive ? '0 0 0 2px #c7d2fe' : 'none',
                          }}
                        >
                          {/* Eğer viewer kendi adımına bakıyorsa banner zaten
                              başlık + yapan/denetimci + bitiş bilgilerini
                              gösteriyor; çakışmasın diye kart üst meta'sını
                              gizliyoruz. Adımlar yine kanıt/medya için durur. */}
                          {!isViewerOwn ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: '#3730a3',
                                      backgroundColor: '#eef2ff',
                                      padding: '3px 8px',
                                      borderRadius: 9999,
                                    }}
                                  >
                                    Adım {row?.adim_no || '-'}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: 9999,
                                    backgroundColor: durumPalette.bg,
                                    color: durumPalette.color,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                  }}
                                >
                                  {durumLabel}
                                </span>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{rowTitle}</div>
                              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Yapan</div>
                                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{stepName}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Denetimci</div>
                                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{denetimciName2}</div>
                                </div>
                                {rowBitis ? (
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Bitiş</div>
                                    <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{formatTs(rowBitis)}</div>
                                  </div>
                                ) : null}
                              </div>
                              {rowAciklama ? (
                                <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                  {rowAciklama}
                                </div>
                              ) : null}
                            </>
                          ) : null}

                          {(row?.tamamlandi_at || row?.adim_onay_at) ? (
                            <div style={{ marginTop: !isViewerOwn ? 8 : 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                              {row?.tamamlandi_at ? (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Tamamlanma</div>
                                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{formatTs(row.tamamlandi_at)}</div>
                                </div>
                              ) : null}
                              {row?.adim_onay_at ? (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Onay zamanı</div>
                                  <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>{formatTs(row.adim_onay_at)}</div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {(urls.length > 0 || stepVideos.length > 0 || stepRefs.length > 0) ? (
                            <div style={{ marginTop: 10, borderTop: '1px dashed #e2e8f0', paddingTop: 10 }}>
                              {urls.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {urls.map((url) => (
                                    <img
                                      key={url}
                                      src={url}
                                      alt=""
                                      style={{
                                        width: 100,
                                        height: 100,
                                        borderRadius: 10,
                                        objectFit: 'cover',
                                        border: '1px solid #e5e7eb',
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => setPreviewPhoto(url)}
                                    />
                                  ))}
                                </div>
                              ) : null}
                              {stepVideos.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: urls.length ? 8 : 0 }}>
                                  {stepVideos.map((vd, vi) => (
                                    <video
                                      key={`sirali-vid-${row.id}-${vi}`}
                                      src={vd.url}
                                      controls
                                      playsInline
                                      style={{ width: 220, maxHeight: 160, borderRadius: 10, border: '1px solid #e5e7eb', background: '#0f172a' }}
                                    />
                                  ))}
                                </div>
                              ) : null}
                              {stepRefs.length > 0 ? (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Adım referans medya</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {stepRefs.map((ref, ri) => {
                                      const isVideo = ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')
                                      const isImage = ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')
                                      if (isVideo) {
                                        return (
                                          <video
                                            key={`sirali-ref-${row.id}-${ri}`}
                                            src={ref.signedUrl}
                                            controls
                                            playsInline
                                            style={{ width: 220, maxHeight: 160, borderRadius: 10, border: '1px solid #e5e7eb', background: '#0f172a' }}
                                          />
                                        )
                                      }
                                      if (isImage) {
                                        return (
                                          <img
                                            key={`sirali-ref-${row.id}-${ri}`}
                                            src={ref.signedUrl}
                                            alt={ref.name || 'Referans'}
                                            style={{ width: 100, height: 100, borderRadius: 10, objectFit: 'cover', border: '1px solid #e5e7eb', cursor: 'pointer' }}
                                            onClick={() => setPreviewPhoto(ref.signedUrl)}
                                          />
                                        )
                                      }
                                      return (
                                        <a key={`sirali-ref-${row.id}-${ri}`} href={ref.signedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                                          {ref.name || 'Dosya'}
                                        </a>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}

          {!isSiraliTask && chainGorevStepsForViewer.length > 0 && (
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
              {chainGorevStepsForViewer.map((row) => {
                const pid = row.personel_id
                const name = chainNameMap[pid] || pid
                const urls = Array.isArray(row.kanit_resim_ler) ? row.kanit_resim_ler : []
                const stepVideos = extractKanitVideosFromJob(row)
                const stepRefs = stepReferenceMediaMap[String(row.id)] || []
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
                        ({normalizeStepStatus(row.adim_durum || row.durum) || '—'})
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
                        {urls.length === 0 && stepVideos.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#64748b' }}>Kanıt yok</div>
                        ) : (
                          <>
                            {urls.length > 0 ? (
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
                            ) : null}
                            {stepVideos.length > 0 ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 10,
                                  marginTop: urls.length ? 10 : 0,
                                }}
                              >
                                {stepVideos.map((v, vi) => (
                                  <video
                                    key={`sv-${vi}`}
                                    src={v.url}
                                    controls
                                    playsInline
                                    style={{
                                      width: 220,
                                      maxHeight: 160,
                                      borderRadius: 12,
                                      border: '1px solid #e5e7eb',
                                      background: '#0f172a',
                                    }}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                        {stepRefs.length > 0 ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                              Adım referans medya
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                              {stepRefs.map((ref, ridx) => {
                                const isVideo =
                                  ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')
                                const isImage =
                                  ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')
                                if (isVideo) {
                                  return (
                                    <video
                                      key={`step-ref-${row.id}-${ridx}`}
                                      src={ref.signedUrl}
                                      controls
                                      playsInline
                                      style={{
                                        width: 220,
                                        maxHeight: 160,
                                        borderRadius: 12,
                                        border: '1px solid #e5e7eb',
                                        background: '#0f172a',
                                      }}
                                    />
                                  )
                                }
                                if (isImage) {
                                  return (
                                    <div key={`step-ref-${row.id}-${ridx}`} style={{ display: 'grid', gap: 4 }}>
                                      <img
                                        src={ref.signedUrl}
                                        alt={ref.name || 'Adım referans görseli'}
                                        style={{
                                          width: 100,
                                          height: 100,
                                          borderRadius: 12,
                                          objectFit: 'cover',
                                          border: '1px solid #e5e7eb',
                                          cursor: 'pointer',
                                        }}
                                        onClick={() => setPreviewPhoto(ref.signedUrl)}
                                      />
                                      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>Referans fotoğraf</div>
                                    </div>
                                  )
                                }
                                return (
                                  <a
                                    key={`step-ref-${row.id}-${ridx}`}
                                    href={ref.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}
                                  >
                                    {ref.name || 'Dosya'}
                                  </a>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
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

          {chainOnayStepsForViewer.length > 0 && (
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
                {chainOnayStepsForViewer.map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>
                    {r.adim_no}. {chainNameMap[r.onaylayici_personel_id] || r.onaylayici_personel_id} —{' '}
                    {normalizeStepStatus(r.durum) || '—'}
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
      <ConfirmDialog
        open={!!confirmCtx}
        onClose={() => setConfirmCtx(null)}
        title={confirmDialogConfig?.title || 'Onay'}
        message={confirmDialogConfig?.message || ''}
        confirmLabel={confirmDialogConfig?.confirmLabel || 'Onayla'}
        variant={confirmDialogConfig?.variant || 'default'}
        loading={!!actioningTaskId}
        reasonInput={!!confirmDialogConfig?.reasonInput}
        reasonRequired={!!confirmDialogConfig?.reasonRequired}
        reasonLabel={confirmDialogConfig?.reasonLabel || 'Açıklama'}
        reasonPlaceholder={confirmDialogConfig?.reasonPlaceholder || ''}
        onConfirm={handleConfirmDialogConfirm}
      />
    </div>
  )
}

