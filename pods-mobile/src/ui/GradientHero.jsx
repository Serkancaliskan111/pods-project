import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Heading from './Heading'
import Text from './Text'
import { gradients, palette, radii, shadows, spacing } from './tokens'

/**
 * Ekranların üst kısmında kullanılan "premium" gradient hero kart.
 *
 * <GradientHero
 *   eyebrow="GÜNAYDIN"
 *   title="Serkan"
 *   subtitle="Bugün 12 görev seni bekliyor"
 *   right={<IconButton ... />}
 * />
 */
export default function GradientHero({
  variant = 'hero',
  eyebrow,
  title,
  subtitle,
  right,
  bottom,
  padding = spacing['2xl'],
  radius = radii['3xl'],
  titleVariant = 'displayMd',
  eyebrowColor = 'rgba(255,255,255,0.72)',
  subtitleColor = 'rgba(255,255,255,0.78)',
  style,
}) {
  const colors = gradients[variant] || gradients.hero
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.wrap,
        { padding, borderRadius: radius },
        shadows.primary,
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.blob, styles.blobA]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobB]} />
      <View style={styles.header}>
        <View style={styles.titleArea}>
          {eyebrow ? (
            <Text
              variant="overline"
              color={eyebrowColor}
              style={{ marginBottom: 6 }}
            >
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Heading variant={titleVariant} color={palette.surface} style={{ marginBottom: 4 }}>
              {title}
            </Heading>
          ) : null}
          {subtitle ? (
            <Text variant="body" color={subtitleColor}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleArea: {
    flex: 1,
    paddingRight: spacing.md,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bottom: {
    marginTop: spacing.lg,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  blobA: {
    width: 240,
    height: 240,
    top: -80,
    right: -80,
  },
  blobB: {
    width: 180,
    height: 180,
    bottom: -90,
    left: -50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
})
