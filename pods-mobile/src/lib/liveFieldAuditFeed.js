/**
 * Ana sayfa — yönetici "Canlı Saha Denetimi" şeridi: İşler ile uyumlu kapsam,
 * tüm görev türleri (normal + zincir görev / sıralı görev / zincir onay / birleşik) için kanıt seçimi.
 */

import { TASK_STATUS, normalizeTaskStatus, isPendingApprovalTaskStatus } from './taskStatus'
import { scopeIslerQuery } from './supabaseScope'
import { taskMatchesManagerTasksListScope } from './managerTasksListScope'
import { isSiraliGorevTuru, isZincirGorevTuru } from './zincirTasks'

/** Şeritte gösterilen iş durumları — checklist/kanıt özetleri için. */
export const LIVE_FIELD_AUDIT_TASK_STATUSES = [
  TASK_STATUS.APPROVED,
  TASK_STATUS.PENDING_APPROVAL,
  TASK_STATUS.RESUBMITTED,
]

export function liveAuditShouldOpenDenetim(durum) {
  return isPendingApprovalTaskStatus(durum)
}

/** Kanıt videolarından düz URL listesi (kanit_videolar JSONB: string veya { url }). */
export function extractKanitVideoUrls(job) {
  const raw = job?.kanit_videolar
  if (!raw) return []
  if (!Array.isArray(raw)) return []
  const out = []
  for (const v of raw) {
    if (typeof v === 'string') {
      const u = v.trim()
      if (u) out.push(u)
    } else if (v && typeof v === 'object' && v.url) {
      const u = String(v.url).trim()
      if (u) out.push(u)
    }
  }
  return out
}

/** Canlı şerit / özet: kök kanıt videoları veya checklist cevaplarındaki ilk video URL'si. */
export function getFirstVideoEvidenceUrlFromJob(job) {
  const direct = extractKanitVideoUrls(job)
  if (direct.length) return direct[0]
  const checklistRows = Array.isArray(job?.checklist_cevaplari) ? job.checklist_cevaplari : []
  for (const ans of checklistRows) {
    const vids = Array.isArray(ans?.videolar) ? ans.videolar : []
    for (const v of vids) {
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (v && typeof v === 'object' && v.url) {
        const u = String(v.url).trim()
        if (u) return u
      }
    }
  }
  return null
}

/** Kanıt alanlarını tek diziye çöz (iş satırı veya zincir adımı). */
export function extractKanitPhotoUrls(job) {
  if (!job) return []
  const raw =
    job.kanit_resim_ler ??
    job.kanit_fotograflari ??
    job.fotograflar ??
    job.gorseller ??
    job.resimler ??
    job.fotograf_url ??
    job.foto_url ??
    job.photo_url ??
    job.images ??
    job.image_urls ??
    job.media

  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    try {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      }
    } catch {
      // ignore
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  return []
}

function pickChainGorevStepPhotos(task, steps) {
  const active = Number(task?.zincir_aktif_adim) || 1
  const sorted = [...(steps || [])].sort(
    (a, b) => Number(a?.adim_no || 0) - Number(b?.adim_no || 0),
  )
  const tryStep = (step) => extractKanitPhotoUrls(step)

  const activeStep = sorted.find((s) => Number(s?.adim_no) === active)
  const fromActive = tryStep(activeStep)
  if (fromActive.length) return fromActive

  for (let adim = active - 1; adim >= 1; adim -= 1) {
    const s = sorted.find((x) => Number(x?.adim_no) === adim)
    const urls = tryStep(s)
    if (urls.length) return urls
  }

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const urls = tryStep(sorted[i])
    if (urls.length) return urls
  }
  return []
}

