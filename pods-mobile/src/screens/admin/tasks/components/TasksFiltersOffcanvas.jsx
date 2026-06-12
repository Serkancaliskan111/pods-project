import React, { useMemo, useState } from 'react'
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
import {
  X,
  ChevronDown,
  Building2,
  Layers3,
  CalendarRange,
  Users,
  Check,
  SlidersHorizontal,
} from 'lucide-react-native'
import { Text, Heading, Button, Sheet, palette, spacing, radii, shadows } from '../../../../ui'
import { getTaskTypeLabel } from '../lib/taskTypeLabels'
import { TASK_LIST_BRAND } from '../lib/tasksListTheme'

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

function formatDateLabel(ymd) {
  if (!ymd) return 'Seçin'
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function FilterSection({ icon: Icon, title, hint, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIconWrap}>
          <Icon size={16} color={TASK_LIST_BRAND} strokeWidth={2.2} />
        </View>
        <View style={styles.sectionHeadText}>
          <Text variant="bodySm" weight="Bold" color={palette.slate[900]}>
            {title}
          </Text>
          {hint ? (
            <Text variant="caption" color={palette.slate[500]}>
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  )
}

function FilterSelectTrigger({ value, placeholder, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.selectTrigger} onPress={onPress}>
      <Text
        variant="bodySm"
        weight="SemiBold"
        color={value ? palette.slate[900] : palette.slate[400]}
        numberOfLines={1}
        style={styles.selectValue}
      >
        {value || placeholder}
      </Text>
      <ChevronDown size={18} color={palette.slate[500]} strokeWidth={2.2} />
    </TouchableOpacity>
  )
}

function FilterSelectSheet({ visible, onClose, title, options, value, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} padding="none" maxHeight="72%">
      <View style={styles.sheetInner}>
        <Text variant="h3" weight="Bold" color={palette.slate[900]} style={styles.sheetTitle}>
          {title}
        </Text>
        <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
          {options.map((opt) => {
            const active = String(opt.value ?? '') === String(value ?? '')
            return (
              <TouchableOpacity
                key={String(opt.value ?? 'all')}
                style={[styles.sheetRow, active && styles.sheetRowActive]}
                onPress={() => {
                  onSelect(opt.value)
                  onClose()
                }}
              >
                <Text
                  variant="bodySm"
                  weight={active ? 'Bold' : 'Medium'}
                  color={active ? TASK_LIST_BRAND : palette.slate[800]}
                  style={{ flex: 1 }}
                >
                  {opt.label}
                </Text>
                {active ? <Check size={18} color={TASK_LIST_BRAND} strokeWidth={2.5} /> : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </Sheet>
  )
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
  const [picker, setPicker] = useState(null)
  const [companySheetOpen, setCompanySheetOpen] = useState(false)
  const [taskTypeSheetOpen, setTaskTypeSheetOpen] = useState(false)

  const companyLabel = useMemo(() => {
    if (companyScoped && companies[0]) return companies[0].ana_sirket_adi
    const c = companies.find((x) => String(x.id) === String(selectedCompanyId))
    return c?.ana_sirket_adi || 'Tüm şirketler'
  }, [companyScoped, companies, selectedCompanyId])

  const taskTypeLabel = useMemo(
    () => (selectedTaskType ? getTaskTypeLabel(selectedTaskType) : 'Tüm görev tipleri'),
    [selectedTaskType],
  )

  const companyOptions = useMemo(
    () => [
      { value: '', label: 'Tüm şirketler' },
      ...companies.map((c) => ({ value: String(c.id), label: c.ana_sirket_adi })),
    ],
    [companies],
  )

  const taskTypeSelectOptions = useMemo(
    () => [
      { value: '', label: 'Tüm görev tipleri' },
      ...taskTypeOptions.map((tt) => ({ value: tt, label: getTaskTypeLabel(tt) })),
    ],
    [taskTypeOptions],
  )

  const activeCount =
    (selectedTaskType ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (selectedUnitIds.length ? 1 : 0) +
    (!companyScoped && selectedCompanyId ? 1 : 0)

  const allUnitsActive = selectedUnitIds.length === 0

  const clearUnitSelection = () => {
    ;[...selectedUnitIds].forEach((id) => onToggleUnit?.(id))
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelTitleRow}>
            <View style={styles.panelTitleIcon}>
              <SlidersHorizontal size={18} color={TASK_LIST_BRAND} strokeWidth={2.2} />
            </View>
            <View>
              <Heading variant="h3">Filtreler</Heading>
              {activeCount > 0 ? (
                <Text variant="caption" color={palette.slate[500]}>
                  {activeCount} aktif filtre
                </Text>
              ) : (
                <Text variant="caption" color={palette.slate[500]}>
                  Listeyi daraltın
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Kapat" style={styles.closeBtn}>
            <X size={20} color={palette.slate[600]} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <FilterSection icon={Building2} title="Şirket" hint="Görevlerin bağlı olduğu şirket">
            {companyScoped && companies[0] ? (
              <View style={styles.readonly}>
                <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]}>
                  {companies[0].ana_sirket_adi}
                </Text>
              </View>
            ) : (
              <FilterSelectTrigger
                value={companyLabel}
                placeholder="Şirket seçin"
                onPress={() => setCompanySheetOpen(true)}
              />
            )}
          </FilterSection>

          <FilterSection icon={Layers3} title="Görev tipi" hint="Dropdown ile tek seçim">
            <FilterSelectTrigger
              value={taskTypeLabel}
              placeholder="Görev tipi seçin"
              onPress={() => setTaskTypeSheetOpen(true)}
            />
          </FilterSection>

          <FilterSection icon={CalendarRange} title="Tarih aralığı" hint="Başlangıç ve bitiş">
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPicker('start')} activeOpacity={0.88}>
                <Text variant="caption" weight="Bold" color={palette.slate[500]} style={styles.dateLabel}>
                  Başlangıç
                </Text>
                <Text variant="bodySm" weight="SemiBold" color={startDate ? palette.slate[900] : palette.slate[400]}>
                  {formatDateLabel(startDate)}
                </Text>
              </TouchableOpacity>
              <View style={styles.dateDivider} />
              <TouchableOpacity style={styles.dateBtn} onPress={() => setPicker('end')} activeOpacity={0.88}>
                <Text variant="caption" weight="Bold" color={palette.slate[500]} style={styles.dateLabel}>
                  Bitiş
                </Text>
                <Text variant="bodySm" weight="SemiBold" color={endDate ? palette.slate[900] : palette.slate[400]}>
                  {formatDateLabel(endDate)}
                </Text>
              </TouchableOpacity>
            </View>
            {(startDate || endDate) && (
              <TouchableOpacity
                onPress={() => {
                  onStartDateChange?.('')
                  onEndDateChange?.('')
                }}
                style={styles.clearDatesBtn}
              >
                <Text variant="caption" weight="Bold" color={TASK_LIST_BRAND}>
                  Tarihleri temizle
                </Text>
              </TouchableOpacity>
            )}
          </FilterSection>

          <FilterSection
            icon={Users}
            title="Birimler"
            hint={
              selectedUnitIds.length
                ? `${selectedUnitIds.length} birim seçili`
                : 'Birden fazla birim seçebilirsiniz'
            }
          >
            {availableUnitOptions.length ? (
              <>
                <View style={styles.unitToolbar}>
                  <TouchableOpacity
                    style={[styles.unitToolbarChip, allUnitsActive && styles.unitChipActive]}
                    onPress={clearUnitSelection}
                    activeOpacity={0.88}
                  >
                    <Text
                      variant="caption"
                      weight="Bold"
                      color={allUnitsActive ? palette.surface : palette.slate[700]}
                    >
                      Tümü
                    </Text>
                  </TouchableOpacity>
                  {selectedUnitIds.length > 0 ? (
                    <TouchableOpacity
                      onPress={clearUnitSelection}
                    >
                      <Text variant="caption" weight="Bold" color={TASK_LIST_BRAND}>
                        Seçimi kaldır
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.unitChipGrid}>
                  {availableUnitOptions.map((u) => {
                    const checked = selectedUnitIds.includes(String(u.id))
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.unitChip, checked && styles.unitChipActive]}
                        onPress={() => onToggleUnit?.(u.id)}
                        activeOpacity={0.88}
                      >
                        {checked ? (
                          <Check size={13} color={palette.surface} strokeWidth={2.8} />
                        ) : null}
                        <Text
                          variant="caption"
                          weight="SemiBold"
                          color={checked ? palette.surface : palette.slate[700]}
                          numberOfLines={2}
                          style={styles.unitChipText}
                        >
                          {u.birim_adi}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            ) : (
              <View style={styles.emptyUnits}>
                <Text variant="caption" color={palette.slate[500]}>
                  Bu şirket için birim bulunamadı.
                </Text>
              </View>
            )}
          </FilterSection>
        </ScrollView>

        <View style={styles.footer}>
          {activeCount > 0 ? (
            <Button variant="secondary" size="md" onPress={onClear} style={{ flex: 1 }}>
              Temizle
            </Button>
          ) : null}
          <Button variant="primary" size="md" onPress={onClose} style={{ flex: 1 }}>
            Uygula ({activeCount})
          </Button>
        </View>
      </View>

      <FilterSelectSheet
        visible={companySheetOpen}
        onClose={() => setCompanySheetOpen(false)}
        title="Şirket seç"
        options={companyOptions}
        value={selectedCompanyId}
        onSelect={onCompanyChange}
      />

      <FilterSelectSheet
        visible={taskTypeSheetOpen}
        onClose={() => setTaskTypeSheetOpen(false)}
        title="Görev tipi seç"
        options={taskTypeSelectOptions}
        value={selectedTaskType}
        onSelect={onTaskTypeChange}
      />

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
    width: '90%',
    maxWidth: 380,
    backgroundColor: palette.slate[50],
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
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[100],
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  panelTitleIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: palette.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  section: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: palette.slate[100],
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeadText: {
    flex: 1,
    gap: 1,
  },
  readonly: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
  },
  selectTrigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
  },
  selectValue: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    overflow: 'hidden',
  },
  dateBtn: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 3,
  },
  dateLabel: {
    letterSpacing: 0.4,
  },
  dateDivider: {
    width: 1,
    backgroundColor: palette.slate[200],
  },
  clearDatesBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  unitToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  unitToolbarChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
  },
  unitChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  unitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
  },
  unitChipActive: {
    backgroundColor: TASK_LIST_BRAND,
    borderColor: TASK_LIST_BRAND,
  },
  unitChipText: {
    flexShrink: 1,
  },
  emptyUnits: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radii.xl,
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.slate[100],
    backgroundColor: palette.surface,
  },
  sheetInner: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sheetTitle: {
    marginBottom: spacing.sm,
  },
  sheetList: {
    maxHeight: 360,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: 2,
  },
  sheetRowActive: {
    backgroundColor: '#EFF6FF',
  },
})
