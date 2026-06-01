import * as FileSystem from 'expo-file-system'
import { normalizePhotoUri } from './photoOrientation'

export const PROFILE_PHOTO_MAX_INPUT_BYTES = 30 * 1024 * 1024
export const PROFILE_PHOTO_MAX_EDGE = 1024

/**
 * Galeriden gelen büyük görselleri yüklemeden önce sıkıştırır (JPEG).
 * @param {import('expo-image-picker').ImagePickerAsset} asset
 */
export async function compressProfilePhotoAsset(asset) {
  if (!asset?.uri) throw new Error('Dosya seçilmedi')

  const inputBytes =
    typeof asset.fileSize === 'number'
      ? asset.fileSize
      : await (async () => {
          try {
            const info = await FileSystem.getInfoAsync(asset.uri, { size: true })
            return typeof info.size === 'number' ? info.size : 0
          } catch {
            return 0
          }
        })()

  if (inputBytes > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    throw new Error('Profil fotoğrafı en fazla 30 MB olabilir.')
  }

  const uri = await normalizePhotoUri(asset.uri, {
    quality: 0.82,
    maxWidth: PROFILE_PHOTO_MAX_EDGE,
    maxHeight: PROFILE_PHOTO_MAX_EDGE,
  })

  return {
    ...asset,
    uri,
    base64: null,
    mimeType: 'image/jpeg',
    fileName: 'avatar.jpg',
  }
}
