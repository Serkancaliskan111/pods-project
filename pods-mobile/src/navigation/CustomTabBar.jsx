import React from 'react'
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, Animated, Easing } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Home,
  ClipboardList,
  Bell,
  User,
  Users,
  Shield,
  Menu,
  Plus,
  Megaphone,
  MessageCircle,
} from 'lucide-react-native'
import { Text, palette, spacing, radii, shadows } from '../ui'

const ICON_SIZE = 20
const ACTIVE_COLOR = palette.primary[700]
const INACTIVE_COLOR = palette.slate[400]
const ACTIVE_BG = palette.primary[50]

const ICONS = {
  Home,
  Tasks: ClipboardList,
  ManagerTasks: ClipboardList,
  News: Bell,
  Denetim: Shield,
  StaffList: User,
  PointsHistory: Bell,
  Chat: MessageCircle,
  Profile: User,
}

/**
 * Gesture / yazılım navigasyon çubuğu üzerinde kalması için minimum boşluk (dp).
 * iPhone X+ ve gesture-nav Android cihazlarda `insets.bottom` zaten home
 * indicator için yeterli clearance (≈34dp / cihaza göre) verir; bu sabit
 * yalnızca insets.bottom = 0 olan klasik cihazlar (iPhone SE, eski Android)
 * için yedek bir tampon görevi görür.
 */
const MIN_BOTTOM_CLEARANCE = 8

