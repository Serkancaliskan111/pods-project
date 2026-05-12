/** Web paneli ve bazı kayıtlar Türkçe anahtar kullanır (yol, ad, mime, tip). */
export function canonicalReferenceMediaRow(row) {
  if (!row || typeof row !== 'object') return row
  const pathVal = row.path ?? row.yol
  const outPath = pathVal != null ? String(pathVal).trim() : ''
  const nameVal = row.name ?? row.ad
  return {
    ...row,
    path: outPath,
    name: nameVal != null ? String(nameVal) : '',
    mimeType: String(row.mimeType || row.mime || ''),
    type: String(row.type || row.tip || ''),
  }
}

export function normalizeReferenceMediaList(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.filter(Boolean).map(canonicalReferenceMediaRow)
  if (typeof raw === 'object') {
    const o = raw
    if (o.path || o.yol || o.url || o.signedUrl || o.publicUrl) return [canonicalReferenceMediaRow(o)]
    return []
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (/^https?:\/\//i.test(trimmed)) return [canonicalReferenceMediaRow({ url: trimmed })]
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(canonicalReferenceMediaRow)
      if (parsed && typeof parsed === 'object') {
        if (parsed.path || parsed.yol || parsed.url || parsed.signedUrl || parsed.publicUrl) {
          return [canonicalReferenceMediaRow(parsed)]
        }
      }
      return []
    } catch {
      return []
    }
  }
  return []
}

export function inferReferenceRowKind(item, fallbackUrl = '') {
  const mime = String(item?.mimeType || item?.mime || '').toLowerCase()
  const t = String(item?.type || item?.tip || '').toLowerCase().trim()
  if (t === 'video' || t === 'image') return t
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('image/')) return 'image'
  const u = String(fallbackUrl || item?.url || item?.path || item?.yol || '').toLowerCase()
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u)) return 'video'
  if (/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(u)) return 'image'
  if (/\.pdf(\?|#|$)/i.test(u)) return 'file'
  if (!mime && u) return 'image'
  return 'file'
}
