import React from 'react'
import { View, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { ChevronLeft, Check } from 'lucide-react-native'
import { useUiTheme } from '../../contexts/UiThemeContext'
import { Heading, Text, TextInput, Button, Sheet, palette, spacing, radii, textInputFieldStyle } from '../../ui'

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
    ...textInputFieldStyle,
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
        variant="field"
        style={adminStyles.input}
        value={value}
        onChangeText={onChangeText}
        {...rest}
      />
    </View>
  )
}

export function ListPickerSheet({ visible, onClose, title, options, value, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} padding="none" maxHeight="72%">
      <View style={pickerStyles.wrap}>
        <Heading variant="h3" style={pickerStyles.title}>
          {title}
        </Heading>
        <ScrollView style={pickerStyles.list} keyboardShouldPersistTaps="handled">
          {(options || []).map((opt) => {
            const active = String(opt.value ?? '') === String(value ?? '')
            return (
              <TouchableOpacity
                key={String(opt.value ?? '__all__')}
                activeOpacity={0.85}
                style={[pickerStyles.row, active && pickerStyles.rowActive]}
                onPress={() => {
                  onSelect(opt.value)
                  onClose()
                }}
              >
                <Text
                  variant="bodySm"
                  weight={active ? 'Bold' : 'Medium'}
                  color={active ? palette.primary[700] : palette.slate[800]}
                  style={{ flex: 1 }}
                >
                  {opt.label}
                </Text>
                {active ? <Check size={18} color={palette.primary[600]} strokeWidth={2.5} /> : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <Button variant="secondary" size="md" fullWidth onPress={onClose} style={{ marginTop: spacing.md }}>
          Kapat
        </Button>
      </View>
    </Sheet>
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

const pickerStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
  },
  rowActive: {
    backgroundColor: palette.primary[50],
  },
})
