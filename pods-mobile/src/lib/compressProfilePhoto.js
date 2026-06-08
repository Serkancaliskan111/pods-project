import { Platform, NativeModules } from 'react-native'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system'

/** Kullanıcı seçimi: büyük dosyalar kabul; sunucuya KB mertebesinde JPEG gider. */
export const PROFILE_PHOTO_MAX_INPUT_BYTES = 30 * 1024 * 1024
export const PROFILE_PHOTO_TARGET_MAX_BYTES = 450 * 1024
export const PROFILE_PHOTO_MAX_EDGE = 1024

function scaleDimensions(width, height, maxEdge) {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { width: w, height: h }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Sıkıştırma başarısız'))),
      type,
      quality,
    )
  })
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Görsel okunamadı. JPEG veya PNG deneyin.'))
    }
    img.src = url
  })
}

/**
 * @param {File|Blob} file
 * @returns {Promise<File>}
 */
export async function compressProfilePhotoFile(file) {
  if (!file) throw new Error('Dosya seçilmedi')
  const inputSize = typeof file.size === 'number' ? file.size : 0
  if (inputSize > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    throw new Error('Profil fotoğrafı en fazla 30 MB olabilir.')
  }

  const img = await loadImageFromFile(file)
  let { width, height } = scaleDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, PROFILE_PHOTO_MAX_EDGE)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Tarayıcı görsel işlemeyi desteklemiyor.')

  let quality = 0.88
  let blob = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= PROFILE_PHOTO_TARGET_MAX_BYTES) break
    if (quality > 0.55) {
      quality = Math.max(0.55, quality - 0.08)
      continue
    }
    width = Math.max(320, Math.round(width * 0.85))
    height = Math.max(320, Math.round(height * 0.85))
    quality = 0.82
  }

  if (!blob) throw new Error('Sıkıştırma başarısız')

  const baseName = file instanceof File && file.name ? file.name.replace(/\.[^.]+$/, '') : 'avatar'
  return new File([blob], `${baseName || 'avatar'}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

function canUseNativeCompressor() {
  if (Platform.OS === 'web') return false
  try {
    if (Constants.executionEnvironment === 'storeClient') return false
  } catch {
    // executionEnvironment yoksa devam et
  }
  try {
    return !!(NativeModules && NativeModules.Compressor)
  } catch {
    return false
  }
}

async function getUriByteSize(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true })
    return typeof info?.size === 'number' ? info.size : 0
  } catch {
    return 0
  }
}

async function getAssetByteSize(asset) {
  if (typeof asset?.fileSize === 'number' && asset.fileSize > 0) return asset.fileSize
  return getUriByteSize(asset?.uri)
}

async function compressUriWithNative(uri, { quality, maxEdge }) {
  const compressorModule = require('react-native-compressor')
  const compressFn = compressorModule?.Image?.compress
  if (typeof compressFn !== 'function') return uri

  return compressFn(uri, {
    compressionMethod: 'auto',
    quality,
    maxWidth: maxEdge,
    maxHeight: maxEdge,
    output: 'jpg',
    returnableOutputType: 'uri',
  })
}

/**
 * ImagePicker asset → upload için sıkıştırılmış JPEG URI.
 * @param {import('expo-image-picker').ImagePickerAsset} asset
 */
export async function compressProfilePhotoAsset(asset) {
  if (!asset?.uri) throw new Error('Dosya seçilmedi')

  const inputSize = await getAssetByteSize(asset)
  if (inputSize > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    throw new Error('Profil fotoğrafı en fazla 30 MB olabilir.')
  }

  const sourceUri = String(asset.uri).trim()
  if (!canUseNativeCompressor()) {
    return { uri: sourceUri, base64: null, mimeType: 'image/jpeg' }
  }

  let quality = 0.88
  let maxEdge = PROFILE_PHOTO_MAX_EDGE
  let outputUri = sourceUri

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      outputUri = await compressUriWithNative(sourceUri, { quality, maxEdge })
      outputUri = String(outputUri || sourceUri)
      const size = await getUriByteSize(outputUri)
      if (size <= PROFILE_PHOTO_TARGET_MAX_BYTES || size === 0) break
      if (quality > 0.55) {
        quality = Math.max(0.55, quality - 0.08)
        continue
      }
      maxEdge = Math.max(320, Math.round(maxEdge * 0.85))
      quality = 0.82
    }
  } catch {
    outputUri = sourceUri
  }

  return { uri: outputUri, base64: null, mimeType: 'image/jpeg' }
}
