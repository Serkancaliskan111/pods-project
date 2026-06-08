import { Linking } from 'react-native'
import { createChatAttachmentSignedUrl } from './chatApi'

export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024

function extOf(name) {
  const n = String(name || '').toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

const TEXT_EXTS = new Set([
  'txt', 'log', 'csv', 'md', 'json', 'xml', 'yaml', 'yml', 'ini', 'env', 'rtf', 'tsv',
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

export async function openAttachmentExternally(url) {
  if (!url) return
  await Linking.openURL(url)
}

export async function resolveAttachmentPreviewUrl(storagePath, signedUrl) {
  if (signedUrl) return signedUrl
  if (!storagePath) return null
  return createChatAttachmentSignedUrl(storagePath, 3600)
}
