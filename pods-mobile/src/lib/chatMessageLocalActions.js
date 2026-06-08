import AsyncStorage from '@react-native-async-storage/async-storage'

const STAR_PREFIX = '@pods_chat_star:'
const PIN_PREFIX = '@pods_chat_pin:'

export async function toggleChatMessageStar(messageId) {
  const key = `${STAR_PREFIX}${messageId}`
  const cur = await AsyncStorage.getItem(key)
  if (cur) {
    await AsyncStorage.removeItem(key)
    return false
  }
  await AsyncStorage.setItem(key, new Date().toISOString())
  return true
}

export async function toggleChatMessagePin(channelId, messageId) {
  const key = `${PIN_PREFIX}${channelId}`
  const raw = await AsyncStorage.getItem(key)
  const cur = raw ? JSON.parse(raw) : null
  if (cur && String(cur) === String(messageId)) {
    await AsyncStorage.removeItem(key)
    return false
  }
  await AsyncStorage.setItem(key, JSON.stringify(messageId))
  return true
}
