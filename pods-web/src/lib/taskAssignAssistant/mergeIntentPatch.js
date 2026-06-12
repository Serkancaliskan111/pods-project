import { normalizeOperasyonelOpts } from '../projectTaskOperasyonel.js'
import { matchPersonnelInText, matchTemplateInText, personLabel } from './parseMessage'

function resolveName(name, roster) {
  if (!name) return null
  const hits = matchPersonnelInText(String(name), roster)
  return hits[0] || null
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

/**
 * LLM intentPatch (isimlerle) → tam intent nesnesi (id'ler çözülmüş).
 */
export function mergeIntentPatch(baseIntent, patch, context = {}) {
  if (!patch || typeof patch !== 'object') return baseIntent
  const { personnel = [], templates = [] } = context
  const next = {
    ...baseIntent,
    operasyonel: { ...(baseIntent.operasyonel || {}) },
    siraliSteps: [...(baseIntent.siraliSteps || [])],
  }

  if (patch.mode) next.mode = patch.mode
  if (patch.baslik) next.baslik = String(patch.baslik).trim()
  if (patch.aciklama) next.aciklama = String(patch.aciklama).trim()
  if (patch.baslangic) next.baslangic = String(patch.baslangic).slice(0, 10)
  if (patch.bitis) next.bitis = String(patch.bitis).slice(0, 10)
  if (patch.cokluAtama != null) next.cokluAtama = !!patch.cokluAtama

  if (patch.operasyonel && typeof patch.operasyonel === 'object') {
    next.operasyonel = normalizeOperasyonelOpts({ ...next.operasyonel, ...patch.operasyonel })
  }

  if (patch.sablonName || patch.sablonId) {
    const tpl =
      (patch.sablonId && templates.find((t) => String(t.id) === String(patch.sablonId))) ||
      matchTemplateInText(patch.sablonName || '', templates)
    if (tpl) {
      next.sablonId = String(tpl.id)
      next.sablonName = tpl.baslik || ''
    }
  }

  if (patch.assigneeNames?.length) {
    const { ids, labels } = resolveNames(patch.assigneeNames, personnel)
    if (ids.length) {
      next.assigneeIds = mergeUniqueIds(next.assigneeIds, ids)
      next.assigneeNames = mergeNames(next.assigneeNames, labels)
      if (ids.length === 1 && !next.cokluAtama) next.personId = ids[0]
    }
  }

  if (patch.zincirGorevNames?.length) {
    const { ids, labels } = resolveNames(patch.zincirGorevNames, personnel)
    next.zincirGorevIds = ids
    next.zincirGorevNames = labels
  }

  if (patch.zincirOnayNames?.length) {
    const { ids, labels } = resolveNames(patch.zincirOnayNames, personnel)
    next.zincirOnayIds = ids
    next.zincirOnayNames = labels
  }

  if (patch.zincirOnayWorkerName) {
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
  return next
}
