import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Share } from 'react-native'
import { encode as encodeBase64 } from 'base64-arraybuffer'
import { createChatAttachmentSignedUrl } from './chatApi'

export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024
export const INLINE_TEXT_PREVIEW_MAX_CHARS = 320
export const INLINE_TEXT_PREVIEW_MAX_LINES = 4

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
  'application/rtf',
  'text/rtf',
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

/** Balon içi kısa metin önizlemesi. */
export function truncateTextPreview(
  text,
  maxChars = INLINE_TEXT_PREVIEW_MAX_CHARS,
  maxLines = INLINE_TEXT_PREVIEW_MAX_LINES,
) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n')
  if (!raw) return ''
  const lines = raw.split('\n').slice(0, maxLines)
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars).trimEnd()}…`
  else if (raw.split('\n').length > maxLines || raw.length > out.length) out = `${out.trimEnd()}…`
  return out
}

function textByteLength(text) {
  try {
    return new TextEncoder().encode(String(text)).byteLength
  } catch {
    return String(text).length * 2
  }
}

export async function fetchTextAttachmentContent(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch_failed')
  const contentLength = Number(res.headers.get('content-length') || 0)
  if (contentLength > MAX_TEXT_PREVIEW_BYTES) {
    const err = new Error('too_large')
    err.code = 'too_large'
    throw err
  }
  const text = await res.text()
  if (textByteLength(text) > MAX_TEXT_PREVIEW_BYTES) {
    const err = new Error('too_large')
    err.code = 'too_large'
    throw err
  }
  return text
}

function sanitizeShareFileName(name) {
  const base = String(name || 'dosya')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim()
  return base || 'dosya'
}

/**
 * Supabase imzalı URL’yi tarayıcıda/Linking ile açmaz; dosyayı indirip yerel paylaşım sheet’i gösterir.
 * @param {{ url?: string | null, fileName?: string, mime?: string | null, textFallback?: string | null }} opts
 */
export async function shareChatAttachmentFile({ url, fileName, mime, textFallback = null }) {
  const safe = sanitizeShareFileName(fileName)
  const text = textFallback != null ? String(textFallback) : ''

  if (!url) {
    if (text) {
      await Share.share({ message: text, title: safe })
      return
    }
    throw new Error('share_unavailable')
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error('share_fetch_failed')
  const buf = await res.arrayBuffer()
  const b64 = encodeBase64(buf)
  const localPath = `${FileSystem.cacheDirectory}chat-share-${Date.now()}-${safe}`
  await FileSystem.writeAsStringAsync(localPath, b64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localPath, {
      mimeType: mime || undefined,
      dialogTitle: safe,
    })
    return
  }

  if (text) {
    await Share.share({ message: text, title: safe })
    return
  }

  throw new Error('share_unavailable')
}

export async function resolveAttachmentPreviewUrl(storagePath, signedUrl) {
  if (signedUrl) return signedUrl
  if (!storagePath) return null
  return createChatAttachmentSignedUrl(storagePath, 3600)
}
