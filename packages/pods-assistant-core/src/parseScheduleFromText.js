function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function localYmd(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayYmd() {
  return localYmd(new Date())
}

function addDaysYmd(days, fromYmd = null) {
  const base = fromYmd ? new Date(`${fromYmd}T12:00:00`) : new Date()
  base.setDate(base.getDate() + days)
  return localYmd(base)
}

function ymdFromParts(day, month, year = new Date().getFullYear()) {
  let y = year
  if (y < 100) y += 2000
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseTrDateToken(token) {
  const m = String(token || '').match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/)
  if (!m) return ''
  const year = m[3] ? Number(m[3]) : new Date().getFullYear()
  return ymdFromParts(Number(m[1]), Number(m[2]), year)
}

const WEEKDAYS = {
  pazartesi: 1,
  sali: 2,
  carsamba: 3,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
  pazar: 0,
}

function nextWeekdayYmd(targetDow, fromDate = new Date()) {
  const d = new Date(fromDate)
  d.setHours(12, 0, 0, 0)
  const current = d.getDay()
  let delta = (targetDow - current + 7) % 7
  if (delta === 0) delta = 7
  d.setDate(d.getDate() + delta)
  return localYmd(d)
}

function parseAllClockTimes(text, t, { allowBareHour = false } = {}) {
  const times = []
  const seen = new Set()

  const add = (h, m = '00') => {
    const hour = Math.min(23, Math.max(0, Number(h)))
    const token = `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    if (!seen.has(token)) {
      seen.add(token)
      times.push(token)
    }
  }

  const range = String(text || '').match(/\b(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})\b/)
  if (range) {
    add(range[1], range[2])
    add(range[3], range[4])
    return times
  }

  const between = String(text || '').match(/\b(\d{1,2})[:.](\d{2})\s*(?:ile|ve)\s*(\d{1,2})[:.](\d{2})\s*ar/i)
  if (between) {
    add(between[1], between[2])
    add(between[3], between[4])
    return times
  }

  let hm
  const hmRe = /\b(\d{1,2})[:.](\d{2})\b/g
  while ((hm = hmRe.exec(String(text || '')))) {
    add(hm[1], hm[2])
  }

  const saatWordRe = /\bsaat\s*(\d{1,2})\b/g
  while ((hm = saatWordRe.exec(t))) {
    add(hm[1], '00')
  }

  const apostropheRe = /\b(\d{1,2})\s*['']?(?:da|de|ta|te)\b/gi
  while ((hm = apostropheRe.exec(String(text || '')))) {
    let h = Number(hm[1])
    const slice = String(text || '').slice(Math.max(0, hm.index - 20), hm.index + hm[0].length + 20)
    if (/\bak[sş]am|aksam|gece|ogleden\s+sonra|öğleden\s+sonra/i.test(slice) && h <= 12) h += 12
    add(h, '00')
  }

  // Yalnızca saat gap'inde: "11", "9", "17"
  if (!times.length && allowBareHour) {
    const bare = String(text || '')
      .trim()
      .match(/^(\d{1,2})(?:\s*(?:da|de|ta|te))?$/i)
    if (bare) {
      add(bare[1], '00')
      return times
    }
  }

  if (!times.length) {
    const single = parseClockTime(text, t, { allowBareHour })
    if (single) times.push(single)
  }

  return times
}

function parseClockTime(text, t, { allowBareHour = false } = {}) {
  const hm = String(text || '').match(/\b(\d{1,2})[:.](\d{2})\b/)
  if (hm) {
    const h = Math.min(23, Math.max(0, Number(hm[1])))
    return `${String(h).padStart(2, '0')}:${hm[2]}`
  }

  const saatWord = t.match(/\bsaat\s*(\d{1,2})\b/)
  if (saatWord) {
    const h = Math.min(23, Math.max(0, Number(saatWord[1])))
    return `${String(h).padStart(2, '0')}:00`
  }

  const apostrophe = String(text || '').match(/(\d{1,2})\s*['']?(?:da|de|ta|te)\b/i)
  if (apostrophe) {
    let h = Number(apostrophe[1])
    if (/\bak[sş]am|aksam|gece|ogleden\s+sonra|öğleden\s+sonra/i.test(text) && h <= 12) h += 12
    if (h <= 23) return `${String(h).padStart(2, '0')}:00`
  }

  const bare = allowBareHour
    ? String(text || '')
        .trim()
        .match(/^(\d{1,2})(?:\s*(?:da|de|ta|te))?$/i)
    : null
  if (bare) {
    const h = Math.min(23, Math.max(0, Number(bare[1])))
    return `${String(h).padStart(2, '0')}:00`
  }

  if (/\bsabah\b/.test(t)) return '09:00'
  if (/\böğlen\b|\boglen\b|\bögle\b|\bogle\b/.test(t)) return '12:00'
  if (/\baksam\b|\bakşam\b/.test(t)) return '18:00'
  if (/\bgece\b/.test(t)) return '21:00'

  return ''
}

function isDeadlineContext(t) {
  return /\b(kadar|bitis|bitiş|son\s*tarih|deadline|en\s+gec|en\s+geç|e\s+kadar)\b/.test(t)
}

function isStartContext(t) {
  return /\b(baslasin|başlasın|baslangic|başlangıç|itibaren|den\s+itibaren|baslayacak|başlayacak|baslayarak|başlayarak)\b/.test(t)
}

function isBetweenContext(t) {
  return /\baras/i.test(t) && /\b(ile|ve)\b/.test(t)
}

/**
 * Türkçe doğal dil → tarih/saat intent alanları.
 * @returns {{
 *   baslangic?: string,
 *   bitis?: string,
 *   baslamaSaat?: string,
 *   bitisSaat?: string,
 *   scheduleStart?: boolean,
 *   immediate?: boolean,
 * }}
 */
export function parseScheduleFromText(text, { timeRole = 'auto' } = {}) {
  const raw = String(text || '')
  const t = norm(raw)
  const out = {}

  if (/\b(hemen|simdi|şimdi|hemen\s+ata|bugün\s+bitsin)\b/.test(t) && !/\b(kadar|bitis|bitiş)\b/.test(t)) {
    out.immediate = true
    return out
  }

  const clocks = parseAllClockTimes(raw, t, { allowBareHour: timeRole !== 'auto' })
  const clock = clocks[0] || ''
  const secondClock = clocks[1] || ''
  const deadlineCtx = isDeadlineContext(t)
  const startCtx = isStartContext(t)
  const betweenCtx = isBetweenContext(t)

  if (/\bbugün\b|\bbugun\b/.test(t)) {
    if (deadlineCtx || clock) out.bitis = todayYmd()
    else out.baslangic = todayYmd()
  }
  if (/\byarin\b|\byarın\b/.test(t)) {
    const y = addDaysYmd(1)
    if (deadlineCtx || (clock && !startCtx)) out.bitis = y
    else out.baslangic = y
  }
  if (/\bgelecek\s+hafta\b/.test(t)) out.baslangic = addDaysYmd(7)
  if (/\bbu\s+hafta\s+sonu\b/.test(t)) out.bitis = nextWeekdayYmd(0)

  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const ymd = nextWeekdayYmd(dow)
      if (deadlineCtx || (clock && !startCtx)) out.bitis = ymd
      else out.baslangic = ymd
      break
    }
  }

  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) {
    if (deadlineCtx) out.bitis = iso[0]
    else out.baslangic = iso[0]
  }

  const trDates = raw.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g)
  if (trDates?.length) {
    const first = parseTrDateToken(trDates[0])
    const second = trDates.length > 1 ? parseTrDateToken(trDates[1]) : ''
    if (deadlineCtx && first) out.bitis = first
    else if (first) out.baslangic = first
    if (second) out.bitis = second
  }

  const daysRange = t.match(/(\d+)\s*gun(?:\s+icinde|\s+içinde)?/)
  if (daysRange) {
    const base = out.baslangic || todayYmd()
    out.bitis = addDaysYmd(Number(daysRange[1]), base)
    if (!out.baslangic && !startCtx) out.baslangic = todayYmd()
  }

  const hoursRange = t.match(/(\d+)\s*saat(?:\s+icinde|\s+içinde)?/)
  if (hoursRange) {
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + Number(hoursRange[1]))
    out.bitis = localYmd(deadline)
    out.bitisSaat = `${String(deadline.getHours()).padStart(2, '0')}:${String(deadline.getMinutes()).padStart(2, '0')}`
    out.relativeDeadline = true
    if (!out.baslangic) out.baslangic = todayYmd()
  }

  if (clocks.length >= 2 || betweenCtx) {
    out.baslamaSaat = clocks[0]
    out.bitisSaat = clocks[1] || clocks[0]
    out.scheduleStart = true
    if (!out.baslangic && !out.bitis) {
      out.baslangic = todayYmd()
      out.bitis = todayYmd()
    } else if (out.baslangic && !out.bitis) {
      out.bitis = out.baslangic
    } else if (!out.baslangic && out.bitis) {
      out.baslangic = out.bitis
    }
  } else if (clock) {
    const assignStart =
      timeRole === 'start' ||
      (timeRole === 'auto' && (startCtx || (out.baslangic && !deadlineCtx && !out.bitis)))
    const assignEnd =
      timeRole === 'end' ||
      (timeRole === 'auto' && (deadlineCtx || (out.bitis && !startCtx) || !assignStart))

    if (assignStart && !assignEnd) {
      out.baslamaSaat = clock
      if (out.baslangic) out.scheduleStart = true
    } else if (assignEnd) {
      out.bitisSaat = clock
    } else {
      out.baslamaSaat = clock
      if (out.baslangic) out.scheduleStart = true
    }
  }

  if (secondClock && !out.bitisSaat) out.bitisSaat = secondClock

  if ((startCtx || out.baslamaSaat) && out.baslangic) {
    out.scheduleStart = true
  }

  if (out.baslangic && !out.bitis && !deadlineCtx && !clock) {
    out.bitis = out.baslangic
  }

  if (out.baslangic && out.baslangic !== todayYmd() && startCtx) {
    out.scheduleStart = true
  }

  return out
}

/** Eski API — parseDatesFromText ile uyumlu */
export function parseDatesFromText(text) {
  const s = parseScheduleFromText(text)
  const out = {}
  if (s.baslangic) out.baslangic = s.baslangic
  if (s.bitis) out.bitis = s.bitis
  if (s.baslamaSaat) out.baslamaSaat = s.baslamaSaat
  if (s.bitisSaat) out.bitisSaat = s.bitisSaat
  if (s.scheduleStart != null) out.scheduleStart = s.scheduleStart
  if (s.immediate != null) out.immediate = s.immediate
  return out
}

export function applyScheduleFieldsToIntent(next, schedule, { expectedGap = '' } = {}) {
  if (!schedule || typeof schedule !== 'object') return next
  if (schedule.immediate) {
    next.baslangic = ''
    next.bitis = ''
    next.baslamaSaat = ''
    next.bitisSaat = ''
    next.scheduleStart = false
    next.relativeDeadline = false
    next.tarihConfirmed = true
    return next
  }

  const timeRole =
    expectedGap === 'tarih_baslangic_saat' ? 'start' : expectedGap === 'tarih_bitis_saat' ? 'end' : 'auto'

  if (schedule.baslangic) next.baslangic = schedule.baslangic
  if (schedule.bitis) {
    const today = todayYmd()
    const intentDate = next.baslangic || next.bitis
    const clockOnlyInjectedToday =
      timeRole !== 'auto' &&
      schedule.bitis === today &&
      intentDate &&
      intentDate !== today &&
      !schedule.baslangic
    if (!clockOnlyInjectedToday) next.bitis = schedule.bitis
  }
  if (schedule.baslamaSaat) next.baslamaSaat = schedule.baslamaSaat
  if (schedule.bitisSaat) next.bitisSaat = schedule.bitisSaat
  if (schedule.relativeDeadline) next.relativeDeadline = true
  if (schedule.scheduleStart != null) next.scheduleStart = !!schedule.scheduleStart
  if (schedule.baslamaSaat && schedule.baslangic) next.scheduleStart = true

  if (next.baslangic && !next.bitis) next.bitis = next.baslangic
  if (!next.baslangic && next.bitis) next.baslangic = next.bitis
  return next
}
