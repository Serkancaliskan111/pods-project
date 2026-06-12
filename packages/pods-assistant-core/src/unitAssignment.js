import { personLabel, isExplicitSequentialChain } from './parseMessage.js'

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[çÇ]/g, 'c')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanUnitQuery(s) {
  return String(s || '')
    .replace(/\b(bulunan|herkese|herkes|hepsi|hepsine|tum|tumü|tüm|acil|olarak|skt|kontrol|gorev|görev|gorevi|görevi|ata|at|yarın|yarin|ekip|ekibi|ekibine|ekibinin|birim|birimi|ver|olsun)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Metinden birim/ekip adı adayı çıkar */
export function extractUnitQueryFromText(text) {
  const raw = String(text || '')

  let m = raw.match(/\b([a-zçğıöşüA-ZÇĞİÖŞÜ0-9]+)\s+ekip\s+üyelerine\b/i)
  if (m?.[1]?.trim()) return cleanUnitQuery(m[1])

  m = raw.match(/\b([a-zçğıöşüA-ZÇĞİÖŞÜ0-9]+)\s+ekib(?:inin|ine|inde|i)\b/i)
  if (m?.[1]?.trim()) return cleanUnitQuery(m[1])

  m = raw.match(/\b([a-zçğıöşüA-ZÇĞİÖŞÜ0-9]+)(?:ın|in|un|ün|nin|nın)\s+hepsine\b/i)
  if (m?.[1]?.trim() && !/ekib$/i.test(norm(m[1]))) return cleanUnitQuery(m[1])

  m = raw.match(/([a-zçğıöşüA-ZÇĞİÖŞÜ0-9\s]+?)\s+birim(?:inde|de|i|ini)?\b/i)
  if (m?.[1]?.trim()) return cleanUnitQuery(m[1])

  return ''
}

export function matchUnitInText(text, units = []) {
  const t = norm(text)
  const query = norm(extractUnitQueryFromText(text))
  const allowFullTextScan = isTeamWideAssignment(text) || !!query
  let best = null
  let bestScore = 0

  for (const u of units) {
    const name = norm(u.birim_adi || u.ad || '')
    if (name.length < 2) continue

    if (query) {
      const q = norm(query)
      if (name === q || name.includes(q) || q.includes(name)) {
        const score = name.length + 20
        if (score > bestScore) {
          best = u
          bestScore = score
        }
        continue
      }
      const nameWords = name.split(/\s+/).filter((w) => w.length > 2)
      const queryWords = q.split(/\s+/).filter((w) => w.length > 2)
      const wordHit = nameWords.some((w) => q.includes(w)) || queryWords.some((w) => name.includes(w))
      if (wordHit) {
        const score = name.length + 12
        if (score > bestScore) {
          best = u
          bestScore = score
        }
        continue
      }
    }

    if (allowFullTextScan && t.includes(name) && name.length > bestScore) {
      best = u
      bestScore = name.length
    }
  }

  return best
}

export function personnelInUnit(personnel, unitId) {
  return (personnel || []).filter((p) => String(p.birim_id) === String(unitId))
}

/** "X ekibine" — adı geçen ekip = birim geneli atama */
export function isDirectTeamTarget(text) {
  const t = norm(text)
  if (/\b[a-zçğıöşü0-9]{2,}\s+ekip\s+üyelerine\b/.test(t)) return true
  if (/\b[a-zçğıöşü0-9]{2,}\s+ekib(?:inin|ine|inde|i)\b/.test(t)) return true
  if (/\b(tum ekibe|tüm ekibe)\b/.test(t) && extractUnitQueryFromText(text)) return true
  return false
}

export function isAssigneeCorrectionMessage(text) {
  const t = norm(text)
  if (/\b(değil|degil)\b/.test(t) && /\b(herkese|hepsine|ekibe|ekibine|tum|tüm|hepsi)\b/.test(t)) {
    return true
  }
  if (/^(değil|degil)\s+(herkese|hepsine|ekibe)/.test(t)) return true
  if (/\b(erene|ali(?:ye)?|mehmet(?:e)?|veli(?:ye)?)\s+(değil|degil)\b/.test(t)) return true
  return false
}

export function isBroadReassignMessage(text) {
  const t = norm(text)
  return /^(herkese|hepsine|tüm ekibe|tum ekibe|ekibe)$/i.test(t.trim()) ||
    /\b(herkese|hepsine)\s+(olsun|ata|ver)\b/.test(t)
}

export function isUnitWideAssignment(text) {
  const t = norm(text)
  return (
    (/\b(birim(?:inde|de|i|ini)?|birimindeki)\b/.test(t) && /\b(herkese|herkes|tum|tüm|hepsi|hepsine)\b/.test(t)) ||
    /\bbirim(?:inde|de|i)?\s*(?:bulunan\s+)?herkese\b/.test(t)
  )
}

/** Ekip / birim geneli atama ifadesi */
export function isTeamWideAssignment(text) {
  if (isExplicitSequentialChain(text)) return false
  const t = norm(text)
  if (isUnitWideAssignment(text)) return true
  if (isDirectTeamTarget(text)) return true
  if (isAssigneeCorrectionMessage(text) || isBroadReassignMessage(text)) return true
  if (/\b(hepsine|herkese|hepsinin tamamina|hepsinin tamamına)\b/.test(t) && extractUnitQueryFromText(text)) {
    return true
  }
  if (/\b(ekibe|ekibine|ekibinin|ekibinde)\b/.test(t) && /\b(hepsi|herkes|herkese|hepsine|tum|tüm)\b/.test(t)) {
    return true
  }
  if (/\b\w+(?:in|in|un|un|nin|nin)\s+hepsine\b/.test(t)) return true
  if (/\b\w+\s+ekib(?:inin|ine|inde|i)\b/.test(t) && /\b(hepsi|hepsine|herkes|herkese)\b/.test(t)) return true
  return false
}

export function shouldTryUnitAssignment(text) {
  return isTeamWideAssignment(text) || isDirectTeamTarget(text) || !!extractUnitQueryFromText(text)
}

/** Sıralı zincir + ekip/birim — paralel atama yapma */
export function applySequentialUnitContext(next, text, personnel = [], units = []) {
  if (!isExplicitSequentialChain(text)) return next
  if (!shouldTryUnitAssignment(text)) return next

  const unit = matchUnitInText(text, units)
  if (!unit) {
    const q = extractUnitQueryFromText(text)
    if (q) next.pendingUnitQuery = q
    return next
  }

  next.mode = 'zincir_gorev'
  next.unitId = String(unit.id)
  next.unitName = unit.birim_adi || ''
  next.parallelAssignmentHint = false
  next.cokluAtama = false
  next.pendingUnitQuery = ''
  next.personId = ''
  next.assigneeIds = []
  next.assigneeNames = []
  next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: false }
  return next
}

/** Yalnızca kime/ekibe yanıtı — görev başlığını ezmemek için */
export function isAssigneeTargetMessage(text, { expectedGap = '' } = {}) {
  const raw = String(text || '').trim()
  if (!raw) return false

  const hasTaskContent =
    /\b(skt|kontrol|sayim|sayım|hijyen|depo|teslim|temizlik|görevini|gorevini|yaptır|yaptir|yapsın|yapsin)\b/i.test(
      raw,
    ) || /[-—]/.test(raw) || raw.length > 55

  if (hasTaskContent) return false

  if (raw.length > 80) return false

  if (expectedGap === 'assignees' || expectedGap === 'tarih' || expectedGap === 'tarih_baslangic_saat' || expectedGap === 'tarih_bitis_saat' || expectedGap === 'tarih_saat' || expectedGap.startsWith('person_ambiguous:')) {
    if (isAssigneeCorrectionMessage(raw) || isBroadReassignMessage(raw)) return true
    if (isTeamWideAssignment(raw) && raw.length <= 48) return true
    if (extractUnitQueryFromText(raw) && /\b(hepsi|hepsine|herkes|herkese|ekip|ekib)\b/i.test(raw)) return true
    if (/^(ekibe|tüm ekibe|tum ekibe|hepsine)$/i.test(norm(raw))) return true
    return false
  }

  if (isTeamWideAssignment(raw) && raw.length <= 48) return true
  if (extractUnitQueryFromText(raw) && /\b(hepsi|hepsine|herkes|herkese)\b/i.test(raw) && raw.length <= 48) {
    return true
  }
  if (/^(ekibe|tüm ekibe|tum ekibe|hepsine)$/i.test(norm(raw))) return true
  return false
}

/** Birimdeki herkese paralel atama */
export function applyUnitAssignment(next, text, personnel = [], units = []) {
  if (!shouldTryUnitAssignment(text)) return next

  const unit = matchUnitInText(text, units)
  if (!unit) {
    if (isTeamWideAssignment(text)) {
      next.parallelAssignmentHint = true
      next.cokluAtama = true
      next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: true }
      const q = extractUnitQueryFromText(text)
      if (q) next.pendingUnitQuery = q
    }
    return next
  }

  const members = personnelInUnit(personnel, unit.id)
  if (!members.length) return next

  next.mode = 'normal'
  next.cokluAtama = true
  next.unitId = String(unit.id)
  next.unitName = unit.birim_adi || ''
  next.assigneeIds = members.map((p) => String(p.id))
  next.assigneeNames = members.map(personLabel)
  next.personId = members.length === 1 ? String(members[0].id) : ''
  next.parallelAssignmentHint = true
  next.pendingUnitQuery = ''
  next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: true }

  return next
}

/** Yanlış kişi düzeltmesi — "erene değil herkese" vb. */
export function applyAssigneeCorrection(next, text, contextMessages, personnel = [], units = []) {
  if (!isAssigneeCorrectionMessage(text) && !isBroadReassignMessage(text)) return next

  const ctx = [...(contextMessages || []).filter((m) => m?.role === 'user').slice(-3).map((m) => m.text), text]
    .filter(Boolean)
    .join(' ')

  next.personId = ''
  next.pendingAmbiguities = []

  applyUnitAssignment(next, ctx, personnel, units)

  if (next.unitId && next.assigneeIds?.length) {
    next.cokluAtama = true
    next.parallelAssignmentHint = true
    next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: true }
  }

  return next
}
