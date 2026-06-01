const READ_STORAGE_KEY = 'pods_web_ann_read_v1'

export function loadReadAnnouncementIds(scopeId) {
  if (!scopeId || typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(`${READ_STORAGE_KEY}:${scopeId}`)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

export function saveReadAnnouncementIds(scopeId, ids) {
  if (!scopeId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${READ_STORAGE_KEY}:${scopeId}`,
      JSON.stringify([...ids].slice(-300)),
    )
  } catch {
    /* ignore */
  }
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
