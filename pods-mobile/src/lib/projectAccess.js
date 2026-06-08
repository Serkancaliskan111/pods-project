import { hasProjectCreatePermission } from './permissions.js'

export { hasProjectCreatePermission }
export const PROJECT_TEAM_ROLES = Object.freeze(['uye'])
export const PROJECT_AUTH_ROLE = 'yetkili'

export function isProjectTeamMember(member) {
  return member && PROJECT_TEAM_ROLES.includes(member.rol)
}

export function isProjectAuthorized(member) {
  return member?.rol === PROJECT_AUTH_ROLE
}

export function splitProjectMembers(members = []) {
  const team = []
  const authorized = []
  for (const m of members) {
    if (m.rol === PROJECT_AUTH_ROLE || m.rol === 'lider') authorized.push(m)
    else team.push(m)
  }
  return { team, authorized }
}

/**
 * Bu proje kaydında düzenleme (meta, ekip, yetkili, görev planı).
 */
export function canManageProjectRecord({
  isSystemAdmin,
  permissions,
  personelId,
  userId,
  project,
  members = [],
}) {
  if (isSystemAdmin) return true
  if (!hasProjectCreatePermission(permissions, false)) return false
  const me = personelId != null ? String(personelId) : ''
  if (!me) return false

  if (userId && project?.olusturan_kullanici_id && String(project.olusturan_kullanici_id) === String(userId)) {
    return true
  }

  const row = members.find((m) => String(m.personel_id) === me)
  if (!row) return false
  return row.rol === PROJECT_AUTH_ROLE || row.rol === 'lider'
}

/** Yetkili ekleme / çıkarma — yalnızca projeyi oluşturan (veya sistem yöneticisi) */
export function canManageProjectAuthorized({ isSystemAdmin, userId, project }) {
  if (isSystemAdmin) return true
  if (!userId || !project?.olusturan_kullanici_id) return false
  return String(project.olusturan_kullanici_id) === String(userId)
}

/** Proje detayına salt okunur erişim (ekip üyesi veya görev sorumlusu vb.) */
export function canViewProjectRecord({
  isSystemAdmin,
  personelId,
  userId,
  project,
  members = [],
  hasTaskAssignment = false,
}) {
  if (isSystemAdmin) return true
  const me = personelId != null ? String(personelId) : ''
  if (userId && project?.olusturan_kullanici_id && String(project.olusturan_kullanici_id) === String(userId)) {
    return true
  }
  if (me && members.some((m) => String(m.personel_id) === me)) return true
  if (hasTaskAssignment) return true
  return false
}
