import {
  OPERATOR_HOME_LIMIT,
  OPERATOR_TASKS_LIST_LIMIT,
} from './supabaseScope.js'
import { mergeChainSiraliTasksIntoJobs } from './mergeChainSiraliTasksIntoJobs.js'
import { refineSiraliResponsibleRows } from './refineSiraliResponsibleRows.js'
import { isListedTaskVisibleForAssignee, isTaskVisibleToPerson } from './taskVisibility.js'
import {
  fetchAssigneeProjectTasks,
  mergeJobsWithAssigneeProjectTasks,
} from './projectTaskGlobalList.js'
import { isSiraliGorevTuru } from './zincirTasks.js'
import { isApprovedTaskStatus } from './taskStatus.js'

/** Ana sayfa kartları — kanıt alanları hariç (daha hızlı ilk yükleme). */
export const CUBICLE_HOME_SELECT =
  'id,baslik,durum,calisma_durumu,calisma_durumu_guncelleme_at,son_tarih,baslama_tarihi,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorunur_tarih,acil,ozel_gorev,gorev_turu,zincir_aktif_adim,zincir_onay_aktif_adim,is_sablonlari(baslik)'

export const CUBICLE_HOME_SELECT_LEGACY =
  'id,baslik,durum,son_tarih,baslama_tarihi,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu,zincir_aktif_adim,zincir_onay_aktif_adim'

function dedupeById(rows) {
  const m = new Map()
  for (const r of rows || []) {
    if (r?.id != null) m.set(String(r.id), r)
  }
  return [...m.values()]
}

async function selectWithFallback(client, buildQuery, select, selectLegacy) {
  let res = await buildQuery(select)
  if (res.error?.code === '42703' && selectLegacy) {
    res = await buildQuery(selectLegacy)
  }
  return res
}

/**
 * Personel: kendi sorumlu işleri (+ özel görevler), birim kapsamı olmadan.
 */
export async function fetchOperatorAssigneeTasks(
  client,
  {
    personelId,
    companyId,
    limit = OPERATOR_HOME_LIMIT,
    select = CUBICLE_HOME_SELECT,
    selectLegacy = CUBICLE_HOME_SELECT_LEGACY,
  },
) {
  const pid = String(personelId || '')
  const cid = String(companyId || '')
  if (!pid || !cid) return { data: [], error: null }

  const buildMain = (select) =>
    client
      .from('isler')
      .select(select)
      .eq('ana_sirket_id', cid)
      .eq('sorumlu_personel_id', pid)
      .order('created_at', { ascending: false })
      .limit(limit)

  const buildPrivate = (select) =>
    client
      .from('isler')
      .select(select)
      .eq('ana_sirket_id', cid)
      .eq('ozel_gorev', true)
      .or(`sorumlu_personel_id.eq.${pid},atayan_personel_id.eq.${pid}`)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 80))

  const [mainRes, privateRes] = await Promise.all([
    selectWithFallback(client, buildMain, select, selectLegacy),
    selectWithFallback(client, buildPrivate, select, selectLegacy),
  ])

  let rows = mainRes.data || []
  const error = mainRes.error || privateRes.error
  if (!privateRes.error && privateRes.data?.length) {
    rows = dedupeById([...rows, ...privateRes.data])
  }

  return { data: rows, error }
}

/** Personel ana sayfa — ilk boyama: yalnızca atanmış işler (zincir birleştirme yok). */
export async function fetchOperatorHomeTasksBase(client, { personelId, companyId }) {
  const res = await fetchOperatorAssigneeTasks(client, {
    personelId,
    companyId,
    limit: OPERATOR_HOME_LIMIT,
  })
  if (res.error) {
    return { tasks: [], fetchError: res.error }
  }
  const now = new Date()
  let rows = (res.data || []).filter((t) => {
    if (!isTaskVisibleToPerson(t, personelId)) return false
    if (isApprovedTaskStatus(t?.durum)) return false
    if (!isListedTaskVisibleForAssignee(t, now)) return false
    return true
  })

  const projectRes = await fetchAssigneeProjectTasks(client, {
    personelId,
    companyId,
    limit: OPERATOR_HOME_LIMIT,
  })
  if (!projectRes.error && projectRes.data?.length) {
    rows = mergeJobsWithAssigneeProjectTasks(rows, projectRes.data).filter((t) => {
      if (isProjectPlanningTaskFromRow(t)) {
        if (isApprovedTaskStatus(t?.durum)) return false
        return isListedTaskVisibleForAssignee(t, now)
      }
      if (!isTaskVisibleToPerson(t, personelId)) return false
      if (isApprovedTaskStatus(t?.durum)) return false
      return isListedTaskVisibleForAssignee(t, now)
    })
  }

  return { tasks: rows, fetchError: null, loadedAt: now }
}

