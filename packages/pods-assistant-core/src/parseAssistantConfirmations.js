import {
  parseScheduleFromText,
  parseOperationalFlags,
  isExplicitParallelAssignment,
  clearZincirIntent,
} from './parseMessage.js'
import { isOpenEndedSchedule, mergeScheduleDatesWithIntent, validateScheduleIntent, isTarihFullyConfirmed } from './scheduleIntentUtils.js'

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasExplicitCount(text) {
  return /\b\d+\s*(foto|belge|video|adet|tane)?\b/i.test(String(text || '')) || /\b(bir|iki|üç|uc|dört|dort|beş|bes)\s*(foto|belge|video|adet|tane)\b/i.test(
    String(text || ''),
  )
}

const WORD_NUM = { bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5 }

function parseCountFromText(text) {
  const t = norm(text)
  const m = t.match(/\b(\d+)\s*(?:adet|tane|foto|belge|video)?\b/)
  if (m) return Math.min(5, Math.max(1, Number(m[1])))
  const w = t.match(/\b(bir|iki|üç|uc|dört|dort|beş|bes)\s*(?:adet|tane|foto|belge|video)?\b/)
  if (w) return WORD_NUM[w[1]] || 1
  if (/^\d+$/.test(t)) return Math.min(5, Math.max(1, Number(t)))
  return null
}

function mergeScheduleWithIntent(schedule, intent = {}) {
  const { baslangic, bitis } = mergeScheduleDatesWithIntent(schedule, intent)
  return {
    baslangic,
    bitis,
    baslamaSaat: schedule.baslamaSaat || intent.baslamaSaat || '',
    bitisSaat: schedule.bitisSaat || intent.bitisSaat || '',
    scheduleStart: schedule.scheduleStart ?? intent.scheduleStart,
    relativeDeadline: schedule.relativeDeadline ?? intent.relativeDeadline,
  }
}

function timeRoleForGap(expectedGap = '') {
  if (expectedGap === 'tarih_baslangic_saat') return 'start'
  if (expectedGap === 'tarih_bitis_saat') return 'end'
  return 'auto'
}

/** Tarih / saat — başlangıç + bitiş saati zorunlu; tutarsızlıkta yeniden sor */
export function parseScheduleConfirmation(text, intent = {}, { expectedGap = '' } = {}) {
  const t = norm(text)
  const schedule = parseScheduleFromText(text, { timeRole: timeRoleForGap(expectedGap) })

  if (schedule.immediate) {
    return { tarihConfirmed: true, baslangic: '', bitis: '', baslamaSaat: '', bitisSaat: '', scheduleStart: false, relativeDeadline: false }
  }

  if (/\b(tarih fark etmez|deadline yok|süre sınırı yok)\b/.test(t)) {
    return { tarihConfirmed: true, baslangic: '', bitis: '', baslamaSaat: '', bitisSaat: '', relativeDeadline: false }
  }

  if (/\b(hemen|şimdi|simdi)\b/.test(t) && !/\b(kadar|bitis|bitiş)\b/.test(t)) {
    return { tarihConfirmed: true, baslangic: '', bitis: '', baslamaSaat: '', bitisSaat: '', relativeDeadline: false }
  }

  const hasDateInMsg = !!(schedule.baslangic || schedule.bitis)
  const hasClockInMsg = !!(schedule.baslamaSaat || schedule.bitisSaat)
  const existingDate = intent.baslangic || intent.bitis

  if (!hasDateInMsg && !hasClockInMsg) return null

  const merged = mergeScheduleWithIntent(schedule, intent)
  const draft = { ...intent, ...merged }
  const validation = validateScheduleIntent(draft)

  if (validation.valid) {
    return { tarihConfirmed: true, ...merged }
  }

  if (hasDateInMsg || hasClockInMsg) {
    return { ...merged, scheduleValidationIssue: validation.issue || null }
  }

  return null
}

