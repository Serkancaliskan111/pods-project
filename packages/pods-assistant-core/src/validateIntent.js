/**
 * Asistan hazır mı? — atama + tarih/acil/kanıt onayları + isim belirsizliği
 */
import { enrichIntentBaslikAciklama, displayTaskTitle } from './inferIntentBaslikAciklama.js'
import { formatAmbiguityQuestion } from './personnelAmbiguity.js'
import { clearZincirIntent } from './parseMessage.js'
import { resolveTaskModeFromIntent } from './resolveTaskModeFromIntent.js'
import { normalizeConfirmationFlags } from './parseAssistantConfirmations.js'
import {
  isTarihFullyConfirmed,
  formatScheduleDateLabel,
  scheduleCollectGap,
  validateScheduleIntent,
} from './scheduleIntentUtils.js'

function coerceParallelIntent(intent) {
  if (!intent) return intent
  const zincirModes = ['zincir_gorev', 'zincir_onay', 'zincir_gorev_ve_onay']
  if (!zincirModes.includes(intent.mode)) return intent
  if (intent.zincirGorevIds?.length >= 2) return intent

  const parallel =
    intent.parallelAssignmentHint ||
    intent.cokluAtama ||
    (intent.assigneeIds?.length > 1) ||
    intent.operasyonel?.coklu_atama

  if (!parallel) return intent

  const next = { ...intent, mode: 'normal' }
  clearZincirIntent(next)
  return next
}

function isTarihConfirmed(intent) {
  return isTarihFullyConfirmed(intent)
}

function isAcilConfirmed(intent) {
  if (intent?.acilConfirmed) return true
  return typeof intent?.operasyonel?.acil === 'boolean'
}

function isKanitConfirmed(intent, context = {}) {
  if (intent?.kanitConfirmed) return true

  const op = intent?.operasyonel || {}
  if (op.foto_zorunlu || op.video_zorunlu || op.belge_zorunlu) return true
  if (
    op.foto_zorunlu === false &&
    op.video_zorunlu === false &&
    op.belge_zorunlu === false &&
    intent?.kanitAdetConfirmed
  ) {
    return true
  }

  const templates = context.templates || []
  if (intent?.sablonId) {
    const tpl = templates.find((t) => String(t.id) === String(intent.sablonId))
    if (tpl?.foto_zorunlu || tpl?.video_zorunlu) return true
  }
  return false
}

function collectPersonnelAmbiguityGaps(intent) {
  const amb = intent?.pendingAmbiguities?.find((a) => a?.token && a?.candidates?.length > 1)
  return amb ? [`person_ambiguous:${amb.token}`] : []
}

function collectAssignmentGaps(intent) {
  const gaps = []
  if (!intent?.mode) return ['mode']

  const mode = intent.mode || 'normal'

  if (mode === 'sirali_gorev') {
    const steps = intent.siraliSteps || []
    const complete = steps.filter(
      (s) => s?.personel_id && s?.denetimci_personel_id && (s?.adim_baslik?.trim() || intent.baslik?.trim()),
    )
    if (complete.length < 2) return ['sirali']
    const missingAuditor = steps.some((s) => s?.personel_id && !s?.denetimci_personel_id)
    if (missingAuditor) return ['sirali_denetim']
    return []
  }
  if (mode === 'zincir_gorev') {
    if (!intent.zincirGorevIds?.length) return ['zincir_gorev']
    return []
  }
  if (mode === 'zincir_onay') {
    if (!intent.zincirOnayWorkerId) return ['zincir_onay_worker']
    if (!intent.zincirOnayIds?.length) return ['zincir_onay']
    return []
  }
  if (mode === 'zincir_gorev_ve_onay') {
    if (!intent.zincirGorevIds?.length) return ['zincir_gorev']
    if (!intent.zincirOnayIds?.length) return ['zincir_onay']
    return []
  }
  if (mode === 'sablon_gorev') {
    if (!intent.sablonId) return ['sablon']
    if (!intent.assigneeIds?.length && !intent.personId) return ['assignees']
    return []
  }
  if (!intent.assigneeIds?.length && !intent.personId) return ['assignees']
  return []
}

function needsKanitAdet(intent) {
  const op = intent?.operasyonel || {}
  return !!(op.foto_zorunlu || op.video_zorunlu || op.belge_zorunlu)
}

function isKanitAdetConfirmed(intent) {
  if (!needsKanitAdet(intent)) return true
  if (intent?.kanitAdetConfirmed) return true
  const op = intent?.operasyonel || {}
  return !!(op.min_foto_sayisi || op.min_video_sayisi || op.min_belge_sayisi)
}

