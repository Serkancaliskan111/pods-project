import {
  createWelcomeMessage,
  allModesHelp,
  explainMode,
  isHelpRequest,
} from './knowledge.js'
import {
  extractTitleCandidate,
  inferModeFromText,
  shouldAutoAssignWhenReady,
  matchPersonnelInText,
  matchTemplateInText,
  parseAciklamaFromText,
  parseOperationalFlags,
  parseOrderedPeople,
  parseSiraliPair,
  parseZincirOnayWorkerAndChain,
  personLabel,
  splitGorevOnaySections,
  isExplicitParallelAssignment,
  isExplicitSequentialChain,
  looksLikeOrderedNameList,
  clearZincirIntent,
} from './parseMessage.js'
import { parseScheduleFromText, applyScheduleFieldsToIntent } from './parseScheduleFromText.js'
import { extractGorevDetayFromText } from './extractGorevDetay.js'
import { applyUnitAssignment, applySequentialUnitContext, isUnitWideAssignment, isTeamWideAssignment, isAssigneeTargetMessage, applyAssigneeCorrection, isAssigneeCorrectionMessage, isDirectTeamTarget } from './unitAssignment.js'
import { validateIntent, formatNextGapQuestion } from './validateIntent.js'
import { applyAssistantConfirmations } from './parseAssistantConfirmations.js'
import { applyPersonnelAmbiguityGuard, refreshPersonnelAmbiguities } from './personnelAmbiguity.js'
import { isGenericInferredBaslik, isModeLabelTitle, displayTaskTitle } from './inferIntentBaslikAciklama.js'
import { isTaskAssignmentTopic, offTopicReply } from './taskTopicGate.js'
import { buildAssignmentContextText } from './assistantContext.js'

export function createEmptyIntent() {
  return {
    baslik: '',
    gorevKonusu: '',
    pendingAmbiguities: [],
    tarihConfirmed: false,
    acilConfirmed: false,
    kanitConfirmed: false,
    kanitAdetConfirmed: false,
    mode: '',
    assigneeIds: [],
    assigneeNames: [],
    personId: '',
    zincirGorevIds: [],
    zincirGorevNames: [],
    zincirOnayIds: [],
    zincirOnayNames: [],
    zincirOnayWorkerId: '',
    zincirOnayWorkerName: '',
    siraliSteps: [],
    sablonId: '',
    sablonName: '',
    baslangic: '',
    bitis: '',
    aciklama: '',
    operasyonel: {},
    cokluAtama: false,
    projeId: '',
    projeGorevId: '',
    company: '',
    unitId: '',
    unitName: '',
    parallelAssignmentHint: false,
    pendingUnitQuery: '',
    gorevDetay: '',
    baslamaSaat: '',
    bitisSaat: '',
    relativeDeadline: false,
    scheduleValidationIssue: '',
    modeExplicit: false,
  }
}

