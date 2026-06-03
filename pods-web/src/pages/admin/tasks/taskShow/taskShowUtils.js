export function normalizeTimelineArray(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

export function samePersonelId(a, b) {
  const x = String(a ?? '').trim()
  const y = String(b ?? '').trim()
  if (!x || !y) return false
  return x === y
}

export function fullNameFromPerson(p) {
  if (!p) return '—'
  const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
  return n || p.email || '—'
}

export function personRefLabel(row, personelId) {
  if (row) return fullNameFromPerson(row)
  if (personelId) return `Personel (${String(personelId).slice(0, 8)}…)`
  return '—'
}

export function formatTaskShowTs(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR')
}

/** Tek bir kanıt girdisini görüntülenebilir URL stringine çevirir */
export function coercePhotoUrl(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') {
    const t = entry.trim()
    if (!t) return ''
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:image/')) {
      return t
    }
    return t
  }
  if (typeof entry === 'object') {
    const u =
      entry.url ??
      entry.signedUrl ??
      entry.publicUrl ??
      entry.src ??
      entry.path ??
      entry.photo_url ??
      entry.foto_url ??
      entry.image_url
    return u != null ? String(u).trim() : ''
  }
  return ''
}

/**
 * kanit_resim_ler, kanit_foto_durumlari (URL→durum map) ve iç içe diziler.
 */
export function normalizePhotoList(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.flatMap((v) => normalizePhotoList(v)).map(coercePhotoUrl).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return normalizePhotoList(JSON.parse(trimmed))
      } catch {
        /* düz string */
      }
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  if (typeof raw === 'object') {
    const nested = [
      raw.url,
      raw.path,
      raw.src,
      raw.signedUrl,
      raw.publicUrl,
      raw.photo_url,
      raw.foto_url,
      raw.image_url,
      raw.images,
      raw.fotos,
      raw.foto_urls,
      raw.kanit_resim_ler,
      raw.kanit_fotograflari,
      raw.resimler,
    ]
      .flatMap((v) => normalizePhotoList(v))
      .filter(Boolean)
    if (nested.length) return nested

    const keyUrls = Object.keys(raw).filter((k) => {
      const key = String(k || '').trim()
      if (!key) return false
      return (
        key.startsWith('http://') ||
        key.startsWith('https://') ||
        key.startsWith('data:image/')
      )
    })
    if (keyUrls.length) return keyUrls
  }
  return []
}

export function extractPhotoUrls(job) {
  if (!job) return []
  const sources = [
    job.kanit_resim_ler,
    job.kanit_fotograflari,
    job.kanit_foto_durumlari,
    job.fotograflar,
    job.gorseller,
    job.resimler,
    job.fotograf_url,
    job.foto_url,
    job.photo_url,
    job.images,
    job.image_urls,
    job.media,
  ]
  const merged = sources.flatMap((s) => normalizePhotoList(s))
  return [...new Set(merged)]
}

