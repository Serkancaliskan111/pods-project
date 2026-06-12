import {
  createWelcomeMessage,
  allModesHelp,
  explainMode,
  isHelpRequest,
} from './knowledge'
import {
  extractTitleCandidate,
  inferModeFromText,
  isConfirmIntent,
  matchPersonnelInText,
  matchTemplateInText,
  parseAciklamaFromText,
  parseDatesFromText,
  parseOperationalFlags,
  parseOrderedPeople,
  parseSiraliPair,
  parseZincirOnayWorkerAndChain,
  personLabel,
  splitGorevOnaySections,
} from './parseMessage'
import { gapQuestion, validateIntent, formatGapChecklist } from './validateIntent'

export function createEmptyIntent() {
  return {
    baslik: '',
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
  }
  if (tpl.video_zorunlu) {
    next.operasyonel.video_zorunlu = true
    next.operasyonel.min_video_sayisi = 1
    next.operasyonel.max_video_suresi_sn = 60
  }
  const puan = Number(tpl.varsayilan_puan ?? tpl.puan ?? 0)
  if (puan > 0 && !next.operasyonel.puan) next.operasyonel.puan = puan
}

export function applyTextToIntent(intent, text, context) {
  const { personnel = [], templates = [], canAssignTask = true } = context
  const next = {
    ...intent,
    operasyonel: { ...(intent.operasyonel || {}) },
    siraliSteps: [...(intent.siraliSteps || [])],
  }

  const dates = parseDatesFromText(text)
  if (dates.baslangic) next.baslangic = dates.baslangic
  if (dates.bitis) next.bitis = dates.bitis

  const aciklama = parseAciklamaFromText(text)
  if (aciklama) next.aciklama = aciklama

  const mode = inferModeFromText(text, next.mode)
  if (mode) next.mode = mode

  const op = parseOperationalFlags(text)
  next.operasyonel = { ...next.operasyonel, ...op }
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

  const { gorevPart, onayPart } = splitGorevOnaySections(text)

  if (next.mode === 'zincir_gorev' || next.mode === 'zincir_gorev_ve_onay') {
    const ordered = parseOrderedPeople(gorevPart || text, personnel)
    if (ordered.ids.length) {
      next.zincirGorevIds = mergeUniqueIds(next.zincirGorevIds, ordered.ids)
      next.zincirGorevNames = mergeNames(next.zincirGorevNames, ordered.names)
    } else if (peopleIds.length && next.mode === 'zincir_gorev') {
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
  if (title && (!next.baslik || next.baslik.length < title.length)) {
    next.baslik = title
  }

  if (!next.mode) next.mode = 'normal'
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

  const updated = applyTextToIntent(intent, userText, context)
  const { gaps, ready } = validateIntent(updated, context)

  if (isConfirmIntent(userText) && ready) {
    replies.push({
      role: 'assistant',
      text: 'Önizleme hazır. **Atamayı tamamla** ile son kontrolü yapıp görevi oluşturabilirsiniz.',
      preview: true,
    })
  } else if (ready) {
    replies.push({
      role: 'assistant',
      text: 'Tüm bilgiler tamam. Önizlemeyi kontrol edin; uygunsa **Atamayı tamamla** deyin veya düğmeye basın.',
      preview: true,
    })
  } else {
    const checklist = formatGapChecklist(updated, context)
    const hint = checklist.length ? `\n\nEksik: ${checklist.join(', ')}` : ''
    replies.push({ role: 'assistant', text: gapQuestion(gaps[0], updated) + hint })
  }

  return {
    messages: [...messages, { role: 'user', text: userText }, ...replies],
    intent: updated,
    ready,
    gaps,
  }
}

export { createWelcomeMessage } from './knowledge'
