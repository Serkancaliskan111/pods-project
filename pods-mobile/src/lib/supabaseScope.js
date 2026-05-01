/**
 * Şirket / birim kapsamı — istemci sorgularını tek yerde daraltır (web pods-web/src/lib/supabaseScope ile aynı mantık).
 */

export function scopeAnaSirketlerQuery(q, { isSystemAdmin, currentCompanyId }) {
  if (!isSystemAdmin && currentCompanyId) {
    return q.eq('id', currentCompanyId)
  }
  return q
}

function toScopeKey(value) {
  if (value == null) return ''
  return String(value)
}

export function isUnitInScope(accessibleUnitIds, unitId) {
  if (!unitId) return true
  if (!Array.isArray(accessibleUnitIds) || !accessibleUnitIds.length) return true
  const target = toScopeKey(unitId)
  return accessibleUnitIds.some((id) => toScopeKey(id) === target)
}

export function scopeBirimlerQuery(
  q,
  { isSystemAdmin, currentCompanyId, accessibleUnitIds },
) {
  if (!isSystemAdmin && currentCompanyId) {
    let next = q.eq('ana_sirket_id', currentCompanyId)
    if (accessibleUnitIds?.length) {
      next = next.in('id', accessibleUnitIds)
    }
    return next
  }
  return q
}

export function scopePersonelQuery(
  q,
  { isSystemAdmin, currentCompanyId, accessibleUnitIds },
) {
  if (!isSystemAdmin && currentCompanyId) {
    let next = q.eq('ana_sirket_id', currentCompanyId)
    if (accessibleUnitIds?.length) {
      next = next.in('birim_id', accessibleUnitIds)
    }
    return next
  }
  return q
}

export function scopeIslerQuery(
  q,
  { isSystemAdmin, currentCompanyId, accessibleUnitIds },
) {
  if (!isSystemAdmin && currentCompanyId) {
    let next = q.eq('ana_sirket_id', currentCompanyId)
    if (accessibleUnitIds?.length) {
      next = next.in('birim_id', accessibleUnitIds)
    }
    return next
  }
  return q
}

/** Görev listesi — çok büyük yanıtlarda cihazı koru. */
export const TASKS_LIST_LIMIT = 2000
