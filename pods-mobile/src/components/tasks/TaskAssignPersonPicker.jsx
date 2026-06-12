import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Switch,
} from 'react-native'
import {
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  Search,
  Users,
} from 'lucide-react-native'
import { Sheet, Text, Avatar, Button, palette, spacing, radii } from '../../ui'

const TONES = {
  indigo: { badge: '#EEF2FF', text: '#4338CA' },
  sky: { badge: '#E0F2FE', text: '#0369A1' },
  fuchsia: { badge: '#FAE8FF', text: '#A21CAF' },
  emerald: { badge: palette.success?.[50] || '#ECFDF5', text: palette.success?.[700] || '#047857' },
  slate: { badge: palette.slate[100], text: palette.slate[700] },
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
}

function PersonPickerSheet({ visible, onClose, title, options, onPick, excludeIds = [] }) {
  const [query, setQuery] = useState('')
  const excludeSet = useMemo(() => new Set(excludeIds.map(String)), [excludeIds])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    const list = options.filter((o) => !excludeSet.has(String(o.id)))
    if (!needle) return list
    return list.filter((o) => String(o.name || '').toLocaleLowerCase('tr').includes(needle))
  }, [options, query, excludeSet])

  const handleClose = () => {
    setQuery('')
    onClose?.()
  }

  return (
    <Sheet visible={visible} onClose={handleClose} padding="none" maxHeight="88%">
      <View style={styles.sheetInner}>
        <Text variant="h3" weight="Bold" color={palette.slate[900]} style={styles.sheetTitle}>
          {title || 'Personel seçin'}
        </Text>
      <View style={styles.searchWrap}>
        <Search size={16} color={palette.slate[400]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Ara…"
          placeholderTextColor={palette.slate[400]}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: 360 }}
        ListEmptyComponent={
          <Text variant="bodySm" color={palette.slate[500]} style={styles.emptySheet}>
            Sonuç yok
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => {
              onPick?.(item.id)
              handleClose()
            }}
          >
            <Avatar name={item.name} size="xs" />
            <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} style={{ flex: 1 }} numberOfLines={1}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />
      </View>
    </Sheet>
  )
}

