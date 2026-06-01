/** Görev başlığı: her kelimenin ilk harfi büyük (tr-TR). */
export function formatTaskTitleCase(value) {
  const raw = String(value ?? '')
  if (!raw) return ''
  return raw
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => {
      const lower = word.toLocaleLowerCase('tr-TR')
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1)
    })
    .join(' ')
}
