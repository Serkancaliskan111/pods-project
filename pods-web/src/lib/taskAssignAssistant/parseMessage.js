import { GOREV_MODU_OPTIONS } from '../gorevModuOptions'

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

export function inferModeFromText(text, currentMode = '') {
  const t = norm(text)
  if (currentMode && currentMode !== 'normal' && !isExplicitModeChange(text)) {
    return currentMode
  }
  if (/\bsirali\b|\bsıralı\b/.test(t) && /\bdenetimci\b|\bdenetlesin\b|\bdenetim\b/.test(t)) {
    return 'sirali_gorev'
  }
  if (/zincir.*gorev.*ve.*onay|gorev.*ve.*onay.*zincir|ikisi birden/.test(t)) {
    return 'zincir_gorev_ve_onay'
  }
  if (/zincir.*onay|onay.*zincir|zincir onay/.test(t)) return 'zincir_onay'
  if (/\bzincir\b|\bsirayla devret\b|\bsırayla devret\b/.test(t)) return 'zincir_gorev'
  if (/\bşablon\b|\bsablon\b|\bchecklist\b|\bkontrol listesi\b/.test(t)) return 'sablon_gorev'
  if (/\bstandart\b|\bnormal\b/.test(t) && /gorev|görev/.test(t)) return 'normal'
  return currentMode || 'normal'
}

export function parseDatesFromText(text) {
  const t = norm(text)
  const out = {}
  if (/\bbugün\b|\bbugun\b/.test(t)) out.baslangic = todayYmd()
  if (/\byarın\b|\byarin\b/.test(t)) out.baslangic = addDaysYmd(1)
  if (/\bgelecek hafta\b/.test(t)) out.baslangic = addDaysYmd(7)
  const range = t.match(/(\d+)\s*gün/)
  if (range && out.baslangic) {
    out.bitis = addDaysYmd(Number(range[1]))
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) out.baslangic = iso[0]
  const trDate = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/)
  if (trDate) {
    const day = Number(trDate[1])
    const month = Number(trDate[2])
    let year = trDate[3] ? Number(trDate[3]) : new Date().getFullYear()
    if (year < 100) year += 2000
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      out.baslangic = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  const bitisMatch = t.match(/\bbitiş\b|\bbitis\b|\bkadar\b/)
  if (bitisMatch) {
    const secondDate = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g)
    if (secondDate?.length > 1) {
      const trDate2 = secondDate[1].match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/)
      if (trDate2) {
        const day = Number(trDate2[1])
        const month = Number(trDate2[2])
        let year = trDate2[3] ? Number(trDate2[3]) : new Date().getFullYear()
        if (year < 100) year += 2000
        out.bitis = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }
  if (out.baslangic && !out.bitis) out.bitis = out.baslangic
  return out
}

export function parseAciklamaFromText(text) {
  const m = String(text || '').match(/(?:açıklama|aciklama|not)\s*[:：]\s*(.+)/i)
  return m ? m[1].trim() : ''
}

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

/** En uzun eşleşme önce — çift isim çakışmalarını azaltır */
export function matchPersonnelInText(text, roster = []) {
  const t = norm(text)
  const candidates = []
  for (const p of roster) {
    const full = norm(personLabel(p))
    const ad = norm(p.ad)
    if (full.length > 3 && t.includes(full)) {
      candidates.push({ p, len: full.length, start: t.indexOf(full) })
    } else if (ad.length > 2 && t.includes(ad)) {
      candidates.push({ p, len: ad.length, start: t.indexOf(ad) })
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

export function parseOrderedPeople(text, roster) {
  const parts = String(text || '')
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

export function extractTitleCandidate(text, roster, templates) {
  let s = String(text || '').trim()
  if (!s) return ''
  const aciklama = parseAciklamaFromText(s)
  if (aciklama) s = s.replace(/(?:açıklama|aciklama|not)\s*[:：].+/i, '')
  for (const p of roster) {
    const full = personLabel(p)
    if (full) s = s.replace(new RegExp(full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    if (p.ad) s = s.replace(new RegExp(String(p.ad).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  }
  for (const tpl of templates) {
    if (tpl.baslik) s = s.replace(new RegExp(tpl.baslik.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  }
  s = s
    .replace(/\bonay\s*(?:zinciri)?\s*[:：].+/gi, '')
    .replace(/\b(yarın|yarin|bugün|bugun|acil|fotoğraf|foto|video|belge|şablon|sablon|zincir|denetimci|denetlesin|yapsın|yapsin|onaylasın)\b/gi, '')
    .replace(/\b(sonra|ve|,|\.)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length < 3) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function isConfirmIntent(text) {
  const t = norm(text)
  return (
    /^(tamam|hazır|hazir|oluştur|olustur|devam|onayla|gönder|gonder|evet|ok)$/.test(t) ||
    /\b(görevi oluştur|gorevi olustur|atamayı tamamla|atamayi tamamla)\b/.test(t)
  )
}

export function modeOptionsForHelp() {
  return GOREV_MODU_OPTIONS
}