function isProjectPlanningTaskFromRow(t) {
  return t?._projectPlanning === true
}

/** Zincir/sıralı birleştirme + sıralı sorumlu süzme (arka planda). */
export async function enrichOperatorHomeTasks(
  client,
  baseTasks,
  { personelId, companyId, isSystemAdmin, skipChainMerge = false, skipSiraliRefine = false },
) {
  const pid = String(personelId || '')
  if (!pid || !companyId) {
    return { tasks: baseTasks || [], fetchError: null, chainTaskIds: new Set() }
  }

  const baseIds = new Set((baseTasks || []).map((t) => String(t.id)))
  let merged = baseTasks || []

  if (!skipChainMerge && merged.length > 0) {
    try {
      merged = await mergeChainSiraliTasksIntoJobs(client, merged, {
        personelId: pid,
        companyId,
        isSystemAdmin,
        jobsSelectWithVisibleAt: CUBICLE_HOME_SELECT,
        jobsSelectLegacy: CUBICLE_HOME_SELECT_LEGACY,
      })
    } catch (e) {
      console.warn('[enrichOperatorHomeTasks] mergeChainSiraliTasksIntoJobs', e)
    }
  }

  const chainTaskIds = new Set(
    merged.filter((t) => !baseIds.has(String(t.id))).map((t) => String(t.id)),
  )

  let refined = merged
  const hasSiraliMine =
    !skipSiraliRefine &&
    merged.some(
      (t) =>
        isSiraliGorevTuru(t?.gorev_turu) &&
        String(t?.sorumlu_personel_id || '') === pid,
    )

  if (hasSiraliMine) {
    try {
      refined = await refineSiraliResponsibleRows(merged, pid, client)
    } catch (e) {
      console.warn('[enrichOperatorHomeTasks] refineSiraliResponsibleRows', e)
    }
  }

  const tasks = refined.filter((t) => {
    if (!isTaskVisibleToPerson(t, pid)) return false
    if (String(t.sorumlu_personel_id || '') === pid) return true
    if (chainTaskIds.has(String(t.id))) return true
    return false
  })

  return { tasks, fetchError: null, chainTaskIds }
}

export async function loadCubicleHomeTasks(
  client,
  {
    scope,
    scopeIslerQuery,
    operatorMode,
    personelId,
    currentCompanyId,
    isSystemAdmin,
    skipChainMerge = false,
    skipSiraliRefine = false,
  },
) {
  let jobs = []
  let fetchError = null

  if (operatorMode && personelId && currentCompanyId) {
    const base = await fetchOperatorHomeTasksBase(client, {
      personelId,
      companyId: currentCompanyId,
    })
    if (base.fetchError) {
      return { tasks: [], fetchError: base.fetchError, chainTaskIds: new Set() }
    }
    const enriched = await enrichOperatorHomeTasks(client, base.tasks, {
      personelId,
      companyId: currentCompanyId,
      isSystemAdmin,
      skipChainMerge,
      skipSiraliRefine,
    })
    return {
      tasks: enriched.tasks,
      fetchError: null,
      chainTaskIds: enriched.chainTaskIds,
    }
  } else {
    let q = scopeIslerQuery(client.from('isler').select(CUBICLE_HOME_SELECT), scope)
    q = q.order('son_tarih', { ascending: true, nullsFirst: false }).limit(250)
    let res = await q
    if (res.error?.code === '42703') {
      q = scopeIslerQuery(
        client.from('isler').select(CUBICLE_HOME_SELECT_LEGACY),
        scope,
      )
      q = q.order('son_tarih', { ascending: true, nullsFirst: false }).limit(250)
      res = await q
    }
    jobs = res.data || []
    fetchError = res.error
  }

  if (fetchError) {
    return { tasks: [], fetchError, chainTaskIds: new Set() }
  }

  const visible = (jobs || []).filter((t) => isTaskVisibleToPerson(t, personelId))
  return { tasks: visible, fetchError: null, chainTaskIds: new Set() }
}

export { OPERATOR_TASKS_LIST_LIMIT }
