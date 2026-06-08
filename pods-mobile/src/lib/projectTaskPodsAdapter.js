import { getGorevModuOption } from './gorevModuOptions.js'
import { getActiveProjectTasks } from './projectTasksListUtils.js'
import { isProjectTaskOverdue } from './projectGanttUtils.js'
import { PROJECT_TASK_STATUS } from './projectStatus.js'
import { isProjectTaskAssignedToPersonel } from './projectTaskPlan.js'
import { isTaskAssignedToPersonel } from './taskWorkEligibility.js'
import { normalizePlanMeta } from './projectTaskPlan.js'

/** Planlama görevini PODS liste/takvim bileşenlerinin beklediği alanlara map eder */
export function mapProjectTaskForPodsUI(task) {
  if (!task) return task
  const end = task.bitis_tarihi
  const start = task.baslangic_tarihi
  const endIso = end ? `${String(end).slice(0, 10)}T17:00:00` : null
  const startIso = start ? `${String(start).slice(0, 10)}T09:00:00` : null
  const meta = normalizePlanMeta(task.plan_meta)
  const acil = !!meta?.operasyonel?.acil || !!meta?.siraliAdimlar?.some((a) => a.acil)

  return {
    ...task,
    son_tarih: endIso,
    baslama_tarihi: startIso,
    gorev_turu: task.gorev_tipi || 'normal',
    updated_at: task.guncelleme_at || task.olusturulma_at,
    created_at: task.olusturulma_at,
    acil,
    _projectPlanning: true,
  }
}

export function mapProjectTasksForPodsUI(tasks) {
  return getActiveProjectTasks(tasks).map(mapProjectTaskForPodsUI)
}

export function filterProjectByListMode(task, listMode) {
  const done = task?.durum === PROJECT_TASK_STATUS.DONE
  if (listMode === 'all') return true
  if (listMode === 'completed') return done
  if (listMode === 'pending') return !done
  return true
}

export function matchesProjectQuickFilter(task, quickFilter, personelId) {
  if (!quickFilter || quickFilter === 'all') return true
  const pid = String(personelId || '')
  if (quickFilter === 'assigned_to_me') {
    return isProjectTaskAssignedToPersonel(task, pid) || isTaskAssignedToPersonel(task, pid)
  }
  if (quickFilter === 'urgent') {
    return !!task?.acil
  }
  if (quickFilter === 'overdue') {
    return isProjectTaskOverdue(task)
  }
  if (quickFilter === 'blocked') {
    return task?.durum === PROJECT_TASK_STATUS.BLOCKED
  }
  if (quickFilter === 'unassigned') {
    return !task?.sorumlu_personel_id && task?.durum !== PROJECT_TASK_STATUS.DONE
  }
  if (quickFilter === 'operational_pending') {
    return !task?.bagli_is_id && task?.durum !== PROJECT_TASK_STATUS.DONE
  }
  return true
}

export function getProjectTaskTypeLabel(gorevTipi) {
  return getGorevModuOption(gorevTipi || 'normal').label
}

export function getProjectAssigneeName(task, personMap = {}) {
  const p = personMap?.[String(task?.sorumlu_personel_id)]
  if (!p) return 'Atanmamış'
  const name = [p.ad, p.soyad].filter(Boolean).join(' ').trim()
  return name || p.email || 'Personel'
}
