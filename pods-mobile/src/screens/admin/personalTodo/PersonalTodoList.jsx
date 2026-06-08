import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, CheckCircle2, FileStack } from 'lucide-react-native'
import { useAuth } from '../../../contexts/AuthContext'
import {
  createPersonalTodoBlank,
  createPersonalTodoFromTemplate,
  deletePersonalTodoTemplate,
  fetchPersonalTodoTemplates,
  fetchPersonalTodos,
  markPersonalTodoDone,
  parseTodoItems,
  submitPersonalTodoToAudit,
  updatePersonalTodo,
} from '../../../lib/personalTodoApi'
import { countPendingMedia, canCompleteMadde, TODO_ITEM_SINGULAR, TODO_ITEM_PLURAL, getTodoItemTypeOption } from '../../../lib/personalTodoItemTypes'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import PersonalTodoTemplateSheet from '../../../components/personalTodo/PersonalTodoTemplateSheet'
import {
  Text,
  Card,
  Button,
  Chip,
  EmptyState,
  IconButton,
  CenterModal,
  StatusBadge,
  Icon,
  palette,
  spacing,
  radii,
} from '../../../ui'

const DURUM_LABEL = {
  yapilacak: { label: 'Devam ediyor', tone: 'primary' },
  yapildi: { label: 'Tamamlandı', tone: 'success' },
  denetimde: { label: 'Onay bekliyor', tone: 'warning' },
}