function isReferenceImageRef(ref) {
  if (!ref?.signedUrl) return false
  if (ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')) return true
  if (ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')) return false
  return /\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|$)/i.test(String(ref.signedUrl))
}

/** Görev detay lightbox — tüm kanıt ve referans görselleri */
export function collectTaskDetailLightboxPhotos({
  task,
  chainSteps = [],
  checklistItems = [],
  taskReferenceMedia = [],
  stepReferenceMediaMap = {},
} = {}) {
  const seen = new Set()
  const out = []

  const push = (entry) => {
    const u = coercePhotoUrl(entry)
    if (!u || seen.has(u)) return
    seen.add(u)
    out.push(u)
  }

  const pushMany = (raw) => {
    for (const u of normalizePhotoList(raw)) push(u)
  }

  for (const u of extractPhotoUrls(task)) push(u)

  const stepIds = new Set()
  for (const step of chainSteps || []) {
    if (!step?.id || stepIds.has(String(step.id))) continue
    stepIds.add(String(step.id))
    pushMany(step.kanit_resim_ler)
    pushMany(step.kanit_foto_durumlari)
    pushMany(step.kanit_fotograflari)
  }

  for (const item of checklistItems || []) {
    for (const p of item?.photos || []) push(p)
  }

  for (const ref of taskReferenceMedia || []) {
    if (isReferenceImageRef(ref)) push(ref.signedUrl)
  }

  for (const list of Object.values(stepReferenceMediaMap || {})) {
    if (!Array.isArray(list)) continue
    for (const ref of list) {
      if (isReferenceImageRef(ref)) push(ref.signedUrl)
    }
  }

  return out
}

/** Lightbox albümü — tekrarsız URL listesi */
export function dedupePhotoUrls(list) {
  const seen = new Set()
  const out = []
  for (const entry of list || []) {
    const u = coercePhotoUrl(entry)
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

export function normalizeKanitVideoEntry(v) {
  if (v == null) return null
  if (typeof v === 'string') {
    const u = v.trim()
    return u ? { url: u } : null
  }
  if (typeof v === 'object' && v.url) {
    return {
      url: String(v.url),
      duration_sec:
        v.duration_sec != null && Number.isFinite(Number(v.duration_sec))
          ? Number(v.duration_sec)
          : null,
    }
  }
  return null
}

export function extractKanitVideosFromJob(job) {
  const raw = job?.kanit_videolar
  if (!raw || !Array.isArray(raw)) return []
  return raw.map(normalizeKanitVideoEntry).filter(Boolean)
}

export function extractChecklistVideoList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(normalizeKanitVideoEntry).filter(Boolean)
  if (typeof raw === 'string') {
    const t = raw.trim()
    try {
      const p = JSON.parse(t)
      if (Array.isArray(p)) return p.map(normalizeKanitVideoEntry).filter(Boolean)
    } catch {
      /* ignore */
    }
    const u = normalizeKanitVideoEntry(t)
    return u ? [u] : []
  }
  return []
}

export function normalizeReferenceMediaList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

export function extractChecklistPhotoUrls(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.flatMap((v) => extractChecklistPhotoUrls(v)).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        return extractChecklistPhotoUrls(JSON.parse(trimmed))
      }
    } catch {
      /* ignore */
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((p) => p.trim()).filter(Boolean)
    }
    return [trimmed]
  }
  if (typeof raw === 'object') {
    const directCandidates = [
      raw.url,
      raw.path,
      raw.src,
      raw.photo_url,
      raw.photo_urls,
      raw.foto_url,
      raw.foto_urls,
      raw.fotos,
      raw.fotograflar,
      raw.images,
      raw.files,
    ]
    return Array.from(
      new Set(directCandidates.flatMap((v) => extractChecklistPhotoUrls(v)).filter(Boolean)),
    )
  }
  return []
}

export function buildChecklistItems(task) {
  if (!Array.isArray(task?.checklist_cevaplari)) return []
  return task.checklist_cevaplari.map((item, idx) => {
    const soru = item?.soru_metni || item?.soru || item?.question || `Madde ${idx + 1}`
    const cevap =
      item?.cevap_metni ?? item?.cevap ?? item?.value ?? item?.yanit ?? item?.answer ?? ''
    const karar = item?.denetim_karari || item?.audit_decision || ''
    const soruTipi = String(item?.soru_tipi || item?.question_type || item?.type || '')
      .trim()
      .toUpperCase()
    const photos = extractChecklistPhotoUrls(
      item?.fotograflar ??
        item?.fotos ??
        item?.foto_urls ??
        item?.photo_urls ??
        item?.images ??
        item?.files ??
        item?.photo_url ??
        item?.foto_url ??
        null,
    )
    const videos = extractChecklistVideoList(
      item?.videolar ?? item?.videos ?? item?.video_urls ?? null,
    )
    return {
      id: item?.id || item?.soru_id || idx,
      key: String(item?.id || item?.soru_id || idx),
      index: idx,
      soru: String(soru || `Madde ${idx + 1}`),
      soruTipi,
      cevap: String(cevap || '').trim(),
      karar: String(karar || '').trim(),
      photos,
      videos,
    }
  })
}
