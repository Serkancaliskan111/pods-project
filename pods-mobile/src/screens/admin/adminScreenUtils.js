import React from 'react'
import { View, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { useUiTheme } from '../../contexts/UiThemeContext'
import { Heading, Text, palette, spacing, radii } from '../../ui'

export const adminStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate[600],
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: palette.slate[800],
    backgroundColor: palette.slate[50],
    marginBottom: spacing.md,
  },
  fieldBlock: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  progressTrack: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: palette.slate[100],
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: { height: '100%', borderRadius: radii.full },
})

export function AdminBackHeader({ navigation, title, subtitle, right }) {
  const { theme } = useUiTheme()
  return (
    <View
      style={[
        adminStyles.headerRow,
        {
          backgroundColor: theme.cardBg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          paddingBottom: spacing.md,
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'))}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Geri"
      >
        <ChevronLeft size={28} color={palette.slate[700]} strokeWidth={2} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Heading variant="h1">{title}</Heading>
        {subtitle ? (
          <Text variant="bodySm" color={palette.slate[500]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right || null}
    </View>
  )
}

export function AdminTextField({ label, value, onChangeText, ...rest }) {
  return (
    <View style={adminStyles.fieldBlock}>
      {label ? <Text variant="caption" weight="SemiBold" color={palette.slate[600]} style={{ marginBottom: 4 }}>{label}</Text> : null}
      <TextInput
        style={adminStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={palette.slate[400]}
        {...rest}
      />
    </View>
  )
}

export function pickFromList(title, options, onPick) {
  Alert.alert(
    title,
    undefined,
    [
      ...options.map((o) => ({
        text: o.label,
        onPress: () => onPick(o.value),
      })),
      { text: 'İptal', style: 'cancel' },
    ],
  )
}
