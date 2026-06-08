import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_AVATAR_ID } from './avatarTemplates'

export const AVATAR_PREF_INITIAL = 'initial'

export const HOME_AVATAR_EMOJI_OPTIONS = [
  '😊', '🙂', '😎', '🤩', '💪', '⭐', '🎯', '🔥', '👍', '🚀', '💼', '🏆',
]

function getKey(userId) {
  return `pods_avatar_pref_${String(userId || '')}`
}

/** @returns {{ kind: 'initial' | 'emoji' | 'template', id?: string, emoji?: string }} */
export function parseAvatarPreference(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === AVATAR_PREF_INITIAL) return { kind: 'initial' }
  if (raw.startsWith('emoji:')) {
    const emoji = raw.slice(6)
    return emoji ? { kind: 'emoji', emoji } : { kind: 'initial' }
  }
  return { kind: 'template', id: raw }
}

export function formatEmojiAvatarPreference(emoji) {
  return `emoji:${emoji}`
}

export async function loadAvatarPreference(userId) {
  if (!userId) return DEFAULT_AVATAR_ID
  try {
    const value = await AsyncStorage.getItem(getKey(userId))
    return value || DEFAULT_AVATAR_ID
  } catch {
    return DEFAULT_AVATAR_ID
  }
}

export async function saveAvatarPreference(userId, avatarId) {
  if (!userId || !avatarId) return false
  try {
    await AsyncStorage.setItem(getKey(userId), String(avatarId))
    return true
  } catch {
    return false
  }
}