/** Acil mi — yalnızca açık yanıt */
export function parseAcilConfirmation(text) {
  const t = norm(text)
  if (/\bacil\b|\böncelikli\b|\boncelikli\b|\bivedi\b/.test(t) && !/\b(değil|degil|hayır|hayir)\b/.test(t)) {
    return { acilConfirmed: true, operasyonel: { acil: true } }
  }
  if (
    /\b(acil değil|acil degil|normal öncelik|normal oncelik|öncelikli değil|hayır acil|hayir acil)\b/.test(t) ||
    /^(hayır|hayir|normal|değil|degil)$/i.test(String(text || '').trim()) ||
    (/\bnormal\b/.test(t) && !/\bacil\b/.test(t) && String(text || '').trim().length <= 48)
  ) {
    return { acilConfirmed: true, operasyonel: { acil: false } }
  }
  return null
}

/** Kanıt türü — adet ayrı sorulur */
export function parseKanitConfirmation(text, { allowHayir = false } = {}) {
  const t = norm(text)
  const withCount = hasExplicitCount(text)

  if (
    allowHayir &&
    /^(hayır|hayir|yok|hayir)$/i.test(String(text || '').trim())
  ) {
    return {
      kanitConfirmed: true,
      kanitAdetConfirmed: true,
      operasyonel: {
        foto_zorunlu: false,
        video_zorunlu: false,
        belge_zorunlu: false,
      },
    }
  }

  if (
    /\b(kanıt yok|kanit yok|hiçbiri|hicbiri|gerek yok|gerekmez|kanıtsız|kanitsiz)\b/.test(t) &&
    !/\b(foto|video|belge)\b/.test(t)
  ) {
    return {
      kanitConfirmed: true,
      kanitAdetConfirmed: true,
      operasyonel: {
        foto_zorunlu: false,
        video_zorunlu: false,
        belge_zorunlu: false,
        min_foto_sayisi: 0,
        min_video_sayisi: 0,
        min_belge_sayisi: 0,
      },
    }
  }

  if (/\b(foto|fotoğraf|fotograf|video|belge|pdf|doküman|dokuman)\b/.test(t)) {
    const op = parseOperationalFlags(text)
    const operasyonel = {
      foto_zorunlu: !!op.foto_zorunlu,
      video_zorunlu: !!op.video_zorunlu,
      belge_zorunlu: !!op.belge_zorunlu,
    }
    if (!operasyonel.foto_zorunlu && !operasyonel.video_zorunlu && !operasyonel.belge_zorunlu) {
      if (/\bfoto/.test(t)) operasyonel.foto_zorunlu = true
      if (/\bvideo/.test(t)) operasyonel.video_zorunlu = true
      if (/\bbelge|pdf|dokuman|doküman/.test(t)) operasyonel.belge_zorunlu = true
    }
    const adet = withCount ? buildKanitAdetFromText(text, operasyonel) : null
    return {
      kanitConfirmed: true,
      kanitAdetConfirmed: !!adet,
      operasyonel: adet ? { ...operasyonel, ...adet } : operasyonel,
    }
  }

  if (/^(foto|video|belge)$/i.test(String(text || '').trim())) {
    const key = t
    const operasyonel = {
      foto_zorunlu: key === 'foto',
      video_zorunlu: key === 'video',
      belge_zorunlu: key === 'belge',
    }
    return { kanitConfirmed: true, kanitAdetConfirmed: false, operasyonel }
  }

  return null
}

function buildKanitAdetFromText(text, operasyonel) {
  const n = parseCountFromText(text)
  if (!n) return null
  const out = {}
  if (operasyonel.foto_zorunlu) out.min_foto_sayisi = Math.min(5, n)
  if (operasyonel.video_zorunlu) out.min_video_sayisi = Math.min(3, n)
  if (operasyonel.belge_zorunlu) out.min_belge_sayisi = Math.min(5, n)
  return Object.keys(out).length ? out : null
}

/** Kaç adet kanıt? */
export function parseKanitAdetConfirmation(text, intent = {}) {
  const n = parseCountFromText(text)
  if (!n) return null
  const op = intent.operasyonel || {}
  const operasyonel = {}
  if (op.foto_zorunlu) operasyonel.min_foto_sayisi = Math.min(5, n)
  if (op.video_zorunlu) operasyonel.min_video_sayisi = Math.min(3, n)
  if (op.belge_zorunlu) operasyonel.min_belge_sayisi = Math.min(5, n)
  if (!Object.keys(operasyonel).length) return null
  return { kanitAdetConfirmed: true, operasyonel }
}

