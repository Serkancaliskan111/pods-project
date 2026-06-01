import { palette, hexToRgba } from './palette'
import { typography, fontFamilies } from './typography'
import { spacing, radii, shadows, gradients, motion, z } from './tokens'

/**
 * GERİYE UYUMLU tema kaynağı.
 *
 * Bu dosya yeni paletin (`palette.js`), tipografinin (`typography.js`) ve
 * tokenların (`tokens.js`) üstünde, eski API'nin (`Colors.primary`,
 * `Colors.accent`, `Colors.alpha.indigo10`, `Typography.heading`, `Radii.lg`,
 * `Shadows.card`, vb.) ürettiği yapıyı **bir alias katmanı** olarak yeniden
 * paketler. Bu sayede henüz UI Kit'e taşınmamış 18 ekran, yeni kimliği
 * otomatik olarak benimser; refactor faz faz ilerlerken hiçbir mevcut import
 * yolu kırılmaz.
 *
 * Yeni kodda doğrudan tema sabitleri yerine
 *   `import { palette, typography, spacing, radii, shadows } from '../theme'`
 * tercih edilmelidir. UI Kit primitivleri zaten yeni tokenleri kullanır.
 */

const slate = palette.slate
const primary = palette.primary
const accent = palette.accent
const success = palette.success
const danger = palette.danger
const warning = palette.warning
const info = palette.info
const blurple = palette.blurple

const alpha = {
  // primary / "indigo" ailesi – mevcut ekranlarda kart background ve border
  // tonları için yaygın kullanılıyor.
  indigo06: hexToRgba(primary[700], 0.06),
  indigo08: hexToRgba(primary[700], 0.08),
  indigo10: hexToRgba(primary[700], 0.1),
  indigo12: hexToRgba(primary[700], 0.12),
  indigo15: hexToRgba(primary[700], 0.15),
  indigo20: hexToRgba(primary[700], 0.2),
  indigo25: hexToRgba(primary[700], 0.25),
  indigo32: hexToRgba(primary[700], 0.32),
  indigo55: hexToRgba(primary[700], 0.55),

  // emerald / "success" ailesi
  emerald08: hexToRgba(success[500], 0.08),
  emerald10: hexToRgba(success[500], 0.1),
  emerald18: hexToRgba(success[500], 0.18),
  emerald25: hexToRgba(success[500], 0.25),
  emerald35: hexToRgba(success[500], 0.35),

  // amber / "warning" ailesi
  amber10: hexToRgba(warning[500], 0.1),
  amber25: hexToRgba(warning[500], 0.25),

  // rose / "danger" ailesi
  rose08: hexToRgba(danger[500], 0.08),
  rose10: hexToRgba(danger[500], 0.1),
  rose25: hexToRgba(danger[500], 0.25),
  rose35: hexToRgba(danger[500], 0.35),

  // gri / "slate" ailesi
  gray06: hexToRgba(slate[500], 0.06),
  gray08: hexToRgba(slate[500], 0.08),
  gray10: hexToRgba(slate[500], 0.1),
  gray12: hexToRgba(slate[500], 0.12),
  gray18: hexToRgba(slate[500], 0.18),
  gray20: hexToRgba(slate[500], 0.2),
  gray22: hexToRgba(slate[500], 0.22),
  gray25: hexToRgba(slate[500], 0.25),
  gray35: hexToRgba(slate[500], 0.35),
  gray85: hexToRgba(slate[500], 0.85),
  gray95: hexToRgba(slate[500], 0.95),

  // siyah / overlay
  black40: 'rgba(0,0,0,0.40)',
  black55: 'rgba(0,0,0,0.55)',
  black60: 'rgba(0,0,0,0.60)',
  black72: 'rgba(0,0,0,0.72)',

  // beyaz / cam efekti
  white10: 'rgba(255,255,255,0.10)',
  white75: 'rgba(255,255,255,0.75)',

  // mevcut navy/slate alias'ları
  navy05: hexToRgba(primary[700], 0.05),
  navy09: hexToRgba(primary[700], 0.9),
  slate1555: hexToRgba(slate[500], 0.55),
  slate9009: hexToRgba(primary[700], 0.9),
}

const Colors = {
  // Yapısal
  background: palette.background,
  surface: palette.surface,
  card: palette.surface,

  // Marka
  primary: primary[700],
  primaryDeep: primary[800],
  primaryDark: primary[800],
  primarySoft: primary[100],
  accent: accent[500],
  accentDeep: accent[600],
  accentSoft: accent[100],
  tertiary: blurple[500],
  tertiarySoft: blurple[100],

  // Metin
  text: slate[800],
  bodyText: slate[700],
  mutedText: slate[500],
  subtleText: slate[400],

  // Form
  inputBg: slate[50],
  inputBorder: slate[200],

  // Semantik
  success: success[500],
  successDeep: success[700],
  successSoft: success[100],
  warning: warning[500],
  warningDeep: warning[700],
  warningSoft: warning[100],
  error: danger[500],
  errorDeep: danger[700],
  errorSoft: danger[100],
  info: info[500],
  infoSoft: info[100],

  // Gri rampası (ekranlarda doğrudan kullanılıyor)
  gray: slate[400],
  grayDeep: slate[600],
  graySoft: slate[100],

  // Ham palet erişimi (yeni kit için)
  palette,

  // Geriye uyum alfa rampası
  alpha,
}

