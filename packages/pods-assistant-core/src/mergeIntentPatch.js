import { normalizeOperasyonelOpts } from './deps/projectTaskOperasyonel.js'
import { matchPersonnelInText, matchTemplateInText, personLabel } from './parseMessage.js'
import { refreshPersonnelAmbiguities, applyPersonnelAmbiguityGuard } from './personnelAmbiguity.js'
import { isGenericInferredBaslik, isModeLabelTitle } from './inferIntentBaslikAciklama.js'
import { isExplicitParallelAssignment, clearZincirIntent } from './parseMessage.js'
import { normalizeConfirmationFlags } from './parseAssistantConfirmations.js'
import { ensureFutureScheduleFlags } from './premiumOrchestratorUtils.js'
import { applyUnitAssignment, isUnitWideAssignment, isTeamWideAssignment } from './unitAssignment.js'
import { buildAssignmentContextText } from './assistantContext.js'

function hasParallelAssignmentSignals(sourceText) {
  return (
    isExplicitParallelAssignment(sourceText) ||
    isUnitWideAssignment(sourceText) ||
    isTeamWideAssignment(sourceText)
  )
}

function normName(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .trim()
}

function resolveName(name, roster) {
  const n = String(name || '').trim()
  if (!n) return null
  const t = normName(n)

  const exact = roster.filter((p) => normName(personLabel(p)) === t)
  if (exact.length === 1) return exact[0]

  const byAd = roster.filter((p) => normName(p.ad) === t)
  if (byAd.length === 1) return byAd[0]
  if (byAd.length > 1) return null

  const hits = matchPersonnelInText(n, roster)
  if (hits.length === 1) return hits[0]
  return null
}

function resolveNames(names, roster) {
  const ids = []
  const labels = []
  for (const n of names || []) {
    const p = resolveName(n, roster)
    if (p) {
      ids.push(String(p.id))
      labels.push(personLabel(p))
    }
  }
  return { ids, labels }
}