function pickChainGorevStepVideos(task, steps) {
  const active = Number(task?.zincir_aktif_adim) || 1
  const sorted = [...(steps || [])].sort(
    (a, b) => Number(a?.adim_no || 0) - Number(b?.adim_no || 0),
  )
  const tryStep = (step) => extractKanitVideoUrls(step)

  const activeStep = sorted.find((s) => Number(s?.adim_no) === active)
  const fromActive = tryStep(activeStep)
  if (fromActive.length) return fromActive

  for (let adim = active - 1; adim >= 1; adim -= 1) {
    const s = sorted.find((x) => Number(x?.adim_no) === adim)
    const urls = tryStep(s)
    if (urls.length) return urls
  }

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const urls = tryStep(sorted[i])
    if (urls.length) return urls
  }
  return []
}

/**
 * Zincir görev / sıralı görev / zincir+görev tarafında kök satırda kanıt yoksa adım kanıtlarından doldurur.
 * zincir_onay yalın görevlerde kanıt çoğunlukla iş satırında; adım tablosunda foto yok.
 */
export async function attachChainGorevPhotosToRows(supabase, rows) {
  if (!Array.isArray(rows) || !rows.length) return rows

  const chainTaskIds = rows
    .filter((row) => isZincirGorevTuru(row?.gorev_turu) || isSiraliGorevTuru(row?.gorev_turu))
    .map((row) => row?.id)
    .filter(Boolean)

  if (!chainTaskIds.length) return rows

  const { data: stepRows } = await supabase
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, durum, kanit_resim_ler')
    .in('is_id', chainTaskIds)
    .order('adim_no', { ascending: true })

  const stepsByTask = {}
  for (const step of stepRows || []) {
    const tid = String(step?.is_id || '')
    if (!tid) continue
    if (!stepsByTask[tid]) stepsByTask[tid] = []
    stepsByTask[tid].push(step)
  }

  for (const row of rows) {
    if (!isZincirGorevTuru(row?.gorev_turu) && !isSiraliGorevTuru(row?.gorev_turu)) continue
    const existing = extractKanitPhotoUrls(row)
    if (existing.length) continue
    const tid = String(row?.id || '')
    const steps = stepsByTask[tid] || []
    const photos = pickChainGorevStepPhotos(row, steps)
    if (photos.length) {
      row.kanit_resim_ler = photos
    }
  }

  return rows
}

/** Zincir görev satırında kök kanit_videolar boşsa, adım videolarından doldurur. */
export async function attachChainGorevVideosToRows(supabase, rows) {
  if (!Array.isArray(rows) || !rows.length) return rows

  const chainTaskIds = rows
    .filter((row) => isZincirGorevTuru(row?.gorev_turu) || isSiraliGorevTuru(row?.gorev_turu))
    .map((row) => row?.id)
    .filter(Boolean)

  if (!chainTaskIds.length) return rows

  const { data: stepRows } = await supabase
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, durum, kanit_videolar')
    .in('is_id', chainTaskIds)
    .order('adim_no', { ascending: true })

  const stepsByTask = {}
  for (const step of stepRows || []) {
    const tid = String(step?.is_id || '')
    if (!tid) continue
    if (!stepsByTask[tid]) stepsByTask[tid] = []
    stepsByTask[tid].push(step)
  }

  for (const row of rows) {
    if (!isZincirGorevTuru(row?.gorev_turu) && !isSiraliGorevTuru(row?.gorev_turu)) continue
    const existing = extractKanitVideoUrls(row)
    if (existing.length) continue
    const tid = String(row?.id || '')
    const steps = stepsByTask[tid] || []
    const urls = pickChainGorevStepVideos(row, steps)
    if (urls.length) {
      row.kanit_videolar = urls.map((url) => ({ url }))
    }
  }

  return rows
}

