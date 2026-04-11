export function isPermTruthy(permissions, key) {
  const v = permissions?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function isUnitUnassigned(birimId) {
  return birimId == null || String(birimId).trim() === ''
}

export function hasManagementPrivileges(permissions, personel) {
  // Strict manager/admin scope for hierarchy screens.
  // NOTE: Operational permissions (e.g. is.olustur) are intentionally excluded.
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

  if (managementKeys.some((k) => isPermTruthy(permissions, k))) return true

  const roleText = normalizeText(
    personel?.roleName ||
      personel?.rol_adi ||
      personel?.rol ||
      '',
  )

  // Fallback: rol isminden yönetici/sahip/admin tespiti
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

export function isTopCompanyScope(personel, permissions) {
  if (!personel?.ana_sirket_id) return false
  if (!isUnitUnassigned(personel?.birim_id)) return false
  return hasManagementPrivileges(permissions, personel)
}

export function canAssignTasks(permissions, personel) {
  if (!hasManagementPrivileges(permissions, personel)) return false
  return (
    isPermTruthy(permissions, 'gorev_atama') ||
    isPermTruthy(permissions, 'is.olustur')
  )
}

export function canCreateTasks(permissions) {
  return (
    isPermTruthy(permissions, 'gorev_atama') ||
    isPermTruthy(permissions, 'is.olustur')
  )
}
