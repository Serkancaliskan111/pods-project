import React, { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, Platform, TouchableOpacity, View, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, Inbox, Trash2, ArrowRight } from 'lucide-react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { canApproveTaskDeletion } from '../lib/taskDeletion'
import {
  Screen,
  Text,
  Heading,
  Card,
  Button,
  Chip,
  StatusBadge,
  EmptyState,
  SkeletonCard,
  palette,
  spacing,
} from '../ui'

const supabase = getSupabase()

export default function TaskDeletionCenter() {
  const navigation = useNavigation()
  const { permissions } = useAuth()
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [archive, setArchive] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const allowed = canApproveTaskDeletion(permissions)

  const loadPending = useCallback(async () => {
    const { data, error } = await supabase
      .from('isler_silme_talepleri')
      .select('id,is_id,talep_aciklama,created_at,talep_eden_personel_id')
      .eq('durum', 'bekliyor')
      .order('created_at', { ascending: false })
    if (error) throw error
    const rows = data || []
    const jobIds = [...new Set(rows.map((r) => r.is_id).filter(Boolean))]
    let jobMap = {}
    if (jobIds.length) {
      const { data: jobs } = await supabase.from('isler').select('id,baslik').in('id', jobIds)
      jobMap = Object.fromEntries((jobs || []).map((j) => [j.id, j.baslik]))
    }
    const pids = [...new Set(rows.map((r) => r.talep_eden_personel_id).filter(Boolean))]
    let nameMap = {}
    if (pids.length) {
      const { data: people } = await supabase.from('personeller').select('id,ad,soyad').in('id', pids)
      nameMap = Object.fromEntries(
        (people || []).map((p) => [p.id, p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id)]),
      )
    }
    setPending(
      rows.map((r) => ({
        ...r,
        _title: jobMap[r.is_id] || '—',
        _requester: nameMap[r.talep_eden_personel_id] || '—',
      })),
    )
  }, [])

  const loadArchive = useCallback(async () => {
    const { data, error } = await supabase
      .from('silinen_isler')
      .select('id,original_is_id,silindi_at,talep_eden_personel_id,onaylayan_personel_id,snapshot')
      .order('silindi_at', { ascending: false })
      .limit(300)
    if (error) throw error
    const rows = data || []
    const ids = [...new Set(rows.flatMap((r) => [r.talep_eden_personel_id, r.onaylayan_personel_id]).filter(Boolean))]
    let nameMap = {}
    if (ids.length) {
      const { data: people } = await supabase.from('personeller').select('id,ad,soyad').in('id', ids)
      nameMap = Object.fromEntries(
        (people || []).map((p) => [p.id, p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id)]),
      )
    }
    setArchive(
      rows.map((r) => {
        const snap = r.snapshot && typeof r.snapshot === 'object' ? r.snapshot : {}
        return {
          ...r,
          _title: snap.baslik || '(başlıksız)',
          _durum: snap.durum || '—',
          _requester: nameMap[r.talep_eden_personel_id] || '—',
          _approver: nameMap[r.onaylayan_personel_id] || '—',
        }
      }),
    )
  }, [])

  const refresh = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    try {
      await Promise.all([loadPending(), loadArchive()])
    } catch (e) {
      console.warn(e)
      Alert.alert('Hata', e?.message || 'Veriler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [allowed, loadPending, loadArchive])

  useEffect(() => {
    refresh()
  }, [refresh])

  const approve = async (id) => {
    setBusyId(id)
    try {
      const { error } = await supabase.rpc('rpc_is_silme_onayla', { p_talep_id: id })
      if (error) throw error
      Alert.alert('Tamam', 'Görev silindi ve arşive alındı.')
      await refresh()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Onay başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const runReject = async (id, redNedeni) => {
    setBusyId(id)
    try {
      const { error } = await supabase.rpc('rpc_is_silme_reddet', { p_talep_id: id, p_red_nedeni: redNedeni })
      if (error) throw error
      Alert.alert('Tamam', 'Talep reddedildi.')
      await refresh()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Red başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const reject = (id) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Reddet',
        'İsteğe bağlı red nedeni:',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Reddet', style: 'destructive', onPress: (reason) => void runReject(id, reason?.trim() || null) },
        ],
        'plain-text',
      )
      return
    }
    Alert.alert('Reddet', 'Bu talebi reddetmek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Reddet', style: 'destructive', onPress: () => void runReject(id, null) },
    ])
  }

  if (!allowed) {
    return (
      <Screen padded>
        <EmptyState
          icon={<Trash2 size={42} color={palette.slate[400]} strokeWidth={1.5} />}
          title="Yetki gerekiyor"
          description="Bu ekran için görev silme onay yetkisi gerekir."
          action={
            <Button variant="ghost" size="sm" onPress={() => navigation.goBack()}>
              Geri Dön
            </Button>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen padded bottomInset>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={24} color={palette.primary[700]} strokeWidth={2} />
        </TouchableOpacity>
        <Heading variant="h1" style={{ flex: 1, marginLeft: spacing.sm }}>
          Görev Silme
        </Heading>
      </View>

      <View style={styles.tabRow}>
        <Chip selected={tab === 'pending'} onPress={() => setTab('pending')}>
          Bekleyen
        </Chip>
        <Chip selected={tab === 'archive'} onPress={() => setTab('archive')}>
          Silinenler
        </Chip>
      </View>

      {loading ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : tab === 'pending' ? (
        <FlatList
          data={pending}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <EmptyState
              icon={<Inbox size={42} color={palette.slate[400]} strokeWidth={1.5} />}
              title="Bekleyen talep yok"
              description="Yeni silme talebi geldiğinde burada görünecek."
            />
          }
          renderItem={({ item }) => (
            <Card tone="surface" elevated style={{ marginBottom: spacing.md }}>
              <Text variant="bodyLg" weight="Bold" color={palette.slate[800]} style={{ marginBottom: spacing.xs }}>
                {item._title}
              </Text>
              <Text variant="caption" color={palette.slate[500]}>
                Talep: {item._requester}
              </Text>
              <Text variant="caption" color={palette.slate[400]}>
                {item.created_at ? new Date(item.created_at).toLocaleString('tr-TR') : ''}
              </Text>
              {item.talep_aciklama ? (
                <Text variant="bodySm" color={palette.slate[600]} style={{ marginTop: spacing.sm }}>
                  {item.talep_aciklama}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => item.is_id && navigation.navigate('TaskDetail', { taskId: item.is_id })}
                  disabled={!item.is_id}
                >
                  Görev
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busyId === item.id}
                  onPress={() =>
                    Alert.alert('Onay', 'Bu görev kalıcı olarak silinsin mi?', [
                      { text: 'Vazgeç', style: 'cancel' },
                      { text: 'Sil', style: 'destructive', onPress: () => void approve(item.id) },
                    ])
                  }
                >
                  Onayla
                </Button>
                <Button variant="outline" size="sm" disabled={busyId === item.id} onPress={() => reject(item.id)}>
                  Red
                </Button>
              </View>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={archive}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <EmptyState
              icon={<Trash2 size={42} color={palette.slate[400]} strokeWidth={1.5} />}
              title="Arşivde kayıt yok"
              description="Silme onayı verildikçe burada listelenir."
            />
          }
          renderItem={({ item }) => (
            <Card tone="soft" style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                <Text variant="bodyLg" weight="Bold" color={palette.slate[800]} style={{ flex: 1 }}>
                  {item._title}
                </Text>
                <StatusBadge tone="danger">{item._durum || 'silindi'}</StatusBadge>
              </View>
              <Text variant="caption" color={palette.slate[500]}>
                Orijinal ID: {item.original_is_id}
              </Text>
              <Text variant="caption" color={palette.slate[400]}>
                {item.silindi_at ? new Date(item.silindi_at).toLocaleString('tr-TR') : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs }}>
                <Text variant="caption" color={palette.slate[500]}>{item._requester}</Text>
                <ArrowRight size={12} color={palette.slate[400]} strokeWidth={2} />
                <Text variant="caption" color={palette.slate[500]}>{item._approver}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backBtn: {
    padding: 4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
})
