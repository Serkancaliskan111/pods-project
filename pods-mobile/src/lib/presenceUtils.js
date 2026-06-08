/** Mobil presence: heartbeat tazeliği ve uyarı eşikleri */
export const PRESENCE_STALE_MS = 12 * 1000
export const UNSEEN_WARNING_MS = 2 * 60 * 60 * 1000
export const NO_TASK_ACTIVITY_WARNING_MS = 4 * 60 * 60 * 1000

export function formatTs(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR')
}

export function formatRelativeTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'az önce'
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return 'az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  if (diffHour < 24) return `${diffHour} saat önce`
  if (diffDay < 7) return `${diffDay} gün önce`
  return date.toLocaleDateString('tr-TR')
}

export function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h === 0) return `${m} dk`
  if (h < 48) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`
  const d = Math.floor(h / 24)
  const rh = h % 24
  if (rh === 0) return `${d} gün`
  return `${d} gün ${rh} sa`
}

export function isPresenceFresh(value, staleMs = PRESENCE_STALE_MS) {
  if (!value) return false
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= staleMs
}

export function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

export function getRangeStart(rangeKey) {
  const now = new Date()
  if (rangeKey === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  }
  if (rangeKey === 'week') {
    const day = now.getDay()
    const diffToMonday = day === 0 ? 6 : day - 1
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0)
  }
  if (rangeKey === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  }
  if (rangeKey === 'year') {
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
  }
  return startOfToday()
}

export function getRangeDaysElapsed(rangeStart, rangeEnd = new Date()) {
  const ms = Math.max(0, rangeEnd.getTime() - rangeStart.getTime())
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export function getRangeLabel(rangeKey) {
  if (rangeKey === 'day') return 'Bugün'
  if (rangeKey === 'week') return 'Bu hafta'
  if (rangeKey === 'month') return 'Bu ay'
  if (rangeKey === 'year') return 'Bu yıl'
  return 'Dönem'
}

/**
 * Personel satırı + son log ile çevrimiçi durumu çözümler.
 */
export function resolveStaffOnlineState(person, latestLog, { presenceColumnsAvailable = true } = {}) {
  const rawOnlineFromColumns = presenceColumnsAvailable
    ? !!person?.mobil_online
    : latestLog?.durum === 'online'
  const lastSeen = person?.mobil_last_seen_at || latestLog?.kaydedildi_at || null
  let online = rawOnlineFromColumns && isPresenceFresh(lastSeen)

  if (latestLog?.durum === 'offline') {
    online = false
  } else if (latestLog?.durum === 'online') {
    online = isPresenceFresh(latestLog?.kaydedildi_at || lastSeen)
  }

  return {
    mobil_online: online,
    mobil_online_at:
      person?.mobil_online_at ||
      (latestLog?.durum === 'online' ? latestLog?.kaydedildi_at : null),
    mobil_last_seen_at: lastSeen,
    mobil_last_offline_at:
      person?.mobil_last_offline_at ||
      (latestLog?.durum === 'offline' ? latestLog?.kaydedildi_at : null),
  }
}

function clampTs(ts, rangeStartMs, rangeEndMs) {
  return Math.max(rangeStartMs, Math.min(ts, rangeEndMs))
}

function touchActiveDays(set, startMs, endMs) {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor.getTime() <= last.getTime()) {
    set.add(cursor.toDateString())
    cursor.setDate(cursor.getDate() + 1)
  }
}

/**
 * Online/offline loglarından dönem içi süreleri hesaplar.
 * Uzun dönemlerde "tüm ay çevrimiçi" gibi hatalı sonuçları önler.
 */
export function computeOnlineDurationMetrics(
  logsAsc,
  { beforeRangeLog, rangeStart, rangeEnd = new Date(), lastSeenAt, isCurrentlyFresh },
) {
  const rangeStartMs = rangeStart.getTime()
  const rangeEndMs = rangeEnd.getTime()
  const maxRangeMs = Math.max(0, rangeEndMs - rangeStartMs)

  let totalMs = 0
  const sessionIntervals = []
  const activeDays = new Set()
  let activeStartMs = null

  const beforeTs = beforeRangeLog?.kaydedildi_at
    ? new Date(beforeRangeLog.kaydedildi_at).getTime()
    : NaN
  const carryOnline =
    beforeRangeLog?.durum === 'online' && !Number.isNaN(beforeTs) && beforeTs < rangeStartMs

  if (carryOnline) {
    activeStartMs = rangeStartMs
  }

  const sorted = [...(logsAsc || [])].sort(
    (a, b) => new Date(a.kaydedildi_at).getTime() - new Date(b.kaydedildi_at).getTime(),
  )

  for (const log of sorted) {
    const rawTs = new Date(log.kaydedildi_at).getTime()
    if (Number.isNaN(rawTs)) continue
    const ts = clampTs(rawTs, rangeStartMs, rangeEndMs)

    if (log.durum === 'online') {
      if (activeStartMs == null) activeStartMs = ts
    } else if (log.durum === 'offline' && activeStartMs != null) {
      const dur = Math.max(0, ts - activeStartMs)
      if (dur > 0) {
        totalMs += dur
        sessionIntervals.push({ startMs: activeStartMs, endMs: ts, durationMs: dur, open: false })
        touchActiveDays(activeDays, activeStartMs, ts)
      }
      activeStartMs = null
    }
  }

  if (activeStartMs != null) {
    const lastLog = sorted[sorted.length - 1]
    const lastWasOnline = !lastLog || lastLog.durum === 'online'

    if (lastWasOnline && isCurrentlyFresh) {
      let endMs = rangeEndMs
      if (lastSeenAt) {
        const ls = new Date(lastSeenAt).getTime()
        if (!Number.isNaN(ls)) endMs = Math.min(endMs, ls)
      }
      endMs = clampTs(endMs, rangeStartMs, rangeEndMs)
      const dur = Math.max(0, endMs - activeStartMs)
      if (dur > 0) {
        totalMs += dur
        sessionIntervals.push({ startMs: activeStartMs, endMs, durationMs: dur, open: true })
        touchActiveDays(activeDays, activeStartMs, endMs)
      }
    } else if (lastWasOnline && lastSeenAt) {
      const ls = clampTs(new Date(lastSeenAt).getTime(), rangeStartMs, rangeEndMs)
      const dur = Math.max(0, ls - activeStartMs)
      if (dur > 0) {
        totalMs += dur
        sessionIntervals.push({ startMs: activeStartMs, endMs: ls, durationMs: dur, open: false })
        touchActiveDays(activeDays, activeStartMs, ls)
      }
    }
  }

  totalMs = Math.min(totalMs, maxRangeMs)

  for (const iv of sessionIntervals) {
    touchActiveDays(activeDays, iv.startMs, iv.endMs)
  }
  for (const log of sorted) {
    const d = new Date(log.kaydedildi_at)
    if (!Number.isNaN(d.getTime())) activeDays.add(d.toDateString())
  }

  const daysInRange = getRangeDaysElapsed(rangeStart, rangeEnd)
  const activeDayCount = activeDays.size
  const onlineEventsInRange = sorted.filter((l) => l.durum === 'online').length

  return {
    totalMs,
    sessionIntervals,
    sessionsInRange: sessionIntervals.length || onlineEventsInRange,
    onlineEventsInRange,
    activeDayCount,
    daysInRange,
    dailyAvgMs: Math.floor(totalMs / daysInRange),
    activeDayAvgMs: activeDayCount > 0 ? Math.floor(totalMs / activeDayCount) : 0,
    avgSessionMs:
      sessionIntervals.length > 0 ? Math.floor(totalMs / sessionIntervals.length) : 0,
  }
}

/** Detay sayfası metrik kartları — döneme göre anlamlı etiketler */
export function buildPresenceMetricCards(rangeKey, metrics) {
  const period = getRangeLabel(rangeKey)
  const cards = [
    {
      label: `${period} toplam`,
      value: formatDuration(metrics.totalMs),
      tone: 'executive',
    },
  ]

  if (rangeKey === 'day') {
    cards.push(
      { label: 'Oturum', value: metrics.sessionsInRange, tone: 'surface' },
      {
        label: 'Ort. oturum',
        value: metrics.avgSessionMs > 0 ? formatDuration(metrics.avgSessionMs) : '—',
        tone: 'surface',
      },
    )
  } else {
    cards.push(
      { label: 'Aktif gün', value: metrics.activeDayCount, tone: 'surface' },
      {
        label: 'Günlük ortalama',
        value: metrics.dailyAvgMs > 0 ? formatDuration(metrics.dailyAvgMs) : '—',
        tone: 'surface',
        hint: `${metrics.daysInRange} günlük dönem`,
      },
      {
        label: 'Aktif gün başına',
        value:
          metrics.activeDayCount > 0 && metrics.activeDayAvgMs > 0
            ? formatDuration(metrics.activeDayAvgMs)
            : '—',
        tone: 'surface',
      },
    )
  }

  return cards
}

export function buildSessionTimelineRows(sessionIntervals) {
  return (sessionIntervals || []).map((iv, idx) => ({
    id: `${iv.startMs}-${idx}`,
    start: new Date(iv.startMs),
    end: new Date(iv.endMs),
    durationMs: iv.durationMs,
    open: !!iv.open,
  }))
}

/** Bugün saatlik çevrimiçi olay sayısı (benzersiz personel / saat) */
export function buildTodayHourlyActivity(logs, { rangeStart = startOfToday() } = {}) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    uniquePeople: new Set(),
    events: 0,
  }))

  for (const log of logs || []) {
    if (log.durum !== 'online' || !log.personel_id) continue
    const d = new Date(log.kaydedildi_at)
    if (Number.isNaN(d.getTime()) || d < rangeStart) continue
    const h = d.getHours()
    buckets[h].events += 1
    buckets[h].uniquePeople.add(String(log.personel_id))
  }

  return buckets.map((b) => ({
    hour: b.hour,
    label: b.label,
    events: b.events,
    count: b.uniquePeople.size,
  }))
}

export function personConnectedToday(person, todayOnlinePersonIds) {
  if (todayOnlinePersonIds?.has(String(person.id))) return true
  const at = person?.mobil_online_at
  if (!at) return false
  const d = new Date(at)
  return !Number.isNaN(d.getTime()) && d >= startOfToday()
}

export function msSinceLastSeen(person) {
  const at = person?.mobil_last_seen_at
  if (!at) return Infinity
  const ts = new Date(at).getTime()
  if (Number.isNaN(ts)) return Infinity
  return Date.now() - ts
}

export function exportPresenceCsv(rows, { unitName }) {
  const header = ['Ad Soyad', 'Birim', 'Durum', 'Son görülme', 'Son çevrimdışı', 'Son görev aktivitesi']
  const lines = [header.join(';')]
  for (const p of rows) {
    const name =
      p.ad && p.soyad ? `${p.ad} ${p.soyad}` : p.email || p.personel_kodu || 'Personel'
    lines.push(
      [
        name,
        unitName(p.birim_id) || '—',
        p.mobil_online ? 'Uygulamada' : 'Bağlantı yok',
        formatTs(p.mobil_last_seen_at),
        formatTs(p.mobil_last_offline_at),
        p.lastTaskAt ? formatTs(p.lastTaskAt) : '—',
      ].join(';'),
    )
  }
  // Mobil: CSV dışa aktarma web-only; ekranda paylaşım ileride eklenebilir.
  if (typeof globalThis?.document !== 'undefined') {
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erisim-durumu-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
}

export function groupActivityLogs(logs, { recentMinutes = 15 } = {}) {
  const now = Date.now()
  const recentCutoff = now - recentMinutes * 60 * 1000
  const recent = []
  const earlier = []

  for (const log of logs || []) {
    const ts = new Date(log.kaydedildi_at).getTime()
    if (Number.isNaN(ts)) continue
    if (ts >= recentCutoff) recent.push(log)
    else earlier.push(log)
  }

  return { recent, earlier }
}
