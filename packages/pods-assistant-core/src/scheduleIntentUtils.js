function localTodayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysYmd(days, fromYmd) {
  const base = fromYmd ? new Date(`${fromYmd}T12:00:00`) : new Date()
  base.setDate(base.getDate() + days)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

export function hasScheduleDate(intent) {
  return !!(intent?.baslangic || intent?.bitis)
}

export function hasScheduleStartTime(intent) {
  return !!String(intent?.baslamaSaat || '').match(/^\d{1,2}:\d{2}$/)
}

export function hasScheduleEndTime(intent) {
  return !!String(intent?.bitisSaat || '').match(/^\d{1,2}:\d{2}$/)
}

/** @deprecated use hasScheduleStartTime/hasScheduleEndTime */
export function hasScheduleTime(intent) {
  return hasScheduleStartTime(intent) || hasScheduleEndTime(intent)
}

/** Hemen / tarih fark etmez — saat gerekmez */
export function isOpenEndedSchedule(intent) {
  return !!intent?.tarihConfirmed && !hasScheduleDate(intent) && !hasScheduleTime(intent)
}

/** "3 saat içinde" gibi göreli bitiş — başlangıç saati sorulmaz */
export function isRelativeDeadline(intent) {
  return !!intent?.relativeDeadline && hasScheduleDate(intent) && hasScheduleEndTime(intent)
}

function clockToMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function effectiveStartYmd(intent) {
  return String(intent?.baslangic || intent?.bitis || '').slice(0, 10)
}

function effectiveEndYmd(intent) {
  return String(intent?.bitis || intent?.baslangic || '').slice(0, 10)
}

/**
 * Zamanlama tutarlılığı — kullanıcıya gösterilecek mesaj + hangi gap'te kalınacağı.
 * @returns {{ valid: boolean, issue?: string, retryGap?: string }}
 */
export function validateScheduleIntent(intent) {
  if (isOpenEndedSchedule(intent)) return { valid: true }
  if (!hasScheduleDate(intent)) {
    return { valid: false, retryGap: 'tarih' }
  }
  if (isRelativeDeadline(intent)) {
    return { valid: true }
  }

  if (!hasScheduleStartTime(intent)) {
    return { valid: false, retryGap: 'tarih_baslangic_saat' }
  }
  if (!hasScheduleEndTime(intent)) {
    return { valid: false, retryGap: 'tarih_bitis_saat' }
  }

  const startYmd = effectiveStartYmd(intent)
  const endYmd = effectiveEndYmd(intent)
  if (startYmd && endYmd && startYmd > endYmd) {
    return {
      valid: false,
      issue: 'Başlangıç tarihi bitiş tarihinden sonra olamaz. Tarihi yeniden yazar mısınız?',
      retryGap: 'tarih',
    }
  }

  const startMin = clockToMinutes(intent.baslamaSaat)
  const endMin = clockToMinutes(intent.bitisSaat)
  if (startMin == null || endMin == null) {
    return { valid: false, retryGap: !hasScheduleStartTime(intent) ? 'tarih_baslangic_saat' : 'tarih_bitis_saat' }
  }

  if (startYmd === endYmd && startMin >= endMin) {
    return {
      valid: false,
      issue: `Bitiş saati (${intent.bitisSaat}) başlangıç saatinden (${intent.baslamaSaat}) **sonra** olmalı. Bitiş saati kaç olsun?`,
      retryGap: 'tarih_bitis_saat',
    }
  }

  const today = localTodayYmd()
  if (startYmd === today) {
    const startDt = new Date(`${startYmd}T${intent.baslamaSaat}:00`)
    if (startDt.getTime() < Date.now() - 60_000) {
      return {
        valid: false,
        issue: `Bugün için **${intent.baslamaSaat}** geçmiş bir saat. Başlangıç saati kaç olsun?`,
        retryGap: 'tarih_baslangic_saat',
      }
    }
  }

  if (endYmd === today) {
    const endDt = new Date(`${endYmd}T${intent.bitisSaat}:00`)
    if (endDt.getTime() < Date.now() - 60_000) {
      return {
        valid: false,
        issue: `Bugün için **${intent.bitisSaat}** geçmiş bir saat. Bitiş saati kaç olsun?`,
        retryGap: 'tarih_bitis_saat',
      }
    }
  }

  return { valid: true }
}

export function isTarihFullyConfirmed(intent) {
  if (isOpenEndedSchedule(intent)) return true
  if (!hasScheduleDate(intent)) return false
  return validateScheduleIntent(intent).valid
}

export function formatScheduleDateLabel(ymd) {
  const d = String(ymd || '').slice(0, 10)
  if (!d) return ''
  const today = localTodayYmd()
  if (d === today) return 'Bugün'
  if (d === addDaysYmd(1, today)) return 'Yarın'
  const [y, m, day] = d.split('-')
  if (y && m && day) return `${Number(day)}.${Number(m)}.${y}`
  return d
}

/** Operasyonel gap sırası: tarih → başlangıç saati → bitiş saati */
export function scheduleCollectGap(intent) {
  if (isTarihFullyConfirmed(intent)) return null
  if (!hasScheduleDate(intent)) return 'tarih'
  const v = validateScheduleIntent(intent)
  return v.retryGap || 'tarih'
}

/** @deprecated scheduleCollectGap kullanın */
export function scheduleGapKind(intent) {
  return scheduleCollectGap(intent)
}

/** Intent tarihlerini koruyarak saat-only schedule birleştir */
export function mergeScheduleDatesWithIntent(schedule, intent = {}) {
  const today = localTodayYmd()
  const intentStart = String(intent.baslangic || '').slice(0, 10)
  const intentEnd = String(intent.bitis || intent.baslangic || '').slice(0, 10)
  const schedStart = String(schedule.baslangic || '').slice(0, 10)
  const schedEnd = String(schedule.bitis || '').slice(0, 10)
  const clockOnly = !!(schedule.baslamaSaat || schedule.bitisSaat) && !schedStart
  const spuriousTodayEnd = clockOnly && schedEnd === today && intentStart && intentStart !== today

  let baslangic = schedStart || intentStart || ''
  let bitis = spuriousTodayEnd ? intentEnd || intentStart : schedEnd || intentEnd || baslangic || intentStart || ''

  if (!bitis && baslangic) bitis = baslangic
  if (!baslangic && bitis) baslangic = bitis

  return { baslangic, bitis }
}
