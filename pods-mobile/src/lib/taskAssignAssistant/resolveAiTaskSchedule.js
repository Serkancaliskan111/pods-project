import { deriveGorunurFromBaslamaIso } from '../taskVisibility.js'

function localTodayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mergeDateTime(datePart, timePart) {
  if (!datePart) return null
  const d = String(datePart).slice(0, 10)
  if (d.includes('T')) return d
  if (!timePart) return null
  const t = String(timePart).slice(0, 5)
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null
  return `${d}T${t}:00`
}

function pickExplicitTime(intent, kind) {
  const key = kind === 'start' ? 'baslamaSaat' : 'bitisSaat'
  const raw = intent?.[key]
  if (raw && /^\d{1,2}:\d{2}$/.test(String(raw))) return String(raw).slice(0, 5)
  return null
}

/**
 * Manuel ExtraTask/New.jsx ile uyumlu zamanlama:
 * - Gelecek tarih veya açık başlangıç/bitiş saati → planlı başlangıç.
 * - Kullanıcının verdiği saatler aynen kullanılır.
 */
export function resolveAiTaskSchedule(intent = {}) {
  const nowIso = new Date().toISOString()
  const todayYmd = localTodayYmd()
  const startYmd = intent.baslangic ? String(intent.baslangic).slice(0, 10) : ''
  const endYmd = intent.bitis ? String(intent.bitis).slice(0, 10) : ''
  const startClock = pickExplicitTime(intent, 'start')
  const endClock = pickExplicitTime(intent, 'end')
  const effectiveEndYmd = endYmd || startYmd || ''
  const effectiveStartYmd = startYmd || endYmd || ''

  const hasFutureStartDate = !!(effectiveStartYmd && effectiveStartYmd > todayYmd)
  const hasFutureEndDate = !!(effectiveEndYmd && effectiveEndYmd > todayYmd)
  const hasScheduledStart = !!(
    intent.scheduleStart ||
    intent.baslamaZamanSec ||
    hasFutureStartDate ||
    hasFutureEndDate ||
    (startClock && effectiveStartYmd && effectiveStartYmd >= todayYmd) ||
    (startClock && endClock && effectiveStartYmd)
  )

  if (hasScheduledStart && effectiveStartYmd) {
    const baslamaIso =
      mergeDateTime(effectiveStartYmd, startClock || '09:00') || nowIso
    let sonIso = null
    if (effectiveEndYmd && endClock) {
      sonIso = mergeDateTime(effectiveEndYmd, endClock)
    } else if (effectiveEndYmd) {
      sonIso = mergeDateTime(effectiveEndYmd, endClock || '18:00')
    } else if (endClock) {
      sonIso = mergeDateTime(effectiveStartYmd, endClock)
    }
    return {
      baslamaIso,
      sonIso,
      gorunurIso: deriveGorunurFromBaslamaIso(baslamaIso),
      immediate: false,
    }
  }

  // Bugün gelecek saatte başlangıç (planlı)
  if (startClock && effectiveStartYmd === todayYmd) {
    const startIso = mergeDateTime(todayYmd, startClock)
    if (startIso && new Date(startIso).getTime() > Date.now()) {
      const sonYmd = effectiveEndYmd || todayYmd
      const sonIso = endClock
        ? mergeDateTime(sonYmd, endClock)
        : effectiveEndYmd
          ? mergeDateTime(sonYmd, '18:00')
          : null
      return {
        baslamaIso: startIso,
        sonIso,
        gorunurIso: deriveGorunurFromBaslamaIso(startIso),
        immediate: false,
      }
    }
  }

  // Göreli deadline ("3 saat içinde") — anında başla
  if (intent.relativeDeadline && effectiveEndYmd && endClock) {
    return {
      baslamaIso: nowIso,
      sonIso: mergeDateTime(effectiveEndYmd, endClock),
      gorunurIso: nowIso,
      immediate: true,
    }
  }

  // Anında başlangıç
  const baslamaIso = nowIso
  let sonIso = null

  if (effectiveEndYmd && endClock) {
    sonIso = mergeDateTime(effectiveEndYmd, endClock)
  } else if (effectiveEndYmd) {
    sonIso = mergeDateTime(effectiveEndYmd, endClock || '18:00')
  } else if (endClock) {
    sonIso = mergeDateTime(todayYmd, endClock)
  }

  return {
    baslamaIso,
    sonIso,
    gorunurIso: nowIso,
    immediate: true,
  }
}

export function resolveBirimIdForTask({ assigneeId, personnel = [], assignerPersonel, intent = {} }) {
  if (intent.unitId) return intent.unitId
  const row = personnel.find((p) => String(p.id) === String(assigneeId))
  if (row?.birim_id) return row.birim_id
  if (assignerPersonel?.birim_id) return assignerPersonel.birim_id
  return null
}
