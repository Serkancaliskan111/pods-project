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