function mergeUniqueIds(a, b) {
  const out = [...(a || [])]
  for (const id of b || []) {
    const s = String(id)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function mergeNames(a, b) {
  const out = [...(a || [])]
  for (const n of b || []) {
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

function isEmptyPatchValue(v) {
  if (v == null) return true
  if (typeof v === 'string' && !v.trim()) return true
  if (Array.isArray(v) && !v.length) return true
  if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return true
  return false
}

/**
 * LLM intentPatch (isimlerle) → tam intent nesnesi (id'ler çözülmüş).
 */
export function mergeIntentPatch(baseIntent, patch, context = {}, sourceText = '', contextMessages = []) {
  if (!patch || typeof patch !== 'object') return baseIntent
  const { personnel = [], templates = [] } = context
  const next = {
    ...baseIntent,
    operasyonel: { ...(baseIntent.operasyonel || {}) },
    siraliSteps: [...(baseIntent.siraliSteps || [])],
  }

  const parallelSignals = hasParallelAssignmentSignals(sourceText)

  const activeGap = context?.gaps?.[0] || ''

  if (!isEmptyPatchValue(patch.mode) && !parallelSignals) {
    next.mode = patch.mode
  }
  if (!isEmptyPatchValue(patch.gorevKonusu)) {
    const gk = String(patch.gorevKonusu).trim()
    if (!isGenericInferredBaslik(gk) && !isModeLabelTitle(gk)) {
      if (!next.gorevKonusu) next.gorevKonusu = gk
    }
  }
  if (!isEmptyPatchValue(patch.baslik)) {
    const b = String(patch.baslik).trim()
    if (!isGenericInferredBaslik(b) && !isModeLabelTitle(b)) {
      if (!next.gorevKonusu) next.gorevKonusu = b
      if (!next.baslik || isGenericInferredBaslik(next.baslik) || isModeLabelTitle(next.baslik)) {
        next.baslik = b
      }
    }
  }
  if (!isEmptyPatchValue(patch.aciklama)) next.aciklama = String(patch.aciklama).trim()
  if (!isEmptyPatchValue(patch.gorevDetay)) next.gorevDetay = String(patch.gorevDetay).trim()
  if (next.gorevKonusu && (!next.baslik || isGenericInferredBaslik(next.baslik) || isModeLabelTitle(next.baslik))) {
    next.baslik = next.gorevKonusu
  }
  if (!isEmptyPatchValue(patch.baslangic)) next.baslangic = String(patch.baslangic).slice(0, 10)
  if (!isEmptyPatchValue(patch.bitis)) next.bitis = String(patch.bitis).slice(0, 10)

  if (activeGap === 'tarih_baslangic_saat') {
    if (!isEmptyPatchValue(patch.baslamaSaat)) next.baslamaSaat = String(patch.baslamaSaat).slice(0, 5)
    next.bitisSaat = baseIntent.bitisSaat || ''
  } else if (activeGap === 'tarih_bitis_saat') {
    if (!isEmptyPatchValue(patch.bitisSaat)) next.bitisSaat = String(patch.bitisSaat).slice(0, 5)
  } else {
    if (!isEmptyPatchValue(patch.baslamaSaat)) next.baslamaSaat = String(patch.baslamaSaat).slice(0, 5)
    if (!isEmptyPatchValue(patch.bitisSaat)) next.bitisSaat = String(patch.bitisSaat).slice(0, 5)
  }

  if (patch.scheduleStart != null) next.scheduleStart = !!patch.scheduleStart
  if (patch.cokluAtama != null) next.cokluAtama = !!patch.cokluAtama

  if (patch.operasyonel && typeof patch.operasyonel === 'object') {
    const op = { ...patch.operasyonel }
    if (activeGap !== 'acil') delete op.acil
    if (!['kanit', 'kanit_adet'].includes(activeGap)) {
      delete op.foto_zorunlu
      delete op.video_zorunlu
      delete op.belge_zorunlu
      delete op.min_foto_sayisi
      delete op.min_video_sayisi
      delete op.min_belge_sayisi
    }
    if (Object.keys(op).length) {
      next.operasyonel = normalizeOperasyonelOpts({ ...next.operasyonel, ...op })
    }
  }

  if (patch.sablonName || patch.sablonId) {
    const tpl =
      (patch.sablonId && templates.find((t) => String(t.id) === String(patch.sablonId))) ||
      matchTemplateInText(patch.sablonName || '', templates)
    if (tpl) {
      next.sablonId = String(tpl.id)
      next.sablonName = tpl.baslik || ''
      if (tpl.foto_zorunlu || tpl.video_zorunlu) {
        next.kanitConfirmed = true
        next.kanitAdetConfirmed = true
      }
    }
  }

  if (patch.assigneeNames?.length && !(next.unitId && (next.cokluAtama || parallelSignals || isTeamWideAssignment(sourceText)))) {
    const { ids, labels } = resolveNames(patch.assigneeNames, personnel)
    if (ids.length) {
      next.assigneeIds = mergeUniqueIds(next.assigneeIds, ids)
      next.assigneeNames = mergeNames(next.assigneeNames, labels)
      if (ids.length === 1 && !next.cokluAtama) next.personId = ids[0]
    }
  }

  if (!parallelSignals && patch.zincirGorevNames?.length) {
    const { ids, labels } = resolveNames(patch.zincirGorevNames, personnel)
    next.zincirGorevIds = ids
    next.zincirGorevNames = labels
  }

  if (!parallelSignals && patch.zincirOnayNames?.length) {
    const { ids, labels } = resolveNames(patch.zincirOnayNames, personnel)
    next.zincirOnayIds = ids
    next.zincirOnayNames = labels
  }

  if (!parallelSignals && patch.zincirOnayWorkerName) {
    const w = resolveName(patch.zincirOnayWorkerName, personnel)
    if (w) {
      next.zincirOnayWorkerId = String(w.id)
      next.zincirOnayWorkerName = personLabel(w)
    }
  }

  if (Array.isArray(patch.siraliSteps) && patch.siraliSteps.length) {
    const steps = patch.siraliSteps.map((s, i) => {
      const worker = resolveName(s.workerName || s.personelName, personnel)
      const auditor = resolveName(s.auditorName || s.denetimciName, personnel)
      return {
        personel_id: worker ? String(worker.id) : s.personel_id || '',
        denetimci_personel_id: auditor ? String(auditor.id) : s.denetimci_personel_id || '',
        adim_baslik: s.adim_baslik || s.title || `${next.baslik || 'Adım'} — ${i + 1}`,
        workerName: worker ? personLabel(worker) : s.workerName || '',
        auditorName: auditor ? personLabel(auditor) : s.auditorName || '',
      }
    })
    next.siraliSteps = steps
  }

  if (!next.mode) next.mode = 'normal'

  const rosterText = [
    sourceText,
    ...(patch.assigneeNames || []),
    patch.zincirOnayWorkerName,
    ...(patch.zincirGorevNames || []),
    ...(patch.zincirOnayNames || []),
    ...(patch.siraliSteps || []).flatMap((s) => [s.workerName, s.auditorName]),
  ]
    .filter(Boolean)
    .join(' ')

  if (rosterText.trim()) {
    applyPersonnelAmbiguityGuard(next, rosterText, personnel)
    Object.assign(next, refreshPersonnelAmbiguities(next, rosterText, personnel))
  }

  const assignContextText = buildAssignmentContextText(contextMessages, sourceText, context?.gaps?.[0] || '')

  applyUnitAssignment(next, assignContextText, personnel, context.units || [])

  if (next.unitId && next.assigneeIds?.length) {
    next.personId = next.assigneeIds.length === 1 ? next.assigneeIds[0] : ''
  }

  if (parallelSignals || isExplicitParallelAssignment(sourceText) || isUnitWideAssignment(sourceText) || isTeamWideAssignment(sourceText)) {
    next.parallelAssignmentHint = true
    next.mode = 'normal'
    next.cokluAtama = true
    next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: true }
    clearZincirIntent(next)
    next.siraliSteps = []
  }

  next.tarihConfirmed = false
  next.acilConfirmed = false
  next.kanitConfirmed = false
  next.kanitAdetConfirmed = false

  return ensureFutureScheduleFlags(normalizeConfirmationFlags(next))
}
