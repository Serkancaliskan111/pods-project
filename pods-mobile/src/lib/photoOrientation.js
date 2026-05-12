/**
 * EXIF orientation normalizasyonu.
 *
 * Sorun: Android'de bazı cihazlarda kamera (expo-camera / expo-image-picker)
 * çekilen JPEG dosyalarına EXIF orientation flag'i yazıyor ama pikselleri
 * döndürmüyor. Bu nedenle:
 *   - Storage'a yüklenen ham byte'lar EXIF'siz olarak okunduğunda yatay görünüyor
 *   - <Image> bileşeni veya browser EXIF'i okumayan bir görüntüleyici resmi
 *     yatay gösteriyor
 *
 * Çözüm: çekim/seçim sonrası resmi `react-native-compressor` ile yeniden
 * encode ederek EXIF orientation'ı kalıcı olarak piksellere uygulamak. Bu
 * işlem aynı zamanda dosyayı küçültür ve yükleme süresini azaltır.
 *
 * Bu kütüphane Expo Go'da çalışmadığı için (native modül gerekli) güvenli
 * fallback'lerle sarılmıştır: native modül yoksa orijinal uri döner.
 */

import { Platform, NativeModules } from 'react-native'
import Constants from 'expo-constants'

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

/**
 * Bir fotoğrafın URI'sini EXIF orientation'ı piksele uygulanmış yeni bir
 * URI'ye çevirir. Compressor mevcut değilse veya hata olursa orijinal URI
 * döner. Çağıranlar `base64` alanını null'a çekmelidir; aksi halde upload
 * tarafı normalize edilmemiş base64 byte'larını okur.
 */
export async function normalizePhotoUri(inputUri, options = {}) {
  const uri = String(inputUri || '').trim()
  if (!uri) return uri
  if (!canUseNativeCompressor()) return uri

  try {
    const compressorModule = require('react-native-compressor')
    const compressFn = compressorModule?.Image?.compress
    if (typeof compressFn !== 'function') return uri

    const quality = typeof options.quality === 'number' ? options.quality : 0.88
    const maxWidth = typeof options.maxWidth === 'number' ? options.maxWidth : 2048
    const maxHeight = typeof options.maxHeight === 'number' ? options.maxHeight : 2048

    const normalized = await compressFn(uri, {
      compressionMethod: 'auto',
      quality,
      maxWidth,
      maxHeight,
      output: 'jpg',
      returnableOutputType: 'uri',
    })
    return String(normalized || uri)
  } catch {
    return uri
  }
}
