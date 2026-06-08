import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { Search, Users, UserCheck, X, Check } from 'lucide-react-native'
import { Sheet, Text, Button, Avatar, palette, spacing, radii } from '../../ui'

/**
 * Çok sayıda proje ekibi üyesi — kompakt özet + arama/checkbox sheet (web parity).
 */
export default function ProjectTeamBulkPicker({
  title = 'Proje ekibi',
  subtitle = 'Görev atamasında yalnızca ekip üyeleri seçilebilir.',
  selectedIds = [],
  options = [],
  readOnly = false,
  loading = false,
  saving = false,
  onChange,
  emptyText = 'Henüz kimse eklenmedi.',
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draftIds, setDraftIds] = useState([])

  const idSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds])
  const optionMap = useMemo(() => {
    const m = new Map()
    for (const o of options) m.set(String(o.id), o)
    return m
  }, [options])

  const resolveName = useCallback(
    (id) => optionMap.get(String(id))?.name?.trim() || 'Personel',
    [optionMap],
  )

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    if (!needle) return options
    return options.filter((o) =>
      String(o.name || '')
        .toLocaleLowerCase('tr')
        .includes(needle),
    )
  }, [options, query])

  const openSheet = () => {
    setDraftIds([...selectedIds])
    setQuery('')
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setQuery('')
  }

  const draftSet = useMemo(() => new Set(draftIds.map(String)), [draftIds])

  const toggleDraftId = (id) => {
    const key = String(id)
    setDraftIds((prev) =>
      prev.some((x) => String(x) === key) ? prev.filter((x) => String(x) !== key) : [...prev, id],
    )
  }

  const selectAllFiltered = () => {
    const next = new Set(draftIds.map(String))
    for (const o of filteredOptions) next.add(String(o.id))
    setDraftIds([...next])
  }

  const clearDraft = () => setDraftIds([])

  const applyDraft = () => {
    onChange?.(draftIds)
    closeSheet()
  }

  const removeOne = (id) => {
    onChange?.(selectedIds.filter((x) => String(x) !== String(id)))
  }

  const renderSheetRow = ({ item: o }) => {
    const checked = draftSet.has(String(o.id))
    const label = String(o.name || 'Personel')
    return (
      <TouchableOpacity
        style={[styles.sheetRow, checked && styles.sheetRowChecked]}
        onPress={() => toggleDraftId(o.id)}
        activeOpacity={0.85}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
        <Avatar name={label} size="xs" />
        <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} style={styles.sheetRowLabel} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }

  const renderReadRow = ({ item }) => {
    const label = String(item.name || 'Personel')
    return (
      <View style={styles.readRow}>
        <Avatar name={label} size="sm" />
        <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} style={styles.sheetRowLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    )
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.headIcon}>
            <UserCheck size={16} color={palette.success[700]} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodySm" weight="Bold" color={palette.slate[900]} numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" color={palette.slate[500]} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text variant="caption" weight="Bold" color={palette.success[700]}>
              {selectedIds.length}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          {loading ? (
            <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.md }} />
          ) : (
            <>
              {!readOnly ? (
                <View style={styles.actionRow}>
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={openSheet}
                    iconLeft={<Users size={15} color="#fff" />}
                    loading={saving}
                  >
                    Ekip seç
                  </Button>
                  {selectedIds.length > 0 ? (
                    <Button variant="ghost" size="sm" onPress={() => onChange?.([])} disabled={saving}>
                      Temizle
                    </Button>
                  ) : null}
                </View>
              ) : selectedIds.length > 0 ? (
                <Button variant="outline" size="sm" onPress={openSheet}>
                  Tümünü gör
                </Button>
              ) : null}

              {selectedIds.length === 0 ? (
                <Text variant="caption" color={palette.slate[400]}>
                  {emptyText}
                </Text>
              ) : (
                <>
                  <View style={styles.avatarStack}>
                    {selectedIds.slice(0, 8).map((id, idx) => (
                      <View
                        key={String(id)}
                        style={[styles.avatarStackItem, idx > 0 && { marginLeft: -10 }]}
                      >
                        <Avatar name={resolveName(id)} size="xs" />
                      </View>
                    ))}
                    {selectedIds.length > 8 ? (
                      <View style={[styles.moreBubble, { marginLeft: -10 }]}>
                        <Text variant="caption" weight="Bold" color={palette.slate[700]}>
                          +{selectedIds.length - 8}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <ScrollView
                    style={styles.selectedScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {selectedIds.map((id) => (
                      <View key={String(id)} style={styles.selectedRow}>
                        <Text variant="caption" weight="SemiBold" color={palette.slate[800]} style={{ flex: 1 }} numberOfLines={1}>
                          {resolveName(id)}
                        </Text>
                        {!readOnly ? (
                          <TouchableOpacity
                            onPress={() => removeOne(id)}
                            hitSlop={8}
                            accessibilityLabel={`${resolveName(id)} — çıkar`}
                          >
                            <X size={16} color={palette.slate[400]} strokeWidth={2.2} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
            </>
          )}
        </View>
      </View>

      <Sheet visible={sheetOpen} onClose={closeSheet} padding="none" maxHeight="88%">
        <View style={styles.sheetInner}>
          <Text variant="h3" weight="Bold" color={palette.slate[900]} style={styles.sheetTitle}>
            {readOnly ? String(title) : `${title} — personel seç`}
          </Text>

          <View style={styles.searchBox}>
            <Search size={18} color={palette.slate[400]} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Ad veya e-posta ara…"
              placeholderTextColor={palette.slate[400]}
              style={styles.searchInput}
              autoFocus={!readOnly}
              returnKeyType="search"
            />
          </View>

          {!readOnly ? (
            <View style={styles.sheetActions}>
              <Text variant="caption" weight="SemiBold" color={palette.slate[600]}>
                {String(draftIds.length)} / {String(options.length)} seçili
              </Text>
              <TouchableOpacity onPress={selectAllFiltered} disabled={filteredOptions.length === 0}>
                <Text variant="caption" weight="Bold" color={palette.primary[600]}>
                  {`Listeyi seç (${filteredOptions.length})`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearDraft} disabled={draftIds.length === 0}>
                <Text variant="caption" weight="Bold" color={palette.slate[500]}>
                  Temizle
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text variant="caption" color={palette.slate[500]} style={{ marginBottom: spacing.sm }}>
              {`${selectedIds.length} kişi`}
            </Text>
          )}

          <FlatList
            data={readOnly ? options.filter((o) => idSet.has(String(o.id))) : filteredOptions}
            keyExtractor={(item) => String(item.id)}
            renderItem={readOnly ? renderReadRow : renderSheetRow}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text variant="bodySm" color={palette.slate[500]} align="center" style={styles.listEmpty}>
                Sonuç yok
              </Text>
            }
            style={styles.list}
          />

          {!readOnly ? (
            <View style={styles.sheetFooter}>
              <Button variant="primary" size="md" fullWidth onPress={applyDraft} loading={saving}>
                {`Tamam (${draftIds.length} kişi)`}
              </Button>
            </View>
          ) : (
            <View style={styles.sheetFooter}>
              <Button variant="outline" size="md" fullWidth onPress={closeSheet}>
                Kapat
              </Button>
            </View>
          )}
        </View>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.lg,
    backgroundColor: palette.success[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    backgroundColor: palette.success[50],
    borderRadius: radii.full,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  cardBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  avatarStackItem: {
    borderWidth: 2,
    borderColor: palette.surface,
    borderRadius: radii.full,
  },
  moreBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
  selectedScroll: {
    maxHeight: 120,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[100],
    backgroundColor: palette.slate[50],
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  sheetInner: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetTitle: {
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  listEmpty: {
    paddingVertical: spacing.xl,
  },
  sheetRowLabel: {
    flex: 1,
    minWidth: 0,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 4,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: palette.slate[800],
    paddingVertical: spacing.xs,
  },
  sheetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: 4,
  },
  sheetRowChecked: {
    backgroundColor: palette.success[50],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: palette.success[600],
    borderColor: palette.success[600],
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  sheetFooter: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.slate[100],
    marginTop: spacing.sm,
  },
})
