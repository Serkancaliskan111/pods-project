import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { palette, radii, spacing } from './tokens'

/**
 * Basit shimmer'lı skeleton kartı. `lines` parametresi kaç satır iskele
 * göstereceğini belirler.
 */
export default function SkeletonCard({ lines = 3, style }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.slate[100], palette.slate[200]],
  })
  return (
    <View style={[styles.card, style]}>
      <Animated.View style={[styles.line, { width: '60%', height: 18, backgroundColor: bg }]} />
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Animated.View
          key={i}
          style={[styles.line, { width: i === lines - 2 ? '40%' : '90%', backgroundColor: bg }]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: palette.slate[100],
    padding: spacing.lg,
    gap: spacing.sm,
  },
  line: {
    height: 12,
    borderRadius: radii.sm,
  },
})
