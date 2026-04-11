function toTitleCaseWord(word) {
  const w = String(word || '').trim()
  if (!w) return ''
  const first = w.charAt(0).toLocaleUpperCase('tr-TR')
  const rest = w.slice(1).toLocaleLowerCase('tr-TR')
  return `${first}${rest}`
}

export function formatFullName(ad, soyad, fallback = '') {
  const full = [ad, soyad]
    .map((p) => toTitleCaseWord(p))
    .filter(Boolean)
    .join(' ')
    .trim()
  return full || fallback
}

export function formatNameText(value = '', fallback = '') {
  const text = String(value || '')
    .split(' ')
    .map((w) => toTitleCaseWord(w))
    .filter(Boolean)
    .join(' ')
    .trim()
  return text || fallback
}
