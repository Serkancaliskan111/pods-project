import getSupabase from '../../../../lib/supabaseClient'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  enrichScopeWithJunctionPersonelIds,
  scopePersonelQuery,
  TASKS_LIST_LIMIT,
  OPERATOR_TASKS_LIST_LIMIT,
} from '../../../../lib/supabaseScope.js'
import { fetchOperatorAssigneeTasks } from '../../../../lib/loadCubicleHomeTasks.js'
import {
  fetchAssigneeProjectTasks,
  mergeJobsWithAssigneeProjectTasks,
} from '../../../../lib/projectTaskGlobalList.js'
import { isListedTaskVisibleForAssignee } from '../../../../lib/taskVisibility.js'
import {
  isApprovedTaskStatus,
  isStepApprovedStatus,
  normalizeTaskStatus,
  TASK_STATUS,
} from '../../../../lib/taskStatus.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../../../lib/taskVisibility.js'
import { groupTasksByGrupId } from '../../../../lib/groupTasks.js'
import { enrichTasksWithWorkActions } from '../../../../lib/enrichTasksWorkActions.js'
import {
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from '../../../../lib/zincirTasks.js'

export const JOBS_SELECT_WITH_VISIBLE_AT =
  'id,baslik,durum,calisma_durumu,calisma_durumu_guncelleme_at,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,gorunur_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,zincir_aktif_adim,zincir_onay_aktif_adim,ozel_gorev,grup_id,kanit_resim_ler,kanit_videolar,personel_tamamlama_notu,acil'

export const JOBS_SELECT_LEGACY =
  'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,zincir_aktif_adim,zincir_onay_aktif_adim,grup_id,kanit_resim_ler,kanit_videolar,personel_tamamlama_notu,acil'

function dedupeTasksById(rows) {
  const m = new Map()
  for (const r of rows || []) {
    if (r?.id != null) m.set(String(r.id), r)
  }
  return [...m.values()]
}

export async function mergeChainSiraliTasksIntoJobs(client, baseJobs, opts) {
  const {
    personelId,
    companyId,
    isSystemAdmin,
    jobsSelectWithVisibleAt,
    jobsSelectLegacy,
  } = opts
  if (!personelId) return baseJobs || []

  const workerJoinedQ = client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, adim_durum, durum, isler(gorev_turu)')
    .eq('personel_id', personelId)
  const denetimJoinedQ = client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, adim_durum, durum, isler(gorev_turu)')
    .eq('denetimci_personel_id', personelId)
  const onayPendingQ = client
    .from('isler_zincir_onay_adimlari')
    .select('is_id, adim_no')
    .eq('onaylayici_personel_id', personelId)
    .eq('durum', 'bekliyor')
  const onayAllQ = client
    .from('isler_zincir_onay_adimlari')
    .select('is_id')
    .eq('onaylayici_personel_id', personelId)

  const [workerJoinedRes, denetimJoinedRes, onayPendingRes, onayAllRes] = await Promise.all([
    workerJoinedQ,
    denetimJoinedQ,
    onayPendingQ,
    onayAllQ,
  ])

  let zincirGorevStepsRes = workerJoinedRes
  let workerStepsJoined = !zincirGorevStepsRes?.error
  if (zincirGorevStepsRes?.error?.code === '42703') {
    zincirGorevStepsRes = await client
      .from('isler_zincir_gorev_adimlari')
      .select('is_id, adim_no, adim_durum, durum')
      .eq('personel_id', personelId)
    workerStepsJoined = false
    if (zincirGorevStepsRes?.error?.code === '42703') {
      zincirGorevStepsRes = await client
        .from('isler_zincir_gorev_adimlari')
        .select('is_id, adim_no, durum')
        .eq('personel_id', personelId)
    }
  }

  const zincirOnayStepsData = onayPendingRes?.data
  const zincirOnayAllMine = onayAllRes?.data

  let siraliDenetimRes = denetimJoinedRes
  let denetimJoined = !siraliDenetimRes?.error
  if (siraliDenetimRes?.error?.code === '42703') {
    siraliDenetimRes = await client
      .from('isler_zincir_gorev_adimlari')
      .select('is_id, adim_no, adim_durum, durum')
      .eq('denetimci_personel_id', personelId)
    denetimJoined = false
    if (siraliDenetimRes?.error?.code === '42703') {
      siraliDenetimRes = { data: [] }
    }
  }

  const gorevMap = new Map()
  const siraliWorkerStepMap = new Map()
  const chainJobParticipantIds = new Set()
  const zincirOnayPastParticipantIds = new Set()
  ;(zincirOnayAllMine || []).forEach((r) => {
    if (r?.is_id) zincirOnayPastParticipantIds.add(String(r.is_id))
  })
  ;(zincirGorevStepsRes?.data || []).forEach((r) => {
    if (!r?.is_id || r?.adim_no == null) return
    chainJobParticipantIds.add(String(r.is_id))
    const tur = workerStepsJoined ? r?.isler?.gorev_turu : null
    const adimDurum = String(r?.adim_durum || r?.durum || '').toLowerCase()
    const zincireUygun = !workerStepsJoined || tur == null || isZincirGorevTuru(tur)
    const siraliUygun = !workerStepsJoined || tur == null || isSiraliGorevTuru(tur)
    if (
      zincireUygun &&
      (adimDurum === 'aktif' || adimDurum === 'bekliyor' || adimDurum === 'sira_bekliyor')
    ) {
      gorevMap.set(String(r.is_id), Number(r.adim_no))
    }
    if (siraliUygun && (adimDurum === 'aktif' || adimDurum === 'bekliyor')) {
      siraliWorkerStepMap.set(String(r.is_id), Number(r.adim_no))
    }
  })

  const onayMap = new Map()
  ;(zincirOnayStepsData || []).forEach((r) => {
    if (!r?.is_id || r?.adim_no == null) return
    onayMap.set(String(r.is_id), Number(r.adim_no))
  })

  const siraliDenetimMap = new Map()
  ;(siraliDenetimRes?.data || []).forEach((r) => {
    if (!r?.is_id || r?.adim_no == null) return
    const tur = denetimJoined ? r?.isler?.gorev_turu : null
    if (denetimJoined && !isSiraliGorevTuru(tur)) return
    const adimDurum = String(r?.adim_durum || r?.durum || '').toLowerCase()
    if (adimDurum === 'onay_bekliyor') {
      siraliDenetimMap.set(String(r.is_id), Number(r.adim_no))
    }
  })

  const chainIds = [
    ...new Set([
      ...gorevMap.keys(),
      ...onayMap.keys(),
      ...siraliDenetimMap.keys(),
      ...chainJobParticipantIds,
      ...zincirOnayPastParticipantIds,
    ]),
  ]
  if (!chainIds.length) return baseJobs || []

  let chainQ = client.from('isler').select(jobsSelectWithVisibleAt).in('id', chainIds)
  if (!isSystemAdmin && companyId) chainQ = chainQ.eq('ana_sirket_id', companyId)
  let { data: chainTasksData, error: chainTasksError } = await chainQ

  if (chainTasksError?.code === '42703' && jobsSelectLegacy) {
    let chainQ2 = client.from('isler').select(jobsSelectLegacy).in('id', chainIds)
    if (!isSystemAdmin && companyId) chainQ2 = chainQ2.eq('ana_sirket_id', companyId)
    const legacy = await chainQ2
    chainTasksData = legacy.data
    chainTasksError = legacy.error
  }

  if (chainTasksError || !chainTasksData?.length) return baseJobs || []

  const visibleChainTasks = chainTasksData.filter((task) => {
    const taskId = String(task?.id || '')
    const durumLower = String(normalizeTaskStatus(task?.durum) || '').toLowerCase()
    if (durumLower.includes('redded')) return false
    if (isApprovedTaskStatus(task?.durum)) {
      const gt = task?.gorev_turu
      const chainTyped =
        isZincirGorevTuru(gt) || isZincirOnayTuru(gt) || isSiraliGorevTuru(gt)
      if (!chainTyped) return false
      if (chainJobParticipantIds.has(taskId)) return true
      if (zincirOnayPastParticipantIds.has(taskId)) return true
      return false
    }
    if (isZincirGorevTuru(task?.gorev_turu)) {
      const myStep = gorevMap.get(taskId)
      if (myStep != null && Number(task?.zincir_aktif_adim || 1) === myStep) return true
    }
    if (isZincirOnayTuru(task?.gorev_turu)) {
      const myStep = onayMap.get(taskId)
      if (myStep != null && Number(task?.zincir_onay_aktif_adim || 1) === myStep) return true
    }
    if (isSiraliGorevTuru(task?.gorev_turu)) {
      const myActiveStep = siraliWorkerStepMap.get(taskId)
      if (myActiveStep != null && Number(task?.zincir_aktif_adim || 1) === myActiveStep) return true
      const myAuditStep = siraliDenetimMap.get(taskId)
      if (myAuditStep != null && Number(task?.zincir_aktif_adim || 1) === myAuditStep) return true
    }
    return false
  })

  if (!visibleChainTasks.length) return baseJobs || []
  return dedupeTasksById([...(baseJobs || []), ...visibleChainTasks])
}

async function applySiraliApprovedOverride(client, jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return jobs
  const siraliIds = jobs
    .filter((j) => isSiraliGorevTuru(j?.gorev_turu) && !isApprovedTaskStatus(j?.durum))
    .map((j) => j.id)
    .filter(Boolean)
  if (!siraliIds.length) return jobs

  const { data: allStepRows, error: stepsErr } = await client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_durum, durum')
    .in('is_id', siraliIds)
  if (stepsErr || !Array.isArray(allStepRows) || !allStepRows.length) return jobs

  const byJob = new Map()
  for (const row of allStepRows) {
    const key = String(row?.is_id || '')
    if (!key) continue
    const arr = byJob.get(key) || []
    arr.push(row)
    byJob.set(key, arr)
  }

  return jobs.map((j) => {
    if (!isSiraliGorevTuru(j?.gorev_turu)) return j
    const rows = byJob.get(String(j.id)) || []
    if (!rows.length) return j
    const allApproved = rows.every((r) => isStepApprovedStatus(r?.adim_durum || r?.durum))
    if (allApproved) return { ...j, durum: TASK_STATUS.APPROVED }
    return j
  })
}

export async function loadTasksListData({
  supabase: client = getSupabase(),
  scope,
  personel,
  isSystemAdmin,
  currentCompanyId,
  operatorMode = false,
}) {
  const jobsSelectWithVisibleAt = JOBS_SELECT_WITH_VISIBLE_AT
  const jobsSelectLegacy = JOBS_SELECT_LEGACY

  let comps = []
  let unitsData = []
  let staffData = []
  let jobs = []
  let jobsErr = null
  let compErr = null
  let unitsErr = null
  let staffErr = null

  if (operatorMode && personel?.id && currentCompanyId) {
    const [assigneeRes, unitsRes] = await Promise.all([
      fetchOperatorAssigneeTasks(client, {
        personelId: personel.id,
        companyId: currentCompanyId,
        limit: OPERATOR_TASKS_LIST_LIMIT,
        select: jobsSelectWithVisibleAt,
        selectLegacy: jobsSelectLegacy,
      }),
      scopeBirimlerQuery(
        client.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
        scope,
      ),
    ])
    jobs = assigneeRes.data || []
    jobsErr = assigneeRes.error
    if (!jobsErr && personel?.id && currentCompanyId) {
      const projectRes = await fetchAssigneeProjectTasks(client, {
        personelId: personel.id,
        companyId: currentCompanyId,
        limit: OPERATOR_TASKS_LIST_LIMIT,
      })
      if (!projectRes.error && projectRes.data?.length) {
        const now = new Date()
        jobs = mergeJobsWithAssigneeProjectTasks(jobs, projectRes.data).filter((t) =>
          isListedTaskVisibleForAssignee(t, now),
        )
      }
    }
    unitsData = unitsRes.data
    unitsErr = unitsRes.error
  } else {
    const [
      compsRes,
      unitsRes,
      staffRes,
      jobsRes,
    ] = await Promise.all([
      scopeAnaSirketlerQuery(
        client.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
        scope,
      ),
      scopeBirimlerQuery(
        client.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
        scope,
      ),
      scopePersonelQuery(
        client.from('personeller').select('id,ad,soyad,email,ana_sirket_id,birim_id,rol_id').is('silindi_at', null),
        scope,
      ),
      scopeIslerQuery(
        client
          .from('isler')
          .select(jobsSelectWithVisibleAt)
          .order('created_at', { ascending: false })
          .limit(TASKS_LIST_LIMIT),
        scope,
      ),
    ])
    comps = compsRes.data
    compErr = compsRes.error
    unitsData = unitsRes.data
    unitsErr = unitsRes.error
    staffData = staffRes.data
    staffErr = staffRes.error
    jobs = jobsRes.data
    jobsErr = jobsRes.error

    let usedLegacy = false
    if (jobsErr?.code === '42703') {
      usedLegacy = true
      const legacyRes = await scopeIslerQuery(
        client
          .from('isler')
          .select(jobsSelectLegacy)
          .order('created_at', { ascending: false })
          .limit(TASKS_LIST_LIMIT),
        scope,
      )
      jobs = legacyRes.data
      jobsErr = legacyRes.error
    }

    if (!jobsErr && personel?.id && currentCompanyId) {
      try {
        const sel = usedLegacy ? jobsSelectLegacy : jobsSelectWithVisibleAt
        const { data: privateAssignedByMe, error: privateErr } = await client
          .from('isler')
          .select(sel)
          .eq('ana_sirket_id', currentCompanyId)
          .eq('atayan_personel_id', personel.id)
          .eq('ozel_gorev', true)
          .order('created_at', { ascending: false })
          .limit(TASKS_LIST_LIMIT)

        if (!privateErr && Array.isArray(privateAssignedByMe) && privateAssignedByMe.length) {
          const mergedMap = new Map()
          for (const row of jobs || []) mergedMap.set(String(row?.id || ''), row)
          for (const row of privateAssignedByMe) mergedMap.set(String(row?.id || ''), row)
          jobs = Array.from(mergedMap.values())
        }
      } catch (_) {
        /* best-effort */
      }
    }
  }

  if (!jobsErr && personel?.id) {
    try {
      jobs = await mergeChainSiraliTasksIntoJobs(client, jobs || [], {
        personelId: personel.id,
        companyId: currentCompanyId,
        isSystemAdmin,
        jobsSelectWithVisibleAt,
        jobsSelectLegacy,
      })
    } catch (e) {
      console.warn('[loadTasksListData] mergeChainSiraliTasksIntoJobs', e)
    }
  }

  if (!jobsErr && Array.isArray(jobs) && jobs.length) {
    jobs = await applySiraliApprovedOverride(client, jobs)
  }

  if (compErr || staffErr || jobsErr || unitsErr) {
    return {
      error: compErr || staffErr || jobsErr || unitsErr,
      companies: comps || [],
      units: unitsData || [],
      staff: staffData || [],
      tasks: [],
    }
  }

  const visibleTasks = (jobs || []).filter(
    (t) => isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personel?.id),
  )
  const { items: groupedTasks } = groupTasksByGrupId(visibleTasks)

  return {
    error: null,
    companies: comps || [],
    units: unitsData || [],
    staff: staffData || [],
    tasks: groupedTasks,
    needsWorkActionEnrich: !!personel?.id,
  }
}

export async function fetchPendingDeletionMap(client, taskIds) {
  if (!taskIds?.length) return {}
  const { data, error } = await client
    .from('isler_silme_talepleri')
    .select('is_id')
    .eq('durum', 'bekliyor')
    .in('is_id', taskIds)
  if (error) return {}
  const next = {}
  for (const row of data || []) {
    if (row?.is_id) next[String(row.is_id)] = true
  }
  return next
}

export async function enrichScopeForTasks(client, { isSystemAdmin, currentCompanyId, accessibleUnitIds }) {
  return enrichScopeWithJunctionPersonelIds(client, {
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIds,
  })
}
