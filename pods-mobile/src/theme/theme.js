import theme from './constants'

export default theme

// CommonJS interop for RN toolchains
try {
  // eslint-disable-next-line no-undef
  module.exports = theme
  // eslint-disable-next-line no-undef
  module.exports.default = theme
} catch {
  // ignore
}

