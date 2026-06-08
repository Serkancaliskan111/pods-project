import { isExpoGoClient } from './expoGoNotifications'

let notificationsModulePromise = null

/**
 * Expo Go (SDK 53+) uzaktan push desteklemediği için modül yalnızca
 * development/production build'de lazy yüklenir — konsol uyarıları azalır.
 */
export async function loadNotificationsModule() {
  if (isExpoGoClient()) return null
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch((err) => {
      notificationsModulePromise = null
      throw err
    })
  }
  return notificationsModulePromise
}
