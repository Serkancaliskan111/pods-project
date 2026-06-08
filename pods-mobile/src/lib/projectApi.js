import getSupabase from './supabaseClient'
import {
  scopeAnaSirketlerQuery,
  restrictQueryByPersonelBirimHierarchy,
} from './supabaseScope.js'
import {
  PROJECT_AUTH_ROLE,
  PROJECT_TEAM_ROLES,
  canManageProjectAuthorized,
  splitProjectMembers,
} from './projectAccess.js'
import { normalizeRolePermissions, hasProjectCreatePermission } from './permissions.js'
import { expandUnitsFromSeeds } from './personelUnitScope.js'
import {
  collectPlanPersonIds,
  normalizePlanMeta,
  resolvePrimaryAssignee,
} from './projectTaskPlan.js'
import { clampWorkCounts, computeProgressPercent } from './projectTaskProgress.js'

const supabase = getSupabase()

const PROJECT_SELECT =
  'id,ana_sirket_id,birim_id,baslik,aciklama,kod,durum,oncelik,baslangic_tarihi,bitis_tarihi,renk,sorumlu_personel_id,olusturan_kullanici_id,olusturulma_at,guncelleme_at'

const TASK_SELECT =
  'id,proje_id,parent_id,baslik,aciklama,baslangic_tarihi,bitis_tarihi,durum,ilerleme,yapilan_is,toplam_is,sira,sorumlu_personel_id,gorev_tipi,plan_meta,bagli_is_id,olusturulma_at,guncelleme_at,silindi_at'

function applyWorkProgressFields(row, payload) {
  const durum = payload.durum ?? row.durum ?? 'yapilacak'
  const { yapilan_is, toplam_is } = clampWorkCounts(
    payload.yapilan_is ?? row.yapilan_is ?? 0,
    payload.toplam_is ?? row.toplam_is ?? 1,
    durum,
  )
  return {
    yapilan_is,
    toplam_is,
    ilerleme: computeProgressPercent(yapilan_is, toplam_is, durum),
    durum,
  }
}

function applyCompanyScope(q, ctx) {
  let next = q.is('silindi_at', null)
  if (!ctx.isSystemAdmin && ctx.currentCompanyId) {
    next = next.eq('ana_sirket_id', ctx.currentCompanyId)
  }
  return next
}

/** Oturumdaki personelin görebileceği proje id'leri (ekip, yetkili, görev, oluşturan) */
export async function resolveVisibleProjectIds(ctx, { personelId, userId } = {}) {
  if (ctx.isSystemAdmin) return null

  const pid = personelId != null ? String(personelId) : ''
  if (!pid) return []

  const ids = new Set()

  const { data: memberships, error: memErr } = await supabase
    .from('proje_sorumlulari')
    .select('proje_id')
    .eq('personel_id', pid)
  if (memErr) throw memErr
  for (const row of memberships || []) {
    if (row.proje_id) ids.add(String(row.proje_id))
  }

  const { data: taskRows, error: taskErr } = await supabase
    .from('proje_gorevleri')
    .select('proje_id')
    .eq('sorumlu_personel_id', pid)
    .is('silindi_at', null)
  if (taskErr) throw taskErr
  for (const row of taskRows || []) {
    if (row.proje_id) ids.add(String(row.proje_id))
  }

  if (userId) {
    let cq = supabase
      .from('projeler')
      .select('id')
      .eq('olusturan_kullanici_id', userId)
      .is('silindi_at', null)
    if (ctx.currentCompanyId) cq = cq.eq('ana_sirket_id', ctx.currentCompanyId)
    const { data: created, error: cErr } = await cq
    if (cErr) throw cErr
    for (const row of created || []) {
      if (row.id) ids.add(String(row.id))
    }
  }

  return [...ids]
}

