import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native'
import { Plus, Trash2 } from 'lucide-react-native'
import {
  fetchPersonalTodoTemplateWithItems,
  savePersonalTodoTemplate,
} from '../../lib/personalTodoApi'
import { TODO_ITEM_PLURAL, TODO_ITEM_SINGULAR, todoItemPlaceholder, normalizeMaddeTip } from '../../lib/personalTodoItemTypes'
import TodoItemTypePicker from './TodoItemTypePicker'
import { Sheet, Text, Button, Icon, palette, spacing, radii } from '../../ui'

function newRowId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function PersonalTodoTemplateSheet({
  visible,
  templateId,
  userId,
  onClose,
  onSaved,
}) {
  const isEdit = !!templateId
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [maddeler, setMaddeler] = useState([{ id: newRowId(), metin: '', tip: 'metin' }])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const resetBlank = useCallback(() => {
    setBaslik('')
    setAciklama('')
    setMaddeler([{ id: newRowId(), metin: '', tip: 'metin' }])
  }, [])

  useEffect(() => {
    if (!visible || !userId) return
    if (!templateId) {
      resetBlank()
      return
    }
    setLoading(true)
    void fetchPersonalTodoTemplateWithItems(templateId, userId)
      .then((tpl) => {
        if (!tpl) {
          Alert.alert('Hata', 'Şablon bulunamadı')
          onClose?.()
          return
        }
        setBaslik(tpl.baslik || '')
        setAciklama(tpl.aciklama || '')
        setMaddeler(
          (tpl.maddeler || []).length
            ? tpl.maddeler.map((m) => ({
                id: m.id || newRowId(),
                metin: m.metin || '',
                tip: normalizeMaddeTip(m.tip || m.madde_tipi),
              }))
            : [{ id: newRowId(), metin: '', tip: 'metin' }],
        )
      })
      .catch((e) => Alert.alert('Hata', e?.message || 'Yüklenemedi'))
      .finally(() => setLoading(false))
  }, [visible, templateId, userId, onClose, resetBlank])

  const addMadde = () => {
    setMaddeler((rows) => [...rows, { id: newRowId(), metin: '', tip: 'metin' }])
  }

  const updateMadde = (idx, patch) => {
    setMaddeler((rows) => rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const removeMadde = (idx) => {
    setMaddeler((rows) => {
      if (rows.length <= 1) return [{ id: newRowId(), metin: '', tip: 'metin' }]
      return rows.filter((_, i) => i !== idx)
    })
  }

  const handleSave = async () => {
    if (!userId) return
    const filled = maddeler.filter((m) => String(m.metin || '').trim())
    if (!String(baslik || '').trim()) {
      Alert.alert('Eksik bilgi', 'Şablon adı gerekli.')
      return
    }
    if (!filled.length) {
      Alert.alert('Eksik bilgi', `En az bir ${TODO_ITEM_SINGULAR.toLowerCase()} ekleyin.`)
      return
    }
    setSaving(true)
    try {
      await savePersonalTodoTemplate({
        userId,
        id: templateId || null,
        baslik,
        aciklama,
        maddeler: filled,
      })
      Alert.alert('Kaydedildi', isEdit ? 'Şablon güncellendi.' : 'Şablon oluşturuldu.')
      onSaved?.()
      onClose?.()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} padding="md" maxHeight="92%">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Icon.TodoList size={20} color={palette.primary[700]} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3" weight="Bold">{isEdit ? 'Şablonu düzenle' : 'Yeni şablon'}</Text>
          <Text variant="caption" color={palette.slate[500]}>
            Sık kullandığınız listeleri kaydedin
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={palette.primary[600]} style={styles.loader} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <Text variant="caption" weight="SemiBold" color={palette.slate[600]} style={styles.label}>
            Şablon adı
          </Text>
          <TextInput
            value={baslik}
            onChangeText={setBaslik}
            placeholder="Örn: Açılış kontrolü"
            placeholderTextColor={palette.slate[400]}
            style={styles.input}
            editable={!saving}
          />

          <Text variant="caption" weight="SemiBold" color={palette.slate[600]} style={styles.label}>
            Açıklama (isteğe bağlı)
          </Text>
          <TextInput
            value={aciklama}
            onChangeText={setAciklama}
            placeholder="Kısa not…"
            placeholderTextColor={palette.slate[400]}
            style={[styles.input, styles.textArea]}
            multiline
            editable={!saving}
          />

          <View style={styles.maddelerHeader}>
            <Text variant="overline" color={palette.slate[500]}>
              {TODO_ITEM_PLURAL}
            </Text>
            <TouchableOpacity style={styles.addMaddeBtn} onPress={addMadde} disabled={saving}>
              <Plus size={14} color={palette.primary[700]} strokeWidth={2.5} />
              <Text variant="caption" weight="Bold" color={palette.primary[700]}>
                {TODO_ITEM_SINGULAR} ekle
              </Text>
            </TouchableOpacity>
          </View>

          {maddeler.map((m, idx) => (
            <View key={m.id} style={styles.stepCard}>
              <View style={styles.stepCardTop}>
                <Text variant="caption" weight="Bold" color={palette.slate[600]}>
                  {TODO_ITEM_SINGULAR} {idx + 1}
                </Text>
                <TouchableOpacity
                  onPress={() => removeMadde(idx)}
                  hitSlop={8}
                  disabled={saving}
                  style={styles.removeBtn}
                >
                  <Trash2 size={16} color={palette.danger[500]} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <TodoItemTypePicker
                value={m.tip}
                onChange={(tip) => updateMadde(idx, { tip })}
                disabled={saving}
              />
              <TextInput
                value={m.metin}
                onChangeText={(v) => updateMadde(idx, { metin: v })}
                placeholder={todoItemPlaceholder(m.tip)}
                placeholderTextColor={palette.slate[400]}
                style={styles.maddeInput}
                editable={!saving}
              />
            </View>
          ))}

          <View style={styles.actions}>
            <Button variant="ghost" size="sm" onPress={onClose} disabled={saving}>
              Vazgeç
            </Button>
            <Button variant="primary" size="sm" loading={saving} onPress={() => void handleSave()}>
              {isEdit ? 'Güncelle' : 'Oluştur'}
            </Button>
          </View>
        </ScrollView>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: palette.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginVertical: spacing['3xl'] },
  scrollContent: { paddingBottom: spacing['3xl'] },
  label: { marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Medium',
    color: palette.slate[800],
    backgroundColor: palette.slate[50],
    marginBottom: spacing.md,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  maddelerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  addMaddeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.primary[50],
  },
  stepCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    gap: spacing.sm,
  },
  stepCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  maddeInput: {
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    color: palette.slate[800],
    backgroundColor: palette.surface,
  },
  removeBtn: {
    padding: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
})
