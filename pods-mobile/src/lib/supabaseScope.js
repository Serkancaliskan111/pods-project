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
  if (!Array.isArray(accessibleUnitIds) || !accessibleUnitIds.length) return true
  const target = toScopeKey(unitId)
  if (!target) return false
  return accessibleUnitIds.some((id) => toScopeKey(id) === target)
}

function normalizeAccessibleUnitIds(accessibleUnitIds) {
  if (!Array.isArray(accessibleUnitIds)) return []
  return [
    ...new Set(accessibleUnitIds.filter((x) => x != null && String(x).trim() !== '').map((x) => String(x))),
  ]
}

/** @see pods-web/src/lib/supabaseScope.js — aynı mantık */
export function restrictQueryByPersonelBirimHierarchy(q, ctx = {}) {
  const { isSystemAdmin, isTopCompanyScope, accessibleUnitIds, fallbackBirimId } = ctx
  if (isSystemAdmin || isTopCompanyScope) return q
  const ids = normalizeAccessibleUnitIds(accessibleUnitIds)
  if (ids.length) return q.in('birim_id', ids)
  const fb = fallbackBirimId != null ? String(fallbackBirimId).trim() : ''
  if (fb) return q.eq('birim_id', fb)
  return q
}

export function restrictBirimlerQueryByHierarchy(q, ctx = {}) {
  const { isSystemAdmin, isTopCompanyScope, accessibleUnitIds, fallbackBirimId } = ctx
  if (isSystemAdmin || isTopCompanyScope) return q
  const ids = normalizeAccessibleUnitIds(accessibleUnitIds)
  if (ids.length) return q.in('id', ids)
  const fb = fallbackBirimId != null ? String(fallbackBirimId).trim() : ''
  if (fb) return q.eq('id', fb)
  return q
}

export function restrictAnnouncementQueryByTargetUnits(q, ctx = {}) {
  const { isSystemAdmin, isTopCompanyScope, accessibleUnitIds, fallbackBirimId } = ctx
  if (isSystemAdmin || isTopCompanyScope) return q
  const ids = normalizeAccessibleUnitIds(accessibleUnitIds)
  if (!ids.length) {
    const fb = fallbackBirimId != null ? String(fallbackBirimId).trim() : ''
    return fb ? q.contains('hedef_birim_ids', [fb]) : q
  }
  if (ids.length === 1) return q.contains('hedef_birim_ids', ids)
  const orClause = ids.map((id) => `hedef_birim_ids.cs.{${id}}`).join(',')
  return q.or(orClause)
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

export async function enrichScopeWithJunctionPersonelIds(supabase, scope) {
  const base = scope && typeof scope === 'object' ? { ...scope } : {}
  const { isSystemAdmin, currentCompanyId, accessibleUnitIds } = base
  if (isSystemAdmin || !currentCompanyId || !accessibleUnitIds?.length) {
    base.junctionPersonelIds = []
    return base
  }
  const { data, error } = await supabase
    .from('personel_birimleri')
    .select('personel_id')
    .eq('ana_sirket_id', currentCompanyId)
    .in('birim_id', accessibleUnitIds)

  const missingTable =
    error &&
    (error.code === '42P01' ||
      error.code === 'PGRST205' ||
      String(error.message || '')
        .toLowerCase()
        .includes('personel_birimleri'))

  if (error && !missingTable && __DEV__) {
    console.warn('[enrichScopeWithJunctionPersonelIds]', error.message || error)
  }

  if (missingTable || error) {
    base.junctionPersonelIds = []
    return base
  }

  base.junctionPersonelIds = [
    ...new Set((data || []).map((r) => r.personel_id).filter(Boolean).map(String)),
  ]
  return base
}

export function scopePersonelQuery(
  q,
  { isSystemAdmin, currentCompanyId, accessibleUnitIds, junctionPersonelIds },
) {
  if (!isSystemAdmin && currentCompanyId) {
    let next = q.eq('ana_sirket_id', currentCompanyId)
    if (accessibleUnitIds?.length) {
      const csv = accessibleUnitIds.join(',')
      const junc = Array.isArray(junctionPersonelIds)
        ? junctionPersonelIds.filter(Boolean).map(String)
        : []
      if (junc.length) {
        const jcsv = junc.join(',')
        return next.or(`birim_id.in.(${csv}),id.in.(${jcsv})`)
      }
      return next.in('birim_id', accessibleUnitIds)
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
