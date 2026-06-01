import getSupabase from './supabaseClient'
import { compressCustomerRatingPhotoFile } from './compressCustomerRatingPhoto.js'
import { compressCustomerRatingVideoFile } from './compressCustomerRatingVideo.js'
import { TODO_MADDE_TIP } from './personalTodoItemTypes.js'

export const KISISEL_TODO_MEDIA_BUCKET = 'kisisel-todo-medya'

export function buildPersonalTodoMediaPath(userId, todoId, itemId, ext) {
  return `${userId}/${todoId}/${itemId}.${ext}`
}

function inferExt(file, tip) {
  const n = String(file?.name || '').toLowerCase()
  if (tip === TODO_MADDE_TIP.VIDEO) {
    if (n.endsWith('.webm') || String(file?.type || '').includes('webm')) return 'webm'
    if (n.endsWith('.mov')) return 'mov'
    return 'mp4'
  }
  if (n.endsWith('.png')) return 'png'
  if (n.endsWith('.webp')) return 'webp'
  return 'jpg'
}

function contentTypeForExt(ext, tip) {
  if (tip === TODO_MADDE_TIP.VIDEO) {
    if (ext === 'webm') return 'video/webm'
    if (ext === 'mov') return 'video/quicktime'
    return 'video/mp4'
  }
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/**
 * @param {File} file
 * @param {'foto'|'video'} tip
 */
export async function compressPersonalTodoMediaFile(file, tip) {
  if (tip === TODO_MADDE_TIP.FOTO) return compressCustomerRatingPhotoFile(file)
  if (tip === TODO_MADDE_TIP.VIDEO) return compressCustomerRatingVideoFile(file)
  return file
}

/**
 * @returns {Promise<string>} storage path
 */
function uploadErrorMessage(err, tip) {
  const raw = String(err?.message || err || '').toLowerCase()
  if (raw.includes('uzun') || raw.includes('süre')) {
    return 'Video çok uzun; daha kısa bir kayıt seçin.'
  }
  if (raw.includes('büyük')) {
    return 'Dosya çok büyük; daha küçük bir dosya seçin.'
  }
  return tip === TODO_MADDE_TIP.VIDEO ? 'Video yüklenemedi.' : 'Görsel yüklenemedi.'
}

export async function uploadPersonalTodoItemMedia({ userId, todoId, itemId, file, tip }) {
  if (!userId || !todoId || !itemId || !file) throw new Error('Eksik yükleme bilgisi')
  let prepared
  try {
    prepared = await compressPersonalTodoMediaFile(file, tip)
  } catch (err) {
    throw new Error(uploadErrorMessage(err, tip))
  }
  const ext = inferExt(prepared, tip)
  const path = buildPersonalTodoMediaPath(userId, todoId, itemId, ext)
  const supabase = getSupabase()
  const { error } = await supabase.storage.from(KISISEL_TODO_MEDIA_BUCKET).upload(path, prepared, {
    contentType: contentTypeForExt(ext, tip),
    upsert: true,
  })
  if (error) throw new Error(uploadErrorMessage(error, tip))
  return path
}

export async function getPersonalTodoMediaSignedUrl(path, expiresIn = 3600) {
  if (!path) return null
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(KISISEL_TODO_MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) throw error
  return data?.signedUrl || null
}

export async function removePersonalTodoMediaPath(path) {
  if (!path) return
  const supabase = getSupabase()
  await supabase.storage.from(KISISEL_TODO_MEDIA_BUCKET).remove([path])
}
