import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native'
import {
  Text as KitText,
  Heading as KitHeading,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  tones,
} from '../../ui'

/**
 * Revolut / Monzo / iOS Shortcuts tarzı hızlı erişim:
 * tek beyaz kart, eşit sütunlu dairesel aksiyonlar, sade başlık.
 */
const CIRCLE = 56
const SLOT = 80
const GAP = kitSpacing.sm

function ActionButton({ item, width, showDivider }) {
  const IconComp = item.Icon
  const tone = tones[item.tone] || tones.primary

  return (
    <View style={[styles.slotWrap, { width }]}>
      <Pressable
        onPress={item.onPress}
        style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        <View style={[styles.circle, { backgroundColor: tone.iconBg }]}>
          <IconComp size={24} color={tone.icon} strokeWidth={1.85} />
        </View>
        <KitText
          variant="caption"
          weight="Medium"
          color={kitPalette.slate[600]}
          style={styles.label}
          numberOfLines={2}
        >
          {item.label}
        </KitText>
      </Pressable>
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  )
}

export default function HomeQuickAccess({ items = [], style }) {
  const [cardWidth, setCardWidth] = useState(0)

  const innerPad = kitSpacing.xs
  const contentWidth = items.length * SLOT + Math.max(0, items.length - 1) * GAP
  const scrollable = cardWidth > 0 && contentWidth > cardWidth - innerPad * 2

  const slotWidth = useMemo(() => {
    if (!cardWidth || scrollable || !items.length) return SLOT
    const gaps = Math.max(0, items.length - 1) * GAP
    const available = cardWidth - innerPad * 2 - gaps
    return Math.max(SLOT, Math.floor(available / items.length))
  }, [cardWidth, scrollable, items.length, innerPad])

  const onCardLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width
    if (w > 0 && w !== cardWidth) setCardWidth(w)
  }, [cardWidth])

  if (!items.length) return null

  const showDividers = !scrollable && items.length >= 2 && items.length <= 4

  const buttons = items.map((item, index) => (
    <ActionButton
      key={item.key}
      item={item}
      width={scrollable ? SLOT : slotWidth}
      showDivider={showDividers && index < items.length - 1}
    />
  ))

  return (
    <View style={[styles.wrap, style]}>
      <KitHeading variant="h3" color={kitPalette.slate[900]}>
        Hızlı Erişim
      </KitHeading>

      <View style={styles.card} onLayout={onCardLayout}>
        {scrollable ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            contentContainerStyle={[
              styles.row,
              { paddingHorizontal: innerPad, gap: GAP },
            ]}
          >
            {buttons}
          </ScrollView>
        ) : (
          <View style={[styles.row, styles.rowEven, { paddingHorizontal: innerPad, gap: GAP }]}>
            {buttons}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: kitSpacing.md,
  },
  card: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    paddingVertical: kitSpacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: kitPalette.slate[200],
    ...kitShadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowEven: {
    justifyContent: 'space-between',
  },
  slotWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  slot: {
    alignItems: 'center',
    width: '100%',
    gap: kitSpacing.sm,
    paddingVertical: kitSpacing.xs,
  },
  slotPressed: {
    opacity: 0.65,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: 0.1,
    minHeight: 30,
    maxWidth: 76,
  },
  divider: {
    position: 'absolute',
    right: -GAP / 2,
    top: kitSpacing.sm,
    bottom: kitSpacing.lg,
    width: StyleSheet.hairlineWidth,
    backgroundColor: kitPalette.slate[200],
  },
})
