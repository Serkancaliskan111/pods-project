import { normalizeOperasyonelOpts } from './deps/projectTaskOperasyonel.js'
import { buildSiraliPayload } from './buildSiraliPayload.js'

function b64Json(obj) {
  const json = JSON.stringify(obj)
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(json)))
  }
  return json
}

/**
 * Seed (proje, route) + asistan intent → ExtraTask / New.jsx tam parametre seti.
 */
export function buildAssistantRouteParams(intent, seed = {}, { canAssignTask = true } = {}) {
  const params = { ...(seed || {}) }
  if (!intent) return params

  const mode = intent.mode || 'normal'
  if (canAssignTask) params.mode = mode

  if (intent.baslik) params.baslik = intent.baslik
  if (intent.aciklama) params.aciklama = intent.aciklama
  if (intent.baslangic) params.baslangic = intent.baslangic
  if (intent.bitis) params.bitis = intent.bitis

  if (intent.sablonId) params.sablonId = String(intent.sablonId)

  const op = normalizeOperasyonelOpts(intent.operasyonel || {})
  if (Object.keys(intent.operasyonel || {}).length) {
    params.operasyonel = b64Json(op)
  }
  if (op.acil) params.acil = '1'
  if (op.aciklama_zorunlu) params.aciklamaZorunlu = '1'
  if (op.foto_zorunlu) {
    params.fotoZorunlu = '1'
    params.minFoto = String(op.min_foto_sayisi)
  }
  if (op.video_zorunlu) {
    params.videoZorunlu = '1'
    params.minVideo = String(op.min_video_sayisi)
    params.maxVideoSn = String(op.max_video_suresi_sn)
  }
  if (op.belge_zorunlu) {
    params.belgeZorunlu = '1'
    params.minBelge = String(op.min_belge_sayisi)
  }
  if (op.ozel_gorev) params.ozelGorev = '1'
  if (op.bireysel === false) params.bireysel = '0'
  if (op.coklu_atama) params.cokluAtama = '1'
  if (op.puan > 0) params.puan = String(op.puan)

  if (mode === 'zincir_gorev' || mode === 'zincir_gorev_ve_onay') {
    if (intent.zincirGorevIds?.length) params.zincirGorev = intent.zincirGorevIds.join(',')
  }

  if (mode === 'zincir_onay' || mode === 'zincir_gorev_ve_onay') {
    if (intent.zincirOnayIds?.length) params.zincirOnay = intent.zincirOnayIds.join(',')
    if (intent.zincirOnayWorkerId) params.personId = String(intent.zincirOnayWorkerId)
  }

  if (mode === 'sirali_gorev') {
    const payload = buildSiraliPayload(intent)
    if (payload.length) params.sirali = b64Json(payload)
  } else {
    const ids = intent.assigneeIds?.length
      ? intent.assigneeIds
      : intent.personId
        ? [String(intent.personId)]
        : []
    if (ids.length > 1 || intent.cokluAtama) {
      params.assignees = ids.join(',')
      params.cokluAtama = '1'
    } else if (ids.length === 1) {
      params.personId = ids[0]
    }
  }

  if (intent.projeId) params.projeId = String(intent.projeId)
  if (intent.projeGorevId) params.projeGorevId = String(intent.projeGorevId)
  if (intent.company) params.company = String(intent.company)
  if (intent.unitId) params.unitId = String(intent.unitId)

  params.assistantPrefill = '1'
  return params
}

/** @deprecated use buildAssistantRouteParams */
export function intentToPrefillParams(intent, options) {
  return buildAssistantRouteParams(intent, {}, options)
}
