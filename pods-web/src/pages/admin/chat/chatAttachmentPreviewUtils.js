import { createChatAttachmentSignedUrl } from '../../../lib/chatApi.js'

export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024

function extOf(name) {
  const n = String(name || '').toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

const TEXT_EXTS = new Set([
  'txt',
  'log',
  'csv',
  'md',
  'json',
  'xml',
  'yaml',
  'yml',
  'ini',
  'env',
  'rtf',
  'tsv',
])

const TEXT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
  'text/tab-separated-values',
])

/** @returns {'text' | 'pdf' | 'download'} */
export function getAttachmentPreviewKind({ mime, fileName }) {
  const m = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const ext = extOf(fileName)
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (TEXT_MIMES.has(m) || m.startsWith('text/')) return 'text'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'download'
}

export async function fetchTextAttachmentContent(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch_failed')
  const blob = await res.blob()
  if (blob.size > MAX_TEXT_PREVIEW_BYTES) {
    const err = new Error('too_large')
    err.code = 'too_large'
    throw err
  }
  return blob.text()
}

function sanitizeDownloadFileName(name) {
  const base = String(name || 'dosya')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim()
  return base || 'dosya'
}

function clickBlobDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = sanitizeDownloadFileName(fileName)
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}

async function fetchBlobFromUrl(downloadUrl) {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error('download_fetch_failed')
  return res.blob()
}

/**
 * Supabase imzalı URL’ler çapraz köken olduğu için <a download> yalnızca sekme açar.
 * Dosyayı fetch + blob ile indirir.
 * @param {string} [storagePath] İsteğe bağlı; birincil URL başarısız olursa Content-Disposition’lı imza denenir.
 */
export async function triggerAttachmentDownload(url, fileName, storagePath = null) {
  if (!url && !storagePath) return false
  const name = sanitizeDownloadFileName(fileName)

  try {
    if (url) {
      const blob = await fetchBlobFromUrl(url)
      clickBlobDownload(blob, name)
      return true
    }
  } catch (e) {
    console.warn('[chat download] primary', e?.message || e)
  }

  if (storagePath) {
    const dlUrl = await createChatAttachmentSignedUrl(storagePath, 3600, { download: name })
    if (dlUrl) {
      const blob = await fetchBlobFromUrl(dlUrl)
      clickBlobDownload(blob, name)
      return true
    }
  }

  throw new Error('download_failed')
}

export function fileTypeIcon(fileName, kind) {
  if (kind === 'pdf') return '📕'
  if (kind === 'text') return '📄'
  const ext = extOf(fileName)
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx'].includes(ext)) return '📊'
  if (['ppt', 'pptx'].includes(ext)) return '📽'
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜'
  return '📎'
}
