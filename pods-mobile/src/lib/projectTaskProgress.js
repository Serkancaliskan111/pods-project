/** Planlama görevi ilerleme — yapılan / toplam iş biriminden yüzde */

export function computeProgressPercent(yapilan, toplam, durum) {
  if (durum === 'tamamlandi') return 100
  const t = Math.max(1, Number(toplam) || 1)
  const y = Math.max(0, Math.min(t, Number(yapilan) || 0))
  return Math.round((y / t) * 100)
}

export function clampWorkCounts(yapilan, toplam, durum) {
  let t = Math.max(1, Number(toplam) || 1)
  let y = Math.max(0, Number(yapilan) || 0)
  if (durum === 'tamamlandi') {
    y = t
  } else {
    y = Math.min(t, y)
  }
  return { yapilan_is: y, toplam_is: t }
}

export function formatWorkProgressLabel(yapilan, toplam, ilerleme, durum) {
  const pct = durum === 'tamamlandi' ? 100 : (ilerleme ?? computeProgressPercent(yapilan, toplam, durum))
  return `${yapilan}/${toplam} görev · %${pct}`
}