export async function fetchProjects(ctx, { status, search, personelId, userId } = {}) {
  if (ctx.isSystemAdmin) {
    let q = supabase
      .from('projeler')
      .select(PROJECT_SELECT)
      .order('guncelleme_at', { ascending: false })
    q = applyCompanyScope(q, ctx)
    if (status) q = q.eq('durum', status)
    if (search?.trim()) {
      const s = `%${search.trim()}%`
      q = q.or(`baslik.ilike.${s},kod.ilike.${s},aciklama.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return data || []
  }

  const visibleIds = await resolveVisibleProjectIds(ctx, { personelId, userId })
  if (!visibleIds.length) return []

  let q = supabase
    .from('projeler')
    .select(PROJECT_SELECT)
    .in('id', visibleIds)
    .order('guncelleme_at', { ascending: false })
  q = applyCompanyScope(q, ctx)
  if (status) q = q.eq('durum', status)
  if (search?.trim()) {
    const s = `%${search.trim()}%`
    q = q.or(`baslik.ilike.${s},kod.ilike.${s},aciklama.ilike.${s}`)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function fetchProjectById(id, ctx, { personelId, userId } = {}) {
  let q = supabase.from('projeler').select(PROJECT_SELECT).eq('id', id).is('silindi_at', null)
  q = applyCompanyScope(q, ctx)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  if (!data) return null

  if (!ctx.isSystemAdmin) {
    const visibleIds = await resolveVisibleProjectIds(ctx, { personelId, userId })
    if (!visibleIds.includes(String(id))) return null
  }
  return data
}

export async function personHasProjectTaskAssignment(projeId, personelId) {
  if (!personelId) return false
  const { data, error } = await supabase
    .from('proje_gorevleri')
    .select('id')
    .eq('proje_id', projeId)
    .eq('sorumlu_personel_id', personelId)
    .is('silindi_at', null)
    .limit(1)
  if (error) throw error
  return (data || []).length > 0
}

export async function fetchProjectTasks(projeId) {
  const { data, error } = await supabase
    .from('proje_gorevleri')
    .select(TASK_SELECT)
    .eq('proje_id', projeId)
    .is('silindi_at', null)
    .order('sira', { ascending: true })
    .order('baslik', { ascending: true })
  if (error) throw error
  return data || []
}

const ISLER_PROJECT_SELECT =
  'id,baslik,aciklama,durum,baslama_tarihi,son_tarih,gorunur_tarih,sorumlu_personel_id,birim_id,ana_sirket_id,gorev_turu,puan,proje_id,acil,created_at,updated_at'

/** Proje kapsamındaki operasyonel görevler (isler.proje_id). Kolon yoksa boş dizi. */
export async function fetchProjectOperationalTasks(projeId) {
  if (!projeId) return []
  const { data, error } = await supabase
    .from('isler')
    .select(ISLER_PROJECT_SELECT)
    .eq('proje_id', projeId)
    .order('updated_at', { ascending: false })
  if (error) {
    if (error.code === '42703' && String(error.message || '').includes('proje_id')) {
      return []
    }
    throw error
  }
  return data || []
}

function unwrapEmbeddedPersonel(raw) {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw[0] || null
  return raw
}

export function formatPersonelDisplayName(p) {
  if (!p) return 'Personel'
  const embedded = unwrapEmbeddedPersonel(p.personel)
  const ad = p.ad ?? embedded?.ad
  const soyad = p.soyad ?? embedded?.soyad
  const email = p.email ?? embedded?.email
  return [ad, soyad].filter(Boolean).join(' ').trim() || email || 'Personel'
}

export function personToPickerOption(p) {
  if (!p) return null
  const id = p.personel_id ?? p.id
  if (id == null || String(id).trim() === '') return null
  return { id, name: formatPersonelDisplayName(p) }
}

export function mapPersonelRows(rows) {
  return (rows || []).map((row) => {
    const embedded = unwrapEmbeddedPersonel(row.personel)
    const p = embedded || row
    const personel_id = row.personel_id ?? embedded?.id ?? p.id
    return {
      membershipId: row.id,
      personel_id,
      rol: row.rol,
      sira: row.sira,
      ad: p.ad ?? null,
      soyad: p.soyad ?? null,
      email: p.email ?? null,
    }
  })
}

const MEMBER_SELECT = 'id,personel_id,rol,sira,personel:personeller(id,ad,soyad,email)'

export async function fetchProjectMembers(projeId) {
  const { data, error } = await supabase
    .from('proje_sorumlulari')
    .select(MEMBER_SELECT)
    .eq('proje_id', projeId)
    .order('sira', { ascending: true })
    .order('eklendi_at', { ascending: true })
  if (error) throw error
  return mapPersonelRows(data)
}

export async function fetchProjectTeamMembers(projeId) {
  const all = await fetchProjectMembers(projeId)
  return splitProjectMembers(all).team
}

export async function fetchProjectAuthorizedMembers(projeId) {
  const all = await fetchProjectMembers(projeId)
  return splitProjectMembers(all).authorized
}

/** `proje.yonet` yetkisi olan şirket personeli — yetkili ekleme havuzu */
export async function fetchStaffWithProjectCreatePermission(ctx) {
  let q = supabase
    .from('personeller')
    .select('id,ad,soyad,email,ana_sirket_id,birim_id,rol:roller(yetkiler)')
    .is('silindi_at', null)
    .order('ad', { ascending: true })
  if (!ctx.isSystemAdmin && ctx.currentCompanyId) {
    q = q.eq('ana_sirket_id', ctx.currentCompanyId)
  }
  const { data, error } = await q
  if (error) throw error
  return (data || []).filter((row) => {
    const flat = normalizeRolePermissions(row.rol?.yetkiler)
    return hasProjectCreatePermission(flat, false)
  })
}

export async function fetchAuthorizedPoolForProject(projeId, ctx) {
  const [pool, members] = await Promise.all([
    fetchStaffWithProjectCreatePermission(ctx),
    fetchProjectMembers(projeId),
  ])
  const onProject = new Set(members.map((m) => String(m.personel_id)))
  return pool.filter((p) => !onProject.has(String(p.id)))
}

export async function fetchStaffPoolForProject(projeId, ctx) {
  const [pool, members, projectRow] = await Promise.all([
    fetchStaffForProjects(ctx),
    fetchProjectTeamMembers(projeId),
    supabase.from('projeler').select('birim_id').eq('id', projeId).maybeSingle(),
  ])
  const memberIds = new Set(members.map((m) => String(m.personel_id)))
  let eligible = pool.filter((p) => !memberIds.has(String(p.id)))

  const projeBirimId = projectRow?.data?.birim_id
  if (projeBirimId) {
    const units = await fetchUnitsForProjects(ctx)
    const unitTree = new Set(
      expandUnitsFromSeeds(units, [projeBirimId]).map(String),
    )
    eligible = eligible.filter((p) => unitTree.has(String(p.birim_id)))
  }

  return eligible
}

/** Proje detayında birim adı */
export async function fetchProjectUnitLabel(birimId) {
  if (!birimId) return null
  const { data, error } = await supabase
    .from('birimler')
    .select('birim_adi')
    .eq('id', birimId)
    .maybeSingle()
  if (error) return null
  return data?.birim_adi || null
}

/** Yeni proje: birim kapsamı otomatik (manuel seçim yok) */
export function resolveDefaultProjectBirimId(ctx, personel) {
  if (ctx?.isSystemAdmin || ctx?.isTopCompanyScope) return null
  const fb = personel?.birim_id
  return fb != null && String(fb).trim() !== '' ? String(fb) : null
}

async function assertProjectAuthorizedEditor(projeId, actor = {}) {
  const { data: project, error } = await supabase
    .from('projeler')
    .select('olusturan_kullanici_id')
    .eq('id', projeId)
    .maybeSingle()
  if (error) throw error
  if (
    !canManageProjectAuthorized({
      isSystemAdmin: !!actor.isSystemAdmin,
      userId: actor.userId,
      project,
    })
  ) {
    throw new Error('Yetkilileri yalnızca projeyi oluşturan kişi düzenleyebilir.')
  }
}

export async function addProjectAuthorized(projeId, personelId, ctx, actor = {}) {
  await assertProjectAuthorizedEditor(projeId, {
    isSystemAdmin: ctx?.isSystemAdmin,
    userId: actor.userId ?? ctx?.userId,
  })
  const eligible = await fetchAuthorizedPoolForProject(projeId, ctx)
  if (!eligible.some((p) => String(p.id) === String(personelId))) {
    throw new Error('Bu personel proje yetkilisi olarak eklenemez (proje.yonet gerekir).')
  }
  const { data, error } = await supabase
    .from('proje_sorumlulari')
    .insert({
      proje_id: projeId,
      personel_id: personelId,
      rol: PROJECT_AUTH_ROLE,
      sira: 0,
    })
    .select(MEMBER_SELECT)
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu personel zaten projede kayıtlı.')
    throw error
  }
  return mapPersonelRows([data])[0]
}

export async function addProjectMember(projeId, personelId, { rol = 'uye', sira } = {}) {
  if (rol === PROJECT_AUTH_ROLE) {
    throw new Error('Yetkili eklemek için addProjectAuthorized kullanın.')
  }
  if (!PROJECT_TEAM_ROLES.includes(rol)) {
    throw new Error('Geçersiz ekip rolü.')
  }
  const { data, error } = await supabase
    .from('proje_sorumlulari')
    .insert({
      proje_id: projeId,
      personel_id: personelId,
      rol,
      sira: sira ?? 0,
    })
    .select(MEMBER_SELECT)
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Bu personel zaten proje ekibinde.')
    throw error
  }
  await syncProjectTeamPrimary(projeId)
  return mapPersonelRows([data])[0]
}

export async function addProjectMembers(projeId, personelIds) {
  const ids = [...new Set((personelIds || []).filter(Boolean).map(String))]
  if (!ids.length) return []
  const rows = ids.map((personel_id, idx) => ({
    proje_id: projeId,
    personel_id,
    rol: 'uye',
    sira: idx,
  }))
  const { data, error } = await supabase.from('proje_sorumlulari').insert(rows).select(MEMBER_SELECT)
  if (error) throw error
  await syncProjectTeamPrimary(projeId)
  return mapPersonelRows(data)
}

export async function resolveProjectCreatorPersonelId(olusturanKullaniciId) {
  if (!olusturanKullaniciId) return null
  const { data, error } = await supabase
    .from('personeller')
    .select('id')
    .eq('kullanici_id', olusturanKullaniciId)
    .is('silindi_at', null)
    .maybeSingle()
  if (error) return null
  return data?.id || null
}

export async function removeProjectMember(projeId, personelId, actor = {}) {
  const { data: project } = await supabase
    .from('projeler')
    .select('olusturan_kullanici_id,ana_sirket_id')
    .eq('id', projeId)
    .maybeSingle()
  const members = await fetchProjectMembers(projeId)
  const row = members.find((m) => String(m.personel_id) === String(personelId))
  const isAuthorizedRow =
    row && (row.rol === PROJECT_AUTH_ROLE || row.rol === 'lider')
  if (isAuthorizedRow) {
    await assertProjectAuthorizedEditor(projeId, actor)
  }
  const creatorId = await resolveProjectCreatorPersonelId(project?.olusturan_kullanici_id)
  if (
    creatorId &&
    String(personelId) === String(creatorId) &&
    isAuthorizedRow
  ) {
    throw new Error('Projeyi oluşturan yetkili kaldırılamaz.')
  }
  const { error } = await supabase
    .from('proje_sorumlulari')
    .delete()
    .eq('proje_id', projeId)
    .eq('personel_id', personelId)
  if (error) throw error
  await syncProjectTeamPrimary(projeId)
}

/** projeler.sorumlu_personel_id — geriye dönük; ilk ekip üyesi */
async function syncProjectTeamPrimary(projeId) {
  const members = await fetchProjectTeamMembers(projeId)
  const primary = members[0]?.personel_id || null
  await supabase.from('projeler').update({ sorumlu_personel_id: primary }).eq('id', projeId)
}

export async function assertProjectTaskAssignee(projeId, personelId) {
  if (!personelId) return
  const members = await fetchProjectTeamMembers(projeId)
  const ok = members.some((m) => String(m.personel_id) === String(personelId))
  if (!ok) {
    throw new Error('Görev sorumlusu proje ekibinden seçilmelidir.')
  }
}

export async function assertPlanMetaTeam(projeId, gorevTipi, planMeta) {
  const ids = collectPlanPersonIds(gorevTipi, planMeta)
  for (const id of ids) {
    await assertProjectTaskAssignee(projeId, id)
  }
}

export async function createProject(
  payload,
  { userId, companyId, memberIds, creatorPersonelId } = {},
) {
  const creatorId =
    creatorPersonelId != null && String(creatorPersonelId).trim() !== ''
      ? String(creatorPersonelId)
      : null
  const teamIds = [...new Set((memberIds || []).filter(Boolean).map(String))]

  let creatorUserId = userId != null && String(userId).trim() !== '' ? String(userId) : null
  if (!creatorUserId) {
    const { data: authData } = await supabase.auth.getUser()
    creatorUserId = authData?.user?.id ? String(authData.user.id) : null
  }

  if (!creatorUserId) {
    throw new Error('Oturum bilgisi alınamadı. Sayfayı yenileyip tekrar deneyin.')
  }

  const projectId = crypto.randomUUID()
  const row = {
    id: projectId,
    ana_sirket_id: payload.ana_sirket_id || companyId,
    birim_id: payload.birim_id || null,
    baslik: String(payload.baslik || '').trim(),
    aciklama: payload.aciklama?.trim() || null,
    kod: payload.kod?.trim() || null,
    durum: payload.durum || 'planlama',
    oncelik: payload.oncelik || 'normal',
    baslangic_tarihi: payload.baslangic_tarihi || null,
    bitis_tarihi: payload.bitis_tarihi || null,
    renk: payload.renk || '#2563EB',
    sorumlu_personel_id: teamIds[0] || null,
    olusturan_kullanici_id: creatorUserId,
  }
  if (!row.baslik) throw new Error('Proje adı zorunludur.')
  if (!row.ana_sirket_id) throw new Error('Şirket bilgisi eksik.')

  const { error: insertErr } = await supabase.from('projeler').insert(row)
  if (insertErr) {
    if (insertErr.code === '42501' || /row-level security/i.test(insertErr.message || '')) {
      throw new Error(
        'Proje oluşturma reddedildi. Rolünüzde «Proje yönetimi» açık olsa bile veritabanı migration’ı (074) uygulanmamış olabilir; yöneticinize bildirin.',
      )
    }
    throw insertErr
  }

  if (creatorId) {
    const { error: authErr } = await supabase.from('proje_sorumlulari').insert({
      proje_id: projectId,
      personel_id: creatorId,
      rol: PROJECT_AUTH_ROLE,
      sira: 0,
    })
    if (authErr) throw authErr
  }

  const teamWithoutCreator = teamIds.filter((id) => String(id) !== String(creatorId))
  if (teamWithoutCreator.length) {
    await addProjectMembers(projectId, teamWithoutCreator)
  }

  const { data, error } = await supabase
    .from('projeler')
    .select(PROJECT_SELECT)
    .eq('id', projectId)
    .single()
  if (error) throw error

  return data
}

export async function updateProject(id, patch) {
  const allowed = [
    'baslik',
    'aciklama',
    'kod',
    'durum',
    'oncelik',
    'baslangic_tarihi',
    'bitis_tarihi',
    'renk',
    'sorumlu_personel_id',
    'birim_id',
  ]
  const row = {}
  for (const k of allowed) {
    if (patch[k] !== undefined) row[k] = patch[k]
  }
  if (row.baslik !== undefined && !String(row.baslik).trim()) {
    throw new Error('Proje adı boş olamaz.')
  }
  const { data, error } = await supabase
    .from('projeler')
    .update(row)
    .eq('id', id)
    .select(PROJECT_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function softDeleteProject(id) {
  const { error } = await supabase
    .from('projeler')
    .update({ silindi_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function createProjectTask(projeId, payload) {
  const gorev_tipi = payload.gorev_tipi || 'normal'
  const plan_meta = normalizePlanMeta(payload.plan_meta)
  await assertPlanMetaTeam(projeId, gorev_tipi, plan_meta)
  const primary =
    payload.sorumlu_personel_id || resolvePrimaryAssignee(gorev_tipi, plan_meta)
  await assertProjectTaskAssignee(projeId, primary)
  const progressFields = applyWorkProgressFields({}, payload)
  const row = {
    proje_id: projeId,
    parent_id: payload.parent_id || null,
    baslik: String(payload.baslik || '').trim(),
    aciklama: payload.aciklama?.trim() || null,
    baslangic_tarihi: payload.baslangic_tarihi,
    bitis_tarihi: payload.bitis_tarihi,
    sira: Number(payload.sira) || 0,
    sorumlu_personel_id: primary || null,
    gorev_tipi,
    plan_meta,
    bagli_is_id: payload.bagli_is_id || null,
    ...progressFields,
  }
  if (!row.baslik) throw new Error('Görev adı zorunludur.')
  if (!row.baslangic_tarihi || !row.bitis_tarihi) {
    throw new Error('Başlangıç ve bitiş tarihi zorunludur.')
  }

  const { data, error } = await supabase
    .from('proje_gorevleri')
    .insert(row)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function updateProjectTask(id, patch, { projeId } = {}) {
  if (projeId && (patch.plan_meta !== undefined || patch.gorev_tipi !== undefined)) {
    const gorev_tipi = patch.gorev_tipi || 'normal'
    const plan_meta = normalizePlanMeta(patch.plan_meta)
    await assertPlanMetaTeam(projeId, gorev_tipi, plan_meta)
    if (patch.sorumlu_personel_id === undefined) {
      patch.sorumlu_personel_id = resolvePrimaryAssignee(gorev_tipi, plan_meta)
    }
  }
  if (patch.sorumlu_personel_id !== undefined && projeId) {
    await assertProjectTaskAssignee(projeId, patch.sorumlu_personel_id)
  }
  const allowed = [
    'baslik',
    'aciklama',
    'baslangic_tarihi',
    'bitis_tarihi',
    'durum',
    'sira',
    'sorumlu_personel_id',
    'parent_id',
    'bagli_is_id',
    'gorev_tipi',
    'plan_meta',
    'yapilan_is',
    'toplam_is',
  ]
  const row = {}
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      row[k] = k === 'plan_meta' ? normalizePlanMeta(patch[k]) : patch[k]
    }
  }
  if (patch.yapilan_is !== undefined || patch.toplam_is !== undefined || patch.durum !== undefined) {
    Object.assign(
      row,
      applyWorkProgressFields(
        {
          durum: patch.durum ?? 'yapilacak',
          yapilan_is: patch.yapilan_is,
          toplam_is: patch.toplam_is,
        },
        patch,
      ),
    )
  }

  const { data, error } = await supabase
    .from('proje_gorevleri')
    .update(row)
    .eq('id', id)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  return data
}

/** Planlama görevini oluşturulan operasyonel iş ile eşle */
export async function linkProjectTaskToOperational(projeGorevId, isId) {
  if (!projeGorevId || !isId) return null
  const { data, error } = await supabase
    .from('proje_gorevleri')
    .update({ bagli_is_id: isId })
    .eq('id', projeGorevId)
    .select(TASK_SELECT)
    .single()
  if (error) throw error
  if (data?.proje_id) {
    const { error: syncErr } = await supabase
      .from('isler')
      .update({ proje_id: data.proje_id })
      .eq('id', isId)
    if (syncErr && syncErr.code !== '42703') throw syncErr
  }
  return data
}

export async function softDeleteProjectTask(id) {
  const { error } = await supabase
    .from('proje_gorevleri')
    .update({ silindi_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function fetchStaffForProjects(ctx) {
  let q = supabase
    .from('personeller')
    .select('id,ad,soyad,email,ana_sirket_id,birim_id')
    .is('silindi_at', null)
    .order('ad', { ascending: true })
  if (!ctx.isSystemAdmin && ctx.currentCompanyId) {
    q = q.eq('ana_sirket_id', ctx.currentCompanyId)
  }
  q = restrictQueryByPersonelBirimHierarchy(q, ctx)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function fetchUnitsForProjects(ctx) {
  let q = supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null)
  if (!ctx.isSystemAdmin && ctx.currentCompanyId) {
    q = q.eq('ana_sirket_id', ctx.currentCompanyId)
  }
  q = restrictQueryByPersonelBirimHierarchy(q, ctx)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function fetchCompaniesForProjects(ctx) {
  let q = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
  q = scopeAnaSirketlerQuery(q, ctx)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
