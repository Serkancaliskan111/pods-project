/**
 * RLS ile birlikte istemci tarafı ek filtre — şirket/birim kapsamı tekrarını tek yerde toplar.
 */

export function scopeAnaSirketlerQuery(q, { isSystemAdmin, currentCompanyId }) {
  if (!isSystemAdmin && currentCompanyId) {
    return q.eq('id', currentCompanyId)
  }
  return q
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

/** Kokpit / özet: son güncellenen kayıtlar yeterli; tüm tabloyu çekme. */
export const DASHBOARD_ISLER_LIMIT = 2500

/** Görev listesi sayfası — çok büyük listelerde tarayıcıyı koru. */
export const TASKS_LIST_LIMIT = 2000

/** Operatör ana sayfası. */
export const OPERATOR_TASKS_LIMIT = 800

/** Görev atama — tüm personel açılır listesi. */
export const ASSIGN_TASK_PERSON_LIMIT = 1200
