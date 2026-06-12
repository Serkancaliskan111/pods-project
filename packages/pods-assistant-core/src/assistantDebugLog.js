const PREFIX = '[PodsAI Assign]'

let traceSeq = 0

/** DEV veya localStorage `pods_ai_assign_debug=1` ile açılır */
export function isAssistantDebugEnabled() {
  if (import.meta.env?.DEV) return true
  try {
    return localStorage.getItem('pods_ai_assign_debug') === '1'
  } catch {
    return false
  }
}

export function enableAssistantDebug() {
  try {
    localStorage.setItem('pods_ai_assign_debug', '1')
  } catch {
    /* ignore */
  }
  console.info(`${PREFIX} debug açık — yeniden mesaj gönderin`)
}

export function disableAssistantDebug() {
  try {
    localStorage.removeItem('pods_ai_assign_debug')
  } catch {
    /* ignore */
  }
  console.info(`${PREFIX} debug kapalı`)
}

function intentSnapshot(intent) {
  if (!intent) return null
  return {
    mode: intent.mode,
    baslik: intent.baslik || intent.gorevKonusu || '',
    assigneeIds: intent.assigneeIds,
    assigneeNames: intent.assigneeNames,
    personId: intent.personId,
    unitId: intent.unitId,
    unitName: intent.unitName,
    zincirGorevIds: intent.zincirGorevIds,
    zincirGorevNames: intent.zincirGorevNames,
    tarihConfirmed: intent.tarihConfirmed,
    acilConfirmed: intent.acilConfirmed,
    kanitConfirmed: intent.kanitConfirmed,
    kanitAdetConfirmed: intent.kanitAdetConfirmed,
    baslangic: intent.baslangic,
    bitis: intent.bitis,
    baslamaSaat: intent.baslamaSaat,
    bitisSaat: intent.bitisSaat,
    parallelAssignmentHint: intent.parallelAssignmentHint,
    cokluAtama: intent.cokluAtama,
    pendingAmbiguities: intent.pendingAmbiguities?.map((a) => a.token),
  }
}

export function newAssistantTrace(label = 'msg') {
  if (!isAssistantDebugEnabled()) return { id: '', log: () => {} }
  const id = `${label}-${++traceSeq}`
  return {
    id,
    log(step, data = {}) {
      console.log(PREFIX, id, step, data)
    },
    intent(step, intent) {
      console.log(PREFIX, id, step, intentSnapshot(intent))
    },
  }
}

export function assistantDebug(step, data = {}) {
  if (!isAssistantDebugEnabled()) return
  console.log(PREFIX, step, data)
}

export function assistantDebugError(step, err, extra = {}) {
  if (!isAssistantDebugEnabled()) return
  console.error(PREFIX, step, {
    message: err?.message || String(err),
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    ...extra,
  })
}

if (typeof window !== 'undefined' && isAssistantDebugEnabled()) {
  window.__podsAiAssignDebug = {
    on: enableAssistantDebug,
    off: disableAssistantDebug,
    enabled: isAssistantDebugEnabled,
  }
}
