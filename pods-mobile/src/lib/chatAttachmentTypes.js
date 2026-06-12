/** Sohbet ekleri — Storage bucket MIME listesi ile uyumlu (pods-web ile aynı kurallar). */

export const CHAT_ATTACHMENT_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif',
  '.mp4', '.mov', '.webm', '.m4v',
  '.pdf', '.doc', '.docx', '.txt', '.rtf', '.csv',
  '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.zip',
]

export const CHAT_ATTACHMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv', 'application/rtf', 'text/rtf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip', 'application/x-zip-compressed',
]

/** Belge seçicide (DocumentPicker) önerilen MIME listesi */
export const CHAT_DOCUMENT_PICKER_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip',
  'application/x-zip-compressed',
]

const EXT_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/mp4',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  rtf: 'application/rtf',
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
}

function fileExtension(fileName) {
  const n = String(fileName || '').toLowerCase()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1) : ''
}

export function stripMimeParameters(mime) {
  const m = String(mime || '').trim().toLowerCase()
  const semi = m.indexOf(';')
  return semi >= 0 ? m.slice(0, semi).trim() : m
}

export function isChatAttachmentAllowed({ mime, fileName }) {
  const m = stripMimeParameters(mime)
  const ext = fileExtension(fileName)

  if (m.startsWith('image/') || m.startsWith('video/')) return true
  if (m && CHAT_ATTACHMENT_MIME_TYPES.includes(m)) return true
  if (ext && EXT_MIME[ext]) return true
  if (ext && CHAT_ATTACHMENT_EXTENSIONS.includes(`.${ext}`)) return true

  return false
}

/** Belge gönderimi için kısa kullanıcı mesajı */
export function chatUnsupportedFileMessage() {
  return (
    'Yalnızca şu dosya türleri desteklenir: PDF, Word (DOC/DOCX), Excel (XLS/XLSX), ' +
    'PowerPoint (PPT/PPTX), TXT, CSV, RTF, ODT, ODS, ZIP; ayrıca fotoğraf ve video.'
  )
}

export function isChatUploadMimeError(message) {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('mime type') ||
    m.includes('not supported') ||
    m.includes('desteklenmeyen') ||
    m.includes('allowed_mime')
  )
}

export function formatChatUploadUserMessage(error) {
  const raw = String(error?.message || error || '').trim()
  if (!raw) return chatUnsupportedFileMessage()
  if (isChatUploadMimeError(raw)) return chatUnsupportedFileMessage()
  return raw
}
