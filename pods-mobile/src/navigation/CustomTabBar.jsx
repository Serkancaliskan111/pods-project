import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Animated, Easing, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Home, ClipboardList, Bell, User, Shield, Menu, Plus, Megaphone } from 'lucide-react-native'
import Theme from '../theme/theme'

const ThemeObj = Theme?.default ?? Theme
const { Colors } = ThemeObj

const ICON_SIZE = 19
const ACTIVE_COLOR = Colors.primary
const INACTIVE_COLOR = '#9CA3AF'

const ICONS = {
  Home,
  Tasks: ClipboardList,
  ManagerTasks: ClipboardList,
  News: Bell,
  Denetim: Shield,
  StaffList: User,
  PointsHistory: Bell,
  Profile: User,
}

export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets()
  const paddingBottom = Platform.OS === 'ios' ? 8 : 8
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
  const plusBottom = Platform.OS === 'ios' ? 36 : 40

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
            >
              <IconComponent
                size={ICON_SIZE}
                color={color}
                strokeWidth={2}
              />
              <Text style={[styles.label, { color }]} numberOfLines={1}>
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
        >
          <Menu size={ICON_SIZE} color={isOverflowFocused ? ACTIVE_COLOR : INACTIVE_COLOR} strokeWidth={2} />
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
            activeOpacity={0.8}
            onPress={() => {
              setPlusMenuVisible(false)
              navigation.navigate('ExtraTask')
            }}
          >
            <Plus size={14} color={Colors.surface} strokeWidth={2.5} />
            <Text style={styles.quickActionText}>{isManagerLike ? 'Görev Ata' : 'Ekstra Görev Girişi'}</Text>
          </TouchableOpacity>
          {isManagerLike ? (
            <TouchableOpacity
              style={[styles.quickActionItem, styles.quickActionSecondary]}
              activeOpacity={0.8}
              onPress={() => {
                setPlusMenuVisible(false)
                navigation.navigate('Home', { openQuickAnnouncement: true })
              }}
            >
              <Megaphone size={14} color={Colors.surface} strokeWidth={2.5} />
              <Text style={styles.quickActionText} numberOfLines={1}>Hızlı Duyuru Gönder</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>

        <Animated.View style={{ transform: [{ rotate: plusRotate }, { scale: plusScale }] }}>
          <TouchableOpacity
            style={styles.centerPlusBtn}
            activeOpacity={0.85}
            onPress={() => {
              setMenuVisible(false)
              setPlusMenuVisible((v) => !v)
            }}
          >
            <Plus size={21} color={Colors.surface} strokeWidth={2.5} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
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
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setMenuVisible(false)
                    navigation.navigate(route.name)
                  }}
                >
                  <IconComponent size={18} color={focused ? ACTIVE_COLOR : Colors.text} strokeWidth={2} />
                  <Text style={[styles.menuItemText, focused && styles.menuItemTextActive]}>{label}</Text>
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
    paddingHorizontal: 10,
    paddingTop: 4,
    overflow: 'visible',
  },
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Radii.lg,
    paddingTop: 7,
    paddingBottom: 7,
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 6,
    overflow: 'visible',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  fabGap: {
    width: 34,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  plusAnchor: {
    position: 'absolute',
    left: '50%',
    marginLeft: -19,
    width: 54,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  centerPlusBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 3,
    borderColor: Colors.surface,
    top: 0,
  },
  quickActionsWrap: {
    marginBottom: 8,
    width: 218,
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Radii.lg,
    padding: 8,
    ...ThemeObj.Shadows.card,
  },
  quickActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: ThemeObj.Radii.md,
    paddingVertical: 8,
    paddingHorizontal: 9,
    marginBottom: 6,
  },
  quickActionSecondary: {
    marginBottom: 0,
    backgroundColor: Colors.accent,
  },
  quickActionText: {
    color: Colors.surface,
    fontSize: ThemeObj.Typography.caption.fontSize,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 76,
    paddingRight: 12,
  },
  menuSheet: {
    width: 248,
    backgroundColor: 'transparent',
    borderRadius: ThemeObj.Radii.lg,
    paddingTop: 4,
    paddingBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginHorizontal: 6,
    marginVertical: 2,
    borderRadius: ThemeObj.Radii.md,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  menuItemText: {
    color: Colors.text,
    fontSize: ThemeObj.Typography.caption.fontSize,
    fontWeight: '500',
  },
  menuItemTextActive: {
    color: ACTIVE_COLOR,
    fontWeight: '700',
  },
})
