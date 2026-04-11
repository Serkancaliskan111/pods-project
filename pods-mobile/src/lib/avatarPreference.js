import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_AVATAR_ID } from './avatarTemplates'

function getKey(userId) {
  return `pods_avatar_pref_${String(userId || '')}`
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
