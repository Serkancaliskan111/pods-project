import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  RefreshControl,
  TextInput,
  View,
  StyleSheet,
} from 'react-native'
import { Bell, Megaphone, Plus } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canCreateAnnouncement } from '../../../lib/permissions'
import {
  loadReadAnnouncementIdsAsync,
  saveReadAnnouncementIdsAsync,
} from '../../../lib/announcementRead'
import {
  buildBirimHierarchyCtx,
  createAnnouncement,
  fetchAnnouncementUnits,
} from '../../../lib/announcementCreateApi'
import { formatFullName } from '../../../lib/nameFormat'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Heading,
  Text,
  Card,
  Button,
  IconBubble,
  EmptyState,
  SkeletonCard,
  CenterModal,
  StatusBadge,
  palette,
  spacing,
  radii,
} from '../../../ui'

const supabase = getSupabase()

export default function AnnouncementsList() {
  const { profile, personel } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canCreate = canCreateAnnouncement(permissions, isSystemAdmin, personel)
  const readScopeId = personel?.id

  const [items, setItems] = useState([])
  const [readIds, setReadIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createText, setCreateText] = useState('')
  const [creating, setCreating] = useState(false)
  const [units, setUnits] = useState([])

  const subtitle = useMemo(
    () =>
      isSystemAdmin
        ? 'Tüm şirketlerdeki duyurular'
        : 'Şirketiniz için yayımlanan duyurular',
    [isSystemAdmin],
  )

  const loadReadIds = useCallback(async () => {
    if (!readScopeId) {
      setReadIds(new Set())
      return
    }
    const ids = await loadReadAnnouncementIdsAsync(readScopeId)
    setReadIds(ids)
  }, [readScopeId])

  const load = useCallback(async () => {
    try {
      let query = supabase
        .from('duyurular')
        .select('id, metin, created_at, gonderen_personel_id, ana_sirket_id, hedef_birim_ids')
        .order('created_at', { ascending: false })
        .limit(200)

      if (!isSystemAdmin && personel?.ana_sirket_id) {
        query = query.eq('ana_sirket_id', personel.ana_sirket_id)
      }

      const { data, error } = await query
      if (error) {
        Alert.alert('Hata', error.message || 'Duyurular yüklenemedi')
        setItems([])
        return
      }

      const rows = Array.isArray(data) ? data : []
      const senderIds = [...new Set(rows.map((d) => d.gonderen_personel_id).filter(Boolean))]
      const senderMap = {}
      if (senderIds.length) {
        const { data: peopleData } = await supabase
          .from('personeller')
          .select('id, ad, soyad, email')
          .in('id', senderIds)
        ;(peopleData || []).forEach((p) => {
          senderMap[String(p.id)] = formatFullName(p.ad, p.soyad, '') || p.email || 'Yönetici'
        })
      }

      setItems(
        rows.map((row) => ({
          ...row,
          gonderen_adi: senderMap[String(row.gonderen_personel_id)] || 'Yönetici',
        })),
      )
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Duyurular yüklenemedi')
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isSystemAdmin, personel?.ana_sirket_id])

  useEffect(() => {
    void loadReadIds()
    load()
  }, [load, loadReadIds])

  const markRead = useCallback(
    async (announcementId) => {
      if (!announcementId || !readScopeId) return
      const id = String(announcementId)
      if (readIds.has(id)) return
      const next = new Set(readIds)
      next.add(id)
      setReadIds(next)
      await saveReadAnnouncementIdsAsync(readScopeId, next)
    },
    [readIds, readScopeId],
  )

  const openCreate = useCallback(async () => {
    if (!personel?.ana_sirket_id) {
      Alert.alert('Hata', 'Oturum bilgisi eksik.')
      return
    }
    try {
      const birimCtx = buildBirimHierarchyCtx({
        isSystemAdmin,
        personel,
        permissions,
      })
      const unitRows = await fetchAnnouncementUnits({
        anaSirketId: personel.ana_sirket_id,
        birimHierarchyCtx: birimCtx,
      })
      setUnits(unitRows)
      setCreateText('')
      setCreateOpen(true)
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Birimler yüklenemedi')
    }
  }, [isSystemAdmin, personel, permissions])

  const submitCreate = useCallback(async () => {
    const text = createText.trim()
    if (!text) {
      Alert.alert('Uyarı', 'Duyuru metni boş olamaz.')
      return
    }
    const unitIds = units.map((u) => u.id).filter(Boolean)
    if (!unitIds.length) {
      Alert.alert('Uyarı', 'Hedef birim bulunamadı.')
      return
    }
    setCreating(true)
    try {
      await createAnnouncement({
        anaSirketId: personel.ana_sirket_id,
        gonderenPersonelId: personel.id,
        metin: text,
        hedefBirimIds: unitIds,
      })
      setCreateOpen(false)
      setCreateText('')
      await load()
      Alert.alert('Başarılı', 'Duyuru yayınlandı.')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Duyuru kaydedilemedi')
    } finally {
      setCreating(false)
    }
  }, [createText, units, personel, load])

  const promptQuickCreate = useCallback(() => {
    void openCreate()
  }, [openCreate])

  const renderItem = useCallback(
    ({ item }) => {
      const unread = !readIds.has(String(item.id))
      const dateText = item?.created_at ? new Date(item.created_at).toLocaleString('tr-TR') : '-'
      return (
        <Card
          tone="surface"
          elevated
          onPress={() => markRead(item.id)}
          style={{ marginBottom: spacing.md, opacity: unread ? 1 : 0.92 }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <IconBubble tone="blurple" size="md">
              <Megaphone size={18} color={palette.blurple[600]} strokeWidth={2} />
            </IconBubble>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text variant="bodyLg" weight="SemiBold" color={palette.slate[800]} style={{ flex: 1 }}>
                  {item?.metin || '-'}
                </Text>
                {unread ? (
                  <StatusBadge tone="warning" size="sm">
                    Yeni
                  </StatusBadge>
                ) : null}
              </View>
              <Text variant="caption" color={palette.slate[500]} style={{ marginTop: spacing.xs }}>
                Gönderen: {item?.gonderen_adi || 'Yönetici'}
              </Text>
              <Text variant="caption" color={palette.slate[400]}>
                {dateText}
              </Text>
            </View>
          </View>
        </Card>
      )
    },
    [readIds, markRead],
  )

  if (loading && !items.length) {
    return (
      <AdminScreenLayout title="Duyurular">
        <SkeletonCard />
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Duyurular">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="bodySm" color={palette.slate[500]}>
            {subtitle}
          </Text>
        </View>
        {canCreate ? (
          <Button
            variant="primary"
            size="sm"
            onPress={promptQuickCreate}
            iconLeft={<Plus size={16} color={palette.surface} />}
          >
            Yeni
          </Button>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              load()
            }}
            tintColor={palette.primary[500]}
          />
        }
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
        ListEmptyComponent={
          <EmptyState
            icon={<Bell size={42} color={palette.slate[400]} strokeWidth={1.5} />}
            title="Henüz duyuru yok"
            description="Şirket duyuruları geldikçe bu liste güncellenecek."
          />
        }
      />

      <CenterModal visible={createOpen} onClose={() => !creating && setCreateOpen(false)}>
        <Heading variant="h2" style={{ marginBottom: spacing.sm }}>
          Yeni duyuru
        </Heading>
        <Text variant="caption" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
          {units.length} birime yayınlanır
        </Text>
        <TextInput
          value={createText}
          onChangeText={setCreateText}
          placeholder="Duyuru metni…"
          placeholderTextColor={palette.slate[400]}
          multiline
          style={styles.createInput}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => setCreateOpen(false)}
            disabled={creating}
          >
            Vazgeç
          </Button>
          <Button
            variant="primary"
            size="md"
            style={{ flex: 1 }}
            onPress={submitCreate}
            disabled={creating}
          >
            {creating ? 'Gönderiliyor…' : 'Yayınla'}
          </Button>
        </View>
      </CenterModal>
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  createInput: {
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    color: palette.slate[800],
    backgroundColor: palette.surface,
  },
})
