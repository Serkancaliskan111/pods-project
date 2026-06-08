import { GOREV_TURU } from './zincirTasks'

/**
 * Web TaskDetailViewRouter ile aynı mantık; şablon görevler bazen gorev_turu=normal kayıtlı.
 */
export function resolveTaskDetailType(task) {
  const raw = String(task?.gorev_turu || GOREV_TURU.NORMAL).trim()
  const hasChecklist =
    !!task?.is_sablon_id ||
    (Array.isArray(task?.checklist_cevaplari) && task.checklist_cevaplari.length > 0)

  if (raw === GOREV_TURU.NORMAL || raw === 'normal') {
    return hasChecklist ? 'sablon_gorev' : 'normal'
  }
  return raw
}
