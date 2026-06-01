import getSupabase from './supabaseClient'
import {
  compressProfilePhotoFile,
  PROFILE_PHOTO_MAX_INPUT_BYTES,
} from './compressProfilePhoto.js'

export const PROFILE_PHOTOS_BUCKET = 'profil-fotolari'
export { PROFILE_PHOTO_MAX_INPUT_BYTES }

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export function inferProfilePhotoExt(fileName, mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase()
  if (MIME_TO_EXT[m]) return MIME_TO_EXT[m]
  const n = String(fileName || '').toLowerCase()
  if (n.endsWith('.png')) return 'png'
  if (n.endsWith('.webp')) return 'webp'
  if (n.endsWith('.heic')) return 'heic'
  if (n.endsWith('.heif')) return 'heif'
  return 'jpg'
}

export function buildProfilePhotoPath(userId, ext = 'jpg') {
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('Geçersiz kullanıcı')
  return `${uid}/avatar.${ext}`
}

export function isAllowedProfilePhotoMime(mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXT, m)
}

export async function createProfilePhotoSignedUrl(storagePath, expiresSec = 3600) {
  const path = String(storagePath || '').trim()
  if (!path) return null
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresSec)
  if (error) {
    if (error.message?.includes('not found') || error.statusCode === 404) return null
    throw error
  }
  return data?.signedUrl ?? null
}

export async function uploadProfilePhoto(userId, file) {
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('Geçersiz kullanıcı')
  if (!file) throw new Error('Dosya seçilmedi')

  const mime = String(file.type || 'image/jpeg').split(';')[0].trim().toLowerCase()
  if (!isAllowedProfilePhotoMime(mime)) {
    throw new Error('Yalnızca JPEG, PNG, WebP veya HEIC yükleyebilirsiniz.')
  }

  const compressed = await compressProfilePhotoFile(file)
  const path = buildProfilePhotoPath(uid, 'jpg')
  const supabase = getSupabase()

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) throw uploadError

  const { error: dbError } = await supabase
    .from('kullanicilar')
    .update({ profil_foto_yol: path })
    .eq('id', uid)
  if (dbError) throw dbError

  return path
}

export async function removeProfilePhoto(userId, storagePath) {
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('Geçersiz kullanıcı')
  const supabase = getSupabase()
  const path = String(storagePath || '').trim()
  if (path) {
    const { error: storageError } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([path])
    if (storageError) throw storageError
  }
  const { error: dbError } = await supabase
    .from('kullanicilar')
    .update({ profil_foto_yol: null })
    .eq('id', uid)
  if (dbError) throw dbError
}
