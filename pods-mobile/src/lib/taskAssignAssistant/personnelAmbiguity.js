import { matchPersonnelInText, personLabel } from './parseMessage.js'

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function personDetail(p) {
  const name = personLabel(p)
  const email = String(p?.email || '').trim()
  if (email) return `${name} (${email})`
  if (p?.birim_id) return `${name} (birim: ${p.birim_id})`
  return name
}

/** Metinde tam adı geçen personel */
function fullNameMatchesInText(text, roster) {
  const t = norm(text)
  const hits = []
  for (const p of roster) {
    const full = norm(personLabel(p))
    if (full.length > 4 && t.includes(full)) hits.push(p)
  }
  return hits
}

/** Aynı ada sahip birden fazla kişi var mı? */
export function findAmbiguousFirstNames(text, roster = []) {
  const t = norm(text)
  const resolvedFullIds = new Set(fullNameMatchesInText(text, roster).map((p) => String(p.id)))
  const byAd = {}

  for (const p of roster) {
    const ad = norm(p.ad)
    if (ad.length < 2) continue
    if (!byAd[ad]) byAd[ad] = []
    byAd[ad].push(p)
  }

  const ambiguities = []
  for (const [ad, people] of Object.entries(byAd)) {
    if (people.length < 2) continue
    if (!t.includes(ad)) continue

    const unresolved = people.filter((p) => !resolvedFullIds.has(String(p.id)))
    if (unresolved.length < 2) continue

    const already = ambiguities.some((a) => a.token === ad)
    if (!already) ambiguities.push({ token: ad, candidates: unresolved })
  }

  return ambiguities
}

export function formatAmbiguityQuestion(amb) {
  const opts = (amb.candidates || [])
    .map((p, i) => `   ${i + 1}. ${personDetail(p)}`)
    .join('\n')
  return `**"${amb.token}"** için sistemde ${amb.candidates.length} kişi var. Tam ad veya e-posta ile belirtin:\n${opts}`
}

/** Belirsiz isimleri intent'ten temizle; tam eşleşenleri koru */
export function applyPersonnelAmbiguityGuard(next, text, roster = []) {
  const ambiguities = findAmbiguousFirstNames(text, roster)
  next.pendingAmbiguities = ambiguities

  if (!ambiguities.length) return next

  const ambiguousIds = new Set()
  for (const amb of ambiguities) {
    for (const p of amb.candidates) ambiguousIds.add(String(p.id))
  }

  if (next.personId && ambiguousIds.has(String(next.personId))) {
    next.personId = ''
  }
  next.assigneeIds = (next.assigneeIds || []).filter((id) => !ambiguousIds.has(String(id)))
  next.assigneeNames = (next.assigneeNames || []).filter((name) => {
    const n = norm(name)
    return !ambiguities.some((a) => n === norm(a.token) || n.startsWith(`${norm(a.token)} `))
  })

  next.zincirGorevIds = (next.zincirGorevIds || []).filter((id) => !ambiguousIds.has(String(id)))
  next.zincirGorevNames = (next.zincirGorevNames || []).filter((name) => {
    const n = norm(name)
    return !ambiguities.some((a) => n === norm(a.token))
  })

  if (next.zincirOnayWorkerId && ambiguousIds.has(String(next.zincirOnayWorkerId))) {
    next.zincirOnayWorkerId = ''
    next.zincirOnayWorkerName = ''
  }
  next.zincirOnayIds = (next.zincirOnayIds || []).filter((id) => !ambiguousIds.has(String(id)))
  next.zincirOnayNames = (next.zincirOnayNames || []).filter((name) => {
    const n = norm(name)
    return !ambiguities.some((a) => n === norm(a.token))
  })

  return next
}

/** Kullanıcı tam ad verdiğinde belirsizlik kalktı mı? */
export function refreshPersonnelAmbiguities(intent, text, roster = []) {
  const next = { ...intent, pendingAmbiguities: findAmbiguousFirstNames(text, roster) }
  return next
}
