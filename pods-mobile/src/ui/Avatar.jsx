import React from 'react'
import { View, Image, StyleSheet } from 'react-native'
import Text from './Text'
import { palette, shadows } from './tokens'

const SIZES = { xs: 28, sm: 36, md: 44, lg: 56, xl: 72, '2xl': 96 }

function getInitials(name) {
  if (!name) return '?'
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((p) => p[0]?.toUpperCase() || '').join('')
}

const PASTEL_BG = [
  palette.primary[100],
  palette.accent[100],
  palette.blurple[100],
  palette.success[100],
  palette.warning[100],
  palette.info[100],
]
const PASTEL_TEXT = [
  palette.primary[700],
  palette.accent[700],
  palette.blurple[700],
  palette.success[700],
  palette.warning[700],
  palette.info[700],
]

function hashIndex(key, mod) {
  let h = 0
  const s = String(key || '?')
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % mod
}

/**
 * Avatar – url verilirse görsel; yoksa baş harf + paletten deterministik
 * pastel arkaplan.
 *
 * <Avatar name="Serkan Çalışkan" url={photoUrl} size="md" />
 */
export default function Avatar({ name, url, size = 'md', shape = 'circle', elevated = false, style }) {
  const dim = SIZES[size] || SIZES.md
  const radius = shape === 'circle' ? dim / 2 : Math.max(dim / 6, 8)
  const idx = hashIndex(name || url, PASTEL_BG.length)
  const bg = PASTEL_BG[idx]
  const fg = PASTEL_TEXT[idx]
  return (
    <View
      style={[
        styles.base,
        { width: dim, height: dim, borderRadius: radius, backgroundColor: bg },
        elevated ? shadows.sm : null,
        style,
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%', borderRadius: radius }} />
      ) : (
        <Text
          variant={dim >= 56 ? 'h2' : dim >= 40 ? 'h3' : 'bodySm'}
          weight="Bold"
          color={fg}
        >
          {getInitials(name)}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
