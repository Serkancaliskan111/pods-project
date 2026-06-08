import React, { useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, Animated, Easing, ScrollView } from 'react-native'
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
  FolderKanban,
  ListTodo,
  Star,
  Clock,
  CircleCheckBig,
  X,
} from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { useUiTheme } from '../contexts/UiThemeContext'
import {
  buildMobileHamburgerMenu,
  MOBILE_PRIMARY_TAB_NAMES,
  MOBILE_PRIMARY_TAB_LEFT_COUNT,
  navigateMobileRoute,
  resolveMobileRouteName,
  tasksListModeForScreen,
} from '../lib/mobileAdminNav'
import { Text, palette, spacing, radii, shadows } from '../ui'

const ICON_SIZE = 22
const MIN_BOTTOM_CLEARANCE = 8
const TASKS_MENU_ITEMS = [
  {
    key: 'pending',
    label: 'Bekleyen',
    route: 'TasksPending',
    icon: Clock,
    iconBg: '#FFF7ED',
    iconColor: '#EA580C',
  },
  {
    key: 'completed',
    label: 'Tamamlanan',
    route: 'TasksCompleted',
    icon: CircleCheckBig,
    iconBg: '#ECFDF5',
    iconColor: '#059669',
  },
]

const FAB_SIZE = 58
const FAB_ICON_SIZE = 24

const TASKS_TAB_NAMES = new Set(['Tasks', 'ManagerTasks'])

const HAMBURGER_ITEM_META = {
  News: { iconBg: '#FFF7ED', iconColor: '#EA580C' },
  Denetim: { iconBg: '#FFF7ED', iconColor: '#EA580C' },
  ManagerTasks: { iconBg: '#EFF6FF', iconColor: '#2563EB' },
  Tasks: { iconBg: '#EFF6FF', iconColor: '#2563EB' },
  StaffList: { iconBg: '#ECFDF5', iconColor: '#059669' },
  PointsHistory: { iconBg: '#FFF7ED', iconColor: '#EA580C' },
  Profile: { iconBg: '#F5F3FF', iconColor: '#7C3AED' },
  PersonalTodoList: { iconBg: '#F5F3FF', iconColor: '#6D28D9' },
  ProjectsList: { iconBg: '#EFF6FF', iconColor: '#1D4ED8' },
}

const ICONS = {
  Home,
  Tasks: ClipboardList,
  ManagerTasks: ClipboardList,
  News: Bell,
  Denetim: Shield,
  StaffList: User,
  PointsHistory: Star,
  Chat: MessageCircle,
  Profile: User,
  PersonalTodoList: ListTodo,
  ProjectsList: FolderKanban,
}

