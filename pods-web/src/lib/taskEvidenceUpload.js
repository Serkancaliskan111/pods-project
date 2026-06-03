import getSupabase from './supabaseClient'
import {
  inferTaskDocumentMeta,
  isAllowedTaskDocument,
  TASK_DOCUMENT_MAX_BYTES,
} from './taskDocumentTypes.js'

export const GOREV_KANITLARI_BUCKET = 'gorev_kanitlari'

function inferImageExt(file) {
  const n = String(file?.name || '').toLowerCase()
  if (n.endsWith('.png')) return { ext: 'png', contentType: 'image/png' }
  if (n.endsWith('.webp')) return { ext: 'webp', contentType: 'image/webp' }
  if (n.endsWith('.heic')) return { ext: 'heic', contentType: 'image/heic' }
  return { ext: 'jpg', contentType: file?.type || 'image/jpeg' }
}

function inferVideoExt(file) {
  const n = String(file?.name || '').toLowerCase()
  if (n.endsWith('.mov')) return { ext: 'mov', contentType: 'video/quicktime' }
  if (n.endsWith('.webm')) return { ext: 'webm', contentType: 'video/webm' }
  return { ext: 'mp4', contentType: file?.type || 'video/mp4' }
}

async function uploadBlob(bucket, path, body, contentType) {
  const supabase = getSupabase()
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('Dosya URL alınamadı')
  return data.publicUrl
}

export async function uploadTaskPhotoFiles(files, namePrefix) {
  const list = Array.from(files || []).filter(Boolean)
  const urls = []
  for (const file of list) {
    const { ext, contentType } = inferImageExt(file)
    const path = `${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const url = await uploadBlob(GOREV_KANITLARI_BUCKET, path, file, contentType)
    urls.push(url)
  }
  return urls
}

/** @returns {Promise<Array<{ url: string, name: string, mime: string|null, size: number|null }>>} */
export async function uploadTaskDocumentFiles(files, namePrefix) {
  const list = Array.from(files || []).filter(Boolean)
  const rows = []
  for (const file of list) {
    if (!isAllowedTaskDocument(file)) {
      throw new Error('Desteklenmeyen belge türü. PDF, DOC, DOCX, XLS, XLSX, PPT veya PPTX yükleyin.')
    }
    if (file.size > TASK_DOCUMENT_MAX_BYTES) {
      throw new Error('Belge boyutu 25 MB sınırını aşıyor.')
    }
    const { name, ext, contentType } = inferTaskDocumentMeta(file)
    const path = `${namePrefix}-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const url = await uploadBlob(GOREV_KANITLARI_BUCKET, path, file, contentType)
    rows.push({
      url,
      name,
      mime: contentType,
      size: file.size ?? null,
    })
  }
  return rows
}

/** @returns {Promise<Array<{ url: string, duration_sec: number|null }>>} */
export async function uploadTaskVideoFiles(files, namePrefix) {
  const list = Array.from(files || []).filter(Boolean)
  const rows = []
  for (const file of list) {
    const { ext, contentType } = inferVideoExt(file)
    const path = `${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const url = await uploadBlob(GOREV_KANITLARI_BUCKET, path, file, contentType)
    rows.push({ url, duration_sec: null })
  }
  return rows
}
