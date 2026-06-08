import { isTaskAssignedToPersonel } from './taskWorkEligibility.js'
import { computeProgressPercent, formatWorkProgressLabel } from './projectTaskProgress.js'
import { isProjectTaskOverdue } from './projectGanttUtils.js'
import { PROJECT_TASK_STATUS } from './projectStatus.js'

export const PROJECT_TASK_LIST_VIEW = {
  TREE: 'tree',
  FLAT: 'flat',
}

export const PROJECT_TASK_SORT = {
  ORDER: 'order',
  START: 'start',
  END: 'end',
  TITLE: 'title',
}

export function getActiveProjectTasks(tasks) {
  return (tasks || []).filter((t) => !t.silindi_at)
}

export function getProjectTaskRoots(tasks) {
  const active = getActiveProjectTasks(tasks)
  const ids = new Set(active.map((t) => String(t.id)))
  return active
    .filter((t) => !t.parent_id || !ids.has(String(t.parent_id)))
    .sort(
      (a, b) =>
        (a.sira || 0) - (b.sira || 0) ||
        String(a.baslik || '').localeCompare(String(b.baslik || ''), 'tr'),
    )
}

export function getProjectTaskChildren(tasks, parentId) {
  return getActiveProjectTasks(tasks)
    .filter((c) => String(c.parent_id) === String(parentId))
    .sort((a, b) => (a.sira || 0) - (b.sira || 0))
}

export function getProjectTaskParentChain(tasks, taskId) {
  const byId = new Map(getActiveProjectTasks(tasks).map((t) => [String(t.id), t]))
  const titles = []
  let cur = byId.get(String(taskId))
  while (cur?.parent_id) {
    const parent = byId.get(String(cur.parent_id))
    if (!parent) break
    titles.unshift(parent.baslik || 'Üst görev')
    cur = parent
  }
  return titles
}

export function getProjectTaskProgressPct(task) {
  if (!task) return 0
  if (task.durum === PROJECT_TASK_STATUS.DONE) return 100
  if (task.ilerleme != null && task.yapilan_is == null && task.toplam_is == null) {
    return Math.min(100, Math.max(0, Number(task.ilerleme) || 0))
  }
  return computeProgressPercent(task.yapilan_is, task.toplam_is, task.durum)
}

export function getProjectTaskProgressLabel(task) {
  if (!task) return null
  const hasWork =
    task.yapilan_is != null || task.toplam_is != null || task.ilerleme != null
  if (!hasWork && task.durum !== PROJECT_TASK_STATUS.DONE) return null
  return formatWorkProgressLabel(
    task.yapilan_is,
    task.toplam_is,
    task.ilerleme,
    task.durum,
  )
}

export function filterProjectTaskList(
  tasks,
  { search = '', status = 'all', assignee = 'all', personelId, assigneePersonelId } = {},
) {
  let list = getActiveProjectTasks(tasks)
  const q = String(search || '')
    .trim()
    .toLowerCase()
  if (q) {
    list = list.filter(
      (t) =>
        String(t.baslik || '')
          .toLowerCase()
          .includes(q) ||
        String(t.aciklama || '')
          .toLowerCase()
          .includes(q),
    )
  }
  if (status && status !== 'all') {
    list = list.filter((t) => t.durum === status)
  }
  if (assignee === 'mine' && personelId) {
    list = list.filter((t) => isTaskAssignedToPersonel(t, personelId))
  } else if (assignee === 'unassigned') {
    list = list.filter((t) => !t.sorumlu_personel_id)
  } else if (assignee === 'person' && assigneePersonelId) {
    list = list.filter((t) => isTaskAssignedToPersonel(t, assigneePersonelId))
  }
  return list
}

/** Filtreye uyan görevler + üst zinciri (ağaç görünümü bağlamı) */
export function filterTasksPreservingTreeAncestors(tasks, filterOpts) {
  const matchedIds = new Set(
    filterProjectTaskList(tasks, filterOpts).map((t) => String(t.id)),
  )
  if (!matchedIds.size) return []

  const active = getActiveProjectTasks(tasks)
  const byId = new Map(active.map((t) => [String(t.id), t]))
  const include = new Set()

  for (const id of matchedIds) {
    include.add(id)
    let cur = byId.get(id)
    while (cur?.parent_id) {
      const pid = String(cur.parent_id)
      const parent = byId.get(pid)
      if (!parent) break
      include.add(pid)
      cur = parent
    }
  }

  return active.filter((t) => include.has(String(t.id)))
}

export function sortFlatProjectTasks(list, sortBy = PROJECT_TASK_SORT.ORDER) {
  const copy = [...list]
  if (sortBy === PROJECT_TASK_SORT.START) {
    return copy.sort(
      (a, b) =>
        String(a.baslangic_tarihi || '').localeCompare(String(b.baslangic_tarihi || '')) ||
        (a.sira || 0) - (b.sira || 0),
    )
  }
  if (sortBy === PROJECT_TASK_SORT.END) {
    return copy.sort(
      (a, b) =>
        String(a.bitis_tarihi || '').localeCompare(String(b.bitis_tarihi || '')) ||
        (a.sira || 0) - (b.sira || 0),
    )
  }
  if (sortBy === PROJECT_TASK_SORT.TITLE) {
    return copy.sort((a, b) =>
      String(a.baslik || '').localeCompare(String(b.baslik || ''), 'tr'),
    )
  }
  return copy.sort(
    (a, b) =>
      (a.sira || 0) - (b.sira || 0) ||
      String(a.baslik || '').localeCompare(String(b.baslik || ''), 'tr'),
  )
}

export function computeProjectTaskListStats(tasks, personelId) {
  const active = getActiveProjectTasks(tasks)
  const done = active.filter((t) => t.durum === PROJECT_TASK_STATUS.DONE).length
  const overdue = active.filter((t) => isProjectTaskOverdue(t)).length
  const unassigned = active.filter((t) => !t.sorumlu_personel_id).length
  const operational = active.filter((t) => t.bagli_is_id).length
  const mine = personelId
    ? active.filter((t) => isTaskAssignedToPersonel(t, personelId)).length
    : 0
  return {
    total: active.length,
    done,
    overdue,
    unassigned,
    operational,
    mine,
    inProgress: active.filter((t) => t.durum === PROJECT_TASK_STATUS.IN_PROGRESS).length,
  }
}

export function collectExpandableTaskIds(tasks) {
  const active = getActiveProjectTasks(tasks)
  const parentIds = new Set(active.map((t) => String(t.parent_id)).filter(Boolean))
  return new Set(
    active.filter((t) => parentIds.has(String(t.id))).map((t) => String(t.id)),
  )
}
