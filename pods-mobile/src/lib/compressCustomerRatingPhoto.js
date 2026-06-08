const MAX_INPUT_BYTES = 25 * 1024 * 1024
const TARGET_MAX_BYTES = 520 * 1024
const MAX_EDGE = 1280

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

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Görsel işlenemedi'))),
      'image/jpeg',
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
      reject(new Error('Görsel okunamadı'))
    }
    img.src = url
  })
}

/** @param {File} file */
export async function compressCustomerRatingPhotoFile(file) {
  if (!file) throw new Error('Dosya seçilmedi')
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Geçersiz görsel dosyası')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Görsel çok büyük')
  }

  const img = await loadImageFromFile(file)
  let { width, height } = scaleDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    MAX_EDGE,
  )

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Tarayıcı görsel işlemeyi desteklemiyor')

  let quality = 0.86
  let blob = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    blob = await canvasToBlob(canvas, quality)
    if (blob.size <= TARGET_MAX_BYTES) break
    if (quality > 0.52) {
      quality = Math.max(0.52, quality - 0.08)
      continue
    }
    width = Math.max(480, Math.round(width * 0.85))
    height = Math.max(480, Math.round(height * 0.85))
    quality = 0.8
  }

  if (!blob) throw new Error('Görsel işlenemedi')
  return new File([blob], 'foto.jpg', { type: 'image/jpeg', lastModified: Date.now() })
}
