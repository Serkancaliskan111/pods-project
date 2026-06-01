import React from 'react'
import { View, ScrollView, RefreshControl, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { palette, spacing } from './tokens'

const IOS_TOP_BUFFER = spacing.lg
const ANDROID_TOP_MIN = spacing['2xl']

/**
 * Tüm tabs-içi ve stack ekranları için ortak root sarmal.
 *
 *  - `scroll`: true ise içerik `ScrollView` ile sarılır.
 *  - `padded`: true ise yatay/dik standart padding uygular.
 *  - `topInset` / `bottomInset`: safe area'yı ekranın kendisinde tüketmek için
 *    paddingTop / paddingBottom ekler. iOS notch / home indicator alanı bu
 *    sarmal sayesinde ekranın asıl rengiyle (paletten gelen) dolar.
 *  - `background`: opsiyonel arkaplan override (default palette.background).
 */
export default function Screen({
  children,
  scroll = false,
  padded = false,
  topInset = true,
  bottomInset = false,
  background = palette.background,
  refreshing,
  onRefresh,
  contentContainerStyle,
  style,
  scrollProps,
  ...rest
}) {
  const insets = useSafeAreaInsets()
  // iOS'ta status bar / Dynamic Island'a daha fazla nefes payı ver; Android'de
  // SafeAreaContext zaman zaman 0 dönebiliyor, bu yüzden minimum bir top
  // padding garanti et.
  const baseTop = topInset ? insets.top : 0
  const padTop = topInset
    ? Platform.OS === 'ios'
      ? baseTop + IOS_TOP_BUFFER
      : Math.max(baseTop, ANDROID_TOP_MIN)
    : baseTop
  const padBottom = bottomInset ? insets.bottom : 0
  const rootStyle = [styles.root, { backgroundColor: background, paddingTop: padTop }, style]

  if (scroll) {
    return (
      <View style={rootStyle} {...rest}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            padded ? styles.scrollContentPadded : styles.scrollContent,
            { paddingBottom: padBottom + spacing['3xl'] },
            contentContainerStyle,
          ]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(refreshing)}
                onRefresh={onRefresh}
                tintColor={palette.primary[500]}
                colors={[palette.primary[700], palette.accent[500]]}
              />
            ) : undefined
          }
          {...scrollProps}
        >
          {children}
        </ScrollView>
      </View>
    )
  }

  return (
    <View
      style={[rootStyle, padded ? styles.padded : null, { paddingBottom: padBottom }]}
      {...rest}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
  },
  scrollContentPadded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['2xl'],
  },
  padded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['2xl'],
  },
})
