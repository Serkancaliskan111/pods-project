import { CUSTOMER_RATING_MEDIA_BUCKET } from './customerRatingMediaUpload'

const SIGNED_TTL_SEC = 3600

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function signedUrlForRatingMediaPath(supabase, storagePath) {
  if (!storagePath) return null
  const { data, error } = await supabase.storage
    .from(CUSTOMER_RATING_MEDIA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_TTL_SEC)
  if (error) {
    console.error(error)
    return null
  }
  return data?.signedUrl || null
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
export async function enrichRatingsWithMediaUrls(supabase, ratings) {
  const list = ratings || []
  const paths = [
    ...new Set(
      list.flatMap((r) => [r.foto_path, r.video_path].filter(Boolean)),
    ),
  ]
  if (!paths.length) return list

  const urlByPath = new Map()
  await Promise.all(
    paths.map(async (path) => {
      const url = await signedUrlForRatingMediaPath(supabase, path)
      if (url) urlByPath.set(path, url)
    }),
  )

  return list.map((r) => ({
    ...r,
    foto_url: r.foto_path ? urlByPath.get(r.foto_path) || null : null,
    video_url: r.video_path ? urlByPath.get(r.video_path) || null : null,
  }))
}
