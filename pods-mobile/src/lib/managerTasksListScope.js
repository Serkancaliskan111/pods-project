import { isTaskVisibleNow, isTaskVisibleToPerson } from './taskVisibility'
import { isUnitInScope } from './supabaseScope'

/**
 * ManagerTasks (İşler) listesi ile birebir aynı kapsam mantığı — ana sayfa Canlı Saha vb. senkron için.
 */
export function taskMatchesManagerTasksListScope(task, ctx) {
  const {
    personel,
    isSystemAdmin,
    currentCompanyId,
    topScope,
    accessibleUnitIds,
  } = ctx || {}
  if (!task) return false
  if (!isTaskVisibleNow(task)) return false
  if (!isTaskVisibleToPerson(task, personel?.id)) return false
  if (!isSystemAdmin) {
    if (String(task?.ana_sirket_id || '') !== String(currentCompanyId || '')) return false
  }
  const isPrivateAssignedByMe =
    task?.ozel_gorev === true &&
    String(task?.atayan_personel_id || '') === String(personel?.id || '')
  if (isPrivateAssignedByMe) return true
  const unitIds = Array.isArray(accessibleUnitIds) ? accessibleUnitIds : []
  if (!topScope && unitIds.length > 0) {
    return isUnitInScope(unitIds, task?.birim_id)
  }
  return true
}