async function mergePrivateOzelGorevForManager(supabase, params) {
  const {
    merged,
    personel,
    isSystemAdmin,
    currentCompanyId,
    activeSelect,
    selectWithVisible,
    selectLegacy,
    privateMergeLimit,
  } = params
  if (isSystemAdmin || !personel?.id || !currentCompanyId) return merged
  let next = Array.isArray(merged) ? [...merged] : []
  try {
    let privQ = supabase
      .from('isler')
      .select(activeSelect)
      .eq('ana_sirket_id', currentCompanyId)
      .eq('atayan_personel_id', personel.id)
      .eq('ozel_gorev', true)
      .order('created_at', { ascending: false })
      .limit(privateMergeLimit)
    let { data: privRows, error: privErr } = await privQ
    if (privErr?.code === '42703' && activeSelect === selectWithVisible && selectLegacy) {
      const lr = await supabase
        .from('isler')
        .select(selectLegacy)
        .eq('ana_sirket_id', currentCompanyId)
        .eq('atayan_personel_id', personel.id)
        .eq('ozel_gorev', true)
        .order('created_at', { ascending: false })
        .limit(privateMergeLimit)
      privRows = lr.data
      privErr = lr.error
    }
    if (!privErr && Array.isArray(privRows) && privRows.length) {
      const mergedMap = new Map()
      for (const row of next) mergedMap.set(String(row?.id || ''), row)
      for (const row of privRows) mergedMap.set(String(row?.id || ''), row)
      next = Array.from(mergedMap.values())
    }
  } catch (_) {
    /* ana havuzu koru */
  }
  return next
}

/**
 * Yönetici odak kartı: onay bekleyen ilk iş — İşler kapsamı, günlük created_at kısıtı yok, zincir adım filtresi yok.
 */
export async function fetchManagerFocusApprovalHead(supabase, ctx) {
  const {
    personel,
    isSystemAdmin,
    isTopCompanyScope,
    scanLimit = 120,
    privateMergeLimit = 150,
  } = ctx

  const pendingStatuses = [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED]
  const currentCompanyId = personel?.ana_sirket_id
  const accessibleUnitIds = Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []

  const scope = { isSystemAdmin, currentCompanyId, accessibleUnitIds }
  const selVisible =
    'id, baslik, son_tarih, created_at, durum, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, baslama_tarihi, gorunur_tarih, ana_sirket_id, birim_id, ozel_gorev, atayan_personel_id, sorumlu_personel_id'
  const selLegacy =
    'id, baslik, son_tarih, created_at, durum, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, baslama_tarihi, ana_sirket_id, birim_id, ozel_gorev, atayan_personel_id, sorumlu_personel_id'

  let activeSelect = selVisible
  let tasksPromise = scopeIslerQuery(
    supabase
      .from('isler')
      .select(selVisible)
      .in('durum', pendingStatuses)
      .order('created_at', { ascending: true })
      .limit(scanLimit),
    scope,
  )
  let { data: tasksData, error: tasksErr } = await tasksPromise

  if (tasksErr?.code === '42703') {
    activeSelect = selLegacy
    const legacyRes = await scopeIslerQuery(
      supabase
        .from('isler')
        .select(selLegacy)
        .in('durum', pendingStatuses)
        .order('created_at', { ascending: true })
        .limit(scanLimit),
      scope,
    )
    tasksData = legacyRes?.data || []
    tasksErr = legacyRes?.error
  }

  if (tasksErr) {
    return { data: [], error: tasksErr }
  }

  let merged = Array.isArray(tasksData) ? [...tasksData] : []
  merged = await mergePrivateOzelGorevForManager(supabase, {
    merged,
    personel,
    isSystemAdmin,
    currentCompanyId,
    activeSelect,
    selectWithVisible: selVisible,
    selectLegacy: selLegacy,
    privateMergeLimit,
  })

  const scopeCtx = {
    personel,
    isSystemAdmin,
    currentCompanyId,
    topScope: isTopCompanyScope,
    accessibleUnitIds,
  }

  const inPending = (t) =>
    pendingStatuses.some((s) => normalizeTaskStatus(t?.durum) === s)

  const pool = merged.filter(
    (t) => inPending(t) && taskMatchesManagerTasksListScope(t, scopeCtx),
  )
  pool.sort((a, b) => {
    const ca = String(a?.created_at || '')
    const cb = String(b?.created_at || '')
    return ca.localeCompare(cb)
  })

  const head = pool[0]
  return { data: head ? [head] : [], error: null }
}