function mergeUniqueIds(existing, incoming) {
  const out = [...(existing || [])]
  for (const id of incoming) {
    const s = String(id)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function mergeNames(existing, incoming) {
  const out = [...(existing || [])]
  for (const n of incoming) {
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

function applyTemplateDefaults(next, tpl) {
  if (!tpl) return
  if (tpl.foto_zorunlu) {
    next.operasyonel.foto_zorunlu = true
    next.operasyonel.min_foto_sayisi = tpl.min_foto_sayisi || 1
    next.kanitConfirmed = true
  }
  if (tpl.video_zorunlu) {
    next.operasyonel.video_zorunlu = true
    next.operasyonel.min_video_sayisi = 1
    next.operasyonel.max_video_suresi_sn = 60
    next.kanitConfirmed = true
  }
  const puan = Number(tpl.varsayilan_puan ?? tpl.puan ?? 0)
  if (puan > 0 && !next.operasyonel.puan) next.operasyonel.puan = puan
}

export function applyTextToIntent(intent, text, context, { expectedGap = '', contextMessages = [] } = {}) {
  const { personnel = [], templates = [], canAssignTask = true } = context
  const assignContextText = buildAssignmentContextText(contextMessages, text, expectedGap)
  const next = {
    ...intent,
    operasyonel: { ...(intent.operasyonel || {}) },
    siraliSteps: [...(intent.siraliSteps || [])],
  }

  applyScheduleFieldsToIntent(next, parseScheduleFromText(text, {
    timeRole:
      expectedGap === 'tarih_baslangic_saat'
        ? 'start'
        : expectedGap === 'tarih_bitis_saat' || expectedGap === 'tarih_saat'
          ? 'end'
          : 'auto',
  }), { expectedGap })

  const aciklama = parseAciklamaFromText(text)
  if (aciklama) next.aciklama = aciklama

  const detay = extractGorevDetayFromText(text)
  if (detay) next.gorevDetay = detay

  const sequentialChain = isExplicitSequentialChain(text)
  const mode = inferModeFromText(text, next.mode)
  if (mode) next.mode = mode

  if (!sequentialChain && (isExplicitParallelAssignment(text) || isUnitWideAssignment(text) || isTeamWideAssignment(text))) {
    next.parallelAssignmentHint = true
    next.mode = 'normal'
    next.cokluAtama = true
    next.operasyonel = { ...next.operasyonel, coklu_atama: true }
    clearZincirIntent(next)
  }

  applyAssigneeCorrection(next, text, contextMessages, personnel, context.units || [])
  if (sequentialChain) {
    applySequentialUnitContext(next, assignContextText, personnel, context.units || [])
  } else {
    applyUnitAssignment(next, assignContextText, personnel, context.units || [])
  }

  if (expectedGap === 'zincir_gorev' && looksLikeOrderedNameList(text, personnel)) {
    next.mode = 'zincir_gorev'
    next.parallelAssignmentHint = false
    next.cokluAtama = false
    next.assigneeIds = []
    next.assigneeNames = []
    next.personId = ''
    next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: false }
    const ordered = parseOrderedPeople(text, personnel)
    if (ordered.ids.length) {
      next.zincirGorevIds = ordered.ids
      next.zincirGorevNames = ordered.names
    }
  }

  const op = parseOperationalFlags(text)
  if (op.coklu_atama) next.cokluAtama = true

  const tpl = matchTemplateInText(text, templates)
  if (tpl) {
    next.sablonId = String(tpl.id)
    next.sablonName = tpl.baslik || ''
    applyTemplateDefaults(next, tpl)
    if (!next.mode || next.mode === 'normal') next.mode = 'sablon_gorev'
  }

  const people = matchPersonnelInText(text, personnel)
  const peopleIds = people.map((p) => String(p.id))
  const peopleNames = people.map(personLabel)
  const unitAssignLocked =
    !!next.unitId &&
    next.assigneeIds?.length > 0 &&
    (isTeamWideAssignment(assignContextText) || isDirectTeamTarget(assignContextText)) &&
    !isAssigneeCorrectionMessage(text)

  const { gorevPart, onayPart } = splitGorevOnaySections(text)

  if (next.mode === 'zincir_gorev' || next.mode === 'zincir_gorev_ve_onay') {
    const ordered = parseOrderedPeople(gorevPart || text, personnel)
    if (ordered.ids.length) {
      next.zincirGorevIds = mergeUniqueIds(next.zincirGorevIds, ordered.ids)
      next.zincirGorevNames = mergeNames(next.zincirGorevNames, ordered.names)
    } else if (
      peopleIds.length &&
      next.mode === 'zincir_gorev' &&
      (expectedGap === 'zincir_gorev' || looksLikeOrderedNameList(text, personnel))
    ) {
      next.zincirGorevIds = mergeUniqueIds(next.zincirGorevIds, peopleIds)
      next.zincirGorevNames = mergeNames(next.zincirGorevNames, peopleNames)
    }
  }

  if (next.mode === 'zincir_onay' || next.mode === 'zincir_gorev_ve_onay') {
    const zo = parseZincirOnayWorkerAndChain(text, personnel)
    if (zo.workerId) {
      next.zincirOnayWorkerId = zo.workerId
      next.zincirOnayWorkerName = zo.workerName
    }
    const onayText = onayPart || (next.mode === 'zincir_onay' ? text : '')
    const orderedOnay = parseOrderedPeople(onayText, personnel)
    if (orderedOnay.ids.length) {
      next.zincirOnayIds = mergeUniqueIds(next.zincirOnayIds, orderedOnay.ids)
      next.zincirOnayNames = mergeNames(next.zincirOnayNames, orderedOnay.names)
    } else if (zo.onayIds.length) {
      next.zincirOnayIds = mergeUniqueIds(next.zincirOnayIds, zo.onayIds)
      next.zincirOnayNames = mergeNames(next.zincirOnayNames, zo.onayNames)
    }
  }

  if (next.mode === 'sirali_gorev') {
    const pair = parseSiraliPair(text, personnel)
    if (pair) {
      const stepTitle = next.baslik ? `${next.baslik} — ${next.siraliSteps.length + 1}` : `Adım ${next.siraliSteps.length + 1}`
      const exists = next.siraliSteps.some((s) => s.personel_id === pair.personel_id)
      if (!exists) {
        next.siraliSteps.push({
          personel_id: pair.personel_id,
          denetimci_personel_id: pair.denetimci_personel_id,
          adim_baslik: stepTitle,
          workerName: pair.workerName,
          auditorName: pair.auditorName,
        })
      }
    }
  } else if (
    canAssignTask &&
    peopleIds.length &&
    !unitAssignLocked &&
    !['zincir_gorev', 'zincir_onay', 'zincir_gorev_ve_onay'].includes(next.mode)
  ) {
    if (peopleIds.length > 1 || next.cokluAtama) {
      next.assigneeIds = mergeUniqueIds(next.assigneeIds, peopleIds)
      next.assigneeNames = mergeNames(next.assigneeNames, peopleNames)
      next.cokluAtama = true
    } else {
      next.personId = peopleIds[0]
      next.assigneeIds = mergeUniqueIds(next.assigneeIds, peopleIds)
      next.assigneeNames = mergeNames(next.assigneeNames, peopleNames)
    }
  }

  const title = extractTitleCandidate(text, personnel, templates)
  const skipTitleUpdate =
    isAssigneeTargetMessage(text, { expectedGap }) ||
    (expectedGap === 'assignees' && !!(next.gorevKonusu?.trim() || next.baslik?.trim()))
  if (title && !skipTitleUpdate && !isGenericInferredBaslik(title) && !isModeLabelTitle(title)) {
    if (!next.gorevKonusu || title.length >= next.gorevKonusu.length) {
      next.gorevKonusu = title
    }
    if (!next.baslik || isGenericInferredBaslik(next.baslik) || isModeLabelTitle(next.baslik)) {
      next.baslik = title
    }
  }

  if (!next.mode) next.mode = 'normal'

  if (
    next.parallelAssignmentHint &&
    ['zincir_gorev', 'zincir_onay', 'zincir_gorev_ve_onay'].includes(next.mode)
  ) {
    next.mode = 'normal'
    clearZincirIntent(next)
  }

  applyAssistantConfirmations(next, text, { expectedGap })
  applyPersonnelAmbiguityGuard(next, assignContextText, personnel)
  Object.assign(next, refreshPersonnelAmbiguities(next, text, personnel))
  return next
}

export function getIntentGaps(intent, context) {
  return validateIntent(intent, context).gaps
}

export function isIntentReady(intent, context) {
  return validateIntent(intent, context).ready
}

export function processUserMessage(messages, userText, context, seedIntent = null) {
  const intent = seedIntent || createEmptyIntent()
  const replies = []

  const { gaps: activeGaps } = validateIntent(intent, context)
  if (
    !isHelpRequest(userText) &&
    !isTaskAssignmentTopic(userText, { gaps: activeGaps, intent, personnel: context.personnel })
  ) {
    return {
      messages: [
        ...messages,
        { role: 'user', text: userText },
        { role: 'assistant', text: offTopicReply() },
      ],
      intent,
      ready: false,
      autoAssign: false,
    }
  }

  if (isHelpRequest(userText)) {
    if (/mod|tür|tur|fark/.test(String(userText).toLocaleLowerCase('tr'))) {
      replies.push({ role: 'assistant', text: `Görev türleri:\n${allModesHelp()}` })
    } else if (intent.mode) {
      replies.push({ role: 'assistant', text: explainMode(intent.mode) })
    } else {
      replies.push({
        role: 'assistant',
        text: `Görev türleri:\n${allModesHelp()}\n\nKısaca görevinizi yazmanız yeterli; türü otomatik çıkarırım.`,
      })
    }
    return { messages: [...messages, { role: 'user', text: userText }, ...replies], intent, ready: false }
  }

  const { gaps: gapsBefore } = validateIntent(intent, context)
  const updated = applyTextToIntent(intent, userText, context, {
    expectedGap: gapsBefore[0] || '',
    contextMessages: messages,
  })
  const { gaps, ready, intent: enriched } = validateIntent(updated, {
    ...context,
    lastUserText: userText,
  })

  if (ready) {
    replies.push({
      role: 'assistant',
      text: `Tamam, **${displayTaskTitle(enriched) || enriched.baslik || 'görev'}** oluşturuluyor…`,
    })
  } else {
    replies.push({
      role: 'assistant',
      text: formatNextGapQuestion(gaps, enriched, context),
    })
  }

  return {
    messages: [...messages, { role: 'user', text: userText }, ...replies],
    intent: enriched,
    ready,
    gaps,
    autoAssign: shouldAutoAssignWhenReady(userText, ready),
  }
}

export { createWelcomeMessage } from './knowledge.js'
