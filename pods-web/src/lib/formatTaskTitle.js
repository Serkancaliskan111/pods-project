/** Görev başlığı: her kelimenin ilk harfi büyük (tr-TR). */
export function formatTaskTitleCase(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  // Sondaki boşluk yazım sırasında korunmalı; aksi halde kelime arası space tuşu çalışmıyor gibi görünür.
  const hasTrailingSpace = /[ \t\u00a0]$/.test(raw)
  const normalized = raw.trim().replace(/\s+/g, ' ')
  if (!normalized) return hasTrailingSpace ? ' ' : ''
  const cased = normalized
    .split(' ')
    .map((word) => {
      const lower = word.toLocaleLowerCase('tr-TR')
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1)
    })
    .join(' ')
  return hasTrailingSpace ? `${cased} ` : cased
}

/** Tek satır önizleme — kelime ortasında kesmez. */
export function truncateSingleLineTitle(value, maxLen = 45) {
  const t = String(value || '').trim()
  if (t.length <= maxLen) return t
  const slice = t.slice(0, maxLen)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace >= Math.floor(maxLen * 0.55) ? lastSpace : maxLen
  return `${t.slice(0, cut).trimEnd()}…`
}
