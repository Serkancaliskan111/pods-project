import React from 'react'
import Text from './Text'

const ALLOWED = new Set(['displayLg', 'displayMd', 'h1', 'h2', 'h3'])

/**
 * Sadece başlık varyantlarını kabul eder. `Text` üstüne küçük bir guard
 * koyar; default `h2`.
 */
export default function Heading({ variant = 'h2', ...rest }) {
  const safe = ALLOWED.has(variant) ? variant : 'h2'
  return <Text variant={safe} {...rest} />
}
