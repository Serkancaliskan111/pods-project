import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import { Platform, NativeModules } from 'react-native'
import Constants from 'expo-constants'
import getSupabase from '../../lib/supabaseClient'

const supabase = getSupabase()

export const UPLOAD_RETRY_DELAYS_MS = [0, 500, 1200]

function inferImageMeta(photo = {}) {
  const uri = String(photo?.uri || '').toLowerCase()
  if (uri.endsWith('.png')) return { ext: 'png', contentType: 'image/png' }
  if (uri.endsWith('.webp')) return { ext: 'webp', contentType: 'image/webp' }
  return { ext: 'jpg', contentType: 'image/jpeg' }
}

async function readPhotoArrayBuffer(photo) {
  if (photo?.base64) {
    const raw = String(photo.base64).replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
    return decodeBase64(raw)
  }

  const uri = String(photo?.uri || '').trim()
  if (!uri) throw new Error('Fotoğraf yolu bulunamadı')

  try {
    const response = await fetch(uri)
    if (!response.ok) throw new Error(`Fotoğraf okunamadı (${response.status})`)
    return await response.arrayBuffer()
  } catch {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
    const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
    return decodeBase64(raw)
  }
}

async function uploadPhotoWithRetry({ bucket, fileNamePrefix, photo }) {
  const { ext, contentType } = inferImageMeta(photo)
  let lastError = null
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  for (let attempt = 0; attempt < UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (UPLOAD_RETRY_DELAYS_MS[attempt] > 0) await sleep(UPLOAD_RETRY_DELAYS_MS[attempt])
      const arrayBuffer = await readPhotoArrayBuffer(photo)
      const fileName = `${fileNamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, arrayBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const path = data?.path ?? data
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      if (!urlData?.publicUrl) throw new Error('Public URL alınamadı')
      return urlData.publicUrl
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Fotoğraf yüklenemedi')
}

export async function uploadPhotoList(bucket, fileNamePrefix, photoList = []) {
  if (!photoList.length) return []
  return Promise.all(
    photoList.map((photo) => uploadPhotoWithRetry({ bucket, fileNamePrefix, photo })),
  )
}

function inferVideoMeta(uri = '') {
  const u = String(uri || '').toLowerCase()
  if (u.endsWith('.mov')) return { ext: 'mov', contentType: 'video/quicktime' }
  return { ext: 'mp4', contentType: 'video/mp4' }
}

/** Yalnızca web: sistem kamerası / picker (native’de uygulama içi kamera kullanılır). */
export function webFallbackVideoPickerOptions(videoMaxDuration) {
  const base = {
    mediaTypes: ['videos'],
    allowsEditing: false,
    videoMaxDuration,
  }
  if (Platform.OS === 'ios') {
    return {
      ...base,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    }
  }
  return base
}

async function readVideoArrayBuffer(video) {
  const uri = String(video?.uri || '').trim()
  if (!uri) throw new Error('Video yolu bulunamadı')
  const response = await fetch(uri)
  if (!response.ok) throw new Error(`Video okunamadı (${response.status})`)
  return await response.arrayBuffer()
}

/** Expo Go'da ve native modül yoksa compressor paketini yüklemeyin (eval sırasında hata veriyor). */
function canUseNativeVideoCompressor() {
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

export async function maybeCompressVideoUri(inputUri) {
  const uri = String(inputUri || '').trim()
  if (!uri) return uri
  if (Platform.OS === 'web') return uri
  if (!canUseNativeVideoCompressor()) return uri
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true })
    const sizeBytes = typeof info?.size === 'number' ? info.size : null
    const sizeMb = sizeBytes != null ? sizeBytes / (1024 * 1024) : null
    if (sizeMb != null && sizeMb <= 8) return uri
  } catch {
    // ignore: compress best-effort
  }
  try {
    const compressorModule = require('react-native-compressor')
    const compressFn = compressorModule?.Video?.compress
    if (typeof compressFn !== 'function') return uri
    const compressedUri = await compressFn(
      uri,
      {
        compressionMethod: 'auto',
        minimumFileSizeForCompress: 8,
        maxSize: 640,
      },
      () => {},
    )
    return String(compressedUri || uri)
  } catch {
    return uri
  }
}

async function uploadVideoWithRetry({ bucket, fileNamePrefix, video }) {
  const baseUri = await maybeCompressVideoUri(video?.uri)
  const uploadVideo = { ...(video || {}), uri: baseUri }
  const { ext, contentType } = inferVideoMeta(uploadVideo?.uri)
  let lastError = null
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  for (let attempt = 0; attempt < UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (UPLOAD_RETRY_DELAYS_MS[attempt] > 0) await sleep(UPLOAD_RETRY_DELAYS_MS[attempt])
      const arrayBuffer = await readVideoArrayBuffer(uploadVideo)
      const fileName = `${fileNamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, arrayBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const path = data?.path ?? data
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      if (!urlData?.publicUrl) throw new Error('Public URL alınamadı')
      const duration_sec =
        uploadVideo?.durationSec != null && Number.isFinite(Number(uploadVideo.durationSec))
          ? Number(uploadVideo.durationSec)
          : null
      return { url: urlData.publicUrl, duration_sec }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Video yüklenemedi')
}

export async function uploadVideoEvidenceRows(bucket, fileNamePrefix, videoList = []) {
  if (!videoList.length) return []
  return Promise.all(
    videoList.map((v) => uploadVideoWithRetry({ bucket, fileNamePrefix, video: v })),
  )
}

const DOC_EXT_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const ALLOWED_DOC_EXT = Object.keys(DOC_EXT_MIME)
const DOC_MAX_BYTES = 25 * 1024 * 1024

function inferDocumentMeta(doc = {}) {
  const name = String(doc.name || doc.fileName || 'belge').trim() || 'belge'
  const lower = name.toLowerCase()
  let ext = 'bin'
  for (const e of ALLOWED_DOC_EXT) {
    if (lower.endsWith(`.${e}`)) {
      ext = e
      break
    }
  }
  const contentType = doc.mimeType || doc.type || DOC_EXT_MIME[ext] || 'application/octet-stream'
  return { name, ext, contentType }
}

async function readDocumentArrayBuffer(doc) {
  const uri = String(doc?.uri || '').trim()
  if (!uri) throw new Error('Belge yolu bulunamadı')
  const response = await fetch(uri)
  if (!response.ok) throw new Error(`Belge okunamadı (${response.status})`)
  return await response.arrayBuffer()
}

async function uploadDocumentWithRetry({ bucket, fileNamePrefix, doc }) {
  const { name, ext, contentType } = inferDocumentMeta(doc)
  const size = doc.size != null ? Number(doc.size) : null
  if (size != null && size > DOC_MAX_BYTES) {
    throw new Error('Belge boyutu 25 MB sınırını aşıyor')
  }
  if (!ALLOWED_DOC_EXT.includes(ext)) {
    throw new Error('Desteklenmeyen belge türü')
  }
  let lastError = null
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  for (let attempt = 0; attempt < UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (UPLOAD_RETRY_DELAYS_MS[attempt] > 0) await sleep(UPLOAD_RETRY_DELAYS_MS[attempt])
      const arrayBuffer = await readDocumentArrayBuffer(doc)
      const fileName = `${fileNamePrefix}-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, arrayBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const path = data?.path ?? data
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      if (!urlData?.publicUrl) throw new Error('Public URL alınamadı')
      return {
        url: urlData.publicUrl,
        name,
        mime: contentType,
        size,
      }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Belge yüklenemedi')
}

/** @returns {Promise<Array<{ url: string, name: string, mime: string|null, size: number|null }>>} */
export async function uploadDocumentList(bucket, fileNamePrefix, documentList = []) {
  if (!documentList.length) return []
  return Promise.all(
    documentList.map((doc) => uploadDocumentWithRetry({ bucket, fileNamePrefix, doc })),
  )
}
