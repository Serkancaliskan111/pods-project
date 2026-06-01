/**
 * Görev atama hiyerarşisi — yukarı (daha yetkili) role/personele görev atanamaz.
 * Mobil managementScope ile uyumlu; web canAssignTask daraltıldı.
 */
import { normalizeRolePermissions, isPermTruthy } from './permissions.js'
import { isUnitInScope } from './supabaseScope.js'

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Rol / yetki setine göre hiyerarşi puanı (yüksek = daha yetkili).
 * Aynı puanda eş düzey kabul edilir.
 */
export function roleHierarchyRank({ roleRow, permissions, roleName } = {}) {
  const flat = normalizeRolePermissions(permissions || roleRow?.yetkiler || {})
  const name = normalizeText(roleName || roleRow?.rol_adi || '')

  if (isPermTruthy(flat, 'is_admin') || isPermTruthy(flat, 'sirket.yonet')) return 900
  if (
    isPermTruthy(flat, 'is_manager') ||
    isPermTruthy(flat, 'personel.yonet') ||
    isPermTruthy(flat, 'sube.yonet')
  ) {
    return 800
  }
  if (isPermTruthy(flat, 'gorev_onayla') || isPermTruthy(flat, 'denetim.onayla')) return 700
  if (isPermTruthy(flat, 'denetim.olustur')) return 650
  if (isPermTruthy(flat, 'is.olustur')) return 600

  if (
    name.includes('sistem') ||
    name.includes('admin') ||
    name.includes('sirket sahibi') ||
    name.includes('genel mudur')
  ) {
    return 850
  }
  if (
    name.includes('yonet') ||
    name.includes('yonetici') ||
    name.includes('mudur') ||
    name.includes('manager') ||
    name.includes('direktor')
  ) {
    return 750
  }
  if (name.includes('denetim') || name.includes('onay')) return 680
  if (name.includes('personel') || name.includes('operasyon') || name.includes('saha')) {
    return 100
  }
  return 200
}

export function getAssignerHierarchyRank(assigner, assignerPermissions, assignerRoleRow) {
  return roleHierarchyRank({
    roleRow: assignerRoleRow,
    permissions: assignerPermissions,
    roleName: assigner?.roleName || assigner?.rol_adi,
  })
}

export function getTargetHierarchyRank(targetRow, rolePermMap) {
  const rid = targetRow?.rol_id ? String(targetRow.rol_id) : ''
  const meta = rid && rolePermMap?.[rid] ? rolePermMap[rid] : null
  const perms = meta?.yetkiler || meta || {}
  const rolAdi = meta?.rol_adi || targetRow?.rol_adi || ''
  return roleHierarchyRank({
    roleRow: { rol_adi: rolAdi, yetkiler: perms },
    permissions: perms,
    roleName: rolAdi,
  })
}

/**
 * Görev sorumlusu / zincir yapan: birim kapsamı + aşağı/eş hiyerarşi.
 * Onaylayıcı seçiminde allowUpward=true (üst yönetici onaylayabilir).
 */
export function canSelectPersonelForAssignment({
  assigner,
  assignerPermissions,
  assignerRoleRow,
  targetRow,
  rolePermMap,
  accessibleUnitIds,
  isSystemAdmin,
  allowUpward = false,
}) {
  if (isSystemAdmin) return true
  if (!assigner?.id || !targetRow?.id) return false
  if (String(targetRow.id) === String(assigner.id)) return false

  const bid = targetRow?.birim_id
  if (accessibleUnitIds?.length) {
    if (!bid || !isUnitInScope(accessibleUnitIds, bid)) return false
  }

  if (allowUpward) return true

  const assignerRank = getAssignerHierarchyRank(assigner, assignerPermissions, assignerRoleRow)
  const targetRank = getTargetHierarchyRank(targetRow, rolePermMap)
  return targetRank <= assignerRank
}

export function filterAssignablePersonnel(rows, ctx) {
  const list = Array.isArray(rows) ? rows : []
  if (ctx.isSystemAdmin) return list

  const rolePermMap = ctx.rolePermMap || {}

  return list.filter((row) =>
    canSelectPersonelForAssignment({
      ...ctx,
      targetRow: row,
      rolePermMap,
      allowUpward: false,
    }),
  )
}

export async function fetchRolePermissionsMap(supabase, roleIds) {
  const ids = [...new Set((roleIds || []).filter(Boolean).map(String))]
  const map = {}
  if (!ids.length) return map
  const { data } = await supabase.from('roller').select('id,yetkiler,rol_adi').in('id', ids)
  for (const row of data || []) {
    map[String(row.id)] = {
      yetkiler: row?.yetkiler || {},
      rol_adi: row?.rol_adi || '',
    }
  }
  return map
}
