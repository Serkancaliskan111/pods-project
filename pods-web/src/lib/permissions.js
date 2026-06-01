/**
 * roller.yetkiler: eski boolean + rol ekranındaki noktalı eylemler
 */
import {
  ALL_ROLE_ACTION_KEYS,
  ROLE_ACTIONS_BY_CATEGORY,
} from './roleActionKeys.js'

/** Rastgele metin alanlarını üst yetki haritasına sızdırmadan leaf topla */
const LEGACY_TOPLEVEL_PERM_KEYS = new Set([
  'panel_erisim',
  'personel_yonet',
  'is_admin',
  'is_manager',
  'gorev_onayla',
  'rol_yonet',
  'roller_yonet',
])

function shouldMergeLeafPermissionKey(k) {
  if (!k || typeof k !== 'string') return false
  if (LEGACY_TOPLEVEL_PERM_KEYS.has(k)) return true
  if (ALL_ROLE_ACTION_KEYS.includes(k)) return true
  if (k.includes('.')) return true
  return false
}

/** İç içe kategori (örn. Sistem / Yönetim / lowercase) altındaki leaf yetkileri düzleştirür */
function deepCollectPermissionLeaves(node, out) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return
  const entries = Object.entries(node)
  if (!entries.length) return
  const leafLike = ([, v]) =>
    v === null ||
    typeof v === 'boolean' ||
    typeof v === 'string' ||
    typeof v === 'number'
  if (entries.every(leafLike)) {
    for (const [k, v] of entries) {
      if (shouldMergeLeafPermissionKey(k)) out[k] = v
    }
    return
  }
  for (const [, v] of entries) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      deepCollectPermissionLeaves(v, out)
    }
  }
}

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
  deepCollectPermissionLeaves(obj, flat)
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

const ROLE_EDITOR_KEY_SET = new Set(ALL_ROLE_ACTION_KEYS)

/** Yeni rol formu: tüm anahtarlar kapalı */
export function emptyRoleSwitchState() {
  return Object.fromEntries(ALL_ROLE_ACTION_KEYS.map((k) => [k, false]))
}

/**
 * DB'deki yetkiler → switch state + ekranda düzenlenmeyen (korunacak) alanlar.
 * Eski rollerdeki gorev_onayla, panel_erisim vb. preserved içinde kalır.
 */
export function hydrateRoleEditorPermissions(rawYetkiler) {
  const flat = normalizeRolePermissions(rawYetkiler || {})
  const switches = {}
  const preserved = {}
  for (const [k, v] of Object.entries(flat)) {
    if (ROLE_EDITOR_KEY_SET.has(k)) {
      switches[k] = isPermTruthy(flat, k)
    } else {
      preserved[k] = v
    }
  }
  for (const k of ALL_ROLE_ACTION_KEYS) {
    if (!(k in switches)) switches[k] = false
  }
  return { switches, preserved }
}

/** Korunan alanlar + switch'ler → kayıt JSON'u */
export function mergeRoleYetkilerForSave(preserved, switches) {
  const p = preserved && typeof preserved === 'object' ? preserved : {}
  const s = switches && typeof switches === 'object' ? switches : {}
  return buildYetkilerForSave({ ...p, ...s })
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

/**
 * Personel kaydını düzenleme yetkisi. Standart kural `canManageStaff` ile aynıdır
 * (personel.yonet sahibi tüm kayıtları düzenler). Ek olarak: rol yönetim
 * yetkisine (`rol.yonet`) sahip bir kullanıcı en az kendi kaydını da
 * düzenleyebilir — bu sayede yalnız `rol.yonet` yetkisi olan biri kendi
 * `rol_id`'sini değiştirebilir.
 */
export function canEditStaffRecord(perms, isSystemAdmin, opts = {}) {
  if (isSystemAdmin) return true
  if (canManageStaff(perms, false)) return true
  if (opts && opts.isOwnRecord && canSeeRoles(perms, false)) return true
  return false
}

export function canApproveTask(perms) {
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'gorev_onayla') ||
    isPermTruthy(flat, 'denetim.onayla')
  )
}

/** Sirali gorev adim denetimi (onay/reddet yetkisi) */
export function canAuditTaskStep(perms) {
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'gorev_onayla') ||
    isPermTruthy(flat, 'denetim.onayla') ||
    isPermTruthy(flat, 'denetim.reddet')
  )
}

/** Normal görevde «özel / birebir» (ozel_gorev) işaretleme */
export function canMarkBirebirGorev(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'is.birebir_gorev')
}

/** Görev silme talebi (RPC: rpc_is_silme_talebi_olustur) */
export function canRequestTaskDeletion(perms) {
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'is.sil')
}

/** Görev Silme Onayı + silinen görevler arşivi görüntüleme */
export function canApproveTaskDeletion(perms) {
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'is.sil.onay')
}

/** Atanan işi operasyonel düzenleme (RPC rpc_is_operasyonel_guncelle, rol: is.duzenle) */
export function canOperationallyEditAssignedTask(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'is.duzenle')
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

/** Rol ekranı erişimi — canonical `rol.yonet` + DB’de görülen takma / iç içe yapılar */
export function canSeeRoles(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'rol.yonet') ||
    isPermTruthy(flat, 'rol_yonet') ||
    isPermTruthy(flat, 'roller_yonet')
  )
}

