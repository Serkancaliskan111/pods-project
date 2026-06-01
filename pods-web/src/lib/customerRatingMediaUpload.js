import getSupabase from './supabaseClient'

export const CUSTOMER_RATING_MEDIA_BUCKET = 'musteri-degerlendirme'

async function uploadObject(path, file) {
  const supabase = getSupabase()
  const { error } = await supabase.storage.from(CUSTOMER_RATING_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return path
}

/**
 * @param {number|string} ratingId
 * @param {File|null} photoFile
 * @param {File|null} videoFile
 * @returns {Promise<{ fotoPath: string|null, videoPath: string|null }>}
 */
export async function uploadCustomerRatingMedia(ratingId, photoFile, videoFile) {
  const prefix = `${ratingId}`
  let fotoPath = null
  let videoPath = null

  if (photoFile) {
    const ext = photoFile.type === 'image/png' ? 'png' : 'jpg'
    fotoPath = await uploadObject(`${prefix}/foto.${ext === 'png' ? 'png' : 'jpg'}`, photoFile)
  }

  if (videoFile) {
    const isWebm = String(videoFile.type || '').includes('webm')
    const name = isWebm ? 'video.webm' : 'video.mp4'
    videoPath = await uploadObject(`${prefix}/${name}`, videoFile)
  }

  return { fotoPath, videoPath }
}
