import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../../lib/supabaseClient'
import { AuthContext } from '../../../../contexts/AuthContext.jsx'
import { isSiraliGorevTuru, isZincirGorevTuru, isZincirOnayTuru } from '../../../../lib/zincirTasks.js'
import {
  TASK_STATUS,
  normalizeTaskStatus,
  normalizeStepStatus,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  isStepApprovedStatus,
  taskOperationalEditEligible,
} from '../../../../lib/taskStatus.js'
import {
  canApproveTask,
  canAuditTaskStep,
  canOperationallyEditAssignedTask,
  canRequestTaskDeletion,
} from '../../../../lib/permissions.js'
import { isUnitInScope } from '../../../../lib/supabaseScope.js'
import { logTaskTimelineEvent } from '../../../../lib/taskTimeline.js'
import {
  fetchTaskWorkStatusHistory,
  formatWorkStatusHistoryLine,
} from '../../../../lib/taskWorkStatusHistory.js'
import { getTaskDetailConfig } from '../../../../components/tasks/detail/taskDetailConfig.js'
import { isHelpGuideDemoTaskId } from '../../../../lib/helpGuideDemoData.js'
import {
  normalizeTimelineArray,
  samePersonelId,
  personRefLabel,
  formatTaskShowTs,
  extractPhotoUrls,
  collectTaskDetailLightboxPhotos,
  dedupePhotoUrls,
  coercePhotoUrl,
  extractKanitVideosFromJob,
  extractChecklistVideoList,
  normalizeReferenceMediaList,
  buildChecklistItems,
  fullNameFromPerson,
} from '../taskShow/taskShowUtils.js'

const supabase = getSupabase()

