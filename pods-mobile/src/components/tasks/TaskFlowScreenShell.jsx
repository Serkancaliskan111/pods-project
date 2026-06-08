import React from 'react'
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import HomeCompactGreeting from '../home/HomeCompactGreeting'
import { useUiTheme } from '../../contexts/UiThemeContext'
import {
  Text as KitText,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  screenContent,
} from '../../ui'

/**
 * Görev ata / görev detay gibi stack ekranları için ana sayfa ile uyumlu kabuk.
 */
export default function TaskFlowScreenShell({
  onBack,
  eyebrow,
  title,
  subtitle,
  headerActions,
  accentColor,
  children,
  footer,
  scrollProps = {},
  contentContainerStyle,
}) {
  const insets = useSafeAreaInsets()
  const { theme: uiTheme } = useUiTheme()
  const pageBg = uiTheme?.pageBg ?? kitPalette.background

  const { contentContainerStyle: scrollContentExtra, ...restScrollProps } = scrollProps

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + kitSpacing.sm,
            backgroundColor: pageBg,
          },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.85}>
          <ChevronLeft size={18} color={kitPalette.primary[700]} strokeWidth={2.4} />
          <KitText variant="bodySm" weight="SemiBold" color={kitPalette.primary[700]}>
            Geri
          </KitText>
        </TouchableOpacity>

        {title ? (
          <HomeCompactGreeting
            eyebrow={eyebrow}
            title={title}
            subtitle={subtitle}
            actions={headerActions}
            accentColor={accentColor}
            style={styles.greeting}
          />
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          contentContainerStyle,
          scrollContentExtra,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...restScrollProps}
      >
        {children}
      </ScrollView>

      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, kitSpacing.md),
              backgroundColor: pageBg,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  )
}

export function TaskFlowSectionCard({ children, style, noPadding }) {
  return (
    <View style={[styles.sectionCard, noPadding && styles.sectionCardFlush, style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: screenContent.paddingHorizontal,
    paddingBottom: kitSpacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: kitSpacing.xs,
    marginBottom: kitSpacing.md,
    alignSelf: 'flex-start',
  },
  greeting: {
    marginBottom: kitSpacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenContent.paddingHorizontal,
    paddingBottom: screenContent.paddingBottom,
    gap: 0,
  },
  sectionCard: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    padding: kitSpacing.lg,
    marginBottom: kitSpacing.md,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    ...kitShadows.sm,
  },
  sectionCardFlush: {
    padding: 0,
    overflow: 'hidden',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: kitPalette.slate[200],
    paddingHorizontal: screenContent.paddingHorizontal,
    paddingTop: kitSpacing.md,
    ...kitShadows.sm,
  },
})