function progressOf(maddeler) {
  const items = parseTodoItems(maddeler)
  if (!items.length) return { done: 0, total: 0, pct: 0 }
  const done = items.filter((m) => m.tamamlandi).length
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

export default function PersonalTodoList() {
  const navigation = useNavigation()
  const { user, personel } = useAuth()
  const uid = user?.id

  const [todos, setTodos] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [templateEditorId, setTemplateEditorId] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    try {
      const [t, s] = await Promise.all([
        fetchPersonalTodos(uid),
        fetchPersonalTodoTemplates(uid),
      ])
      setTodos(t)
      setTemplates(s)
      setActiveId((prev) => {
        if (prev && t.some((row) => String(row.id) === String(prev))) return prev
        const first = t.find((row) => row.durum === 'yapilacak')
        return first?.id ?? t[0]?.id ?? null
      })
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Listeler yüklenemedi')
      setTodos([])
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    void load()
  }, [load])

  const active = useMemo(
    () => todos.find((t) => String(t.id) === String(activeId)) || null,
    [todos, activeId],
  )

  const items = useMemo(() => parseTodoItems(active?.maddeler), [active])
  const progress = useMemo(() => progressOf(active?.maddeler), [active])
  const readOnly = active?.durum === 'denetimde'
  const pendingMediaCount = useMemo(() => countPendingMedia(items), [items])

  const persistItems = async (nextItems) => {
    if (!active || !uid) return
    await updatePersonalTodo({ userId: uid, id: active.id, patch: { maddeler: nextItems } })
    setTodos((rows) =>
      rows.map((r) => (r.id === active.id ? { ...r, maddeler: nextItems } : r)),
    )
  }

  const toggleItem = async (item) => {
    if (readOnly || !canCompleteMadde(item)) {
      if (!canCompleteMadde(item)) {
        Alert.alert('Medya gerekli', `Bu ${TODO_ITEM_SINGULAR.toLowerCase()} için önce fotoğraf veya video yüklenmelidir.`)
      }
      return
    }
    const next = items.map((row) =>
      String(row.id) === String(item.id) ? { ...row, tamamlandi: !row.tamamlandi } : row,
    )
    try {
      await persistItems(next)
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi')
    }
  }

  const handleCreateBlank = async () => {
    const title = newTitle.trim()
    if (!title) {
      Alert.alert('Liste adı', 'Bir başlık girin.')
      return
    }
    if (!uid) return
    setCreating(true)
    try {
      const id = await createPersonalTodoBlank({
        userId: uid,
        baslik: title,
        maddeler: [],
      })
      setCreateOpen(false)
      setNewTitle('')
      await load()
      setActiveId(id)
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Liste oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  const handleFromTemplate = async (sablonId) => {
    if (!uid) return
    try {
      const id = await createPersonalTodoFromTemplate({ userId: uid, sablonId })
      setTemplateOpen(false)
      await load()
      setActiveId(id)
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Şablondan oluşturulamadı')
    }
  }

  const openTemplateEditor = (id = null) => {
    setTemplateOpen(false)
    setTemplateEditorId(id)
    setTemplateEditorOpen(true)
  }

  const handleDeleteTemplate = (tpl) => {
    Alert.alert(
      'Şablonu sil',
      `“${tpl.baslik || 'Şablon'}” kalıcı olarak silinsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deletePersonalTodoTemplate(uid, tpl.id)
                await load()
              } catch (e) {
                Alert.alert('Hata', e?.message || 'Silinemedi')
              }
            })()
          },
        },
      ],
    )
  }

  const handleMarkDone = async () => {
    if (!active || !uid) return
    if (pendingMediaCount > 0) {
      Alert.alert('Eksik medya', `Önce tüm fotoğraf/video ${TODO_ITEM_PLURAL.toLowerCase()}ini tamamlayın.`)
      return
    }
    try {
      await markPersonalTodoDone({
        userId: uid,
        id: active.id,
        maddeler: items.map((m) => ({ ...m, tamamlandi: true })),
      })
      Alert.alert('Tamam', 'Liste tamamlandı.')
      await load()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi')
    }
  }

  const handleSubmitAudit = async () => {
    if (!active || !uid || !personel) return
    if (!items.length) {
      Alert.alert('Boş liste', `Denetime göndermek için en az bir ${TODO_ITEM_SINGULAR.toLowerCase()} ekleyin.`)
      return
    }
    if (pendingMediaCount > 0) {
      Alert.alert('Eksik medya', `Göndermeden önce medya ${TODO_ITEM_PLURAL.toLowerCase()}ini tamamlayın.`)
      return
    }
    setSubmitting(true)
    try {
      const isId = await submitPersonalTodoToAudit({
        userId: uid,
        personel,
        todo: active,
      })
      Alert.alert('Gönderildi', 'Liste yöneticinize denetim için iletildi.')
      await load()
      if (isId) navigation.navigate('TaskDetail', { taskId: isId })
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Denetime gönderilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const renderTodoRow = ({ item: t }) => {
    const p = progressOf(t.maddeler)
    const meta = DURUM_LABEL[t.durum] || DURUM_LABEL.yapilacak
    const selected = String(t.id) === String(activeId)
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setActiveId(t.id)}
        style={[styles.todoRow, selected && styles.todoRowSelected]}
      >
        <View style={styles.todoRowTop}>
          <Text variant="body" style={styles.todoTitle} numberOfLines={1}>
            {t.baslik || 'Liste'}
          </Text>
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        </View>
        <Text variant="caption" style={styles.todoMeta}>
          {p.total ? `${p.done}/${p.total} ${TODO_ITEM_SINGULAR.toLowerCase()} · %${p.pct}` : `${TODO_ITEM_SINGULAR} yok`}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <AdminScreenLayout title="Kişisel yapılacaklar" scroll screenProps={{ bottomInset: true }}>
      <View style={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onPress={() => setCreateOpen(true)}
          style={styles.actionBtn}
        >
          Yeni liste
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => setTemplateOpen(true)}
          style={styles.actionBtn}
        >
          Şablonlar
        </Button>
        <IconButton
          variant="soft"
          size="md"
          accessibilityLabel="Yeni şablon oluştur"
          onPress={() => openTemplateEditor(null)}
        >
          <Icon.TaskAssign size={18} color={palette.primary[700]} strokeWidth={2.2} />
        </IconButton>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={palette.primary[700]} style={styles.loader} />
      ) : (
        <>
          {active ? (
            <Card style={styles.detailCard}>
              <Text variant="h3" style={styles.detailTitle}>
                {active.baslik}
              </Text>
              <Text variant="caption" style={styles.progressText}>
                {progress.total
                  ? `${progress.done}/${progress.total} tamam · %${progress.pct}`
                  : `Henüz ${TODO_ITEM_SINGULAR.toLowerCase()} yok`}
              </Text>

              {items.length === 0 ? (
                <Text variant="caption" style={styles.hint}>
                  Şablondan liste açın veya şablon editöründen adım ekleyin.
                </Text>
              ) : (
                <View style={styles.itemsBox}>
                  {items.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.itemRow}
                      onPress={() => void toggleItem(m)}
                      disabled={readOnly}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          m.tamamlandi && styles.checkboxDone,
                        ]}
                      >
                        {m.tamamlandi ? (
                          <CheckCircle2 size={16} color={palette.surface} />
                        ) : null}
                      </View>
                      <View style={styles.itemTextCol}>
                        <Text
                          variant="body"
                          style={[styles.itemText, m.tamamlandi && styles.itemDone]}
                        >
                          {m.metin}
                        </Text>
                        <Text variant="caption" color={palette.slate[400]}>
                          {getTodoItemTypeOption(m.tip).shortLabel}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!readOnly ? (
                <View style={styles.detailActions}>
                  {pendingMediaCount > 0 ? (
                    <Text variant="caption" style={styles.warn}>
                      {pendingMediaCount} {TODO_ITEM_SINGULAR.toLowerCase()} için medya eksik.
                    </Text>
                  ) : null}
                  <Button variant="secondary" size="sm" onPress={() => void handleMarkDone()}>
                    Hepsini tamamla
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={submitting}
                    disabled={submitting}
                    onPress={() => void handleSubmitAudit()}
                  >
                    Denetime gönder
                  </Button>
                </View>
              ) : (
                <Text variant="caption" style={styles.readOnlyHint}>
                  Liste onay sürecinde — düzenleme kapalı.
                  {active.is_id ? ' Bağlı görev detayından takip edebilirsiniz.' : ''}
                </Text>
              )}
            </Card>
          ) : null}

          {todos.length === 0 ? (
            <EmptyState
              title="Henüz liste yok"
              description="Yeni liste veya şablon ile başlayın."
              action={
                <Button variant="primary" size="sm" onPress={() => setCreateOpen(true)}>
                  Yeni liste
                </Button>
              }
            />
          ) : (
            <FlatList
              data={todos}
              keyExtractor={(t) => String(t.id)}
              renderItem={renderTodoRow}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.listSep} />}
              ListHeaderComponent={
                <Text variant="overline" style={styles.listHeading}>
                  Listelerim
                </Text>
              }
            />
          )}
        </>
      )}

      <CenterModal visible={createOpen} onClose={() => !creating && setCreateOpen(false)}>
        <Text variant="h3" weight="Bold">Yeni liste</Text>
        <Text variant="caption" style={styles.modalHint}>
          Kontrol listesi için bir başlık girin.
        </Text>
        <TextInput
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Örn: Vardiya kapanış"
          style={styles.input}
          editable={!creating}
        />
        <View style={styles.modalActions}>
          <Button variant="ghost" size="sm" onPress={() => setCreateOpen(false)} disabled={creating}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={creating}
            onPress={() => void handleCreateBlank()}
          >
            Oluştur
          </Button>
        </View>
      </CenterModal>

      <CenterModal visible={templateOpen} onClose={() => setTemplateOpen(false)} maxWidth={400}>
        <View style={styles.templateHeader}>
          <View style={styles.templateHeaderIcon}>
            <FileStack size={20} color={palette.primary[700]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h3" weight="Bold">Hazır şablonlar</Text>
            <Text variant="caption" color={palette.slate[500]}>
              Listeyi hızlı başlatın veya şablonu düzenleyin
            </Text>
          </View>
        </View>

        <Button
          variant="secondary"
          size="sm"
          onPress={() => openTemplateEditor(null)}
          style={styles.templateCreateBtn}
        >
          + Yeni şablon oluştur
        </Button>

        {templates.length === 0 ? (
          <EmptyState
            title="Henüz şablon yok"
            description="Sık kullandığınız kontrol listelerini kaydedin."
            action={
              <Button variant="primary" size="sm" onPress={() => openTemplateEditor(null)}>
                İlk şablonu oluştur
              </Button>
            }
          />
        ) : (
          templates.map((tpl) => (
            <View key={tpl.id} style={styles.templateRow}>
              <TouchableOpacity
                style={styles.templateMain}
                onPress={() => void handleFromTemplate(tpl.id)}
              >
                <Text variant="body" weight="SemiBold" style={styles.templateTitle}>
                  {tpl.baslik}
                </Text>
                {tpl.aciklama ? (
                  <Text variant="caption" color={palette.slate[500]} numberOfLines={2}>
                    {tpl.aciklama}
                  </Text>
                ) : null}
                <Text variant="caption" color={palette.primary[600]} style={styles.templateUseHint}>
                  Listeyi oluştur →
                </Text>
              </TouchableOpacity>
              <View style={styles.templateActions}>
                <IconButton
                  variant="soft"
                  size="sm"
                  accessibilityLabel="Şablonu düzenle"
                  onPress={() => openTemplateEditor(tpl.id)}
                >
                  <Icon.TaskEdit size={16} color={palette.slate[600]} strokeWidth={2.2} />
                </IconButton>
                <IconButton
                  variant="soft"
                  size="sm"
                  accessibilityLabel="Şablonu sil"
                  onPress={() => handleDeleteTemplate(tpl)}
                >
                  <Icon.TaskDelete size={16} color={palette.danger[500]} strokeWidth={2.2} />
                </IconButton>
              </View>
            </View>
          ))
        )}
        <Button variant="ghost" size="sm" onPress={() => setTemplateOpen(false)} style={styles.modalClose}>
          Kapat
        </Button>
      </CenterModal>

      <PersonalTodoTemplateSheet
        visible={templateEditorOpen}
        templateId={templateEditorId}
        userId={uid}
        onClose={() => {
          setTemplateEditorOpen(false)
          setTemplateEditorId(null)
        }}
        onSaved={() => void load()}
      />
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerCenter: { flex: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: { flex: 1 },
  loader: { marginTop: spacing['3xl'] },
  detailCard: { marginBottom: spacing.lg },
  detailTitle: { fontWeight: '700', marginBottom: spacing.xs },
  progressText: { color: palette.slate[500], marginBottom: spacing.md },
  hint: { color: palette.slate[500], marginBottom: spacing.sm },
  itemsBox: { gap: spacing.sm, marginBottom: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemTextCol: { flex: 1, gap: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: palette.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: palette.success[500],
    borderColor: palette.success[500],
  },
  itemText: {},
  itemDone: { textDecorationLine: 'line-through', color: palette.slate[400] },
  detailActions: { gap: spacing.sm, marginTop: spacing.sm },
  warn: { color: palette.warning[700] },
  readOnlyHint: { color: palette.warning[800], marginTop: spacing.sm },
  listHeading: {
    marginBottom: spacing.sm,
    color: palette.slate[600],
    fontWeight: '700',
  },
  todoRow: {
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: palette.slate[50],
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  todoRowSelected: {
    borderColor: palette.primary[300],
    backgroundColor: palette.primary[50],
  },
  todoRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  todoTitle: { flex: 1, fontWeight: '700' },
  todoMeta: { marginTop: 4, color: palette.slate[500] },
  listSep: { height: spacing.sm },
  modalHint: { marginVertical: spacing.md, color: palette.slate[500] },
  input: {
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Medium',
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  templateHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: palette.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateCreateBtn: { marginBottom: spacing.md },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.slate[100],
  },
  templateMain: { flex: 1, minWidth: 0 },
  templateTitle: { marginBottom: 2 },
  templateUseHint: { marginTop: 4, fontWeight: '600' },
  templateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  modalClose: { marginTop: spacing.md, alignSelf: 'center' },
})