/** Operasyonel sorular — her turda yalnızca biri */
function collectOperationalGaps(intent, context) {
  const mode = intent.mode || 'normal'
  if (!isTarihConfirmed(intent)) {
    const gap = scheduleCollectGap(intent)
    if (gap) return [gap]
    return ['tarih']
  }
  if (!isAcilConfirmed(intent)) return ['acil']
  if (mode !== 'sirali_gorev' && !isKanitConfirmed(intent, context)) return ['kanit']
  if (mode !== 'sirali_gorev' && needsKanitAdet(intent) && !isKanitAdetConfirmed(intent)) {
    return ['kanit_adet']
  }
  return []
}

export function validateIntent(intent, context = {}) {
  const { canAssignTask = true } = context
  const coerced = coerceParallelIntent(intent || {})
  const modeResolved = resolveTaskModeFromIntent(coerced, context, {
    sourceText: context.lastUserText || '',
  })
  const enriched = enrichIntentBaslikAciklama(normalizeConfirmationFlags(modeResolved))

  if (!canAssignTask) {
    const gaps = []
    if (!enriched?.mode) gaps.push('mode')
    return { gaps, ready: gaps.length === 0, intent: enriched }
  }

  const ambiguityGaps = collectPersonnelAmbiguityGaps(enriched)
  if (ambiguityGaps.length) {
    return { gaps: ambiguityGaps, ready: false, intent: enriched }
  }

  const assignmentGaps = collectAssignmentGaps(enriched)
  if (assignmentGaps.length) {
    return { gaps: assignmentGaps, ready: false, intent: enriched }
  }

  const operationalGaps = collectOperationalGaps(enriched, context)
  return { gaps: operationalGaps, ready: operationalGaps.length === 0, intent: enriched }
}

const SHORT_GAP_QUESTIONS = {
  mode: 'Standart, şablon, zincir veya sıralı mı olsun?',
  assignees: 'Kime atanacak?',
  sablon: 'Hangi şablon?',
  zincir_gorev: 'Sırayla kimler yapacak?',
  zincir_onay: 'Onay sırası kimlerde?',
  zincir_onay_worker: 'Görevi kim yapacak?',
  sirali: 'Adımları yazın (en az 2 adım).',
  sirali_denetim: 'Her adımda kim denetleyecek?',
  tarih: 'Ne zamana kadar bitsin?',
  tarih_baslangic_saat: 'Saat kaçta başlasın?',
  tarih_bitis_saat: 'Saat kaça kadar bitsin?',
  tarih_saat: 'Saat kaça kadar bitsin?',
  acil: 'Acil olsun mu?',
  kanit: 'Kanıt gerekli mi? (foto / video / belge / hayır)',
  kanit_adet: 'Kaç adet gerekli?',
}

function gapQuestionLine(gap, intent, context = {}) {
  if (gap.startsWith('person_ambiguous:')) {
    const token = gap.slice('person_ambiguous:'.length)
    const amb = (intent?.pendingAmbiguities || []).find((a) => a.token === token)
    if (amb) return formatAmbiguityQuestion(amb)
    return `Hangi ${token}? Tam ad yazın.`
  }
  return SHORT_GAP_QUESTIONS[gap] || null
}

export function gapQuestion(gap, intent, context = {}) {
  return gapQuestionLine(gap, intent, context) || 'Bir detay daha lazım.'
}

