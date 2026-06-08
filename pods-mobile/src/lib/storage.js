import AsyncStorage from '@react-native-async-storage/async-storage'

export async function getStoredItem(key) {
  try {
    return await AsyncStorage.getItem(key)
  } catch {
    return null
  }
}

export async function setStoredItem(key, value) {
  try {
    if (value == null) await AsyncStorage.removeItem(key)
    else await AsyncStorage.setItem(key, String(value))
  } catch {
    /* ignore */
  }
}

export async function removeStoredItem(key) {
  try {
    await AsyncStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
