import React from 'react'
import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useUiThemeOptional } from '../contexts/UiThemeContext'
import { palette, screenContent, spacing } from './tokens'

/**
 * Tüm tabs-içi ve stack ekranları için ortak root sarmal.
 *
 *  - `scroll`: true ise içerik `ScrollView` ile sarılır.
 *  - `padded`: true ise yatay/dik standart padding uygular (Görevlerim ile aynı).
 *  - `topInset` / `bottomInset`: `SafeAreaView` ile notch / status bar / home indicator.
 */
export default function Screen({
  children,
  scroll = false,
  padded = false,
  topInset = true,
  bottomInset = false,
  background,
  refreshing,
  onRefresh,
  contentContainerStyle,
  style,
  scrollProps = {},
  ...rest
}) {
  const themeCtx = useUiThemeOptional()
  const pageBg = background ?? themeCtx?.theme?.pageBg ?? palette.background

  const edges = []
  if (topInset) edges.push('top')
  if (bottomInset) edges.push('bottom')

  const rootStyle = [styles.root, { backgroundColor: pageBg }, style]
  const useSafeArea = edges.length > 0
  const Root = useSafeArea ? SafeAreaView : View
  const rootProps = useSafeArea ? { edges, style: rootStyle } : { style: rootStyle }

  const { contentContainerStyle: scrollContentExtra, ...restScrollProps } = scrollProps

  if (scroll) {
    return (
      <Root {...rootProps} {...rest}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            padded ? styles.scrollContentPadded : styles.scrollContent,
            contentContainerStyle,
            scrollContentExtra,
          ]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(refreshing)}
                onRefresh={onRefresh}
                tintColor={themeCtx?.theme?.brandBlue ?? palette.info[600]}
                colors={[
                  themeCtx?.theme?.brandBlue ?? palette.info[600],
                  themeCtx?.theme?.accent ?? palette.accent[500],
                ]}
              />
            ) : undefined
          }
          {...restScrollProps}
        >
          {children}
        </ScrollView>
      </Root>
    )
  }

  return (
    <Root {...rootProps} {...rest}>
      <View style={[styles.fill, padded ? styles.padded : null]}>{children}</View>
    </Root>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: screenContent.paddingBottom,
  },
  scrollContentPadded: {
    paddingHorizontal: screenContent.paddingHorizontal,
    paddingTop: screenContent.paddingTop,
    paddingBottom: screenContent.paddingBottom,
  },
  padded: {
    flex: 1,
    paddingHorizontal: screenContent.paddingHorizontal,
    paddingTop: screenContent.paddingTop,
  },
})
