import React from 'react'
import { View, StyleSheet } from 'react-native'
import { tones, radii } from './tokens'

const SIZES = { sm: 32, md: 40, lg: 48, xl: 56 }

/**
 * İkon + renkli yumuşak arkaplan kapsülü. Section header'larda ve
 * notification list satırlarında "konuyu işaretleyen" ikon olarak kullanılır.
 *
 * <IconBubble tone="accent" size="md"><AlertTriangle ... /></IconBubble>
 */
export default function IconBubble({ tone = 'soft', size = 'md', square = false, style, children }) {
  const toneStyle = tones[tone] || tones.soft
  const dim = SIZES[size] || SIZES.md
  return (
    <View
      style={[
        styles.base,
        {
          width: dim,
          height: dim,
          backgroundColor: toneStyle.iconBg,
          borderRadius: square ? radii.lg : dim / 2,
        },
        style,
      ]}
    >
      {typeof children === 'function' ? children({ color: toneStyle.icon, size: Math.round(dim * 0.5) }) : children}
    </View>
  )
}

IconBubble.colorFor = (tone) => (tones[tone] || tones.soft).icon

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
