import { isPermTruthy, normalizeRolePermissions, canSeeTaskTemplates } from './permissions.js'

export const TEMPLATE_KAPSAM = {
  GLOBAL: 'global',
  SIRKET: 'sirket',
  BIRIM: 'birim',
}

export const KAPSAM_LABELS = {
  global: 'Global',
  sirket: 'Şirket',
  birim: 'Birim',
}

export function allowedTemplateScopesForCreator({
  isSystemAdmin,
  permissions,
  accessibleUnitIds = [],
  personel = null,
} = {}) {
  if (isSystemAdmin) {
    return [TEMPLATE_KAPSAM.GLOBAL, TEMPLATE_KAPSAM.SIRKET, TEMPLATE_KAPSAM.BIRIM]
  }
  const flat = normalizeRolePermissions(permissions)
  const scopes = []
  if (canSeeTaskTemplates(flat, false)) {
    scopes.push(TEMPLATE_KAPSAM.SIRKET)
    const unitIds = [...(accessibleUnitIds || []), personel?.birim_id].filter(Boolean)
    if (unitIds.length > 0) scopes.push(TEMPLATE_KAPSAM.BIRIM)
  }
  if (!scopes.length && personel?.ana_sirket_id) {
    scopes.push(TEMPLATE_KAPSAM.SIRKET)
  }
  return [...new Set(scopes)]
}

export function pickAllowedKapsam(requested, allowed) {
  const list = allowed?.length ? allowed : [TEMPLATE_KAPSAM.SIRKET]
  if (list.includes(requested)) return requested
  return list[0]
}

export function filterTemplatesVisibleToUser(templates, ctx) {
  const list = Array.isArray(templates) ? templates : []
  const { isSystemAdmin, companyId, accessibleUnitIds = [] } = ctx
  const unitSet = new Set((accessibleUnitIds || []).map(String))
  const cid = companyId ? String(companyId) : ''

  return list.filter((row) => {
    const kapsam = row.kapsam || (row.ana_sirket_id ? TEMPLATE_KAPSAM.SIRKET : TEMPLATE_KAPSAM.GLOBAL)
    if (kapsam === TEMPLATE_KAPSAM.GLOBAL) return true
    if (kapsam === TEMPLATE_KAPSAM.SIRKET) {
      if (isSystemAdmin) return true
      return cid && String(row.ana_sirket_id || '') === cid
    }
    if (kapsam === TEMPLATE_KAPSAM.BIRIM) {
      if (!row.birim_id) return false
      if (isSystemAdmin) return true
      if (cid && String(row.ana_sirket_id || '') !== cid) return false
      return unitSet.has(String(row.birim_id))
    }
    return false
  })
}

export function buildTemplateScopePayload({ kapsam, anaSirketId, birimId, userId }) {
  const scope = kapsam || TEMPLATE_KAPSAM.SIRKET
  if (scope === TEMPLATE_KAPSAM.GLOBAL) {
    return { kapsam: scope, ana_sirket_id: null, birim_id: null, olusturan_kullanici_id: userId || null }
  }
  if (scope === TEMPLATE_KAPSAM.BIRIM) {
    return {
      kapsam: scope,
      ana_sirket_id: anaSirketId || null,
      birim_id: birimId || null,
      olusturan_kullanici_id: userId || null,
    }
  }
  return {
    kapsam: TEMPLATE_KAPSAM.SIRKET,
    ana_sirket_id: anaSirketId || null,
    birim_id: null,
    olusturan_kullanici_id: userId || null,
  }
}