/** Kullanıcı mesajından onay bayraklarını intent'e uygula */
export function applyAssistantConfirmations(next, text, { expectedGap = '' } = {}) {
  if (
    isExplicitParallelAssignment(text) ||
    (expectedGap === 'zincir_gorev' &&
      /\b(sira yok|sıra yok|sirasiz|sırasız|aynı anda|ayni anda|paralel|hepsi|herkese)\b/i.test(
        String(text || ''),
      ))
  ) {
    next.parallelAssignmentHint = true
    next.mode = 'normal'
    next.cokluAtama = true
    next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: true }
    clearZincirIntent(next)
  }

  const schedule = parseScheduleConfirmation(text, next, { expectedGap })
  if (schedule) {
    if (schedule.tarihConfirmed) next.tarihConfirmed = true
    if (schedule.baslangic != null && schedule.baslangic !== undefined) {
      next.baslangic = schedule.baslangic
    }
    if (schedule.bitis != null && schedule.bitis !== undefined) {
      next.bitis = schedule.bitis
    }
    if (schedule.baslamaSaat != null) next.baslamaSaat = schedule.baslamaSaat
    if (schedule.bitisSaat != null) next.bitisSaat = schedule.bitisSaat
    if (schedule.scheduleStart != null) next.scheduleStart = !!schedule.scheduleStart
    if (schedule.relativeDeadline != null) next.relativeDeadline = !!schedule.relativeDeadline
    if (schedule.scheduleValidationIssue) next.scheduleValidationIssue = schedule.scheduleValidationIssue
    else if (isTarihFullyConfirmed(next)) delete next.scheduleValidationIssue
  }

  const acil = parseAcilConfirmation(text)
  if (acil) {
    next.acilConfirmed = true
    next.operasyonel = { ...next.operasyonel, ...acil.operasyonel }
  }

  const kanit = parseKanitConfirmation(text, { allowHayir: expectedGap === 'kanit' })
  if (kanit) {
    next.kanitConfirmed = true
    next.operasyonel = { ...next.operasyonel, ...kanit.operasyonel }
    if (kanit.kanitAdetConfirmed) next.kanitAdetConfirmed = true
  }

  const adet = parseKanitAdetConfirmation(text, next)
  if (adet) {
    next.kanitAdetConfirmed = true
    next.operasyonel = { ...next.operasyonel, ...adet.operasyonel }
  }

  return next
}

/** LLM / operasyonel alanlardan onay bayraklarını senkronize et */
export function normalizeConfirmationFlags(intent) {
  if (!intent) return intent
  const next = { ...intent, operasyonel: { ...(intent.operasyonel || {}) } }
  const op = next.operasyonel

  if (isOpenEndedSchedule(next)) return next
  if (isTarihFullyConfirmed(next)) {
    next.tarihConfirmed = true
  }

  if (typeof op.acil === 'boolean') {
    next.acilConfirmed = true
  }

  if (op.foto_zorunlu || op.video_zorunlu || op.belge_zorunlu) {
    next.kanitConfirmed = true
    if (op.min_foto_sayisi || op.min_video_sayisi || op.min_belge_sayisi) {
      next.kanitAdetConfirmed = true
    }
  }

  if (
    op.foto_zorunlu === false &&
    op.video_zorunlu === false &&
    op.belge_zorunlu === false &&
    next.kanitConfirmed
  ) {
    next.kanitAdetConfirmed = true
  }

  return next
}

/** Tarih / acil / kanıt gap'ine verilen kısa yanıt mı? — kural motoru tercih edilir */
export function isOperationalGapReply(text, gap = '') {
  const trimmed = String(text || '').trim()
  if (!trimmed || !gap) return false
  if (!['tarih', 'tarih_baslangic_saat', 'tarih_bitis_saat', 'tarih_saat', 'acil', 'kanit', 'kanit_adet'].includes(gap)) return false
  if (parseScheduleConfirmation(text, {}, { expectedGap: gap })) return true
  if (parseAcilConfirmation(text)) return true
  if (parseKanitConfirmation(text, { allowHayir: gap === 'kanit' })) return true
  if (parseKanitAdetConfirmation(text, {})) return true
  if (gap === 'kanit_adet' && /^\d+$/.test(trimmed)) return true
  if (trimmed.length <= 32) return true
  return false
}