/** Her turda tek, kısa soru — tekrarlayan özet yok */
export function formatNextGapQuestion(gaps, intent, context = {}) {
  const gap = gaps?.[0]
  if (!gap) return 'Bir detay daha lazım.'

  const validationIssue = intent?.scheduleValidationIssue
  const validation = validateScheduleIntent(intent)
  const issuePrefix = validationIssue || (validation.valid ? '' : validation.issue)

  const task = displayTaskTitle(intent)
  const who = intent?.assigneeNames?.filter(Boolean)?.[0]

  if (gap.startsWith('person_ambiguous:')) {
    return gapQuestionLine(gap, intent, context) || 'Hangi kişi? Tam ad yazın.'
  }

  if (issuePrefix && ['tarih_baslangic_saat', 'tarih_bitis_saat', 'tarih', 'tarih_saat'].includes(gap)) {
    return issuePrefix
  }

  switch (gap) {
    case 'assignees':
      if (intent?.pendingUnitQuery && !intent?.unitId) {
        return task
          ? `**${task}** — "${intent.pendingUnitQuery}" birimini bulamadım. Tam birim adını yazar mısınız?`
          : `Hangi birim? ("${intent.pendingUnitQuery}" eşleşmedi)`
      }
      if (intent?.unitName && intent?.assigneeNames?.length) {
        return task
          ? `**${task}** → ${intent.unitName} (${intent.assigneeNames.length} kişi). Devam edelim mi?`
          : `${intent.unitName} ekibine atandı.`
      }
      return task ? `**${task}** kime veya hangi ekibe verilsin?` : 'Kime veya hangi ekibe atanacak?'
    case 'tarih':
      if (task && intent?.unitName && (intent?.assigneeIds?.length > 1 || intent?.cokluAtama)) {
        const n = intent.assigneeNames?.length || intent.assigneeIds?.length || 0
        return `**${task}** (${intent.unitName}${n ? `, ${n} kişi` : ''}) — ne zamana kadar?`
      }
      return task && who ? `**${task}** (${who}) — ne zamana kadar?` : task ? `**${task}** — ne zamana kadar? (örn. yarın, 10-17)` : 'Ne zamana kadar? (tarih + başlangıç/bitiş saati)'
    case 'tarih_baslangic_saat': {
      const ymd = intent?.baslangic || intent?.bitis
      const label = formatScheduleDateLabel(ymd)
      const when = label ? `**${label}**` : 'Görev'
      return task
        ? `**${task}** — ${when} saat kaçta **başlasın**? (örn. 09:00 veya "saat 10")`
        : `${when} saat kaçta başlasın? (örn. 09:00)`
    }
    case 'tarih_bitis_saat': {
      const ymd = intent?.bitis || intent?.baslangic
      const label = formatScheduleDateLabel(ymd)
      const startHint = intent?.baslamaSaat ? ` (başlangıç ${intent.baslamaSaat})` : ''
      const when = label ? `**${label}**` : 'Görev'
      return task
        ? `**${task}** — ${when}${startHint} saat kaça **kadar** bitsin? (örn. 17:00)`
        : `${when}${startHint} saat kaça kadar bitsin? (örn. 17:00)`
    }
    case 'tarih_saat': {
      const ymd = intent?.bitis || intent?.baslangic
      const label = formatScheduleDateLabel(ymd)
      const when = label ? `**${label}** için` : 'Bitiş'
      return task
        ? `**${task}** — ${when} saat kaça kadar? (örn. 17:00 veya "saat 10")`
        : `${when} saat kaça kadar? (örn. 17:00)`
    }
    case 'acil':
      return 'Acil mi, normal mi?'
    case 'kanit':
      return 'Fotoğraf, video veya belge gerekli mi? (yoksa **hayır** yazın)'
    case 'kanit_adet': {
      const op = intent?.operasyonel || {}
      if (op.foto_zorunlu && op.belge_zorunlu) return 'Kaç fotoğraf ve kaç belge? (ör. "2 foto 1 belge")'
      if (op.foto_zorunlu) return 'Kaç fotoğraf gerekli?'
      if (op.video_zorunlu) return 'Kaç video gerekli?'
      if (op.belge_zorunlu) return 'Kaç belge gerekli?'
      return 'Kaç adet kanıt gerekli?'
    }
    default:
      return gapQuestionLine(gap, intent, context) || 'Bir detay daha lazım.'
  }
}

/** @deprecated formatNextGapQuestion kullanın */
export function formatCombinedGapQuestions(gaps, intent, context = {}) {
  return formatNextGapQuestion(gaps, intent, context)
}

export function formatGapChecklist(intent, context) {
  const { gaps } = validateIntent(intent, context)
  const labels = {
    mode: 'Görev türü',
    assignees: 'Atanan',
    sablon: 'Şablon',
    zincir_gorev: 'Zincir',
    zincir_onay: 'Onay',
    zincir_onay_worker: 'Yapan kişi',
    sirali: 'Adımlar',
    sirali_denetim: 'Denetimci',
    tarih: 'Tarih',
    tarih_baslangic_saat: 'Başlangıç saati',
    tarih_bitis_saat: 'Bitiş saati',
    tarih_saat: 'Saat',
    acil: 'Acil',
    kanit: 'Kanıt türü',
    kanit_adet: 'Kanıt adedi',
  }
  return gaps.map((g) => {
    if (g.startsWith('person_ambiguous:')) {
      return `İsim (${g.slice('person_ambiguous:'.length)})`
    }
    return labels[g] || g
  })
}