export function useTaskShowPage() {

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
  const [previewPhotoAlbum, setPreviewPhotoAlbum] = useState(null)

  const openPhotoPreview = useCallback((url, album) => {
    const u = coercePhotoUrl(url)
    if (!u) return
    setPreviewPhoto(u)
    const scoped = dedupePhotoUrls(album)
    setPreviewPhotoAlbum(scoped.length ? scoped : null)
  }, [])

  const closePhotoPreview = useCallback(() => {
    setPreviewPhoto(null)
    setPreviewPhotoAlbum(null)
  }, [])
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
  const [workStatusHistory, setWorkStatusHistory] = useState([])
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
    if (isHelpGuideDemoTaskId(id)) {
      setLoading(false)
      setTask(null)
      toast.message('Bu görev kılavuz örneğidir; gerçek detay sayfası açılmaz.')
      navigate(-1)
      return
    }
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

      try {
        const hist = await fetchTaskWorkStatusHistory(supabase, job.id)
        setWorkStatusHistory(hist)
      } catch {
        setWorkStatusHistory([])
      }

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

  const checklistItems = useMemo(() => buildChecklistItems(task), [task?.checklist_cevaplari, task?.id])

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
  // Sıralı Görevde isler.durum bazı RPC akışlarında geç güncellenebiliyor.
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

  const lightboxPhotoUrls = useMemo(() => {
    const stepsById = new Map()
    for (const s of [...(chainGorevSteps || []), ...(chainGorevStepsForViewer || [])]) {
      if (s?.id) stepsById.set(String(s.id), s)
    }
    return collectTaskDetailLightboxPhotos({
      task,
      chainSteps: [...stepsById.values()],
      checklistItems,
      taskReferenceMedia,
      stepReferenceMediaMap,
    })
  }, [
    task,
    chainGorevSteps,
    chainGorevStepsForViewer,
    checklistItems,
    taskReferenceMedia,
    stepReferenceMediaMap,
  ])

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
  const canEditWorkStatus = isSelfAssignedTask || canSiraliComplete
  const canSiraliAudit =
    isSiraliTask &&
    activeSiraliStep &&
    String(activeSiraliStep?.adim_durum || '') === 'onay_bekliyor' &&
    String(activeSiraliStep?.denetimci_personel_id || '') === String(personel?.id || '') &&
    canAuditTaskStep(permissions || {})

  /**
   * Sıralı Görevde viewer'ın rolü ve hangi adıma sahip olduğu.
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

  // fullName
  const fullName = (p) =>
    p ? `${p.ad || ''} ${p.soyad || ''}`.trim() || p.email || '-' : '-'

  const fullNameOrPersonelRef = (row, personelId) =>
    row
      ? fullNameFromPerson(row)
      : personelId
        ? `Personel (ref: ${String(personelId).slice(0, 8)}…)`
        : '—'

  const taskTypeLabel = (() => {
    const t = String(task?.gorev_turu || '')
    if (!t || t === 'normal') return 'Normal'
    if (t === 'zincir_gorev') return 'Zincir Görev'
    if (t === 'zincir_onay') return 'Zincir Onay'
    if (t === 'zincir_gorev_ve_onay') return 'Zincir Görev + Zincir Onay'
    if (t === 'sirali_gorev') return 'Sıralı Görev'
    if (t === 'sablon_gorev') return 'Şablon Görev'
    return t.replaceAll('_', ' ')
  })()

  const detailConfig = getTaskDetailConfig(task?.gorev_turu)
  const chainTotalSteps = Math.max(chainGorevSteps.length, chainOnaySteps.length)
  const chainActiveStep =
    Number(task?.zincir_aktif_adim) || Number(task?.zincir_onay_aktif_adim) || 0

  const formatTs = formatTaskShowTs
  const _formatTsLegacy = (value) => {
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
  // Sıralı Görev için derivedTaskStatusForSirali (tüm adımlar onaylandığında
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

  const showCompleteBtn =
    !isApproved &&
    !isPendingApprovalTaskStatus(effectiveTaskDurum) &&
    (isSelfAssignedTask || canSiraliComplete)

  const showActionBar =
    showCompleteBtn ||
    (isSiraliTask && canSiraliAudit) ||
    (canManageTask && showApproveBtn) ||
    showOperationalEdit ||
    showDeleteTaskBtn

  const sidebarDescription =
    detailConfig?.description && !suppressGeneralTaskAciklamaForScopedApproved
      ? String(description || '').trim()
      : ''

  const managerNote = String(task?.red_nedeni || '').trim()

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
      const n = fullNameFromPerson(person)
      return n !== '-' ? n : `Personel (ref: ${k.slice(0, 8)}…)`
    }
    if (assigner?.id && k === String(assigner.id)) {
      const n = fullNameFromPerson(assigner)
      return n !== '-' ? n : `Personel (ref: ${k.slice(0, 8)}…)`
    }
    return `Personel (ref: ${k.slice(0, 8)}…)`
  }


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
        'Bu görev için silme talebini onaya göndermek üzeresiniz. Onaylayıcı onayından sonra görev kalıcı olarak silinebilir. Devam etmek için silme nedenini yazın.',
      confirmLabel: 'Onaya gönder',
      variant: 'warning',
      reasonInput: true,
      reasonRequired: true,
      reasonLabel: 'Silme nedeni',
      reasonPlaceholder: 'Silme talebinin gerekçesini yazın…',
    }
  }, [confirmCtx])
  return {
    loading, task, company, person, assigner, navigate, id,
    previewPhoto,
    previewPhotoAlbum,
    openPhotoPreview,
    closePhotoPreview,
    confirmCtx, setConfirmCtx, confirmDialogConfig, handleConfirmDialogConfirm,
    detailConfig, chainActiveStep, chainTotalSteps,
    photoUrls, lightboxPhotoUrls, taskVideoEvidence,
    isChainGorevTask, isChainOnayTask, isSiraliTask, isHybridChainTask, isChecklistTask,
    normalizedStatus, isApproved, isRejected, isReadOnlyApprovedTask, isReviewLockedByOwnership,
    isSelfAssignedTask, canEditWorkStatus, canSiraliAudit, canSiraliComplete,
    effectiveTaskDurum, normalizedStatus,
    showCompleteBtn, showActionBar, showApproveBtn, showDeleteTaskBtn, showOperationalEdit,
    approveDisabled, rejectDisabled, canManageTask,
    sidebarDescription, description, managerNote, completerNote,
    formatTs, fullNameOrPersonelRef, personRefLabel,
    chainGorevSteps, chainOnaySteps, chainGorevStepsForViewer, chainOnayStepsForViewer,
    chainNameMap, expandedChainPerson, setExpandedChainPerson,
    siraliViewerStepInfo, activeSiraliStep,
    checklistItems, checklistDraftDecisions, setChecklistDraftDecisions,
    expandedChecklistItemId, setExpandedChecklistItemId,
    getChecklistDecision, getChecklistDecisionFromDraft, rejectedChecklistItems,
    submitChecklistReview, submitChecklistApproveAll, submittingChecklistReview,
    workStatusHistory, completionHistory, reviewHistory, resubmissionCount, denetimActorLabel,
    taskReferenceMedia, stepReferenceMediaMap, pendingDeletion,
    rejectChainStep, reviewSiraliStep, requestApprove, requestReject, requestDeletion,
    canRejectChainStep, suppressGeneralTaskAciklamaForScopedApproved,
    permissions, personel, actioningTaskId, rejectingStepId,
    loadTask,
    setTask,
    setWorkStatusHistory,
    profile,
    company,
  }
}