function AvatarChip({ name, tone = 'indigo', onRemove, index }) {
  const t = TONES[tone] || TONES.indigo
  return (
    <View style={styles.chipWrap}>
      {index != null ? (
        <View style={styles.orderBadge}>
          <Text variant="caption" weight="Bold" style={{ color: '#fff', fontSize: 9 }}>
            {index}
          </Text>
        </View>
      ) : null}
      <View style={[styles.avatarChip, { backgroundColor: t.badge }]}>
        <Text variant="caption" weight="Bold" style={{ color: t.text, fontSize: 11 }}>
          {initials(name)}
        </Text>
      </View>
      {onRemove ? (
        <TouchableOpacity style={styles.chipRemove} onPress={onRemove} hitSlop={6}>
          <X size={10} color="#fff" strokeWidth={3} />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

export function TaskAssignPeopleChipPicker({
  title,
  countLabel,
  tone = 'emerald',
  options = [],
  selectedIds = [],
  onAdd,
  onRemove,
  emptyText = 'Henüz personel seçilmedi.',
  headerAction = null,
  getSelectedLabel,
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const t = TONES[tone] || TONES.emerald

  const resolveName = useCallback(
    (id) => {
      const fromFn = getSelectedLabel?.(id)
      if (fromFn?.trim()) return fromFn.trim()
      return options.find((o) => String(o.id) === String(id))?.name || 'Personel'
    },
    [getSelectedLabel, options],
  )

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={[styles.panelIcon, { backgroundColor: t.badge }]}>
          <Users size={15} color={t.text} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodySm" weight="Bold" color={palette.slate[900]}>
            {title}
          </Text>
          <Text variant="caption" color={palette.slate[500]}>
            Proje ekibinden seçin
          </Text>
        </View>
        {headerAction}
        {countLabel ? (
          <View style={[styles.countBadge, { backgroundColor: t.badge }]}>
            <Text variant="caption" weight="Bold" style={{ color: t.text, fontSize: 10 }}>
              {countLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.chipArea, selectedIds.length === 0 && styles.chipAreaEmpty]}>
        {selectedIds.length === 0 ? (
          <Text variant="caption" color={palette.slate[400]}>
            {emptyText}
          </Text>
        ) : (
          selectedIds.map((id) => (
            <AvatarChip
              key={id}
              name={resolveName(id)}
              tone={tone}
              onRemove={() => onRemove?.(id)}
            />
          ))
        )}
        <TouchableOpacity style={styles.addBtn} onPress={() => setSheetOpen(true)}>
          <Plus size={18} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      <PersonPickerSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Personel ekle"
        options={options}
        excludeIds={selectedIds}
        onPick={onAdd}
      />
    </View>
  )
}

export function TaskAssignOrderedPeoplePicker({
  title,
  countLabel,
  tone = 'sky',
  options = [],
  orderedIds = [],
  onAdd,
  onRemove,
  onMove,
  emptyText = 'Henüz eklenmedi.',
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const t = TONES[tone] || TONES.sky

  const resolveName = (id) => options.find((o) => String(o.id) === String(id))?.name || '—'

  return (
    <View style={styles.panelCompact}>
      <View style={styles.panelHeader}>
        <View style={[styles.panelIconSm, { backgroundColor: t.badge }]}>
          <Users size={14} color={t.text} strokeWidth={2.2} />
        </View>
        <Text variant="bodySm" weight="Bold" color={palette.slate[900]} style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: t.badge }]}>
          <Text variant="caption" weight="Bold" style={{ color: t.text, fontSize: 10 }}>
            {countLabel}
          </Text>
        </View>
      </View>
      <View style={styles.chipArea}>
        {orderedIds.length === 0 ? (
          <Text variant="caption" color={palette.slate[500]}>
            {emptyText}
          </Text>
        ) : (
          orderedIds.map((id, idx) => (
            <AvatarChip
              key={`${id}-${idx}`}
              name={resolveName(id)}
              tone={tone}
              index={idx + 1}
              onRemove={() => onRemove?.(id)}
            />
          ))
        )}
        <TouchableOpacity style={styles.addBtnSm} onPress={() => setSheetOpen(true)}>
          <Plus size={16} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      {orderedIds.length > 1 ? (
        <View style={styles.orderList}>
          {orderedIds.map((id, idx) => (
            <View key={`ord-${id}-${idx}`} style={[styles.orderRow, { borderColor: t.badge }]}>
              <Text variant="caption" weight="Bold" color={palette.slate[500]}>
                {idx + 1}.
              </Text>
              <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} style={{ flex: 1 }} numberOfLines={1}>
                {resolveName(id)}
              </Text>
              {onMove ? (
                <View style={styles.orderBtns}>
                  <TouchableOpacity onPress={() => onMove(idx, -1)} hitSlop={6}>
                    <ChevronUp size={16} color={palette.slate[500]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onMove(idx, 1)} hitSlop={6}>
                    <ChevronDown size={16} color={palette.slate[500]} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <PersonPickerSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Sıraya ekle"
        options={options}
        excludeIds={orderedIds}
        onPick={onAdd}
      />
    </View>
  )
}

export function TaskAssignRolePairPicker({
  stepIndex,
  yapanValue,
  yapanOptions = [],
  onYapanChange,
  denetimciValue,
  denetimciOptions = [],
  onDenetimciChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  canRemove,
}) {
  const [yapanOpen, setYapanOpen] = useState(false)
  const [denetimciOpen, setDenetimciOpen] = useState(false)

  const yapanName = yapanOptions.find((o) => String(o.id) === String(yapanValue))?.name
  const denetimciName = denetimciOptions.find((o) => String(o.id) === String(denetimciValue))?.name

  return (
    <View style={styles.rolePanel}>
      <View style={styles.roleHeader}>
        <View style={styles.stepBadge}>
          <Text variant="caption" weight="Bold" style={{ color: '#fff', fontSize: 10 }}>
            {stepIndex}. adım
          </Text>
        </View>
        <View style={styles.roleActions}>
          <TouchableOpacity onPress={onMoveUp} hitSlop={6}>
            <ChevronUp size={16} color={palette.slate[500]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onMoveDown} hitSlop={6}>
            <ChevronDown size={16} color={palette.slate[500]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRemove} disabled={!canRemove} hitSlop={6}>
            <Trash2 size={16} color={canRemove ? palette.danger[500] : palette.slate[300]} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.roleRow}>
        <View style={styles.roleCol}>
          <Text variant="caption" weight="Bold" color={palette.slate[600]}>
            Sorumlu
          </Text>
          <TouchableOpacity style={styles.rolePick} onPress={() => setYapanOpen(true)}>
            <Text variant="bodySm" color={yapanName ? palette.slate[800] : palette.slate[400]} numberOfLines={1}>
              {yapanName || 'Seçilmedi'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.roleCol}>
          <Text variant="caption" weight="Bold" color={palette.slate[600]}>
            Denetimci
          </Text>
          <TouchableOpacity style={styles.rolePick} onPress={() => setDenetimciOpen(true)}>
            <Text variant="bodySm" color={denetimciName ? palette.slate[800] : palette.slate[400]} numberOfLines={1}>
              {denetimciName || 'Seçilmedi'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <PersonPickerSheet
        visible={yapanOpen}
        onClose={() => setYapanOpen(false)}
        title="Sorumlu seçin"
        options={yapanOptions}
        onPick={(id) => onYapanChange?.(id)}
      />
      <PersonPickerSheet
        visible={denetimciOpen}
        onClose={() => setDenetimciOpen(false)}
        title="Denetimci seçin"
        options={denetimciOptions}
        onPick={(id) => onDenetimciChange?.(id)}
      />
    </View>
  )
}

export function CokluAtamaSwitch({ value, onChange }) {
  return (
    <View style={styles.cokluSwitch}>
      <Text variant="caption" weight="Bold" color={palette.slate[700]}>
        Çoklu atama
      </Text>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: palette.slate[200], true: palette.success[400] }}
        thumbColor="#fff"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  panelCompact: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  panelIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelIconSm: {
    width: 28,
    height: 28,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: 56,
  },
  chipAreaEmpty: {
    borderStyle: 'dashed',
  },
  chipWrap: {
    position: 'relative',
  },
  avatarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.slate[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    zIndex: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.slate[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.success[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnSm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.success[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderList: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: palette.slate[50],
  },
  orderBtns: {
    flexDirection: 'row',
  },
  sheetInner: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetTitle: {
    marginBottom: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: palette.slate[50],
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: palette.slate[800],
    paddingVertical: spacing.xs,
    backgroundColor: 'transparent',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptySheet: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  rolePanel: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F5D0FE',
    backgroundColor: '#FDF4FF',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  stepBadge: {
    backgroundColor: '#C026D3',
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleCol: {
    flex: 1,
    gap: 4,
  },
  rolePick: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  cokluSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
})