/**
 * İşler (ManagerTasks) ile aynı menzil + özel görev birleştirmesi; şerit için üst N kayıt.
 */
export async function fetchManagerLiveFieldAuditTasks(supabase, ctx) {
  const {
    personel,
    isSystemAdmin,
    isTopCompanyScope,
    liveStatuses = LIVE_FIELD_AUDIT_TASK_STATUSES,
    /** Şeritte en fazla 5 kart; güncel havuz için ~200 satır genelde yeter (500 yerine daha hızlı yanıt). */
    candidateLimit = 220,
    privateMergeLimit = 140,
    resultLimit = 5,
  } = ctx

  const currentCompanyId = personel?.ana_sirket_id
  const accessibleUnitIds = Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []

  const scope = { isSystemAdmin, currentCompanyId, accessibleUnitIds }
  const feedSelectWithVisible =
    'id, baslik, durum, updated_at, created_at, kanit_resim_ler, kanit_videolar, checklist_cevaplari, sorumlu_personel_id, aciklama, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, baslama_tarihi, son_tarih, gorunur_tarih, ana_sirket_id, birim_id, ozel_gorev, atayan_personel_id'
  const feedSelectLegacy =
    'id, baslik, durum, updated_at, created_at, kanit_resim_ler, kanit_videolar, checklist_cevaplari, sorumlu_personel_id, aciklama, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, baslama_tarihi, son_tarih, ana_sirket_id, birim_id, ozel_gorev, atayan_personel_id'

  let activeSelect = feedSelectWithVisible
  let tasksPromise = scopeIslerQuery(
    supabase
      .from('isler')
      .select(feedSelectWithVisible)
      .in('durum', liveStatuses)
      .order('updated_at', { ascending: false })
      .limit(candidateLimit),
    scope,
  )
  let { data: tasksData, error: tasksErr } = await tasksPromise

  if (tasksErr?.code === '42703') {
    activeSelect = feedSelectLegacy
    const legacyRes = await scopeIslerQuery(
      supabase
        .from('isler')
        .select(feedSelectLegacy)
        .in('durum', liveStatuses)
        .order('updated_at', { ascending: false })
        .limit(candidateLimit),
      scope,
    )
    tasksData = legacyRes?.data || []
    tasksErr = legacyRes?.error
  }

  if (tasksErr) {
    return { data: [], error: tasksErr }
  }

  let merged = Array.isArray(tasksData) ? [...tasksData] : []
  merged = await mergePrivateOzelGorevForManager(supabase, {
    merged,
    personel,
    isSystemAdmin,
    currentCompanyId,
    activeSelect,
    selectWithVisible: feedSelectWithVisible,
    selectLegacy: feedSelectLegacy,
    privateMergeLimit,
  })

  const scopeCtx = {
    personel,
    isSystemAdmin,
    currentCompanyId,
    topScope: isTopCompanyScope,
    accessibleUnitIds,
  }

  const inLiveStatuses = (t) => liveStatuses.some((s) => normalizeTaskStatus(t?.durum) === s)

  // İşler ekranı zincirlerde filterByOnaySirasi kullanmıyor; şerit de aynı kapsamda kalsın.
  let pool = merged.filter(
    (t) => inLiveStatuses(t) && taskMatchesManagerTasksListScope(t, scopeCtx),
  )
  pool.sort((a, b) => {
    const ua = String(a?.updated_at || a?.created_at || '')
    const ub = String(b?.updated_at || b?.created_at || '')
    return ub.localeCompare(ua)
  })

  return { data: pool.slice(0, resultLimit), error: null }
}
