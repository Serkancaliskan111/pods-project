import React, { useMemo } from 'react'
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { X } from 'lucide-react-native'
import { Text, Heading, Button, palette, spacing, radii, shadows } from '../../../../ui'
import { getTaskTypeLabel } from '../lib/taskTypeLabels'

function parseYmd(ymd) {
  if (!ymd) return new Date()
  const d = new Date(`${ymd}T12:00:00`)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function toYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function TasksFiltersOffcanvas({
  visible,
  onClose,
  companyScoped,
  companies = [],
  currentCompanyId,
  selectedCompanyId,
  onCompanyChange,
  selectedTaskType,
  onTaskTypeChange,
  taskTypeOptions = [],
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  availableUnitOptions = [],
  selectedUnitIds = [],
  onToggleUnit,
  onClear,
}) {
  const [picker, setPicker] = React.useState(null)

  const companyLabel = useMemo(() => {
    if (companyScoped && companies[0]) return companies[0].ana_sirket_adi
    const c = companies.find((x) => String(x.id) === String(selectedCompanyId))
    return c?.ana_sirket_adi || 'Tüm şirketler'
  }, [companyScoped, companies, selectedCompanyId])

  const activeCount =
    (selectedTaskType ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (selectedUnitIds.length ? 1 : 0) +
    (!companyScoped && selectedCompanyId ? 1 : 0)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Heading variant="h3">Filtreler</Heading>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Kapat">
            <X size={22} color={palette.slate[600]} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <FilterField label="Şirket">
            {companyScoped && companies[0] ? (
              <View style={styles.readonly}>
                <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]}>
                  {companies[0].ana_sirket_adi}
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.optionPill, !selectedCompanyId && styles.optionPillActive]}
                  onPress={() => onCompanyChange?.('')}
                >
                  <Text
                    variant="caption"
                    weight="SemiBold"
                    color={!selectedCompanyId ? palette.surface : palette.slate[700]}
                  >
                    Tümü
                  </Text>
                </TouchableOpacity>
                {companies.map((c) => {
                  const active = String(selectedCompanyId) === String(c.id)
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.optionPill, active && styles.optionPillActive]}
                      onPress={() => onCompanyChange?.(String(c.id))}
                    >
                      <Text
                        variant="caption"
                        weight="SemiBold"
                        color={active ? palette.surface : palette.slate[700]}
                        numberOfLines={1}
                      >
                        {c.ana_sirket_adi}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}
          </FilterField>

          <FilterField label="Görev tipi">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.optionPill, !selectedTaskType && styles.optionPillActive]}
                onPress={() => onTaskTypeChange?.('')}
              >
                <Text
                  variant="caption"
                  weight="SemiBold"
                  color={!selectedTaskType ? palette.surface : palette.slate[700]}
                >
                  Tüm tipler
                </Text>
              </TouchableOpacity>
              {taskTypeOptions.map((tt) => {
                const active = selectedTaskType === tt
                return (
                  <TouchableOpacity
                    key={tt}
                    style={[styles.optionPill, active && styles.optionPillActive]}
                    onPress={() => onTaskTypeChange?.(tt)}
                  >
                    <Text
                      variant="caption"
                      weight="SemiBold"
                      color={active ? palette.surface : palette.slate[700]}
                    >
                      {getTaskTypeLabel(tt)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </FilterField>

          <FilterField label="Tarih filtresi">
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPicker('start')}>
                <Text variant="caption" color={palette.slate[500]}>
                  Başlangıç
                </Text>
                <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]}>
                  {startDate || 'Seçin'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPicker('end')}>
                <Text variant="caption" color={palette.slate[500]}>
                  Bitiş
                </Text>
                <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]}>
                  {endDate || 'Seçin'}
                </Text>
              </TouchableOpacity>
            </View>
            {(startDate || endDate) && (
              <TouchableOpacity
                onPress={() => {
                  onStartDateChange?.('')
                  onEndDateChange?.('')
                }}
              >
                <Text variant="caption" weight="SemiBold" color={palette.primary[700]}>
                  Tarihleri temizle
                </Text>
              </TouchableOpacity>
            )}
          </FilterField>

          <FilterField label="Birimler">
            {availableUnitOptions.length ? (
              <View style={styles.unitList}>
                {availableUnitOptions.map((u) => {
                  const checked = selectedUnitIds.includes(String(u.id))
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.unitRow, checked && styles.unitRowActive]}
                      onPress={() => onToggleUnit?.(u.id)}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxOn]} />
                      <Text variant="bodySm" color={palette.slate[800]} style={{ flex: 1 }}>
                        {u.birim_adi}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ) : (
              <Text variant="caption" color={palette.slate[500]}>
                Birim bulunamadı.
              </Text>
            )}
          </FilterField>
        </ScrollView>

        <View style={styles.footer}>
          {activeCount > 0 ? (
            <Button variant="secondary" size="md" onPress={onClear} style={{ flex: 1 }}>
              Temizle
            </Button>
          ) : null}
          <Button variant="primary" size="md" onPress={onClose} style={{ flex: 1 }}>
            Uygula
          </Button>
        </View>
      </View>

      {picker ? (
        <DateTimePicker
          value={parseYmd(picker === 'start' ? startDate : endDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => {
            if (Platform.OS === 'android') setPicker(null)
            if (!date) return
            const ymd = toYmd(date)
            if (picker === 'start') onStartDateChange?.(ymd)
            else onEndDateChange?.(ymd)
          }}
        />
      ) : null}
    </Modal>
  )
}

function FilterField({ label, children }) {
  return (
    <View style={styles.field}>
      <Text variant="overline" color={palette.slate[500]} weight="Bold" style={styles.fieldLabel}>
        {label}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.overlay,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '88%',
    maxWidth: 360,
    backgroundColor: palette.surface,
    borderLeftWidth: 1,
    borderLeftColor: palette.slate[200],
    ...shadows.xl,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[100],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    letterSpacing: 0.6,
  },
  readonly: {
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
  },
  optionPill: {
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
  },
  optionPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateBtn: {
    flex: 1,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  unitList: {
    gap: spacing.xs,
    maxHeight: 220,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
  },
  unitRowActive: {
    backgroundColor: palette.primary[50],
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.slate[300],
  },
  checkboxOn: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.slate[100],
  },
})