const Typography = {
  // Yeni font ailesi – tüm legacy "Typography.body / heading / ..." anahtarları
  // artık Plus Jakarta Sans'in doğru weight'ini taşıyor.
  fontFamily: fontFamilies.medium,
  fontFamilies,

  // Yeni preset isimleri (ileri kod için)
  displayLg: typography.displayLg,
  displayMd: typography.displayMd,
  h1: typography.h1,
  h2: typography.h2,
  h3: typography.h3,
  bodyLg: typography.bodyLg,
  body: typography.body,
  bodySm: typography.bodySm,
  caption: typography.caption,
  overline: typography.overline,
  metric: typography.metric,
  metricSm: typography.metricSm,

  // Geriye uyum: mevcut ekranlar `Typography.heading.fontSize`, `Typography.subheading`,
  // `Typography.bodyLg`, `Typography.body`, `Typography.caption` referansları kullanıyor.
  heading: { ...typography.h1, fontWeight: '800', color: slate[800] },
  subheading: { ...typography.h2, fontWeight: '700', color: slate[800] },
}

const Spacing = {
  xs: spacing.xs * 2, // = 8  (legacy `Spacing.xs` 8 idi)
  sm: spacing.lg, // = 16 (legacy `Spacing.sm` 16 idi)
  md: spacing['2xl'], // = 24
  lg: spacing['3xl'], // = 32
  xl: spacing['4xl'] + 8, // = 48
  // Yeni scale (önerilen kullanım):
  s: spacing,
}

const radiusLegacyMap = {
  sm: radii.sm,
  md: radii.md,
  lg: radii['2xl'], // legacy `Radii.lg` 24 idi
  xl: radii['3xl'] + 2, // legacy `Radii.xl` 30 idi → 30
  full: radii.pill,
}

const Radii = {
  ...radiusLegacyMap,
  // Yeni scale erişimi
  scale: radii,
}

const Layout = {
  borderRadius: { ...radiusLegacyMap },
  shadow: {
    sm: shadows.sm,
  },
}

const Shadows = {
  // Geriye uyum: `Shadows.card` mevcut ekranlarda en yaygın referans.
  // Yeni "soft + renkli" gölgeyi varsayılan olarak veriyoruz; bu, eski "neredeyse
  // görünmeyen" gölgenin yerine geliyor ve Bold Productivity vibe'a uygun.
  card: shadows.sm,
  cardElevated: shadows.md,
  cardFloating: shadows.lg,
  accent: shadows.accent,
  primary: shadows.primary,
  blurple: shadows.blurple,
  success: shadows.success,
  danger: shadows.danger,
}

const Gradients = gradients

const Card = { borderRadius: radii['2xl'], padding: spacing.lg }

const Button = {
  height: 48,
  borderRadius: radii.pill,
  pressedOpacity: 0.85,
}

const theme = {
  Colors,
  Typography,
  Spacing,
  Radii,
  Layout,
  Shadows,
  Gradients,
  Card,
  Button,
  // Yeni token erişimi (UI Kit ve modern ekranlar için)
  palette,
  spacing,
  radii,
  shadows,
  gradients,
  motion,
  z,
  fontFamilies,
}

export {
  Colors,
  Typography,
  Spacing,
  Radii,
  Layout,
  Shadows,
  Gradients,
  Card,
  Button,
  palette,
  spacing,
  radii,
  shadows,
  gradients,
  motion,
  z,
  fontFamilies,
  alpha,
  hexToRgba,
}

export default theme

try {
  // eslint-disable-next-line no-undef
  module.exports = theme
  // eslint-disable-next-line no-undef
  module.exports.default = theme
  // eslint-disable-next-line no-undef
  module.exports.Colors = Colors
  // eslint-disable-next-line no-undef
  module.exports.Typography = Typography
  // eslint-disable-next-line no-undef
  module.exports.Spacing = Spacing
  // eslint-disable-next-line no-undef
  module.exports.Radii = Radii
  // eslint-disable-next-line no-undef
  module.exports.Layout = Layout
  // eslint-disable-next-line no-undef
  module.exports.Shadows = Shadows
  // eslint-disable-next-line no-undef
  module.exports.Gradients = Gradients
  // eslint-disable-next-line no-undef
  module.exports.Card = Card
  // eslint-disable-next-line no-undef
  module.exports.Button = Button
  // eslint-disable-next-line no-undef
  module.exports.palette = palette
  // eslint-disable-next-line no-undef
  module.exports.spacing = spacing
  // eslint-disable-next-line no-undef
  module.exports.radii = radii
  // eslint-disable-next-line no-undef
  module.exports.shadows = shadows
  // eslint-disable-next-line no-undef
  module.exports.gradients = gradients
  // eslint-disable-next-line no-undef
  module.exports.motion = motion
  // eslint-disable-next-line no-undef
  module.exports.z = z
  // eslint-disable-next-line no-undef
  module.exports.fontFamilies = fontFamilies
  // eslint-disable-next-line no-undef
  module.exports.alpha = alpha
  // eslint-disable-next-line no-undef
  module.exports.hexToRgba = hexToRgba
} catch {
  // ignore
}
