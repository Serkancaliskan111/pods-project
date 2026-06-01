import * as FileSystem from 'expo-file-system'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import getSupabase from './supabaseClient'
import {
  compressProfilePhotoAsset,
  PROFILE_PHOTO_MAX_INPUT_BYTES,
} from './compressProfilePhoto'

export const PROFILE_PHOTOS_BUCKET = 'profil-fotolari'
export { PROFILE_PHOTO_MAX_INPUT_BYTES }

async function readPickerArrayBuffer(asset) {
  if (asset?.base64) {
    const raw = String(asset.base64).replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
    return decodeBase64(raw)
  }
  const uri = String(asset?.uri || '').trim()
  if (!uri) throw new Error('Fotoğraf yolu bulunamadı')
  try {
    const response = await fetch(uri)
    if (!response.ok) throw new Error(`Fotoğraf okunamadı (${response.status})`)
    return await response.arrayBuffer()
  } catch {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
    return decodeBase64(raw)
  }
}

export function buildProfilePhotoPath(userId, ext = 'jpg') {
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('Geçersiz kullanıcı')
  return `${uid}/avatar.${ext}`
}

export async function createProfilePhotoSignedUrl(storagePath, expiresSec = 3600) {
  const path = String(storagePath || '').trim()
  if (!path) return null
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresSec)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function uploadProfilePhoto(userId, asset) {
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('Geçersiz kullanıcı')
  if (!asset?.uri) throw new Error('Dosya seçilmedi')

  const prepared = await compressProfilePhotoAsset(asset)
  const buffer = await readPickerArrayBuffer(prepared)
  const path = buildProfilePhotoPath(uid, 'jpg')
  const supabase = getSupabase()

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })
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
