import { personLabel } from './parseMessage.js'

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractUnitQueryFromText(text) {
  const m = String(text || '').match(/([a-zçğıöşüA-ZÇĞİÖŞÜ0-9\s]+?)\s+birim(?:inde|de|i)?\b/i)
  if (!m) return ''
  return m[1]
    .replace(/\b(bulunan|herkese|herkes|acil|olarak|skt|kontrol|gorev|görev|ata)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchUnitInText(text, units = []) {
  const t = norm(text)
  const query = norm(extractUnitQueryFromText(text))
  let best = null
  let bestScore = 0

  for (const u of units) {
    const name = norm(u.birim_adi || u.ad || '')
    if (name.length < 2) continue

    if (query && (name.includes(query) || query.includes(name) || name.split(/\s+/).some((w) => w.length > 2 && query.includes(w)))) {
      const score = name.length + 10
      if (score > bestScore) {
        best = u
        bestScore = score
      }
      continue
    }

    if (t.includes(name) && name.length > bestScore) {
      best = u
      bestScore = name.length
    }
  }

  return best
}

export function personnelInUnit(personnel, unitId) {
  return (personnel || []).filter((p) => String(p.birim_id) === String(unitId))
}

export function isUnitWideAssignment(text) {
  const t = norm(text)
  return (
    (/\b(birim(?:inde|de|i)?|birimindeki)\b/.test(t) && /\b(herkese|herkes|tum|tüm|hepsi)\b/.test(t)) ||
    /\bbirim(?:inde|de|i)?\s*(?:bulunan\s+)?herkese\b/.test(t)
  )
}

/** Birimdeki herkese paralel atama */
export function applyUnitAssignment(next, text, personnel = [], units = []) {
  if (!isUnitWideAssignment(text) && !extractUnitQueryFromText(text)) return next

  const unit = matchUnitInText(text, units)
  if (!unit) return next

  const members = personnelInUnit(personnel, unit.id)
  if (!members.length) return next

  next.mode = 'normal'
  next.cokluAtama = true
  next.unitId = String(unit.id)
  next.unitName = unit.birim_adi || ''
  next.assigneeIds = members.map((p) => String(p.id))
  next.assigneeNames = members.map(personLabel)
  next.personId = members.length === 1 ? String(members[0].id) : ''
  next.operasyonel = { ...(next.operasyonel || {}), coklu_atama: true }

  return next
}
