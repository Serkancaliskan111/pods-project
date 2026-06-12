import { GOREV_MODU_OPTIONS } from './gorevModuOptions.js'
import { normalizeOperasyonelOpts } from './projectTaskOperasyonel.js'

function mergeDateAndTime(datePart, timePart = '09:00') {
  const d = String(datePart || '').slice(0, 10)
  if (!d) return ''
  const t = String(timePart || '09:00').slice(0, 5)
  return `${d}T${t}:00`
}

function decodeB64Json(value) {
  if (!value) return null
  try {
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(escape(atob(String(value))))
        : String(value)
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * ExtraTask route.params → state patch (web New.jsx searchParams parity).
 */
export function buildExtraTaskPrefillPatch(params = {}, { isSystemAdmin = false } = {}) {
  if (!params || typeof params !== 'object') return null
  const hasAny =
    params.projeId ||
    params.projectId ||
    params.personId ||
    params.mode ||
    params.baslik ||
    params.baslangic ||
    params.bitis ||
    params.sablonId ||
    params.assignees ||
    params.zincirGorev ||
    params.zincirOnay ||
    params.sirali ||
    params.operasyonel
  if (!hasAny) return null

  const patch = {}

  if (params.personId) patch.personelId = String(params.personId)
  if (params.company && isSystemAdmin) patch.companyId = String(params.company)
  else if (params.company) patch.companyId = String(params.company)
  if (params.unitId) patch.unitId = String(params.unitId)

  if (params.mode && GOREV_MODU_OPTIONS.some((o) => o.value === params.mode)) {
    patch.gorevModu = params.mode
    patch.currentStep = 2
  }

  if (params.baslik) patch.baslik = params.baslik
  if (params.sablonId) patch.sablonId = String(params.sablonId)
  if (params.aciklama) patch.aciklama = params.aciklama

  if (params.baslangic) {
    patch.baslamaTarihi = params.baslangic.includes('T')
      ? params.baslangic
      : mergeDateAndTime(params.baslangic, '09:00')
  }
  if (params.bitis) {
    patch.sonTarih = params.bitis.includes('T')
      ? params.bitis
      : mergeDateAndTime(params.bitis, '18:00')
  }

  if (params.assignees) {
    const ids = String(params.assignees)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    if (ids.length) {
      patch.selectedAssigneeIds = ids
      patch.manualSelectedAssigneeIds = ids
      patch.cokluAtama = params.cokluAtama === '1' || params.cokluAtama === true || ids.length > 1
      patch.personelId = ids[0]
      patch.assignmentTarget = 'personeller'
    }
  }

  if (params.zincirGorev) {
    patch.zincirGorevSira = String(params.zincirGorev)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  }
  if (params.zincirOnay) {
    patch.zincirOnaySira = String(params.zincirOnay)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  }

  const siraliSteps = decodeB64Json(params.sirali)
  if (Array.isArray(siraliSteps) && siraliSteps.length) {
    patch.siraliAdimlar = siraliSteps
  }

  const opRaw = decodeB64Json(params.operasyonel)
  if (opRaw) {
    patch.operasyonelOpts = normalizeOperasyonelOpts(opRaw)
  } else {
    const opPartial = {}
    if (params.acil === '1' || params.acil === true) opPartial.acil = true
    if (params.aciklamaZorunlu === '1') opPartial.aciklama_zorunlu = true
    if (params.fotoZorunlu === '1') {
      opPartial.foto_zorunlu = true
      opPartial.min_foto_sayisi = Math.min(5, Math.max(1, Number(params.minFoto) || 1))
    }
    if (params.videoZorunlu === '1') {
      opPartial.video_zorunlu = true
      opPartial.min_video_sayisi = Math.min(3, Math.max(1, Number(params.minVideo) || 1))
      opPartial.max_video_suresi_sn = Math.min(60, Math.max(5, Number(params.maxVideoSn) || 60))
    }
    if (params.belgeZorunlu === '1') {
      opPartial.belge_zorunlu = true
      opPartial.min_belge_sayisi = Math.min(5, Math.max(1, Number(params.minBelge) || 1))
    }
    if (params.ozelGorev === '1') opPartial.ozel_gorev = true
    if (params.bireysel === '0') opPartial.bireysel = false
    if (params.cokluAtama === '1') opPartial.coklu_atama = true
    if (params.puan) opPartial.puan = Number(params.puan) || 0
    if (Object.keys(opPartial).length) {
      patch.operasyonelOpts = normalizeOperasyonelOpts(opPartial)
    }
  }

  if (params.projeGorevId) patch.projeGorevId = String(params.projeGorevId)

  return patch
}
