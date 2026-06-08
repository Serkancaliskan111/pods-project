import React, { useMemo, useState } from 'react'
import {
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native'
import { Check, ChevronDown, Search, UserPlus2 } from 'lucide-react-native'
import { personRowDisplayName } from '../../lib/calendarTeamMembers'
import { Text, palette, spacing, radii } from '../../ui'

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return (parts[0].slice(0, 2) || '?').toUpperCase()
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
}

export default function CalendarTeamPersonFilter({
  options = [],
  selectedIds = [],
  onChange,
  loading = false,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds])
  const selectedRows = useMemo(
    () => options.filter((r) => selectedSet.has(String(r.id))),
    [options, selectedSet],
  )

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return options
    return options.filter((row) => personRowDisplayName(row).toLowerCase().includes(term))
  }, [options, search])

  const toggleId = (id) => {
    const sid = String(id)
    if (selectedSet.has(sid)) {
      onChange?.(selectedIds.filter((x) => String(x) !== sid))
    } else {
      onChange?.([...selectedIds, sid])
    }
  }

  const label =
    selectedIds.length === 0
      ? 'Ekip seç'
      : selectedIds.length === 1
        ? personRowDisplayName(selectedRows[0])
        : `${selectedIds.length} kişi`

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, selectedIds.length > 0 && styles.triggerActive]}
        disabled={loading || !options.length}
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
      >
        {selectedIds.length === 0 ? (
          <View style={styles.iconWrap}>
            <UserPlus2 size={14} color={palette.slate[500]} />
          </View>
        ) : (
          <View style={styles.avatarStack}>
            {selectedRows.slice(0, 2).map((row) => (
              <View key={row.id} style={styles.avatar}>
                <Text variant="caption" weight="Bold" color={palette.primary[700]}>
                  {initials(personRowDisplayName(row))}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text variant="caption" weight="Bold" color={palette.slate[700]} numberOfLines={1} style={styles.triggerLabel}>
          {label}
        </Text>
        <ChevronDown size={14} color={palette.slate[400]} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.searchWrap}>
              <Search size={15} color={palette.slate[400]} style={styles.searchIcon} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="İsim ara…"
                placeholderTextColor={palette.slate[400]}
                style={styles.searchInput}
                autoFocus
              />
            </View>
            <View style={styles.sheetActions}>
              <Text variant="caption" color={palette.slate[500]}>
                {selectedIds.length} / {options.length} seçili
              </Text>
              <View style={styles.sheetActionRow}>
                <TouchableOpacity onPress={() => onChange?.(options.map((r) => String(r.id)))}>
                  <Text variant="caption" weight="Bold" color={palette.slate[600]}>
                    Tümü
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onChange?.([])}>
                  <Text variant="caption" weight="Bold" color={palette.slate[600]}>
                    Temizle
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => String(item.id)}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text variant="bodySm" color={palette.slate[500]} style={styles.empty}>
                  Sonuç bulunamadı.
                </Text>
              }
              renderItem={({ item }) => {
                const id = String(item.id)
                const name = personRowDisplayName(item)
                const checked = selectedSet.has(id)
                return (
                  <TouchableOpacity
                    style={[styles.row, checked && styles.rowChecked]}
                    activeOpacity={0.85}
                    onPress={() => toggleId(id)}
                  >
                    <View style={styles.rowAvatar}>
                      <Text variant="caption" weight="Bold" color={palette.primary[700]}>
                        {initials(name)}
                      </Text>
                    </View>
                    <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} style={styles.rowName}>
                      {name}
                    </Text>
                    <View style={[styles.check, checked && styles.checkOn]}>
                      {checked ? <Check size={12} color={palette.surface} strokeWidth={3} /> : null}
                    </View>
                  </TouchableOpacity>
                )
              }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setOpen(false)}>
              <Text variant="bodySm" weight="Bold" color={palette.surface}>
                Tamam
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 200,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
  },
  triggerActive: {
    borderColor: palette.primary[200],
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStack: {
    flexDirection: 'row',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  triggerLabel: {
    flex: 1,
    minWidth: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: palette.overlayLight,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    maxHeight: '72%',
    paddingBottom: spacing.lg,
  },
  searchWrap: {
    margin: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: palette.slate[900],
  },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    marginVertical: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  rowChecked: {
    backgroundColor: palette.primary[50],
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    flex: 1,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.slate[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: palette.primary[600],
    backgroundColor: palette.primary[600],
  },
  empty: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  doneBtn: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: palette.primary[600],
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
})
