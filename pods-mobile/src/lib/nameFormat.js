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

/** Avatar için: ad ve soyadın ilk harfleri (ör. Serkan + Çalışkan → SÇ). */
export function getPersonInitials(ad, soyad, fallback = '?') {
  const a = String(ad || '').trim()
  const s = String(soyad || '').trim()
  if (a && s) {
    return `${a.charAt(0)}${s.charAt(0)}`.toLocaleUpperCase('tr-TR')
  }
  if (a) return a.charAt(0).toLocaleUpperCase('tr-TR')
  if (s) return s.charAt(0).toLocaleUpperCase('tr-TR')
  const parts = String(fallback || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toLocaleUpperCase('tr-TR')
  }
  if (parts.length === 1) return parts[0].charAt(0).toLocaleUpperCase('tr-TR')
  return '?'
}
