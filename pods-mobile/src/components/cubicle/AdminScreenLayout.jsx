import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { useUiTheme } from '../../contexts/UiThemeContext'
import { Screen, Text, palette, spacing } from '../../ui'

/**
 * Stack ekranları — geri + başlık, web admin sayfalarına yakın düzen.
 */
export default function AdminScreenLayout({
  title,
  subtitle,
  right,
  children,
  scroll = false,
  padded = true,
  refreshing,
  onRefresh,
  screenProps = {},
  showBack = true,
}) {
  const navigation = useNavigation()
  const { theme } = useUiTheme()

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('Tabs')
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.pageBg }]}>
      {showBack ? (
        <SafeAreaView edges={['top']} style={{ backgroundColor: theme.cardBg }}>
          <View
            style={[
              styles.header,
              {
                backgroundColor: theme.cardBg,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={handleBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Geri"
              style={styles.backBtn}
            >
              <ChevronLeft size={26} color={palette.slate[700]} strokeWidth={2} />
            </TouchableOpacity>
            {title ? (
              <View style={styles.titleCol}>
                <Text variant="h2" numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.titleCol} />
            )}
            {right ? <View style={styles.right}>{right}</View> : <View style={styles.rightSpacer} />}
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView edges={['top']} style={{ backgroundColor: theme.pageBg }} />
      )}
      <Screen
        padded={padded}
        topInset={false}
        scroll={scroll}
        refreshing={refreshing}
        onRefresh={onRefresh}
        background={theme.pageBg}
        {...screenProps}
      >
        {children}
      </Screen>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    minWidth: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightSpacer: {
    width: 36,
  },
})
