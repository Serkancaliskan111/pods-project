import { getStoredItem, setStoredItem } from './storage.js'

const READ_STORAGE_KEY = 'pods_mobile_ann_read_v1'

export async function loadReadAnnouncementIdsAsync(scopeId) {
  if (!scopeId) return new Set()
  try {
    const raw = await getStoredItem(`${READ_STORAGE_KEY}:${scopeId}`)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

export function loadReadAnnouncementIds(scopeId) {
  return new Set()
}

export async function saveReadAnnouncementIdsAsync(scopeId, ids) {
  if (!scopeId) return
  try {
    await setStoredItem(
      `${READ_STORAGE_KEY}:${scopeId}`,
      JSON.stringify([...ids].slice(-300)),
    )
  } catch {
    /* ignore */
  }
}

export function saveReadAnnouncementIds() {
  /* sync stub — mobilde async sürüm kullanın */
}

export function countUnreadAnnouncements(items, readIds) {
  if (!items?.length) return 0
  const read = readIds || new Set()
  return items.filter((item) => item?.id != null && !read.has(String(item.id))).length
}

export function filterUnreadAnnouncements(items, readIds) {
  if (!items?.length) return []
  const read = readIds || new Set()
  return items.filter((item) => item?.id != null && !read.has(String(item.id)))
}
