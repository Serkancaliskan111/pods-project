/** Sohbet ekleri — tarayıcı accept + Storage bucket MIME ile uyumlu */

export const CHAT_ATTACHMENT_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.rtf',
  '.csv',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.zip',
]

export const CHAT_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/rtf',
  'text/rtf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip',
  'application/x-zip-compressed',
]

/** HTML file input accept */
export const CHAT_FILE_INPUT_ACCEPT = [
  'image/*',
  'video/*',
  ...CHAT_ATTACHMENT_EXTENSIONS,
  ...CHAT_ATTACHMENT_MIME_TYPES,
].join(',')

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

/** Tarayıcı bazen `text/plain; charset=utf-8` gönderir; bucket tam eşleşme ister. */
function stripMimeParameters(mime) {
  const m = String(mime || '').trim().toLowerCase()
  const semi = m.indexOf(';')
  return semi >= 0 ? m.slice(0, semi).trim() : m
}

export function normalizeChatUploadContentType(mime, fileName) {
  const m = stripMimeParameters(mime)
  const ext = fileExtension(fileName)

  if (ext && EXT_MIME[ext]) return EXT_MIME[ext]

  if (m && m !== 'application/octet-stream' && m !== 'binary/octet-stream') {
    if (m.startsWith('image/') || m.startsWith('video/')) return m
    if (CHAT_ATTACHMENT_MIME_TYPES.includes(m)) return m
  }

  return m || 'application/octet-stream'
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

export function chatAttachmentRejectionMessage() {
  return 'Bu dosya türü desteklenmiyor. Fotoğraf, video veya office/belge (PDF, Word, Excel, TXT vb.) seçin.'
}