export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, MIN_BOTTOM_CLEARANCE)
  const paddingBottom = bottomInset
  const [menuVisible, setMenuVisible] = React.useState(false)
  const [plusMenuVisible, setPlusMenuVisible] = React.useState(false)
  const plusAnim = React.useRef(new Animated.Value(0)).current
  const menuItemAnimsRef = React.useRef([])

  const hasOverflow = state.routes.length > 4
  const visibleRoutes = hasOverflow ? state.routes.slice(0, 3) : state.routes
  const overflowRoutes = hasOverflow ? state.routes.slice(3) : []
  const isOverflowFocused = hasOverflow && state.index >= 3
  const hasRoute = (name) => state.routes.some((r) => r.name === name)
  const isManagerLike = hasRoute('Denetim')
  // FAB konumu tab bar'ın görsel üst kenarından 12dp yukarıya kalibre edildi.
  const plusBottom = paddingBottom + 12

  React.useEffect(() => {
    if (!menuVisible) return
    const anims = overflowRoutes.map((_, idx) => {
      if (!menuItemAnimsRef.current[idx]) {
        menuItemAnimsRef.current[idx] = new Animated.Value(0)
      }
      menuItemAnimsRef.current[idx].setValue(0)
      return Animated.timing(menuItemAnimsRef.current[idx], {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    })
    Animated.stagger(130, anims).start()
  }, [menuVisible, overflowRoutes])

  React.useEffect(() => {
    Animated.spring(plusAnim, {
      toValue: plusMenuVisible ? 1 : 0,
      tension: 50,
      friction: 11,
      useNativeDriver: true,
    }).start()
  }, [plusMenuVisible, plusAnim])

  const plusRotate = plusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  })
  const plusScale = plusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  })
  const quickMenuOpacity = plusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const quickMenuTranslateY = plusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  })

  return (
    <View style={[styles.wrapper, { paddingBottom }]}>
      <View style={styles.container}>
        {visibleRoutes.map((route, visibleIdx) => {
          const index = state.routes.findIndex((r) => r.key === route.key)
          const { options } = descriptors[route.key]
          const label = options.title ?? route.name
          const isFocused = state.index === index
          const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR
          const IconComponent = ICONS[route.name] || Home

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          return (
            <React.Fragment key={route.key}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                testID={options.tabBarTestID}
                onPress={onPress}
                style={styles.tab}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 10, left: 4, right: 4 }}
              >
                <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                  <IconComponent size={ICON_SIZE} color={color} strokeWidth={isFocused ? 2.4 : 2} />
                </View>
                <Text
                  variant="overline"
                  color={color}
                  weight={isFocused ? 'Bold' : 'SemiBold'}
                  style={styles.label}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
              {visibleIdx === 1 ? <View style={styles.fabGap} /> : null}
            </React.Fragment>
          )
        })}

        {hasOverflow ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Diğer menüler"
            onPress={() => {
              setPlusMenuVisible(false)
              setMenuVisible(true)
            }}
            style={styles.tab}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 10, left: 4, right: 4 }}
          >
            <View
              style={[styles.iconWrap, isOverflowFocused && styles.iconWrapActive]}
            >
              <Menu
                size={ICON_SIZE}
                color={isOverflowFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                strokeWidth={2}
              />
            </View>
            <Text
              variant="overline"
              color={isOverflowFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
              weight={isOverflowFocused ? 'Bold' : 'SemiBold'}
              style={styles.label}
            >
              Daha
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.plusAnchor, { bottom: plusBottom }]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.quickActionsWrap,
            {
              opacity: quickMenuOpacity,
              transform: [{ translateY: quickMenuTranslateY }],
            },
          ]}
          pointerEvents={plusMenuVisible ? 'auto' : 'none'}
        >
          <TouchableOpacity
            style={styles.quickActionItem}
            activeOpacity={0.85}
            onPress={() => {
              setPlusMenuVisible(false)
              navigation.navigate('ExtraTask')
            }}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: palette.primary[600] }]}>
              <Plus size={14} color={palette.surface} strokeWidth={2.5} />
            </View>
            <Text variant="bodySm" weight="Bold" color={palette.slate[800]} style={{ flex: 1 }}>
              {isManagerLike ? 'Görev Ata' : 'Ekstra Görev Girişi'}
            </Text>
          </TouchableOpacity>
          {isManagerLike ? (
            <TouchableOpacity
              style={styles.quickActionItem}
              activeOpacity={0.85}
              onPress={() => {
                setPlusMenuVisible(false)
                navigation.navigate('Home', { openQuickAnnouncement: true })
              }}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: palette.accent[500] }]}>
                <Megaphone size={14} color={palette.surface} strokeWidth={2.5} />
              </View>
              <Text
                variant="bodySm"
                weight="Bold"
                color={palette.slate[800]}
                style={{ flex: 1 }}
                numberOfLines={1}
              >
                Hızlı Duyuru Gönder
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.quickActionItem}
            activeOpacity={0.85}
            onPress={() => {
              setPlusMenuVisible(false)
              navigation.navigate('ChatNewGroup')
            }}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: palette.blurple[500] }]}>
              <Users size={14} color={palette.surface} strokeWidth={2.5} />
            </View>
            <Text
              variant="bodySm"
              weight="Bold"
              color={palette.slate[800]}
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              Yeni Grup Sohbeti
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ rotate: plusRotate }, { scale: plusScale }] }}>
          <TouchableOpacity
            style={styles.centerPlusBtn}
            activeOpacity={0.85}
            hitSlop={{ top: 10, bottom: 12, left: 10, right: 10 }}
            onPress={() => {
              setMenuVisible(false)
              setPlusMenuVisible((v) => !v)
            }}
          >
            <Plus size={24} color={palette.surface} strokeWidth={2.5} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={[styles.menuBackdrop, { paddingBottom: 76 + bottomInset }]}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuSheet}>
            {overflowRoutes.map((route, idx) => {
              const index = state.routes.findIndex((r) => r.key === route.key)
              const { options } = descriptors[route.key]
              const label = options.title ?? route.name
              const focused = state.index === index
              const IconComponent = ICONS[route.name] || Home
              const anim = menuItemAnimsRef.current[idx] || new Animated.Value(1)
              const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] })

              return (
                <Animated.View key={route.key} style={{ opacity: anim, transform: [{ translateX }] }}>
                  <TouchableOpacity
                    key={route.key}
                    style={[styles.menuItem, focused && styles.menuItemActive]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setMenuVisible(false)
                      navigation.navigate(route.name)
                    }}
                  >
                    <IconComponent
                      size={18}
                      color={focused ? palette.surface : palette.slate[700]}
                      strokeWidth={2}
                    />
                    <Text
                      variant="bodySm"
                      weight={focused ? 'Bold' : 'SemiBold'}
                      color={focused ? palette.surface : palette.slate[800]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'transparent',
    paddingTop: spacing.xs,
    overflow: 'visible',
  },
  container: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radii['3xl'],
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    minHeight: 64,
    borderWidth: 1,
    borderColor: palette.slate[100],
    overflow: 'visible',
    ...shadows.lg,
  },
  fabGap: {
    width: 56,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  iconWrap: {
    width: 38,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: ACTIVE_BG,
  },
  label: {
    fontSize: 10,
    marginTop: 0,
  },
  plusAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  centerPlusBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.accent[500],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: palette.surface,
    top: 0,
    ...shadows.accent,
  },
  quickActionsWrap: {
    marginBottom: spacing.md,
    width: 256,
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: palette.slate[100],
    ...shadows.lg,
    gap: spacing.xs,
  },
  quickActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.slate[50],
    borderWidth: 1,
    borderColor: palette.slate[100],
    borderRadius: radii.xl,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  quickIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: palette.overlayLight,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  },
  menuSheet: {
    width: 256,
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.slate[100],
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.xs + 2,
    marginVertical: 2,
    borderRadius: radii.lg,
    backgroundColor: palette.slate[50],
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  menuItemActive: {
    backgroundColor: palette.primary[700],
    borderColor: palette.primary[700],
  },
})
