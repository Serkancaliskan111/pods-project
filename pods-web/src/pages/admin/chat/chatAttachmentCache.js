import { createChatAttachmentSignedUrl } from '../../../lib/chatApi'

const signedUrlCache = new Map()

export function getCachedAttachmentUrl(storagePath) {
  if (!storagePath) return null
  const hit = signedUrlCache.get(String(storagePath))
  if (hit && hit.expiresAt > Date.now() + 120_000) return hit.url
  return null
}

export async function prefetchAttachmentUrl(storagePath, expiresSec = 3600) {
  if (!storagePath) return null
  const key = String(storagePath)
  const existing = getCachedAttachmentUrl(key)
  if (existing) return existing
  const url = await createChatAttachmentSignedUrl(key, expiresSec)
  if (url) {
    signedUrlCache.set(key, {
      url,
      expiresAt: Date.now() + Math.max(60, expiresSec - 120) * 1000,
    })
  }
  return url
}

export function prefetchAttachmentUrls(paths, limit = 24) {
  const unique = [...new Set((paths || []).filter(Boolean))].slice(-limit)
  return Promise.all(unique.map((p) => prefetchAttachmentUrl(p).catch(() => null)))
}
