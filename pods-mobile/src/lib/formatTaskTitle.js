/** Görev başlığı: her kelimenin ilk harfi büyük (tr-TR). */
export function formatTaskTitleCase(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  const trailingSpace = /\s$/.test(raw)
  const core = raw.replace(/\s+/g, ' ').trim()
  if (!core) return trailingSpace ? ' ' : ''
  const formatted = core
    .split(' ')
    .map((word) => {
      const lower = word.toLocaleLowerCase('tr-TR')
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1)
    })
    .join(' ')
  return trailingSpace ? `${formatted} ` : formatted
}
