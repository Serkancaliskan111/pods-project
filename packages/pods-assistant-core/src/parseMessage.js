import { GOREV_MODU_OPTIONS } from './deps/gorevModuOptions.js'

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function addDaysYmd(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function personLabel(p) {
  return `${String(p?.ad || '').trim()} ${String(p?.soyad || '').trim()}`.trim()
}

function isExplicitModeChange(text) {
  const t = norm(text)
  return (
    /\b(standart|normal)\s+gorev\b/.test(t) ||
    /\bşablon\b|\bsablon\b|\bchecklist\b/.test(t) ||
    /\bzincir\b/.test(t) ||
    /\bsirali\b|\bsıralı\b/.test(t) ||
    /\bmod[:\s]+/.test(t) ||
    /\btur[:\s]+/.test(t)
  )
}

/** Sıralı zincir atama — paralel DEĞİL */
export function isExplicitSequentialChain(text) {
  const t = norm(text)
  if (/\b(sira yok|sıra yok|sirasiz|sırasız)\b/.test(t)) return false
  if (/\b(ayni anda|aynı anda|es zamanli|eş zamanlı|paralel)\b/.test(t)) return false
  return /\b(sirasyla|sirasiyla|sırasıyla|sirayla|sırayla|sira ile|sıra ile)\b/.test(t)
}

/** Paralel / çoklu atama — zincir görev DEĞİL */
export function isExplicitParallelAssignment(text) {
  if (isExplicitSequentialChain(text)) return false
  const t = norm(text)
  return (
    /\b(sira yok|sıra yok|sirasiz|sırasız)\b/.test(t) ||
    /\b(hepsi ayni anda|hepsi aynı anda|ayni anda|aynı anda|es zamanli|eş zamanlı|paralel)\b/.test(t) ||
    /\b(herkese|herkes[e]?|tum ekip|tüm ekip|hepsine)\b/.test(t) ||
    /\b\w+(?:in|in|un|un|nin|nin)\s+hepsine\b/.test(t) ||
    /\b\w+\s+ekib(?:inin|ine|inde|i)\b/.test(t) ||
    /\b(coklu atama|hepsine ayri|hepsine ayrı)\b/.test(t) ||
    /\b(birim(?:inde|de|i)?\s*(?:bulunan\s+)?herkese)\b/.test(t)
  )
}

export function clearZincirIntent(next) {
  next.zincirGorevIds = []
  next.zincirGorevNames = []
  next.zincirOnayIds = []
  next.zincirOnayNames = []
  next.zincirOnayWorkerId = ''
  next.zincirOnayWorkerName = ''
  if (Array.isArray(next.siraliSteps)) next.siraliSteps = []
}

export function inferModeFromText(text, currentMode = '') {
  const t = norm(text)
  if (isExplicitParallelAssignment(text)) return 'normal'
  if (
    /\b(birim(?:inde|de|i)?|birimindeki)\b/.test(t) &&
    /\b(herkese|herkes|hepsi|tum|tüm)\b/.test(t)
  ) {
    return 'normal'
  }
  if (currentMode && currentMode !== 'normal' && !isExplicitModeChange(text) && !isExplicitParallelAssignment(text)) {
    return currentMode
  }
  if (/\bsirali\b|\bsıralı\b/.test(t) && /\bdenetimci\b|\bdenetlesin\b|\bdenetim\b/.test(t)) {
    return 'sirali_gorev'
  }
  if (/zincir.*gorev.*ve.*onay|gorev.*ve.*onay.*zincir|ikisi birden/.test(t)) {
    return 'zincir_gorev_ve_onay'
  }
  if (/zincir.*onay|onay.*zincir|zincir onay/.test(t)) return 'zincir_onay'
  if (isExplicitSequentialChain(text)) return 'zincir_gorev'
  if (/\bzincir\s+gorev\b|\bzincir\s+görev\b|\bsirayla devret\b|\bsırayla devret\b/.test(t)) {
    return 'zincir_gorev'
  }
  if (/\bşablon\b|\bsablon\b|\bchecklist\b|\bkontrol listesi\b/.test(t)) return 'sablon_gorev'
  if (/\bstandart\b|\bnormal\b/.test(t) && /gorev|görev/.test(t)) return 'normal'
  return currentMode || 'normal'
}

export function parseAciklamaFromText(text) {
  const m = String(text || '').match(/(?:açıklama|aciklama|not)\s*[:：]\s*(.+)/i)
  return m ? m[1].trim() : ''
}

export { parseDatesFromText, parseScheduleFromText, applyScheduleFieldsToIntent } from './parseScheduleFromText.js'

export function parseOperationalFlags(text) {
  const t = norm(text)
  const op = {}
  if (/\bacil\b|\böncelikli\b|\boncelikli\b/.test(t)) op.acil = true
  if (/\bfoto\b|\bfotoğraf\b|\bfotograf\b/.test(t)) {
    op.foto_zorunlu = true
    const m = t.match(/(\d+)\s*foto/)
    op.min_foto_sayisi = m ? Math.min(5, Math.max(1, Number(m[1]))) : 1
  }
  if (/\bvideo\b/.test(t)) {
    op.video_zorunlu = true
    op.min_video_sayisi = 1
    const dur = t.match(/(\d+)\s*(?:sn|saniye|dk)/)
    op.max_video_suresi_sn = dur ? Math.min(60, Math.max(5, Number(dur[1]))) : 60
  }
  if (/\bbelge\b|\bpdf\b|\bdoküman\b|\bdokuman\b/.test(t)) {
    op.belge_zorunlu = true
    op.min_belge_sayisi = 1
  }
  if (/\baçıklama zorunlu\b|\baciklama zorunlu\b/.test(t)) op.aciklama_zorunlu = true
  if (/\bözel görev\b|\bozel gorev\b|\bbirebir\b/.test(t)) op.ozel_gorev = true
  const puanM = t.match(/(\d+)\s*puan/)
  if (puanM) op.puan = Math.max(0, Number(puanM[1]))
  if (/\bçoklu atama\b|\bcoklu atama\b|\bhepsine ayrı\b|\bherkese ayrı\b/.test(t)) {
    op.coklu_atama = true
  }
  if (/\bortak görev\b|\bortak gorev\b|\bbireysel değil\b/.test(t)) {
    op.coklu_atama = true
    op.bireysel = false
  }
  return op
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Türkçe iyelik/yönelme eki — Ali'ye, Mehmet'e, Ayşe'ye */
const TR_NAME_SUFFIX = `(?:['']?(?:ye|ya|e|a|ı|i|u|ü|ne|na|nin|nın|nun|nün|yi|yı|yu|yü))?`

/** Ad/soyad parçası — Eren'e, erene, Eren'e gibi ekleri de yakalar */
function nameTokensForPerson(p) {
  const full = norm(personLabel(p))
  const parts = [full, norm(p.ad), norm(p.soyad), ...full.split(/\s+/)]
  return [...new Set(parts.filter((w) => w.length > 2))]
}

function findNameTokenInText(token, text) {
  const re = new RegExp(`(?:^|[\\s,.])${escapeRe(token)}${TR_NAME_SUFFIX}(?:[\\s,.]|$)`, 'i')
  const m = text.match(re)
  if (!m) return -1
  return m.index ?? text.indexOf(token)
}

function isNegatedNameToken(text, token) {
  const t = norm(text)
  const tok = escapeRe(norm(token))
  if (tok.length < 3) return false
  return (
    new RegExp(`\\b${tok}(?:ye|ya|e|a|ne|na)?\\s+(değil|degil)\\b`).test(t) ||
    new RegExp(`\\b${tok}\\s+(değil|degil)\\b`).test(t)
  )
}

/** En uzun eşleşme önce — çift isim çakışmalarını azaltır */
export function matchPersonnelInText(text, roster = []) {
  const t = norm(text)
  const candidates = []
  for (const p of roster) {
    const full = norm(personLabel(p))
    if (full.length > 3 && t.includes(full)) {
      candidates.push({ p, len: full.length, start: t.indexOf(full) })
      continue
    }
    for (const token of nameTokensForPerson(p)) {
      if (isNegatedNameToken(t, token)) continue
      const start = findNameTokenInText(token, t)
      if (start >= 0) {
        candidates.push({ p, len: token.length, start })
        break
      }
    }
  }
  candidates.sort((a, b) => b.len - a.len || a.start - b.start)
  const usedSpans = []
  const hits = []
  for (const c of candidates) {
    const span = [c.start, c.start + c.len]
    const overlaps = usedSpans.some(([a, b]) => !(span[1] <= a || span[0] >= b))
    if (overlaps) continue
    if (hits.some((h) => String(h.id) === String(c.p.id))) continue
    usedSpans.push(span)
    hits.push(c.p)
  }
  return hits
}

export function matchTemplateInText(text, templates = []) {
  const t = norm(text)
  let best = null
  let bestScore = 0
  for (const tpl of templates) {
    const title = norm(tpl.baslik)
    if (!title) continue
    if (t.includes(title)) return tpl
    const words = title.split(' ').filter((w) => w.length > 3)
    const score = words.filter((w) => t.includes(w)).length
    if (score > bestScore && score >= Math.min(2, words.length)) {
      bestScore = score
      best = tpl
    }
  }
  return best
}

export function splitGorevOnaySections(text) {
  const raw = String(text || '')
  const m = raw.match(/\bonay\s*(?:zinciri|sirasi|sırası)?\s*[:：]\s*/i)
  if (m && m.index != null) {
    return { gorevPart: raw.slice(0, m.index), onayPart: raw.slice(m.index + m[0].length) }
  }
  return { gorevPart: raw, onayPart: '' }
}

function stripTitleLeadNoise(s) {
  return String(s || '')
    .replace(/^(?:[a-zçğıöşü0-9]+\s+)?ekip\s+üyelerine\s+/i, '')
    .replace(/^(?:sirasyla|sirasiyla|sırasıyla|sirayla|sırayla)\s+/i, '')
    .replace(/^(?:yarın|yarin|bugün|bugun)\s+/i, '')
    .replace(/\s+görevini?\s*$/i, '')
    .trim()
}

export function looksLikeOrderedNameList(text, roster = []) {
  const raw = String(text || '').trim()
  if (!raw || raw.length > 80) return false
  if (/\b(skt|kontrol|görev|gorev|github|repo|ata|yarın|yarin|saat)\b/i.test(raw)) return false
  const tokens = raw.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return false
  if (/\b(?:sonra|ardından|ardindan|,)\b/i.test(raw)) return true
  let hits = 0
  const usedIds = new Set()
  for (const token of tokens) {
    const m = matchPersonnelInText(token, roster).filter((p) => !usedIds.has(String(p.id)))
    if (!m[0]) return false
    usedIds.add(String(m[0].id))
    hits++
  }
  return hits >= 2
}

export function parseOrderedPeople(text, roster) {
  const raw = String(text || '').trim()
  const tokens = raw.split(/\s+/).filter(Boolean)

  if (tokens.length >= 2 && !/\b(?:sonra|ardından|ardindan|,)\b/i.test(raw)) {
    const usedIds = new Set()
    const ids = []
    const names = []
    let allMatched = true
    for (const token of tokens) {
      const m = matchPersonnelInText(token, roster).filter((p) => !usedIds.has(String(p.id)))
      if (!m[0]) {
        allMatched = false
        break
      }
      usedIds.add(String(m[0].id))
      ids.push(String(m[0].id))
      names.push(personLabel(m[0]))
    }
    if (allMatched && ids.length >= 2) return { ids, names }
  }

  const parts = raw
    .split(/\b(?:sonra|ardından|ardindan|ve|,)\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
  const ids = []
  const names = []
  for (const part of parts) {
    const m = matchPersonnelInText(part, roster)
    if (m[0]) {
      ids.push(String(m[0].id))
      names.push(personLabel(m[0]))
    }

  }
  return { ids, names }
}

/** zincir onay: "Mehmet yapsın, onay: Ali sonra Ayşe" */
export function parseZincirOnayWorkerAndChain(text, roster) {
  const raw = String(text || '')
  const workerMatch = raw.match(
    /(.+?)\s+(?:yapsın|yapsin|yapacak|yapar|yürütecek|yurutecek)\b/i,
  )
  let worker = null
  let rest = raw
  if (workerMatch) {
    worker = matchPersonnelInText(workerMatch[1], roster)[0]
    rest = raw.slice(workerMatch.index + workerMatch[0].length)
  }
  const { onayPart } = splitGorevOnaySections(rest)
  const chainText = onayPart || rest
  const chain = parseOrderedPeople(chainText, roster)
  return {
    workerId: worker ? String(worker.id) : null,
    workerName: worker ? personLabel(worker) : '',
    onayIds: chain.ids,
    onayNames: chain.names,
  }
}

export function parseSiraliPair(text, roster) {
  const patterns = [
    /(.+?)\s+(?:yapsın|yapsin|yapacak|yapar)\s+(.+?)\s+(?:denetlesin|denetimci|denetim\s+yapsın|onaylasın|onaylasin)/i,
    /(.+?)\s*[-–]\s*(.+?)\s+(?:denetlesin|denetim)/i,
  ]
  for (const re of patterns) {
    const m = String(text || '').match(re)
    if (!m) continue
    const worker = matchPersonnelInText(m[1], roster)[0]
    const auditor = matchPersonnelInText(m[2], roster)[0]
    if (!worker || !auditor) continue
    return {
      personel_id: String(worker.id),
      denetimci_personel_id: String(auditor.id),
      workerName: personLabel(worker),
      auditorName: personLabel(auditor),
    }
  }
  return null
}

function capitalizeTitle(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  return t.charAt(0).toLocaleUpperCase('tr') + t.slice(1)
}

export function extractTitleCandidate(text, roster, templates) {
  let s = String(text || '').trim()
  if (!s) return ''

  const sktM = String(text || '').match(/\b(skt\s+kontrol)\b/i)
  if (sktM?.[1]?.trim()) {
    return capitalizeTitle(sktM[1].trim())
  }

  const teamTaskM = String(text || '').match(
    /\bekib(?:ine|inde|i)\s+[-—]?\s*([a-zçğıöşüA-ZÇĞİÖŞÜ0-9][a-zçğıöşüA-ZÇĞİÖŞÜ0-9\s]{2,}?)(?:\s*[-—]|$)/i,
  )
  if (teamTaskM?.[1]?.trim() && !/^(herkese|hepsine|acil)$/i.test(teamTaskM[1].trim())) {
    const chunk = teamTaskM[1].trim().replace(/\s+(görev|gorev|ata)$/i, '')
    if (chunk.length >= 3) return capitalizeTitle(chunk)
  }

  const sktLegacyM = String(text || '').match(/\b(skt\s+kontrol[a-zçğıöşüü\s]*?)(?:\s+görev|\s+gorev|\s+ata|\s+yaptir|\s+yaptır|$)/i)
  if (sktLegacyM?.[1]?.trim().length >= 3) {
    return capitalizeTitle(sktLegacyM[1].trim())
  }

  const yaptirM = s.match(
    /(?:'e|'a|e)\s+(.+?)\s+(?:yaptır|yaptir|yaptırın|yaptirin|yapsın|yapsin|gönder|gonder|ata|at)\s*$/i,
  )
  if (yaptirM?.[1]?.trim().length >= 3) {
    return capitalizeTitle(yaptirM[1].trim())
  }

  const goreviniM = String(text || '').match(
    /\b(acil\s+olarak\s+)?([a-zçğıöşüü0-9\s]{3,}?)\s+görevini?\s+ata/i,
  )
  if (goreviniM?.[2]?.trim().length >= 3) {
    const cleaned = stripTitleLeadNoise(goreviniM[2].trim())
    if (cleaned.length >= 3) return capitalizeTitle(cleaned)
  }

  const aciklama = parseAciklamaFromText(s)
  if (aciklama) s = s.replace(/(?:açıklama|aciklama|not)\s*[:：].+/i, '')
  for (const p of roster) {
    const full = personLabel(p)
    if (full) s = s.replace(new RegExp(escapeRe(full), 'gi'), '')
    for (const token of nameTokensForPerson(p)) {
      s = s.replace(new RegExp(`${escapeRe(token)}${TR_NAME_SUFFIX}`, 'gi'), '')
    }
  }
  for (const tpl of templates) {
    if (tpl.baslik) s = s.replace(new RegExp(tpl.baslik.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  }
  s = s
    .replace(/\bonay\s*(?:zinciri)?\s*[:：].+/gi, '')
    .replace(
      /\b(yarın|yarin|bugün|bugun|acil|fotoğraf|foto|video|belge|şablon|sablon|zincir|denetimci|denetlesin|yapsın|yapsin|yaptır|yaptir|onaylasın|ata|at|görev|gorev|ver|olsun)\b/gi,
      ' ',
    )
    .replace(/\b(sonra|ve|,|\.)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const quoted = String(text || '').match(/["'«]([^"'»]+)["'»]/)
  if (quoted?.[1]?.trim().length >= 3) {
    return quoted[1].trim().charAt(0).toUpperCase() + quoted[1].trim().slice(1)
  }

  const konu = s.match(
    /(?:için|olarak|görev[:\s]+|gorev[:\s]+)([a-zçğıöşü0-9\s\-]{3,})/i,
  )
  if (konu?.[1]?.trim().length >= 3) {
    const k = konu[1].trim()
    return k.charAt(0).toUpperCase() + k.slice(1)
  }

  if (s.length < 3) return ''
  return capitalizeTitle(s)
}

export function isConfirmIntent(text) {
  const t = norm(text)
  return (
    /^(tamam|hazır|hazir|oluştur|olustur|devam|onayla|gönder|gonder|evet|ok|ata|at|olsun|yap|başlat|baslat|hemen|şimdi|simdi)$/.test(t) ||
    /\b(görevi oluştur|gorevi olustur|görevi ata|gorevi ata|görevi at|gorevi at|atamayı tamamla|atamayi tamamla|görevi gönder|gorevi gonder|onaylıyorum|onayliyorum|devam et)\b/.test(t)
  )
}

/** Hazır intent varken kullanıcı atama/onay niyeti mi? */
export function shouldAutoAssignTask(userText, ready) {
  if (!ready) return false
  if (isConfirmIntent(userText)) return true
  const t = norm(userText)
  if (t.length > 50) return false
  if (/\b(değiştir|degistir|düzelt|duzelt|iptal|vazgeç|vazgec|manuel|bekle|dur|hayır|hayir)\b/.test(t)) {
    return false
  }
  return /^(tamam|evet|ok|olsun|uygun|doğru|dogru|devam|hemen|şimdi|simdi|onayla|gönder|gonder|başlat|baslat|hadi|peki)([\s,!?.]|$)/.test(t)
}

/** LLM yanıtı atama eylemi bildiriyor mu? */
export function isAssignActionReply(text) {
  const t = norm(text)
  return /\b(atiyorum|atıyorum|olusturuyorum|oluşturuyorum|hazirliyorum|hazırlıyorum|kaydediyorum|olusturdum|oluşturdum|atadim|atadım|atandi|atandı)\b/.test(t)
}

/** Kullanıcı intent'i düzeltmek / iptal etmek mi istiyor? */
export function isRevisionIntent(text) {
  const raw = String(text || '').trim()
  const t = norm(text)
  if (/^(iptal|vazgec|vazgeç|bekle)$/i.test(raw)) return true
  return /\b(değiştir|degistir|düzelt|duzelt|yanlış|yanlis|farkli|farklı|iptal et|vazgec|vazgeç)\b/.test(t)
}

/** Intent tamamlandığında otomatik atama tetiklensin mi? */
export function shouldAutoAssignWhenReady(userText, ready) {
  if (!ready) return false
  if (isRevisionIntent(userText)) return false
  return true
}

export function modeOptionsForHelp() {
  return GOREV_MODU_OPTIONS
}
