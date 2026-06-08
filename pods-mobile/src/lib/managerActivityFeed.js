import { formatFullName } from './nameFormat.js'
import { formatRelativeTime } from './presenceUtils.js'
import { normalizeTaskStatus } from './taskStatus.js'

export function getActivityStatusStyle(status) {
  const key = String(status || '').toLowerCase()
  if (key.includes('onaylandı') || key.includes('onaylandi') || key.includes('tamam')) {
    return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' }
  }
  if (key.includes('onay bekliyor') || key.includes('tekrar')) {
    return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
  }
  if (key.includes('redd')) {
    return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
  }
  return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' }
}

function resolveActionLabel(durum) {
  const statusKey = String(durum || '').toLowerCase()
  if (statusKey.includes('onaylandı') || statusKey.includes('onaylandi') || statusKey.includes('tamam')) {
    return 'görevi tamamladı'
  }
  if (statusKey.includes('onay bekliyor') || statusKey.includes('tekrar')) {
    return 'onaya gönderdi'
  }
  if (statusKey.includes('redd')) {
    return 'görev reddedildi'
  }
  return 'görev güncelledi'
}

/**
 * Web AdminDashboard “Son Gönderilen İşler” akışı.
 */
export function buildManagerActivityFeed(jobs = [], staffById = {}, limit = 8) {
  const sorted = [...(jobs || [])].sort((a, b) => {
    const da = new Date(a.updated_at || a.created_at || 0).getTime()
    const db = new Date(b.updated_at || b.created_at || 0).getTime()
    return db - da
  })

  return sorted.slice(0, limit).map((j) => {
    const durum = normalizeTaskStatus(j.durum)
    const pid = String(j?.sorumlu_personel_id || '')
    const person = staffById[pid]
    const personName =
      typeof person === 'string'
        ? person
        : formatFullName(person?.ad, person?.soyad, 'Personel')

    return {
      id: j.id,
      title: j.baslik || 'Görev',
      personName,
      timeRelative: formatRelativeTime(j.updated_at || j.created_at),
      status: durum || '—',
      actionLabel: resolveActionLabel(durum),
      isUrgent: j?.acil === true || j?.acil === 1,
      statusStyle: getActivityStatusStyle(durum),
    }
  })
}
