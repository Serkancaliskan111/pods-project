import React from 'react'
import { View, StyleSheet } from 'react-native'
import Text from './Text'
import IconBubble from './IconBubble'
import Card from './Card'
import { palette, spacing, tones } from './tokens'

const DARK_TONES = new Set(['executive', 'executiveAccent'])

/**
 * KPI / metrik kartı. İkon kapsülü + etiket + büyük rakam + opsiyonel delta.
 *
 * `tone="executive"` (veya `executiveAccent`) ile koyu yüzeyli "Dark
 * Executive" varyanta geçer; metin/etiket renkleri otomatik beyaz/transparan
 * beyaza döner. Ayrıca `valueVariant` ile rakam tipografisi (`metric`,
 * `displayLg`, `displayMd`, ...) çağıran tarafından override edilebilir.
 */
export default function MetricCard({
  tone = 'soft',
  icon,
  label,
  value,
  valueSuffix,
  delta,
  deltaTone,
  trend,
  footer,
  size = 'md',
  valueVariant,
  valueColor,
  labelColor,
  onPress,
  style,
}) {
  const isSm = size === 'sm'
  const labelVariantBase = isSm ? 'overline' : 'caption'
  const valueVariantBase = isSm ? 'metricSm' : 'metric'
  const isDark = DARK_TONES.has(tone)
  const toneObj = tones[tone] || tones.soft
  const resolvedValueColor =
    valueColor || (isDark ? toneObj.text : palette.slate[900])
  const resolvedLabelColor =
    labelColor || (isDark ? toneObj.softText : palette.slate[500])
  const resolvedSuffixColor = isDark
    ? 'rgba(255,255,255,0.65)'
    : palette.slate[500]
  return (
    <Card
      tone={tone}
      padding={isSm ? 'sm' : 'md'}
      radius="2xl"
      interactive={Boolean(onPress)}
      onPress={onPress}
      style={[styles.base, style]}
    >
      <View style={styles.headerRow}>
        {icon ? (
          <IconBubble tone={tone} size={isSm ? 'sm' : 'md'}>
            {icon}
          </IconBubble>
        ) : null}
        {trend ? <View style={styles.trendSlot}>{trend}</View> : null}
      </View>
      {label ? (
        <Text
          variant={labelVariantBase}
          color={resolvedLabelColor}
          style={{ marginTop: spacing.md }}
          numberOfLines={1}
          weight={isDark ? 'SemiBold' : undefined}
        >
          {label}
        </Text>
      ) : null}
      <View style={styles.valueRow}>
        <Text variant={valueVariant || valueVariantBase} color={resolvedValueColor}>
          {value}
        </Text>
        {valueSuffix ? (
          <Text variant="h3" color={resolvedSuffixColor} style={styles.valueSuffix}>
            {valueSuffix}
          </Text>
        ) : null}
      </View>
      {delta ? (
        <Text
          variant="caption"
          weight="Bold"
          color={
            deltaTone === 'success'
              ? palette.success[700]
              : deltaTone === 'danger'
              ? palette.danger[700]
              : isDark
              ? 'rgba(255,255,255,0.78)'
              : palette.slate[500]
          }
          style={{ marginTop: spacing.xs }}
        >
          {delta}
        </Text>
      ) : null}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 132,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendSlot: {
    marginLeft: 'auto',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  valueSuffix: {
    marginLeft: 4,
    marginBottom: 4,
  },
  footer: {
    marginTop: spacing.sm,
  },
})
