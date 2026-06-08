import { isTaskAssignedToPersonel } from './taskWorkEligibility.js'
import {
  fetchRolePermissionsMap,
  filterAssignablePersonnel,
} from './taskAssignHierarchy.js'

export { fetchRolePermissionsMap }

export function personRowDisplayName(row) {
  if (!row) return 'Personel'
  const name = [row.ad, row.soyad].filter(Boolean).join(' ').trim()
  return name || row.email || 'Personel'
}

export function sortPersonRowsAlphabeticalTr(rows) {
  return [...(rows || [])].sort((a, b) =>
    personRowDisplayName(a).localeCompare(personRowDisplayName(b), 'tr'),
  )
}

/**
 * Takvim «Ekip görevleri»: atayanın birim kapsamında, hiyerarşide altı ve eş düzey personel.
 */
export function buildCalendarTeamMemberOptions(staff, ctx) {
  const assignerId = String(ctx?.assigner?.id || '')
  const filtered = filterAssignablePersonnel(staff || [], ctx)
  return sortPersonRowsAlphabeticalTr(
    filtered.filter((row) => row?.id && String(row.id) !== assignerId),
  )
}

export function taskMatchesTeamPersonelSelection(task, selectedPersonelIds) {
  const ids = (selectedPersonelIds || []).map(String).filter(Boolean)
  if (!ids.length) return false
  return ids.some((id) => isTaskAssignedToPersonel(task, id))
}
