import Theme from '../theme/theme'

export default Theme
export { Theme }

// CommonJS interop (some React Native toolchains can require `module.exports`)
try {
  // eslint-disable-next-line no-undef
  module.exports = Theme
  // eslint-disable-next-line no-undef
  module.exports.default = Theme
} catch {
  // ignore (module is not defined in ESM runtime)
}

