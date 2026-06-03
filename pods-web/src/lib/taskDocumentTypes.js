/** Görev kanıt belgeleri — PDF, Office */
export const TASK_DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'

export const TASK_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

export const TASK_DOCUMENT_MAX_COUNT = 5
export const TASK_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

const EXT_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export function taskDocumentExtension(nameOrMime) {
  const n = String(nameOrMime || '').toLowerCase()
  if (n.includes('pdf')) return 'pdf'
  if (n.endsWith('.docx') || n.includes('wordprocessingml')) return 'docx'
  if (n.endsWith('.doc') || n.includes('msword')) return 'doc'
  if (n.endsWith('.xlsx') || n.includes('spreadsheetml')) return 'xlsx'
  if (n.endsWith('.xls')) return 'xls'
  if (n.endsWith('.pptx') || n.includes('presentationml')) return 'pptx'
  if (n.endsWith('.ppt')) return 'ppt'
  const dot = n.lastIndexOf('.')
  if (dot >= 0) return n.slice(dot + 1)
  return 'bin'
}

export function inferTaskDocumentMeta(file = {}) {
  const name = String(file.name || file.fileName || 'belge').trim() || 'belge'
  const ext = taskDocumentExtension(name || file.type || file.mimeType)
  const contentType =
    file.type ||
    file.mimeType ||
    EXT_MIME[ext] ||
    'application/octet-stream'
  return { name, ext, contentType }
}

export function isAllowedTaskDocument(file) {
  const { ext, contentType } = inferTaskDocumentMeta(file)
  if (TASK_DOCUMENT_MIME_TYPES.includes(contentType)) return true
  return Object.keys(EXT_MIME).includes(ext)
}

export function normalizeKanitBelgeEntry(row) {
  if (row == null) return null
  if (typeof row === 'string') {
    const url = row.trim()
    return url ? { url, name: 'Belge', mime: null } : null
  }
  if (typeof row === 'object') {
    const url = String(row.url || row.uri || '').trim()
    if (!url) return null
    return {
      url,
      name: String(row.name || row.file_name || 'Belge').trim() || 'Belge',
      mime: row.mime || row.contentType || row.content_type || null,
      size: row.size != null ? Number(row.size) : null,
    }
  }
  return null
}

export function extractKanitBelgeRows(taskOrRow) {
  const raw = taskOrRow?.kanit_belgeler ?? null
  if (raw == null) return []
  let arr = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      arr = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      arr = [raw]
    }
  } else if (typeof raw === 'object') {
    arr = [raw]
  }
  return arr.map(normalizeKanitBelgeEntry).filter(Boolean)
}
