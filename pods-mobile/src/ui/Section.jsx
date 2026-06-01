import React from 'react'
import { View, StyleSheet } from 'react-native'
import Heading from './Heading'
import Text from './Text'
import { spacing } from './tokens'

/**
 * Tutarlı section başlığı + sub + sağ aksiyon slotu + içerik.
 *
 * <Section title="Bugünün Bildirimleri" subtitle="14 Mayıs Salı" action={<Button.../>}>
 *   ...
 * </Section>
 */
export default function Section({
  title,
  subtitle,
  action,
  icon,
  headerStyle,
  style,
  children,
  gap = spacing.md,
}) {
  return (
    <View style={[styles.wrap, style]}>
      {(title || subtitle || action) ? (
        <View style={[styles.header, { marginBottom: gap }, headerStyle]}>
          <View style={styles.left}>
            {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
            <View style={styles.titleWrap}>
              {title ? (
                <Heading variant="h2" style={styles.title}>
                  {title}
                </Heading>
              ) : null}
              {subtitle ? (
                <Text variant="caption" style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  iconWrap: {
    marginRight: 0,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    marginBottom: 2,
  },
  subtitle: {
    marginTop: 0,
  },
  action: {
    marginLeft: spacing.sm,
  },
})