export default function CustomTabBar({ state, descriptors, navigation }) {
  const { permissions, personel, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const { theme } = useUiTheme()
  const hamburgerMenu = useMemo(
    () => buildMobileHamburgerMenu({ permissions, isSystemAdmin, personel }),
    [permissions, isSystemAdmin, personel],
  )
  const ACTIVE_COLOR = theme.tabActive
  const INACTIVE_COLOR = theme.tabInactive
  const ACTIVE_BG = theme.tabActiveBg
  const ACTIVE_BORDER = theme.tabActiveBorder
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, MIN_BOTTOM_CLEARANCE)
  const paddingBottom = bottomInset
  const [menuVisible, setMenuVisible] = React.useState(false)
  const [plusMenuVisible, setPlusMenuVisible] = React.useState(false)
  const [tasksMenuVisible, setTasksMenuVisible] = React.useState(false)
  const plusAnim = React.useRef(new Animated.Value(0)).current
  const tasksMenuAnim = React.useRef(new Animated.Value(0)).current
  const menuAnim = React.useRef(new Animated.Value(0)).current
  const menuItemAnimsRef = React.useRef([])

  const closeMenu = React.useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMenuVisible(false)
    })
  }, [menuAnim])

  const openMenu = React.useCallback(() => {
    setPlusMenuVisible(false)
    setTasksMenuVisible(false)
    setMenuVisible(true)
  }, [])

  const visibleRoutes = useMemo(
    () =>
      MOBILE_PRIMARY_TAB_NAMES.map((name) => state.routes.find((r) => r.name === name)).filter(Boolean),
    [state.routes],
  )

  const leftTabRoutes = useMemo(
    () => visibleRoutes.slice(0, MOBILE_PRIMARY_TAB_LEFT_COUNT),
    [visibleRoutes],
  )

  const rightTabRoutes = useMemo(
    () => visibleRoutes.slice(MOBILE_PRIMARY_TAB_LEFT_COUNT),
    [visibleRoutes],
  )

  const hamburgerRouteNames = useMemo(
    () => new Set(hamburgerMenu.map((item) => item.routeName)),
    [hamburgerMenu],
  )

  const showHamburger = hamburgerMenu.length > 0
  const currentRoute = state.routes[state.index]
  const isHamburgerFocused =
    showHamburger && currentRoute && hamburgerRouteNames.has(currentRoute.name)
  const hasRoute = (name) => state.routes.some((r) => r.name === name)
  const isManagerLike = hasRoute('Denetim')
  const plusBottom = paddingBottom + 12

  React.useEffect(() => {
    if (!menuVisible) {
      menuAnim.setValue(0)
      return undefined
    }
    menuAnim.setValue(0)
    const total = hamburgerMenu.length
    const itemAnims = Array.from({ length: total }, (_, idx) => {
      if (!menuItemAnimsRef.current[idx]) {
        menuItemAnimsRef.current[idx] = new Animated.Value(0)
      }
      menuItemAnimsRef.current[idx].setValue(0)
      return Animated.timing(menuItemAnimsRef.current[idx], {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    })
    Animated.parallel([
      Animated.spring(menuAnim, {
        toValue: 1,
        tension: 72,
        friction: 12,
        useNativeDriver: true,
      }),
      itemAnims.length ? Animated.stagger(48, itemAnims) : Animated.delay(0),
    ]).start()
    return undefined
  }, [menuVisible, hamburgerMenu.length, menuAnim])

  React.useEffect(() => {
    Animated.spring(plusAnim, {
      toValue: plusMenuVisible ? 1 : 0,
      tension: 50,
      friction: 11,
      useNativeDriver: true,
    }).start()
  }, [plusMenuVisible, plusAnim])

  React.useEffect(() => {
    Animated.spring(tasksMenuAnim, {
      toValue: tasksMenuVisible ? 1 : 0,
      tension: 50,
      friction: 11,
      useNativeDriver: true,
    }).start()
  }, [tasksMenuVisible, tasksMenuAnim])

  const navigateTasksList = React.useCallback(
    (routeName) => {
      setTasksMenuVisible(false)
      navigateMobileRoute(navigation, routeName, {
        listMode: tasksListModeForScreen(routeName),
      })
    },
    [navigation],
  )

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
  const tasksMenuOpacity = tasksMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const tasksMenuTranslateY = tasksMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  })
  const menuBackdropOpacity = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const menuSheetTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  })
  const menuSheetScale = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  })

  const renderTab = (route) => {
    const index = state.routes.findIndex((r) => r.key === route.key)
    const { options } = descriptors[route.key]
    const label = options.title ?? route.name
    const isFocused =
      state.index === index || (TASKS_TAB_NAMES.has(route.name) && tasksMenuVisible)
    const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR
    const IconComponent = ICONS[route.name] || Home

    const onPress = () => {
      if (TASKS_TAB_NAMES.has(route.name)) {
        navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        })
        setPlusMenuVisible(false)
        setMenuVisible(false)
        setTasksMenuVisible((v) => !v)
        return
      }
      setTasksMenuVisible(false)
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
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        testID={options.tabBarTestID}
        onPress={onPress}
        style={styles.tab}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 10, left: 4, right: 4 }}
      >
        <View style={[styles.iconWrap, isFocused ? { backgroundColor: ACTIVE_BG } : null]}>
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
    )
  }

  return (
    <View style={[styles.wrapper, { paddingBottom }]}>
      <View style={styles.container}>
        <View style={styles.sideGroup}>
          {leftTabRoutes.map((route) => renderTab(route))}
        </View>

        <View style={styles.fabGap} />

        <View style={styles.sideGroup}>
          {rightTabRoutes.map((route) => renderTab(route))}

          {showHamburger ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Menü"
              onPress={openMenu}
              style={styles.tab}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 10, left: 4, right: 4 }}
            >
              <View
                style={[
                  styles.iconWrap,
                  isHamburgerFocused ? { backgroundColor: ACTIVE_BG } : null,
                ]}
              >
                <Menu
                  size={ICON_SIZE}
                  color={isHamburgerFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  strokeWidth={2}
                />
              </View>
              <Text
                variant="overline"
                color={isHamburgerFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
                weight={isHamburgerFocused ? 'Bold' : 'SemiBold'}
                style={styles.label}
              >
                Menü
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Animated.View
        style={[
          styles.tasksMenuAnchor,
          { bottom: plusBottom + FAB_SIZE + spacing.md },
          {
            opacity: tasksMenuOpacity,
            transform: [{ translateY: tasksMenuTranslateY }],
          },
        ]}
        pointerEvents={tasksMenuVisible ? 'auto' : 'none'}
      >
        <View style={styles.tasksMenuWrap}>
          {TASKS_MENU_ITEMS.map((item) => {
            const ItemIcon = item.icon
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.tasksMenuItem}
                activeOpacity={0.85}
                onPress={() => navigateTasksList(item.route)}
              >
                <View style={[styles.tasksMenuIconWrap, { backgroundColor: item.iconBg }]}>
                  <ItemIcon size={18} color={item.iconColor} strokeWidth={2.2} />
                </View>
                <View style={styles.tasksMenuTextCol}>
                  <Text variant="bodySm" weight="Bold" color={palette.slate[800]}>
                    {item.label}
                  </Text>
                  <Text variant="caption" color={palette.slate[500]}>
                    {item.key === 'pending' ? 'Devam eden işler' : 'Onaylanmış görevler'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </Animated.View>

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
            <View style={[styles.quickIconWrap, { backgroundColor: theme.brandBlue }]}>
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
              <View style={[styles.quickIconWrap, { backgroundColor: theme.accent }]}>
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
            style={[styles.centerPlusBtn, { backgroundColor: theme.accent }]}
            activeOpacity={0.85}
            hitSlop={{ top: 10, bottom: 12, left: 10, right: 10 }}
            onPress={() => {
              closeMenu()
              setTasksMenuVisible(false)
              setPlusMenuVisible((v) => !v)
            }}
          >
            <Plus size={FAB_ICON_SIZE} color={palette.surface} strokeWidth={2.5} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {tasksMenuVisible ? (
        <Pressable
          style={styles.tasksMenuBackdrop}
          onPress={() => setTasksMenuVisible(false)}
        />
      ) : null}

      <Modal
        visible={menuVisible}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <View style={[styles.menuRoot, { paddingBottom: 76 + bottomInset }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.menuBackdropFill,
                { opacity: menuBackdropOpacity },
              ]}
            />
          </Pressable>

          <Animated.View
            style={[
              styles.menuSheetWrap,
              {
                opacity: menuAnim,
                transform: [{ translateY: menuSheetTranslateY }, { scale: menuSheetScale }],
              },
            ]}
          >
            <View style={styles.menuSheet}>
              <View style={styles.menuSheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLg" weight="Bold" color={palette.slate[900]}>
                    Menü
                  </Text>
                  <Text variant="caption" color={palette.slate[500]}>
                    Hızlı erişim
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeMenu}
                  style={styles.menuCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Menüyü kapat"
                >
                  <X size={18} color={palette.slate[600]} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.menuScroll}
                contentContainerStyle={styles.menuSheetContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {hamburgerMenu.map((item, idx) => {
                  const routeName = resolveMobileRouteName(item.routeName || item.key)
                  const focused = currentRoute?.name === routeName
                  const IconComponent = ICONS[item.key] || ICONS[routeName] || Home
                  const meta = HAMBURGER_ITEM_META[item.key] || HAMBURGER_ITEM_META[routeName] || {
                    iconBg: palette.slate[50],
                    iconColor: palette.slate[700],
                  }
                  const anim = menuItemAnimsRef.current[idx] || new Animated.Value(1)
                  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] })

                  return (
                    <Animated.View
                      key={item.key}
                      style={{ opacity: anim, transform: [{ translateY }] }}
                    >
                      <TouchableOpacity
                        style={[
                          styles.menuItem,
                          focused && {
                            backgroundColor: ACTIVE_BG,
                            borderColor: ACTIVE_BORDER,
                          },
                        ]}
                        activeOpacity={0.85}
                        onPress={() => {
                          menuAnim.setValue(0)
                          setMenuVisible(false)
                          navigation.navigate(routeName)
                        }}
                      >
                        <View style={[styles.menuItemIconWrap, { backgroundColor: meta.iconBg }]}>
                          <IconComponent size={18} color={meta.iconColor} strokeWidth={2.2} />
                        </View>
                        <View style={styles.menuItemTextCol}>
                          <Text
                            variant="bodySm"
                            weight={focused ? 'Bold' : 'SemiBold'}
                            color={focused ? ACTIVE_COLOR : palette.slate[800]}
                          >
                            {item.label}
                          </Text>
                          {focused ? (
                            <Text variant="caption" color={ACTIVE_COLOR}>
                              Şu an buradasınız
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  )
                })}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
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
    alignItems: 'center',
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
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  fabGap: {
    width: FAB_SIZE + spacing.sm,
    flexShrink: 0,
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
  label: {
    fontSize: 10,
    marginTop: 0,
  },
  tasksMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
  },
  tasksMenuAnchor: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    zIndex: 18,
    elevation: 18,
  },
  tasksMenuWrap: {
    width: 248,
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: palette.slate[100],
    ...shadows.lg,
    gap: spacing.xs,
  },
  tasksMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.xl,
    backgroundColor: palette.slate[50],
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  tasksMenuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tasksMenuTextCol: {
    flex: 1,
    gap: 2,
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
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
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
  menuRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  },
  menuBackdropFill: {
    backgroundColor: palette.overlayLight,
  },
  menuSheetWrap: {
    width: 288,
    maxHeight: '72%',
  },
  menuSheet: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: palette.slate[100],
    overflow: 'hidden',
    ...shadows.lg,
  },
  menuSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
    gap: spacing.sm,
  },
  menuCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.slate[50],
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  menuScroll: {
    maxHeight: 360,
  },
  menuSheetContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs + 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    marginVertical: 3,
    borderRadius: radii.xl,
    backgroundColor: palette.slate[50],
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  menuItemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTextCol: {
    flex: 1,
    gap: 2,
  },
})
