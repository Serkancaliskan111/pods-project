const MAX_INPUT_BYTES = 80 * 1024 * 1024
const TARGET_MAX_BYTES = 7 * 1024 * 1024
const MAX_DURATION_SEC = 40
const MAX_EDGE = 720

function pickRecorderMime() {
  const candidates = [
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ]
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return ''
}

function loadVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      const duration = Number(video.duration)
      const width = video.videoWidth || 0
      const height = video.videoHeight || 0
      URL.revokeObjectURL(url)
      resolve({ duration, width, height })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Video okunamadı'))
    }
    video.src = url
  })
}

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

function waitForEvent(el, event) {
  return new Promise((resolve) => {
    const onDone = () => {
      el.removeEventListener(event, onDone)
      resolve()
    }
    el.addEventListener(event, onDone)
  })
}

async function reencodeVideo(file, meta) {
  const mime = pickRecorderMime()
  if (!mime) throw new Error('Tarayıcı video sıkıştırmayı desteklemiyor')

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.src = url

  await waitForEvent(video, 'loadeddata')
  const { width, height } = scaleDimensions(meta.width, meta.height, MAX_EDGE)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Video işlenemedi')

  canvas.width = width
  canvas.height = height

  const stream = canvas.captureStream(24)
  const bitrates = [1_200_000, 900_000, 650_000, 450_000]
  let lastBlob = null

  for (const videoBitsPerSecond of bitrates) {
    const chunks = []
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond })
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data)
    }

    const done = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' })
        resolve(blob)
      }
      recorder.onerror = () => reject(new Error('Video sıkıştırılamadı'))
    })

    recorder.start(250)
    video.currentTime = 0

    await new Promise((resolve, reject) => {
      const onFrame = () => {
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, width, height)
        }
      }
      video.addEventListener('timeupdate', onFrame)
      video.addEventListener('ended', () => {
        video.removeEventListener('timeupdate', onFrame)
        resolve()
      }, { once: true })
      video.addEventListener('error', () => {
        video.removeEventListener('timeupdate', onFrame)
        reject(new Error('Video oynatılamadı'))
      }, { once: true })
      video.play().catch(reject)
    })

    video.pause()
    if (recorder.state !== 'inactive') recorder.stop()
    lastBlob = await done
    if (lastBlob.size <= TARGET_MAX_BYTES) break
  }

  URL.revokeObjectURL(url)
  video.remove()

  if (!lastBlob || !lastBlob.size) throw new Error('Video işlenemedi')
  if (lastBlob.size > TARGET_MAX_BYTES) {
    throw new Error('Video sıkıştırılamadı, daha kısa bir kayıt deneyin')
  }

  const ext = lastBlob.type.includes('mp4') ? 'mp4' : 'webm'
  return new File([lastBlob], `video.${ext}`, { type: lastBlob.type, lastModified: Date.now() })
}

/** @param {File} file */
export async function compressCustomerRatingVideoFile(file) {
  if (!file) throw new Error('Dosya seçilmedi')
  if (!String(file.type || '').startsWith('video/')) {
    throw new Error('Geçersiz video dosyası')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Video çok büyük')
  }

  const meta = await loadVideoMeta(file)
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
    throw new Error('Video süresi okunamadı')
  }
  if (meta.duration > MAX_DURATION_SEC) {
    throw new Error('Video çok uzun')
  }

  if (file.size <= TARGET_MAX_BYTES) {
    return file
  }

  return reencodeVideo(file, meta)
}
