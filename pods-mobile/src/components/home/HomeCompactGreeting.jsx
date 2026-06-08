import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  Text as KitText,
  Heading as KitHeading,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  hexToRgba,
} from '../../ui'

function GreetingPattern({ accentColor }) {
  const brand = accentColor || kitPalette.primary[700]
  return (
    <View style={styles.pattern} pointerEvents="none">
      <View style={[styles.orbPrimary, { backgroundColor: hexToRgba(brand, 0.08) }]} />
      <View style={styles.orbAccent} />
      <LinearGradient
        colors={[hexToRgba(brand, 0.06), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.wash}
      />
      <View style={[styles.stripe, { backgroundColor: brand }]} />
    </View>
  )
}

/**
 * Yönetici ana sayfa karşılama kartı — açık yüzey, marka vurguları.
 */
export default function HomeCompactGreeting({
  eyebrow,
  title,
  subtitle,
  weatherLabel,
  WeatherIcon,
  actions,
  accentColor,
  style,
}) {
  const barColor = accentColor || kitPalette.primary[700]

  return (
    <View style={[styles.wrap, style]}>
      <GreetingPattern accentColor={accentColor} />

      <View style={[styles.accentBar, { backgroundColor: barColor }]} />

      <View style={styles.row}>
        <View style={styles.copy}>
          {eyebrow ? (
            <KitText variant="overline" weight="Bold" color={kitPalette.primary[600]} numberOfLines={1}>
              {eyebrow}
            </KitText>
          ) : null}
          <KitHeading variant="h2" color={kitPalette.slate[900]} numberOfLines={1}>
            {title}
          </KitHeading>
          {subtitle ? (
            <KitText variant="bodySm" color={kitPalette.slate[500]} numberOfLines={1}>
              {subtitle}
            </KitText>
          ) : null}
        </View>

        {WeatherIcon && weatherLabel ? (
          <View style={styles.weather}>
            <WeatherIcon size={15} color={kitPalette.primary[700]} strokeWidth={2} />
            <KitText variant="caption" weight="Bold" color={kitPalette.primary[800]}>
              {weatherLabel}
            </KitText>
          </View>
        ) : null}
      </View>

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: kitRadii['2xl'],
    backgroundColor: kitPalette.surface,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    paddingHorizontal: kitSpacing.lg,
    paddingVertical: kitSpacing.md + 2,
    ...kitShadows.sm,
  },
  pattern: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
  },
  orbPrimary: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -40,
    right: -24,
    backgroundColor: kitPalette.primary[50],
  },
  orbAccent: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    bottom: -28,
    left: '42%',
    backgroundColor: kitPalette.accent[50],
    opacity: 0.85,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: kitPalette.primary[700],
    opacity: 0.12,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: kitRadii['2xl'],
    borderBottomLeftRadius: kitRadii['2xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
    paddingLeft: kitSpacing.xs,
    zIndex: 1,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: kitSpacing.sm + 2,
    paddingVertical: 7,
    borderRadius: kitRadii.pill,
    backgroundColor: kitPalette.primary[50],
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginTop: kitSpacing.sm,
    paddingLeft: kitSpacing.xs,
    zIndex: 1,
  },
})
