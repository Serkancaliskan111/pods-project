import theme from './constants'

export * from './constants'
export { palette } from './palette'
export { typography, fontFamilies } from './typography'
export { spacing, radii, shadows, gradients, motion, z } from './tokens'

export default theme

try {
  // eslint-disable-next-line no-undef
  module.exports = theme
  // eslint-disable-next-line no-undef
  module.exports.default = theme
} catch {
  // ignore
}
