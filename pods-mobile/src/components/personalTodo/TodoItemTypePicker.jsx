import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { AlignLeft, Camera, Film } from 'lucide-react-native'
import { Text, palette, spacing, radii } from '../../ui'
import {
  TODO_MADDE_TIP,
  TODO_MADDE_TIP_OPTIONS,
  normalizeMaddeTip,
  getTodoItemTypeOption,
} from '../../lib/personalTodoItemTypes'

const TYPE_ICONS = {
  [TODO_MADDE_TIP.METIN]: AlignLeft,
  [TODO_MADDE_TIP.FOTO]: Camera,
  [TODO_MADDE_TIP.VIDEO]: Film,
}

/**
 * Adım tipi seçici — metin / fotoğraf / video net segment olarak.
 */
export default function TodoItemTypePicker({ value, onChange, disabled = false, compact = false }) {
  const current = normalizeMaddeTip(value)
  const selected = getTodoItemTypeOption(current)

  return (
    <View style={styles.wrap}>
      <View style={styles.segment}>
        {TODO_MADDE_TIP_OPTIONS.map((opt) => {
          const active = current === opt.value
          const IconComp = TYPE_ICONS[opt.value]
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, active && styles.chipActive, compact && styles.chipCompact]}
              onPress={() => onChange?.(opt.value)}
              disabled={disabled}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
            >
              <IconComp
                size={compact ? 13 : 14}
                color={active ? palette.primary[700] : palette.slate[500]}
                strokeWidth={2.2}
              />
              <Text
                variant="caption"
                weight={active ? 'Bold' : 'SemiBold'}
                color={active ? palette.primary[800] : palette.slate[600]}
                numberOfLines={1}
              >
                {opt.shortLabel}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {!compact ? (
        <Text variant="caption" color={palette.slate[500]}>
          {selected.description}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 3,
    borderRadius: radii.lg,
    backgroundColor: palette.slate[100],
    borderWidth: 1,
    borderColor: palette.slate[200],
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  chipCompact: {
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: palette.surface,
    ...{
      shadowColor: palette.slate[900],
      shadowOpacity: 0.06,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
  },
})
