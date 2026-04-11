/**
 * roller.yetkiler: eski boolean + rol ekranındaki noktalı eylemler
 */
import {
  ALL_ROLE_ACTION_KEYS,
  ROLE_ACTIONS_BY_CATEGORY,
} from './roleActionKeys.js'

export function normalizeRolePermissions(raw) {
  if (raw == null) return {}
  let obj = raw
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      return {}
    }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return {}

  const flat = { ...obj }
  const isFlatPermissionLeafMap = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const keys = Object.keys(v)
    if (!keys.length) return false
    return Object.values(v).every(
      (x) =>
        x === null ||
        typeof x === 'boolean' ||
        typeof x === 'string' ||
        typeof x === 'number',
    )
  }
  // İç içe: { OPERASYON: { ... } } veya { Yönetim: { "personel.yonet": true } }
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const legacyAsciiCategory = /^[A-Z][A-Z0-9_]*$/.test(k)
    const nestedKeys = Object.keys(v)
    const hasDotted = nestedKeys.some((nk) => nk.includes('.'))
    const mergeNested =
      legacyAsciiCategory ||
      (isFlatPermissionLeafMap(v) &&
        (hasDotted ||
          nestedKeys.includes('personel_yonet') ||
          nestedKeys.includes('personel.yonet')))
    if (mergeNested) {
      Object.assign(flat, v)
    }
  }
  return flat
}

/** Kayıt: en az bir eylem seçiliyse panel_erisim de yazılsın (Auth uyumu) */
export function buildYetkilerForSave(flatPermissions) {
  if (!flatPermissions || typeof flatPermissions !== 'object') {
    return { panel_erisim: false }
  }
  const anyAction = ALL_ROLE_ACTION_KEYS.some((k) =>
    isPermTruthy(flatPermissions, k),
  )
  return {
    ...flatPermissions,
    ...(anyAction ? { panel_erisim: true } : {}),
  }
}

export function isPermTruthy(perms, key) {
  if (!perms || typeof perms !== 'object' || !key) return false
  const v = perms[key]
  return (
    v === true || v === 'true' || v === 1 || v === '1'
  )
}

/** Web yönetim paneline giriş (AuthContext / AdminProtected) */
export function hasWebPanelAccess(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  if (!flat || typeof flat !== 'object') return false
  if (flat.panel_erisim === false) return false
  if (flat.panel_erisim === true) return true

  return ALL_ROLE_ACTION_KEYS.some((k) => isPermTruthy(flat, k))
}

export function canManageStaff(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'personel_yonet') ||
    isPermTruthy(flat, 'personel.yonet')
  )
}

export function canApproveTask(perms) {
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'gorev_onayla') ||
    isPermTruthy(flat, 'denetim.onayla')
  )
}

/** Şirketler listesi / CRUD yalnızca sistem yöneticisi (is_system_admin) */
export function canSeeCompanies(_perms, isSystemAdmin) {
  return !!isSystemAdmin
}

export function canSeeUnits(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'sube.yonet') ||
    isPermTruthy(flat, 'sirket.yonet') ||
    isPermTruthy(flat, 'personel.yonet') ||
    isPermTruthy(flat, 'personel_yonet')
  )
}

export function canSeeRoles(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'rol.yonet')
}

export function canSeeTaskTemplates(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'is_turu.yonet')
}

export function canSeeTasks(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'is.liste_gor') ||
    isPermTruthy(flat, 'is.olustur') ||
    isPermTruthy(flat, 'is.detay_gor') ||
    isPermTruthy(flat, 'is.fotograf_yukle') ||
    isPermTruthy(flat, 'denetim.olustur') ||
    isPermTruthy(flat, 'denetim.onayla') ||
    isPermTruthy(flat, 'denetim.reddet')
  )
}

/**
 * Tam yönetim kokpiti (KPI, şirket özeti vb.): Yönetim + Sistem rol eylemlerinden
 * en az biri veya sistem yöneticisi. Operasyon/denetim (sadece iş görüntüleme, iş
 * oluşturma, denetim onayı vb.) yetkisi olanlar görev odaklı ana sayfayı görür.
 */
export const MANAGEMENT_DASHBOARD_ACTION_KEYS = Object.freeze([
  ...ROLE_ACTIONS_BY_CATEGORY.YONETIM,
  ...ROLE_ACTIONS_BY_CATEGORY.SISTEM,
  'personel_yonet',
])

export function hasManagementDashboardAccess(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return MANAGEMENT_DASHBOARD_ACTION_KEYS.some((k) => isPermTruthy(flat, k))
}

export function canAssignTask(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'is.olustur')
}

export function canAccessAdminPath(pathname, perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  if (!pathname.startsWith('/admin')) return true

  const p = pathname.replace(/\/$/, '') || '/admin'

  if (p === '/admin') return hasWebPanelAccess(flat, false)

  if (p.startsWith('/admin/companies')) return canSeeCompanies(flat, false)
  if (p.startsWith('/admin/units')) return canSeeUnits(flat, false)
  if (p.startsWith('/admin/staff')) return canManageStaff(flat, false)
  if (p.startsWith('/admin/roles')) return canSeeRoles(flat, false)
  if (p.startsWith('/admin/task-templates') || p.startsWith('/admin/templates'))
    return canSeeTaskTemplates(flat, false)
  if (p.startsWith('/admin/assign-task')) return canAssignTask(flat, false)
  if (p.startsWith('/admin/tasks')) {
    if (p.endsWith('/new')) return canAssignTask(flat, false)
    return canSeeTasks(flat, false)
  }

  return hasWebPanelAccess(flat, false)
}
