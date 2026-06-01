/**
 * Bu dosya, mobil ana sayfanın asıl implementasyonu olan
 * `./home/HomeScreen.jsx`'in geriye uyumlu re-export'udur.
 *
 * `AppTabs` ve diğer navigation kayıtları halen `'./Home'` import yolunu
 * kullandığı için bu thin wrapper varlığını koruyor.
 */
export { default } from './home/HomeScreen'
