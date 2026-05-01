import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { canApproveTaskDeletion } from '../lib/taskDeletion'
import Theme from '../theme/theme'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const supabase = getSupabase()
const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography, Layout } = ThemeObj

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
      .select(
        'id,original_is_id,silindi_at,talep_eden_personel_id,onaylayan_personel_id,snapshot',
      )
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

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const approve = async (id) => {
    setBusyId(id)
    try {
      const { error } = await supabase.rpc('rpc_is_silme_onayla', { p_talep_id: id })
      if (error) throw error
      Alert.alert('Tamam', 'İş silindi ve arşive alındı.')
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
      const { error } = await supabase.rpc('rpc_is_silme_reddet', {
        p_talep_id: id,
        p_red_nedeni: redNedeni,
      })
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
          {
            text: 'Reddet',
            style: 'destructive',
            onPress: (reason) => void runReject(id, reason?.trim() || null),
          },
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
      <View style={styles.center}>
        <Text style={styles.muted}>Bu ekran için iş silme onay yetkisi gerekir.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <PremiumBackgroundPattern />
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>← Geri</Text>
      </TouchableOpacity>
      <Text style={styles.title}>İş silme</Text>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'pending' && styles.tabActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>Bekleyen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'archive' && styles.tabActive]}
          onPress={() => setTab('archive')}
        >
          <Text style={[styles.tabText, tab === 'archive' && styles.tabTextActive]}>Silinenler</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : tab === 'pending' ? (
        <FlatList
          data={pending}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.muted}>Bekleyen talep yok.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item._title}</Text>
              <Text style={styles.meta}>Talep: {item._requester}</Text>
              <Text style={styles.meta}>
                {item.created_at ? new Date(item.created_at).toLocaleString('tr-TR') : ''}
              </Text>
              {item.talep_aciklama ? <Text style={styles.meta}>{item.talep_aciklama}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => item.is_id && navigation.navigate('TaskDetail', { taskId: item.is_id })}
                  disabled={!item.is_id}
                >
                  <Text style={styles.linkBtnText}>Görev</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dangerBtn}
                  disabled={busyId === item.id}
                  onPress={() =>
                    Alert.alert(
                      'Onay',
                      'Bu iş kalıcı olarak silinsin mi?',
                      [
                        { text: 'Vazgeç', style: 'cancel' },
                        { text: 'Sil', style: 'destructive', onPress: () => void approve(item.id) },
                      ],
                    )
                  }
                >
                  <Text style={styles.dangerBtnText}>
                    {busyId === item.id ? '…' : 'Onayla'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.outlineBtn}
                  disabled={busyId === item.id}
                  onPress={() => reject(item.id)}
                >
                  <Text style={styles.outlineBtnText}>Red</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={archive}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.muted}>Kayıt yok.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item._title}</Text>
              <Text style={styles.meta}>Durum: {item._durum}</Text>
              <Text style={styles.meta}>Orijinal ID: {item.original_is_id}</Text>
              <Text style={styles.meta}>
                {item.silindi_at ? new Date(item.silindi_at).toLocaleString('tr-TR') : ''}
              </Text>
              <Text style={styles.meta}>
                {item._requester} → {item._approver}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: Colors.mutedText, fontSize: Typography.caption.fontSize },
  backBtn: { alignSelf: 'flex-start', marginBottom: 8, paddingVertical: 8 },
  backBtnText: { color: Colors.primary, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tab: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  tabActive: { borderColor: Colors.primary, backgroundColor: Colors.alpha.indigo06 },
  tabText: { fontWeight: '700', color: Colors.mutedText, fontSize: 12 },
  tabTextActive: { color: Colors.primary, fontSize: 12 },
  card: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Layout.borderRadius.lg,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Colors.surface,
  },
  cardTitle: { fontWeight: '800', color: Colors.text, marginBottom: 6 },
  meta: { fontSize: Typography.caption.fontSize, color: Colors.textSecondary, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.alpha.gray25,
  },
  linkBtnText: { fontWeight: '700', color: Colors.primary, fontSize: 12 },
  dangerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.borderRadius.full,
    backgroundColor: '#dc2626',
  },
  dangerBtnText: { fontWeight: '800', color: '#fff', fontSize: 12 },
  outlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.borderRadius.full,
    borderWidth: 1,
    borderColor: '#94a3b8',
  },
  outlineBtnText: { fontWeight: '700', color: Colors.text, fontSize: 12 },
})
