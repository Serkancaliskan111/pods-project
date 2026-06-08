import React from 'react'
import { View, StyleSheet, Pressable, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Text as KitText,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  tones,
  Icon,
} from '../../ui'

const ICON_SIZE = 40

function QuickAction({ item }) {
  const IconComp = item.Icon
  const tone = tones[item.tone] || tones.primary

  return (
    <Pressable
      onPress={item.onPress}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[styles.iconCircle, { backgroundColor: tone.iconBg }]}>
        <IconComp size={18} color={tone.icon} strokeWidth={2} />
      </View>
      <KitText
        variant="caption"
        weight="SemiBold"
        color={kitPalette.slate[600]}
        style={styles.actionLabel}
        numberOfLines={1}
      >
        {item.label}
      </KitText>
    </Pressable>
  )
}

function NotificationBell({ count, onPress }) {
  const hasUnread = count > 0
  const badgeLabel = count > 99 ? '99+' : count > 9 ? '9+' : String(count)

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.notifWrap, hasUnread && styles.notifWrapActive]}
      accessibilityLabel={hasUnread ? `${count} okunmamış bildirim` : 'Bildirimler'}
      accessibilityRole="button"
    >
      <View style={[styles.notifInner, hasUnread && styles.notifInnerActive]}>
        <Icon.News size={19} color={hasUnread ? kitPalette.primary[700] : kitPalette.slate[600]} strokeWidth={2.2} />
      </View>
      {hasUnread ? (
        <>
          <View style={styles.notifRing} pointerEvents="none" />
          <View style={styles.notifBadge}>
            <KitText variant="caption" weight="ExtraBold" color={kitPalette.surface} style={styles.notifBadgeText}>
              {badgeLabel}
            </KitText>
          </View>
        </>
      ) : (
        <View style={styles.notifDotIdle} pointerEvents="none" />
      )}
    </TouchableOpacity>
  )
}

export default function HomeTopBar({
  items = [],
  notifCount = 0,
  onPressNotifications,
  showNotifications = false,
  embedded = false,
}) {
  if (!items.length && !showNotifications) return null

  return (
    <SafeAreaView edges={embedded ? [] : ['top']} style={styles.safe}>
      <View style={styles.bar}>
        {items.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionsRow}
            style={styles.actionsScroll}
          >
            {items.map((item) => (
              <QuickAction key={item.key} item={item} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.actionsScroll} />
        )}

        {showNotifications ? (
          <NotificationBell count={notifCount} onPress={onPressNotifications} />
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const NOTIF_SIZE = 44

const styles = StyleSheet.create({
  safe: {
    backgroundColor: kitPalette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: kitPalette.slate[200],
    ...kitShadows.sm,
    zIndex: 20,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: kitSpacing.sm,
    paddingRight: kitSpacing.md,
    paddingVertical: kitSpacing.sm,
    gap: kitSpacing.sm,
  },
  actionsScroll: {
    flex: 1,
    minWidth: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: kitSpacing.xs,
    paddingRight: kitSpacing.xs,
  },
  action: {
    alignItems: 'center',
    width: 64,
    gap: 4,
    paddingVertical: 2,
  },
  actionPressed: {
    opacity: 0.65,
  },
  iconCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  notifWrap: {
    width: NOTIF_SIZE + 4,
    height: NOTIF_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifWrapActive: {},
  notifInner: {
    width: NOTIF_SIZE,
    height: NOTIF_SIZE,
    borderRadius: NOTIF_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kitPalette.slate[50],
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
  },
  notifInnerActive: {
    backgroundColor: kitPalette.primary[50],
    borderColor: kitPalette.primary[200],
    ...kitShadows.sm,
  },
  notifRing: {
    position: 'absolute',
    width: NOTIF_SIZE + 6,
    height: NOTIF_SIZE + 6,
    borderRadius: (NOTIF_SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: `${kitPalette.primary[400]}55`,
  },
  notifBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: kitPalette.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: kitPalette.surface,
    ...kitShadows.sm,
  },
  notifBadgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
  notifDotIdle: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: kitPalette.slate[300],
    borderWidth: 1.5,
    borderColor: kitPalette.surface,
  },
})
