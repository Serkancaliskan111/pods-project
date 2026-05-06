/**
 * RLS ile birlikte istemci tarafı ek filtre — şirket/birim kapsamı tekrarını tek yerde toplar.
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

/**
 * isler / personeller vb.: birim_id sütununu oturum hiyerarşisine göre daraltır.
 * Sistem yöneticisi veya şirket düzeyi (birimsiz) yönetici için ek birim filtresi yok.
 */
export function restrictQueryByPersonelBirimHierarchy(q, ctx = {}) {
  const { isSystemAdmin, isTopCompanyScope, accessibleUnitIds, fallbackBirimId } = ctx
  if (isSystemAdmin || isTopCompanyScope) return q
  const ids = normalizeAccessibleUnitIds(accessibleUnitIds)
  if (ids.length) return q.in('birim_id', ids)
  const fb = fallbackBirimId != null ? String(fallbackBirimId).trim() : ''
  if (fb) return q.eq('birim_id', fb)
  return q
}

/**
 * birimler listesi: id sütununu accessible birimlere göre daraltır.
 */
export function restrictBirimlerQueryByHierarchy(q, ctx = {}) {
  const { isSystemAdmin, isTopCompanyScope, accessibleUnitIds, fallbackBirimId } = ctx
  if (isSystemAdmin || isTopCompanyScope) return q
  const ids = normalizeAccessibleUnitIds(accessibleUnitIds)
  if (ids.length) return q.in('id', ids)
  const fb = fallbackBirimId != null ? String(fallbackBirimId).trim() : ''
  if (fb) return q.eq('id', fb)
  return q
}

/**
 * duyurular.hedef_birim_ids (dizi) — kapsamdaki herhangi bir birime yönelik kayıtlar.
 */
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

/**
 * Çoklu birim: kapsamdaki birimlere junction ile bağlı personellerin id listesi.
 */
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

  if (error && !missingTable && typeof console !== 'undefined') {
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

/** Kokpit / özet: son güncellenen kayıtlar yeterli; tüm tabloyu çekme. */
export const DASHBOARD_ISLER_LIMIT = 2500

/** Görev listesi sayfası — çok büyük listelerde tarayıcıyı koru. */
export const TASKS_LIST_LIMIT = 2000

/** Operatör ana sayfası. */
export const OPERATOR_TASKS_LIMIT = 800

/** Görev atama — tüm personel açılır listesi. */
export const ASSIGN_TASK_PERSON_LIMIT = 1200
