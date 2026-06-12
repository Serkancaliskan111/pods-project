import { createEmptyIntent } from './orchestrator.js'
import { normalizeOperasyonelOpts } from './deps/projectTaskOperasyonel.js'
import { applySeedConfirmations } from './applySeedConfirmations.js'

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

function nameById(roster, id) {
  const p = roster.find((r) => String(r.id) === String(id))
  return p ? `${p.ad || ''} ${p.soyad || ''}`.trim() : ''
}

/** Route / URL prefill → assistant intent */
export function seedParamsToIntent(params = {}, roster = [], templates = []) {
  const intent = createEmptyIntent()
  if (!params || typeof params !== 'object') return intent

  if (params.projeId || params.projectId) intent.projeId = String(params.projeId || params.projectId)
  if (params.projeGorevId) intent.projeGorevId = String(params.projeGorevId)
  if (params.company) intent.company = String(params.company)
  if (params.unitId) intent.unitId = String(params.unitId)

  if (params.mode) intent.mode = params.mode
  if (params.baslik) intent.baslik = params.baslik
  if (params.aciklama) intent.aciklama = params.aciklama
  if (params.baslangic) intent.baslangic = String(params.baslangic).slice(0, 10)
  if (params.bitis) intent.bitis = String(params.bitis).slice(0, 10)
  if (params.sablonId) {
    intent.sablonId = String(params.sablonId)
    const tpl = templates.find((t) => String(t.id) === String(params.sablonId))
    if (tpl?.baslik) intent.sablonName = tpl.baslik
  }

  if (params.personId) {
    intent.personId = String(params.personId)
    intent.assigneeIds = [String(params.personId)]
    intent.assigneeNames = [nameById(roster, params.personId)].filter(Boolean)
    if (params.mode === 'zincir_onay') {
      intent.zincirOnayWorkerId = String(params.personId)
      intent.zincirOnayWorkerName = nameById(roster, params.personId)
      intent.assigneeIds = []
      intent.assigneeNames = []
    }
  }

  if (params.assignees) {
    const ids = String(params.assignees).split(',').map((x) => x.trim()).filter(Boolean)
    intent.assigneeIds = ids
    intent.assigneeNames = ids.map((id) => nameById(roster, id)).filter(Boolean)
    if (params.cokluAtama === '1' || ids.length > 1) intent.cokluAtama = true
  }

  if (params.zincirGorev) {
    const ids = String(params.zincirGorev).split(',').map((x) => x.trim()).filter(Boolean)
    intent.zincirGorevIds = ids
    intent.zincirGorevNames = ids.map((id) => nameById(roster, id)).filter(Boolean)
  }

  if (params.zincirOnay) {
    const ids = String(params.zincirOnay).split(',').map((x) => x.trim()).filter(Boolean)
    intent.zincirOnayIds = ids
    intent.zincirOnayNames = ids.map((id) => nameById(roster, id)).filter(Boolean)
  }

  const sirali = decodeB64Json(params.sirali)
  if (Array.isArray(sirali)) {
    intent.siraliSteps = sirali.map((s, i) => ({
      personel_id: s.personel_id ? String(s.personel_id) : '',
      denetimci_personel_id: s.denetimci_personel_id ? String(s.denetimci_personel_id) : '',
      adim_baslik: s.adim_baslik || `Adım ${i + 1}`,
      workerName: nameById(roster, s.personel_id),
      auditorName: nameById(roster, s.denetimci_personel_id),
    }))
  }

  const opB64 = decodeB64Json(params.operasyonel)
  if (opB64) {
    intent.operasyonel = normalizeOperasyonelOpts(opB64)
  } else {
    const partial = {}
    if (params.acil === '1') partial.acil = true
    if (params.aciklamaZorunlu === '1') partial.aciklama_zorunlu = true
    if (params.fotoZorunlu === '1') {
      partial.foto_zorunlu = true
      partial.min_foto_sayisi = Number(params.minFoto) || 1
    }
    if (params.videoZorunlu === '1') {
      partial.video_zorunlu = true
      partial.min_video_sayisi = Number(params.minVideo) || 1
      partial.max_video_suresi_sn = Number(params.maxVideoSn) || 60
    }
    if (params.ozelGorev === '1') partial.ozel_gorev = true
    if (params.bireysel === '0') partial.bireysel = false
    if (params.cokluAtama === '1') partial.coklu_atama = true
    if (params.puan) partial.puan = Number(params.puan) || 0
    if (Object.keys(partial).length) intent.operasyonel = normalizeOperasyonelOpts(partial)
  }

  if (params.cokluAtama === '1') intent.cokluAtama = true

  if (!intent.mode) intent.mode = 'normal'
  return applySeedConfirmations(intent)
}
