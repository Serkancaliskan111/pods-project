import getSupabase from './supabaseClient.js'
import { isProjectTaskAssignedToPersonel } from './projectTaskPlan.js'
import { PROJECT_TASK_STATUS } from './projectStatus.js'
import { TASK_STATUS } from './taskStatus.js'
import { mapProjectTaskForPodsUI } from './projectTaskPodsAdapter.js'
import { isListedTaskVisibleForAssignee } from './taskVisibility.js'

const TASK_SELECT =
  'id,proje_id,parent_id,baslik,aciklama,baslangic_tarihi,bitis_tarihi,durum,ilerleme,sira,sorumlu_personel_id,gorev_tipi,plan_meta,bagli_is_id,olusturulma_at,guncelleme_at,silindi_at'

const PROJECT_JOIN =
  'projeler!inner(id,baslik,ana_sirket_id,birim_id,renk,durum,silindi_at)'

export const PROJECT_TASK_GLOBAL_ID_PREFIX = 'pg_'

export function isProjectPlanningTask(task) {
  return task?._projectPlanning === true
}

export function getProjectTaskRoute(task) {
  const projeId = task?._projeId || task?.proje_id
  if (!projeId) return null
  const rawId = task?._projectTaskId || String(task?.id || '').replace(/^pg_/, '')
  if (!rawId) return null
  return `/admin/projects/${projeId}?openTask=${encodeURIComponent(rawId)}`
}

export function mapProjectDurumToGlobalDurum(durum) {
  if (durum === PROJECT_TASK_STATUS.DONE) return TASK_STATUS.APPROVED
  if (durum === PROJECT_TASK_STATUS.BLOCKED) return TASK_STATUS.REJECTED
  if (durum === PROJECT_TASK_STATUS.IN_PROGRESS) return TASK_STATUS.PENDING_APPROVAL
  return TASK_STATUS.ASSIGNED
}

export { isProjectTaskAssignedToPersonel } from './projectTaskPlan.js'

export function mapProjectRowToGlobalListItem(row) {
  const project = row.projeler || {}
  const base = mapProjectTaskForPodsUI(row)
  return {
    ...base,
    id: `${PROJECT_TASK_GLOBAL_ID_PREFIX}${row.id}`,
    _projectTaskId: row.id,
    _projeId: row.proje_id,
    _projectTitle: project.baslik || 'Proje',
    _projectPlanning: true,
    proje_id: row.proje_id,
    ana_sirket_id: project.ana_sirket_id,
    birim_id: project.birim_id,
    durum: mapProjectDurumToGlobalDurum(row.durum),
    projectLabel: project.baslik ? `Proje: ${project.baslik}` : 'Proje görevi',
    bagli_is_id: row.bagli_is_id,
  }
}

function dedupeById(rows) {
  const m = new Map()
  for (const r of rows || []) {
    if (r?.id != null) m.set(String(r.id), r)
  }
  return [...m.values()]
}

/** Operasyonel işe bağlanmış planlama görevlerini listeden çıkar (çift kayıt önlenir). */
export function mergeJobsWithAssigneeProjectTasks(islerRows = [], projectRows = []) {
  const linkedIsIds = new Set(
    (projectRows || [])
      .map((r) => r.bagli_is_id)
      .filter(Boolean)
      .map(String),
  )
  const islerIds = new Set((islerRows || []).map((r) => String(r.id)))

  const planning = (projectRows || [])
    .filter((row) => {
      if (row.silindi_at) return false
      const link = row.bagli_is_id ? String(row.bagli_is_id) : ''
      if (link && islerIds.has(link)) return false
      if (link && linkedIsIds.has(link)) return false
      return true
    })
    .map(mapProjectRowToGlobalListItem)

  return dedupeById([...(islerRows || []), ...planning])
}

/**
 * Personelin proje planlama görevleri (şirket kapsamı).
 * Başlangıç tarihi filtresi merge sonrası `isListedTaskVisibleForAssignee` ile uygulanır.
 */
export async function fetchAssigneeProjectTasks(
  client = getSupabase(),
  { personelId, companyId, limit = 120 } = {},
) {
  const pid = String(personelId || '')
  const cid = String(companyId || '')
  if (!pid || !cid) return { data: [], error: null }

  const select = `${TASK_SELECT}, ${PROJECT_JOIN}`

  const [primaryRes, poolRes] = await Promise.all([
    client
      .from('proje_gorevleri')
      .select(select)
      .eq('sorumlu_personel_id', pid)
      .eq('projeler.ana_sirket_id', cid)
      .is('silindi_at', null)
      .is('projeler.silindi_at', null)
      .order('guncelleme_at', { ascending: false })
      .limit(limit),
    client
      .from('proje_gorevleri')
      .select(select)
      .eq('projeler.ana_sirket_id', cid)
      .is('silindi_at', null)
      .is('projeler.silindi_at', null)
      .not('plan_meta', 'is', null)
      .order('guncelleme_at', { ascending: false })
      .limit(Math.min(limit * 2, 200)),
  ])

  const error = primaryRes.error || poolRes.error
  if (error) return { data: [], error }

  const merged = dedupeById([...(primaryRes.data || []), ...(poolRes.data || [])])
  const now = new Date()
  const assigned = merged.filter((row) => {
    if (!isProjectTaskAssignedToPersonel(row, pid)) return false
    const mapped = mapProjectRowToGlobalListItem(row)
    return isListedTaskVisibleForAssignee(mapped, now)
  })

  return { data: assigned.slice(0, limit), error: null }
}
