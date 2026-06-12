/** Premium hibrit — kural vs LLM birleşim skoru */

export function scheduleFieldsScore(intent = {}) {
  let score = 0
  if (intent.baslangic || intent.bitis) score += 2
  if (intent.baslamaSaat) score += 2
  if (intent.bitisSaat) score += 2
  if (intent.tarihConfirmed) score += 3
  if (intent.scheduleStart) score += 1
  return score
}

export function intentCompletenessScore(intent = {}, gaps = []) {
  let score = scheduleFieldsScore(intent)
  if (intent.assigneeIds?.length || intent.personId) score += 3
  if (intent.zincirGorevIds?.length >= 2) score += 4
  if (intent.acilConfirmed) score += 2
  if (intent.kanitConfirmed) score += 2
  if (intent.mode) score += 1
  score -= (gaps?.length || 0) * 5
  return score
}

/** LLM birleşimi kural sonucundan daha iyi mi? */
export function shouldPreferMergedIntent(ruleResult, mergedValidation, gapsBefore = []) {
  if (mergedValidation.ready && !ruleResult.ready) return true
  if (ruleResult.ready && mergedValidation.ready) return true

  const beforeGap = gapsBefore[0] || ''
  const ruleGap = ruleResult.gaps?.[0] || ''
  const mergedGap = mergedValidation.gaps?.[0] || ''

  if (beforeGap && beforeGap === ruleGap && mergedGap && mergedGap !== ruleGap) return true

  const ruleScore = intentCompletenessScore(ruleResult.intent, ruleResult.gaps)
  const mergedScore = intentCompletenessScore(mergedValidation.intent, mergedValidation.gaps)
  return mergedScore > ruleScore
}

export function ensureFutureScheduleFlags(intent = {}) {
  const next = { ...intent }
  const today = new Date()
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const startYmd = String(next.baslangic || next.bitis || '').slice(0, 10)
  const endYmd = String(next.bitis || next.baslangic || '').slice(0, 10)

  if ((startYmd && startYmd > todayYmd) || (endYmd && endYmd > todayYmd)) {
    next.scheduleStart = true
  }
  if (next.baslamaSaat && next.bitisSaat && (startYmd || endYmd)) {
    next.scheduleStart = true
  }
  return next
}
