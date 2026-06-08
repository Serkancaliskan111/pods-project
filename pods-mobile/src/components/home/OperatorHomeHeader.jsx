import React from 'react'
import { View, StyleSheet, TouchableOpacity, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Eye } from 'lucide-react-native'
import {
  Text as KitText,
  Heading as KitHeading,
  palette as kitPalette,
  spacing as kitSpacing,
  tones,
} from '../../ui'
import OperatorHomeKpiStrip from './OperatorHomeKpiStrip'

function QuickLink({ label, tone, Icon: IconComp, onPress }) {
  const t = tones[tone] || tones.primary
  if (!IconComp) return null
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.link, { backgroundColor: t.iconBg }, pressed && styles.linkPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <IconComp size={14} color={t.icon} strokeWidth={2.2} />
      <KitText variant="caption" weight="SemiBold" color={kitPalette.slate[700]}>
        {label}
      </KitText>
    </Pressable>
  )
}

/**
 * Personel ana sayfa üst bölüm — karşılama, özet, ikincil kısayollar.
 * Alt sekmeler (Görevler, Sohbet, Duyurular) tekrarlanmaz.
 */
export default function OperatorHomeHeader({
  greeting,
  dateLabel,
  displayName,
  subtitle,
  hiddenCount = 0,
  onPressHidden,
  loading,
  stats,
  quickLinks = [],
  style,
}) {
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, style]}>
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <KitText variant="overline" weight="Bold" color={kitPalette.primary[600]} style={styles.eyebrow}>
            {greeting} · {dateLabel}
          </KitText>
          {hiddenCount > 0 ? (
            <TouchableOpacity
              onPress={onPressHidden}
              style={styles.hiddenBtn}
              activeOpacity={0.85}
              accessibilityLabel={`${hiddenCount} gizlenmiş görev`}
            >
              <Eye size={15} color={kitPalette.primary[700]} strokeWidth={2.2} />
              <KitText variant="caption" weight="Bold" color={kitPalette.primary[700]}>
                {hiddenCount}
              </KitText>
            </TouchableOpacity>
          ) : null}
        </View>

        <KitHeading variant="h2" color={kitPalette.slate[900]} numberOfLines={1}>
          {displayName}
        </KitHeading>

        {subtitle ? (
          <KitText variant="bodySm" color={kitPalette.slate[500]} numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </KitText>
        ) : null}

        <OperatorHomeKpiStrip
          loading={loading}
          overdue={stats?.overdue}
          today={stats?.today}
          tomorrow={stats?.tomorrow}
          urgent={stats?.urgent}
          style={styles.stats}
        />

        {quickLinks.length ? (
          <View style={styles.linksRow}>
            {quickLinks.map((link) => (
              <QuickLink key={link.key} {...link} />
            ))}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    // Arka plan üst bileşenden (theme.pageBg) gelir
  },
  inner: {
    paddingHorizontal: kitSpacing.lg,
    paddingTop: kitSpacing.sm,
    paddingBottom: kitSpacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: kitSpacing.sm,
    marginBottom: kitSpacing.xs,
  },
  eyebrow: {
    flex: 1,
    minWidth: 0,
  },
  hiddenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: kitSpacing.sm,
    paddingVertical: kitSpacing.xs,
    borderRadius: 999,
    backgroundColor: kitPalette.primary[50],
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
  },
  subtitle: {
    marginTop: 2,
    marginBottom: kitSpacing.md,
  },
  stats: {
    marginBottom: kitSpacing.sm,
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: kitSpacing.md,
    paddingVertical: kitSpacing.sm,
    borderRadius: 999,
  },
  linkPressed: {
    opacity: 0.7,
  },
})
