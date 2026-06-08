import getSupabase from './supabaseClient.js'
import { fetchProjectUnitLabel } from './projectApi.js'
import { getActiveProjectTasks } from './projectTasksListUtils.js'
import {
  mapProjectDurumToGlobalDurum,
  mapProjectRowToGlobalListItem,
} from './projectTaskGlobalList.js'
import { buildProjectUrgentAlerts } from './projectManagerDashboard.js'
import { PROJECT_TASK_STATUS } from './projectStatus.js'
import { TASK_STATUS } from './taskStatus.js'

const KOKPIT_ISLER_SELECT =
  'id,baslik,durum,aciklama,personel_tamamlama_notu,updated_at,created_at,son_tarih,baslama_tarihi,gorunur_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,ozel_gorev,grup_id,acil,puan,kanit_resim_ler,kanit_videolar,checklist_cevaplari,gorev_turu,tamamlama_gecmisi,denetim_gecmisi'

function mapPlanningTaskToKokpitJob(task, project) {
  const base = mapProjectRowToGlobalListItem({ ...task, projeler: project })
  return {
    ...base,
    id: task.id,
    _proje_gorev_id: task.id,
    _projectPlanning: true,
    durum: mapProjectDurumToGlobalDurum(task.durum),
    puan: Number(task.puan) > 0 ? Number(task.puan) : 0,
    kanit_resim_ler: [],
    kanit_videolar: [],
    checklist_cevaplari: null,
    tamamlama_gecmisi: null,
    denetim_gecmisi: null,
    grup_id: null,
    ozel_gorev: false,
  }
}

export async function fetchProjectLinkedIsler(bagliIsIds = []) {
  const ids = [...new Set((bagliIsIds || []).map(String).filter(Boolean))]
  if (!ids.length) return []
  const supabase = getSupabase()
  const { data, error } = await supabase.from('isler').select(KOKPIT_ISLER_SELECT).in('id', ids)
  if (error) {
    console.warn('[fetchProjectLinkedIsler]', error)
    return []
  }
  return data || []
}

/** isler.proje_id ile doğrudan bağlı operasyonel görevler (planlama satırı olmayanlar dahil). */
export async function fetchProjectOperationalIslerForKokpit(projeId) {
  if (!projeId) return []
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('isler')
    .select(KOKPIT_ISLER_SELECT)
    .eq('proje_id', projeId)
  if (error) {
    if (error.code === '42703') return []
    console.warn('[fetchProjectOperationalIslerForKokpit]', error)
    return []
  }
  return data || []
}

/** Proje kapsamındaki kokpit `jobs` listesi (planlama + bağlı operasyonel). */
export function buildProjectKokpitJobs(
  project,
  projectTasks,
  linkedIsler = [],
  operationalOnlyIsler = [],
) {
  const islerById = new Map((linkedIsler || []).map((r) => [String(r.id), r]))
  for (const row of operationalOnlyIsler || []) {
    if (row?.id) islerById.set(String(row.id), row)
  }
  const linkedUsed = new Set()
  const rows = []

  for (const task of getActiveProjectTasks(projectTasks)) {
    const linkId = task.bagli_is_id ? String(task.bagli_is_id) : ''
    if (linkId && islerById.has(linkId)) {
      const op = { ...islerById.get(linkId) }
      linkedUsed.add(linkId)
      rows.push({
        ...op,
        _proje_gorev_id: task.id,
        _projectPlanning: false,
        _proje_id: task.proje_id || project?.id,
      })
    } else if (!linkId) {
      rows.push(mapPlanningTaskToKokpitJob(task, project))
    }
  }

  for (const op of operationalOnlyIsler || []) {
    const id = String(op.id)
    if (linkedUsed.has(id)) continue
    rows.push({
      ...op,
      _proje_gorev_id: null,
      _projectPlanning: false,
      _proje_id: op.proje_id || project?.id,
    })
  }

  return rows
}

export function buildProjectKokpitStaff(teamMembers = [], project) {
  return (teamMembers || []).map((m) => ({
    id: m.personel_id,
    ad: m.ad,
    soyad: m.soyad,
    email: m.email,
    ana_sirket_id: project?.ana_sirket_id,
    birim_id: project?.birim_id,
    durum: true,
  }))
}

export async function buildProjectKokpitMeta(project, birimLabel = '') {
  const companies = project?.ana_sirket_id
    ? [{ id: project.ana_sirket_id, ana_sirket_adi: birimLabel || project.baslik || 'Proje' }]
    : []
  let units = []
  if (project?.birim_id) {
    const label =
      birimLabel || (await fetchProjectUnitLabel(project.birim_id).catch(() => '')) || 'Birim'
    units = [{ id: project.birim_id, birim_adi: label, ana_sirket_id: project.ana_sirket_id }]
  }
  return { companies, units }
}

/** Acil uyarı paneli — kokpit `navigate` yerine proje görev sekmesi filtreleri. */
export function mapProjectUrgentAlertsForKokpit(alerts = []) {
  const statusMap = {
    overdue: { alert: 'overdue' },
    blocked: { status: TASK_STATUS.REJECTED },
    unassigned: { alert: 'unassigned' },
    operational: { alert: 'operational_pending' },
  }
  return (alerts || []).map((a) => ({
    key: a.key,
    title: a.title,
    detail: a.detail,
    count: a.count,
    status: statusMap[a.action]?.status ?? null,
    alert: statusMap[a.action]?.alert ?? a.action,
    buttonLabel: 'Görevlere git',
    _projectAction: a.action,
  }))
}

export function buildProjectKokpitEmbedValue({
  project,
  projectId,
  tasks,
  teamMembers,
  linkedIsler = [],
  operationalOnlyIsler = [],
  birimLabel = '',
  loading = false,
  onTasksList,
  onTaskOpen,
}) {
  const jobs = buildProjectKokpitJobs(project, tasks, linkedIsler, operationalOnlyIsler)
  const staff = buildProjectKokpitStaff(teamMembers, project)
  const { companies, units } = { companies: [], units: [] }

  return {
    mode: 'project',
    projectId,
    jobs,
    metricJobs: jobs,
    companies,
    units,
    staff,
    loading,
    companyScoped: true,
    scopedCompanyName: project?.baslik || 'Proje',
    urgentAlerts: mapProjectUrgentAlertsForKokpit(buildProjectUrgentAlerts(tasks, null)),
    onTasksList,
    onTaskOpen,
  }
}

export function projectKokpitTasksListParams(item) {
  if (!item) return { mode: 'pending', quickFilter: 'all' }
  if (item.alert === 'overdue' || item._projectAction === 'overdue') {
    return { mode: 'pending', quickFilter: 'overdue' }
  }
  if (item._projectAction === 'blocked') {
    return { mode: 'pending', quickFilter: 'blocked' }
  }
  if (item._projectAction === 'unassigned') {
    return { mode: 'pending', quickFilter: 'unassigned' }
  }
  if (item._projectAction === 'operational') {
    return { mode: 'pending', quickFilter: 'operational_pending' }
  }
  if (item.status === TASK_STATUS.APPROVED) {
    return { mode: 'completed', quickFilter: 'all' }
  }
  return { mode: 'pending', quickFilter: 'all' }
}

export function projectKokpitMetricParams(key) {
  const map = {
    pending: { mode: 'pending', quickFilter: 'all' },
    overdue: { mode: 'pending', quickFilter: 'overdue' },
    completed: { mode: 'completed', quickFilter: 'all' },
    'all-tasks': { mode: 'pending', quickFilter: 'all' },
  }
  return map[key] || map.pending
}
