import Constants from 'expo-constants'

/**
 * Uygulama Expo Go içinde mi (App Store’dan indirilen istemci)?
 * SDK 53+ ile Expo Go’da uzaktan push / tam bildirim akışı kaldırıldı;
 * `expo-notifications` çağrıları konsolda ERROR/WARN üretir.
 * Push için: https://docs.expo.dev/develop/development-builds/introduction/
 */
export function isExpoGoClient() {
  return Constants.executionEnvironment === 'storeClient'
}
