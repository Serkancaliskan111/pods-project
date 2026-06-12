import { parseAciklamaFromText } from './parseMessage.js'

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanDetay(s) {
  return String(s || '')
    .replace(/\b(acil\s+olarak|herkese|herkes|birim(?:inde|de|i)?|görevini?\s+ata|gorevini?\s+ata)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim()
}

function capitalizeFirst(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  return t.charAt(0).toLocaleUpperCase('tr') + t.slice(1)
}

/**
 * Kullanıcının iş tanımı cümlelerini (atama ifadesi dışında) çıkar.
 */
export function extractGorevDetayFromText(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''

  const labeled = parseAciklamaFromText(raw)
  if (labeled) return capitalizeFirst(labeled)

  const actionPatterns = [
    /\b(raflarda[^.!?]{8,}?(?:kontrol|say|temiz|duzen)[^.!?]*)/i,
    /\b([^.!?]{10,}?(?:etsin(?:ler)?|yapsın(?:lar)?|yapacak(?:lar)?|yapmalı(?:lar)?|kontrol\s+et(?:sin(?:ler)?|meli(?:ler)?)?|say(?:ım|im)\s+yap(?:sin(?:lar)?|malı(?:lar)?)?|temizle(?:sin(?:ler)?|meli(?:ler)?)?|hazırl(?:a|asın|anmalı)(?:lar)?|teslim\s+et(?:sin(?:ler)?|meli(?:ler)?)?)[^.!?]*)/i,
  ]

  for (const re of actionPatterns) {
    const m = raw.match(re)
    const chunk = cleanDetay(m?.[1] || m?.[0])
    if (chunk.length >= 12) return capitalizeFirst(chunk)
  }

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (sentences.length >= 2) {
    const tail = sentences
      .slice(1)
      .map(cleanDetay)
      .filter((s) => s.length >= 12)
      .join(' ')
    if (tail) return capitalizeFirst(tail)
  }

  const commaTail = raw.split(/,\s+/).slice(1).join(', ')
  const cleanedTail = cleanDetay(commaTail)
  if (cleanedTail.length >= 15 && !/\b(ata|at|görev|gorev)\b/i.test(norm(cleanedTail))) {
    return capitalizeFirst(cleanedTail)
  }

  return ''
}

export function looksLikeMetaSummary(text) {
  const t = String(text || '').trim()
  if (!t) return false
  return (
    /^Atanan:/i.test(t) ||
    (/Süre:/i.test(t) && /Acil/i.test(t)) ||
    /^En az \d+ fotoğraf kanıtı\.$/i.test(t)
  )
}
