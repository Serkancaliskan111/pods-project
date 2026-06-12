import { GOREV_MODU_OPTIONS } from './deps/gorevModuOptions.js'
import { MODE_INFERENCE_HINTS } from './podsAiSystemKnowledge.js'
import { matchTemplateInText, clearZincirIntent, inferModeFromText, isExplicitSequentialChain } from './parseMessage.js'

const CHAIN_MODES = new Set(['zincir_gorev', 'zincir_onay', 'zincir_gorev_ve_onay'])

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function hintScore(mode, text) {
  const t = norm(text)
  const hints = MODE_INFERENCE_HINTS[mode] || []
  let score = 0
  for (const h of hints) {
    const token = norm(h)
    if (token.length > 3 && t.includes(token)) score += 12
  }
  return score
}

function collectSignalText(intent) {
  return [
    intent.gorevKonusu,
    intent.baslik,
    intent.aciklama,
    intent.gorevDetay,
    intent.sablonName,
  ]
    .filter(Boolean)
    .join(' ')
}

function scoreTaskMode(mode, intent, context = {}) {
  let score = 0
  const signalText = collectSignalText(intent)
  const templates = context.templates || []

  score += hintScore(mode, signalText)

  if (mode === 'normal') {
    score += 8
    if (intent.cokluAtama || intent.parallelAssignmentHint || intent.unitId) score += 45
    if (intent.assigneeIds?.length && !intent.zincirGorevIds?.length) score += 20
    if (intent.assigneeIds?.length === 1 && !intent.cokluAtama) score += 10
  }

  if (mode === 'sablon_gorev') {
    if (intent.sablonId) score += 90
    const tpl = intent.sablonId
      ? templates.find((t) => String(t.id) === String(intent.sablonId))
      : matchTemplateInText(signalText, templates)
    if (tpl) score += 35
    if (/\bchecklist\b|\bkontrol\s+listesi\b|\bşablon\b|\bsablon\b/.test(norm(signalText))) score += 25
  }

  if (mode === 'zincir_gorev') {
    if (intent.zincirGorevIds?.length >= 2) score += 85
    else if (intent.zincirGorevIds?.length === 1) score += 25
    if (/\b(sirasyla|sirasiyla|sirayla|sira ile)\b/.test(norm(collectSignalText(intent)))) score += 80
    if (intent.parallelAssignmentHint || intent.cokluAtama) score -= 120
  }

  if (mode === 'zincir_onay') {
    if (intent.zincirOnayIds?.length >= 2) score += 85
    if (intent.zincirOnayWorkerId) score += 30
    if (intent.parallelAssignmentHint || intent.cokluAtama) score -= 80
  }

  if (mode === 'zincir_gorev_ve_onay') {
    if (intent.zincirGorevIds?.length && intent.zincirOnayIds?.length) score += 90
    if (intent.parallelAssignmentHint) score -= 100
  }

  if (mode === 'sirali_gorev') {
    const steps = intent.siraliSteps || []
    if (steps.length >= 2) score += 90
    else if (steps.length === 1) score += 40
    if (/\bdenetimci\b|\bdenetlesin\b|\bsirali\b|\bsıralı\b/.test(norm(signalText))) score += 30
  }

  if (intent.mode === mode) score += 15

  return score
}

function pickBestMode(intent, context) {
  let best = 'normal'
  let bestScore = -Infinity
  for (const opt of GOREV_MODU_OPTIONS) {
    const s = scoreTaskMode(opt.value, intent, context)
    if (s > bestScore) {
      bestScore = s
      best = opt.value
    }
  }
  return { mode: best, score: bestScore }
}

function applyModeStructure(next, context = {}) {
  const mode = next.mode || 'normal'
  const templates = context.templates || []

  if (mode === 'sablon_gorev' && !next.sablonId) {
    const tpl = matchTemplateInText(collectSignalText(next), templates)
    if (tpl) {
      next.sablonId = String(tpl.id)
      next.sablonName = tpl.baslik || ''
    } else if (!next.sablonId) {
      next.mode = 'normal'
    }
  }

  if (!CHAIN_MODES.has(mode)) {
    if (next.zincirGorevIds?.length || next.zincirOnayIds?.length) {
      if (mode === 'normal' && next.cokluAtama) {
        clearZincirIntent(next)
      }
    }
  }

  if (mode === 'normal' || mode === 'sablon_gorev') {
    if (next.parallelAssignmentHint || next.cokluAtama) {
      clearZincirIntent(next)
    } else if (next.unitId && !next.zincirGorevIds?.length) {
      clearZincirIntent(next)
    }
  }

  return next
}

/**
 * Niyet + sistem modları karşılaştırması → en uygun görev türü.
 * Yapısal veri (zincir adımları, şablon id) ve paralel atama sinyalleri önceliklidir.
 */
export function resolveTaskModeFromIntent(intent, context = {}, { sourceText = '' } = {}) {
  if (!intent) return intent
  const next = { ...intent }

  if ((next.parallelAssignmentHint || next.cokluAtama) && CHAIN_MODES.has(next.mode)) {
    next.mode = 'normal'
    clearZincirIntent(next)
  }

  if (sourceText && isExplicitSequentialChain(sourceText)) {
    next.mode = 'zincir_gorev'
    next.modeExplicit = true
    return applyModeStructure(next, context)
  }

  if (next.siraliSteps?.length >= 2) {
    next.mode = 'sirali_gorev'
    return applyModeStructure(next, context)
  }

  if (next.zincirGorevIds?.length >= 2 && next.zincirOnayIds?.length >= 2) {
    next.mode = 'zincir_gorev_ve_onay'
    return applyModeStructure(next, context)
  }

  if (next.zincirGorevIds?.length >= 2 && !next.parallelAssignmentHint) {
    next.mode = 'zincir_gorev'
    next.modeExplicit = false
    return applyModeStructure(next, context)
  }

  if (next.zincirOnayIds?.length >= 2 && next.zincirOnayWorkerId) {
    next.mode = 'zincir_onay'
    return applyModeStructure(next, context)
  }

  if (next.sablonId) {
    next.mode = 'sablon_gorev'
    return applyModeStructure(next, context)
  }

  const explicitFromText = sourceText ? inferModeFromText(sourceText, '') : ''
  const hasExplicitMode =
    next.modeExplicit ||
    (explicitFromText &&
      explicitFromText !== 'normal' &&
      /\b(zincir|şablon|sablon|sirali|sıralı|checklist|sirasyla|sırasıyla|sirayla|sırayla)\b/i.test(sourceText))

  if (hasExplicitMode && explicitFromText && explicitFromText !== 'normal') {
    next.mode = explicitFromText
    next.modeExplicit = true
    return applyModeStructure(next, context)
  }

  const { mode, score } = pickBestMode(next, context)
  if (!next.mode || next.mode === 'normal' || score >= 35) {
    next.mode = mode
  }

  return applyModeStructure(next, context)
}