export function canSeeTaskTemplates(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'is_turu.yonet') ||
    isPermTruthy(flat, 'is_admin') ||
    isPermTruthy(flat, 'is_manager') ||
    isPermTruthy(flat, 'sirket.yonet') ||
    isPermTruthy(flat, 'personel.yonet') ||
    isPermTruthy(flat, 'sube.yonet') ||
    isPermTruthy(flat, 'gorev_onayla')
  )
}

export function canSeeTasks(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  if (
    isPermTruthy(flat, 'is_admin') ||
    isPermTruthy(flat, 'is_manager')
  ) {
    return true
  }
  return (
    isPermTruthy(flat, 'sirket.yonet') ||
    isPermTruthy(flat, 'sube.yonet') ||
    isPermTruthy(flat, 'personel.yonet') ||
    isPermTruthy(flat, 'personel_yonet') ||
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
 * en az biri veya sistem yöneticisi. Operasyon/denetim (sadece görev görüntüleme, görev
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

function normalizeRoleLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Görev atama / yönetim kokpiti — personel rolü tek başına sayılmaz */
export function hasManagementPrivileges(perms, personel = null) {
  const flat = normalizeRolePermissions(perms)
  const managementKeys = [
    'is_admin',
    'is_manager',
    'sirket.yonet',
    'sube.yonet',
    'rol.yonet',
    'personel.yonet',
    'personel_yonet',
    'gorev_onayla',
    'denetim.onayla',
    'denetim.reddet',
  ]
  if (managementKeys.some((k) => isPermTruthy(flat, k))) return true

  const roleText = normalizeRoleLabel(
    personel?.roleName || personel?.rol_adi || personel?.rol || '',
  )
  return (
    roleText.includes('yonet') ||
    roleText.includes('yonetici') ||
    roleText.includes('mudur') ||
    roleText.includes('admin') ||
    roleText.includes('manager') ||
    roleText.includes('owner') ||
    roleText.includes('sahip') ||
    roleText.includes('sirket sahibi')
  )
}

/**
 * Görev oluşturma / atama — yalnızca açık `is.olustur` (veya legacy gorev_atama) + yönetim kapsamı.
 * `is.liste_gor` veya `is_manager` tek başına atama vermez.
 */
export function canAssignTask(perms, isSystemAdmin, personel = null) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  const hasCreatePerm =
    isPermTruthy(flat, 'is.olustur') || isPermTruthy(flat, 'gorev_atama')
  if (!hasCreatePerm) return false
  return hasManagementPrivileges(flat, personel)
}

/** Denetim görevi oluşturma (ayrı eylem) */
export function canCreateAuditTask(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'denetim.olustur')
}

export function canManageCustomerRatings(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return (
    isPermTruthy(flat, 'musteri_puan.qr_olustur') ||
    isPermTruthy(flat, 'musteri_puan.rapor_oku')
  )
}

export function canBypassCompanyIpRestriction(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  return isPermTruthy(flat, 'ip.kisit_muaf')
}

export function canAccessAdminPath(pathname, perms, isSystemAdmin, personel = null) {
  if (isSystemAdmin) return true
  const flat = normalizeRolePermissions(perms)
  if (!pathname.startsWith('/admin')) return true

  const p = pathname.replace(/\/$/, '') || '/admin'

  if (p === '/admin') return hasWebPanelAccess(flat, false)

  if (p.startsWith('/admin/companies')) return canSeeCompanies(flat, false)
  if (p.startsWith('/admin/units')) return canSeeUnits(flat, false)
  if (p.startsWith('/admin/staff/edit')) {
    // Rol yönetim yetkisine sahip biri kendi kaydını düzenleyebilmek için
    // staff/edit rotasına erişebilmeli; ekran içinde ayrıca own-record kontrolü
    // yapılır (başkasının kaydı için yine yetersizdir).
    return canManageStaff(flat, false) || canSeeRoles(flat, false)
  }
  if (p.startsWith('/admin/staff')) return canManageStaff(flat, false)
  if (p.startsWith('/admin/presence')) return canManageStaff(flat, false)
  if (p.startsWith('/admin/roles')) return canSeeRoles(flat, false)
  if (p.startsWith('/admin/task-templates') || p.startsWith('/admin/templates'))
    return canSeeTaskTemplates(flat, false)
  if (p.startsWith('/admin/personal-todo')) return hasWebPanelAccess(flat, false)
  if (p.startsWith('/admin/audit')) return canApproveTask(flat) || canSeeTasks(flat, false)
  if (p.startsWith('/admin/assign-task')) return canAssignTask(flat, false, personel)
  if (p.startsWith('/admin/tasks')) {
    if (p.endsWith('/new')) return canAssignTask(flat, false, personel)
    if (/\/admin\/tasks\/[^/]+\/edit\/?$/.test(p)) {
      return (
        canSeeTasks(flat, false) &&
        canOperationallyEditAssignedTask(perms, false)
      )
    }
    return canSeeTasks(flat, false)
  }

  if (p.startsWith('/admin/profile')) return hasWebPanelAccess(flat, false)
  if (p.startsWith('/admin/chat')) return hasWebPanelAccess(flat, false)
  if (p.startsWith('/admin/calendar')) return hasWebPanelAccess(flat, false)
  if (p.startsWith('/admin/customer-ratings'))
    return canManageCustomerRatings(flat, false)

  return hasWebPanelAccess(flat, false)
}
