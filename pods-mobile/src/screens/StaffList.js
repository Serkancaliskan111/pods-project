import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from 'react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import { formatFullName } from '../lib/nameFormat'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const supabase = getSupabase()

const ThemeObj = Theme?.default ?? Theme
const { Colors, Layout, Typography } = ThemeObj
const SLATE_950 = Colors.background
const INDIGO_600 = Colors.primary
const EMERALD_500 = Colors.success
const ROSE_500 = Colors.error
const MUTED = Colors.mutedText

function isCompleted(durum) {
  const d = String(durum || '').trim().toUpperCase()
  return d.includes('TAMAM') || d.includes('TAMAMLANDI') || d.includes('TAMAMLANDI') || d.includes('COMPLETED')
}

function isRedStatus(durum) {
  const s = String(durum || '').trim().toUpperCase()
  return s.includes('REVİZE') || s.includes('REVIZE') || s.includes('RED') || s.includes('REDD')
}

export default function StaffList() {
  const { personel, permissions } = useAuth()
  const PAGE_SIZE = 20
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [people, setPeople] = useState([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )

  const tenant = useMemo(
    () => ({
      anaSirketId: personel?.ana_sirket_id ?? null,
      birimId: personel?.birim_id ?? null,
    }),
    [personel?.ana_sirket_id, personel?.birim_id],
  )

  const loadPage = useCallback(
    async (pageOffset, reset) => {
    if (!tenant.anaSirketId) {
        if (reset) setPeople([])
        if (reset) setLoading(false)
      return
    }

    if (!isTopCompanyScope && !tenant.birimId) {
        if (reset) setPeople([])
        if (reset) setLoading(false)
      return
    }
    if (!reset && loadingMore) return
    if (!reset && loading) return

    if (reset) {
      setLoading(true)
      setRefreshing(false)
      setHasMore(true)
      setOffset(0)
    } else {
      setLoadingMore(true)
    }

    try {
      // Personel listesi sayfalama: staff sayfası başına 20 kişi
      let staffQuery = supabase
        .from('personeller')
        .select('id, ad, soyad, email, durum')
        .eq('ana_sirket_id', tenant.anaSirketId)
        .is('silindi_at', null)
        .order('ad', { ascending: true })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1)

      if (!isTopCompanyScope) {
        staffQuery = staffQuery.eq('birim_id', tenant.birimId)
      }

      const { data: staffData, error: staffErr } = await staffQuery

      if (staffErr) {
        if (__DEV__) console.warn('StaffList staff load error', staffErr)
        if (reset) setPeople([])
        return
      }

      const staff = staffData || []
      const nextHasMore = staff.length === PAGE_SIZE
      setHasMore(nextHasMore)

      const ids = staff.map((p) => p.id).filter(Boolean)
      const basePeople = staff.map((p) => ({
        ...p,
        totalPuan: 0,
        completedCount: 0,
        redCount: 0,
        openCount: 0,
        assignedCount: 0,
        successPercent: 0,
        redRate: 0,
      }))

      if (!ids.length) {
        if (reset) setPeople(basePeople)
        else setPeople((prev) => [...prev, ...basePeople])
        setOffset(pageOffset + staff.length)
        return
      }

      // Seçili personellerin işlerini çekip metrikleri hesapla
      let tasksQuery = supabase
        .from('isler')
        .select('sorumlu_personel_id, durum, puan')
        .eq('ana_sirket_id', tenant.anaSirketId)
        .in('sorumlu_personel_id', ids)

      if (!isTopCompanyScope) {
        tasksQuery = tasksQuery.eq('birim_id', tenant.birimId)
      }

      const { data: tasksData, error: tasksErr } = await tasksQuery
      if (tasksErr) {
        if (__DEV__) console.warn('StaffList tasks load error', tasksErr)
        if (reset) setPeople(basePeople)
        else setPeople((prev) => [...prev, ...basePeople])
        setOffset(pageOffset + staff.length)
        return
      }

      const byPerson = {}
      for (const p of basePeople) byPerson[p.id] = { ...p }

      for (const t of tasksData || []) {
        const pid = t?.sorumlu_personel_id
        if (!pid || !byPerson[pid]) continue
        const done = isCompleted(t?.durum)
        if (done) {
          byPerson[pid].completedCount += 1
          byPerson[pid].totalPuan += Number(t?.puan) || 0
        } else if (isRedStatus(t?.durum)) {
          byPerson[pid].redCount += 1
        } else {
          byPerson[pid].openCount += 1
        }
      }

      const out = Object.values(byPerson).map((p) => {
        const assigned =
          (p.completedCount || 0) + (p.redCount || 0) + (p.openCount || 0)
        return {
          ...p,
          assignedCount: assigned,
          successPercent: assigned
            ? Math.round(((p.completedCount || 0) / assigned) * 100)
            : 0,
          redRate: assigned ? Math.round(((p.redCount || 0) / assigned) * 100) : 0,
        }
      })

      if (reset) setPeople(out)
      else setPeople((prev) => [...prev, ...out])

      setOffset(pageOffset + staff.length)
    } catch (e) {
      if (__DEV__) console.warn('StaffList load error', e)
      if (reset) setPeople([])
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
    },
    [tenant.anaSirketId, tenant.birimId, isTopCompanyScope, loadingMore, loading, PAGE_SIZE],
  )

  useEffect(() => {
    loadPage(0, true)
  }, [loadPage])

  const renderItem = useCallback(
    ({ item }) => {
    const name = formatFullName(item?.ad, item?.soyad, '') || item?.email || 'Personel'
    const isActive = item?.durum === true
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => {
          setSelectedPerson(item)
          setDetailOpen(true)
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.sub}>
              Görev Durumu: {isActive ? 'Aktif Çalışıyor' : 'Aktif Görevi Yok'}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              { backgroundColor: isActive ? EMERALD_500 : ROSE_500, color: SLATE_950 },
            ]}
          >
            <Text style={styles.badgeText}>{isActive ? 'Aktif' : 'Müsait'}</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Tamamlanan</Text>
            <Text style={[styles.metricValue, { color: EMERALD_500 }]}>{item?.completedCount ?? 0}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Toplam Puan</Text>
            <Text style={[styles.metricValue, { color: INDIGO_600 }]}>
              {item?.totalPuan ?? 0}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Bekleyen İş</Text>
            <Text style={[styles.metricValue, { color: MUTED }]}>{item?.openCount ?? 0}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
    },
    [],
  )

  if (loading && people.length === 0) {
    return (
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonSubtitle} />
        </View>
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonLineLg} />
              <View style={styles.skeletonLineMd} />
              <View style={styles.skeletonRow} />
            </View>
          ))}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <PremiumBackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.title}>Personel Performansı</Text>
        <Text style={styles.subtitle}>Toplam puan, tamamlanan, reddedilen ve bekleyen iş özeti</Text>
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => String(item?.id ?? '')}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadPage(0, true)}
          />
        }
        onEndReachedThreshold={0.2}
        onEndReached={() => {
          if (!hasMore) return
          if (loadingMore || loading) return
          loadPage(offset, false)
        }}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator size={22} color={INDIGO_600} />
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>Personel bulunamadı.</Text>}
      />

      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {formatFullName(selectedPerson?.ad, selectedPerson?.soyad, '') || selectedPerson?.email || 'Personel'}
            </Text>

            <Text style={styles.modalSection}>Başarı %</Text>
            <Text style={[styles.modalBig, { color: EMERALD_500 }]}>{selectedPerson?.successPercent ?? 0}%</Text>

            <Text style={styles.modalSection}>Red Oranı %</Text>
            <Text style={[styles.modalBig, { color: ROSE_500 }]}>{selectedPerson?.redRate ?? 0}%</Text>

            <Text style={styles.modalSection}>Toplam Kazanılan Puan</Text>
            <Text style={[styles.modalBig, { color: INDIGO_600 }]}>{selectedPerson?.totalPuan ?? 0}</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailOpen(false)} activeOpacity={0.85}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: SLATE_950, paddingHorizontal: 16, paddingTop: 16 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 12 },
  title: { fontSize: Typography.heading.fontSize, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  subtitle: { color: MUTED, fontSize: Typography.caption.fontSize },
  listContent: { paddingBottom: 28 },
  empty: { color: MUTED, textAlign: 'center', marginTop: 28 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  name: { color: Colors.text, fontSize: Typography.body.fontSize, fontWeight: '800', marginBottom: 4 },
  sub: { color: MUTED, fontSize: Typography.caption.fontSize },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: Typography.caption.fontSize, fontWeight: '800' },
  badgeText: { fontSize: Typography.caption.fontSize, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  metric: { flex: 1, backgroundColor: Colors.alpha.indigo06, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10 },
  metricLabel: { color: MUTED, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  metricValue: { fontSize: Typography.subheading.fontSize, fontWeight: '900', marginTop: 4, textAlign: 'center' },

  // Skeleton
  skeletonTitle: { height: 22, width: 200, backgroundColor: Colors.alpha.gray35, borderRadius: 10, marginBottom: 10 },
  skeletonSubtitle: { height: 14, width: 260, backgroundColor: Colors.alpha.gray25, borderRadius: 10, marginBottom: 16 },
  skeletonCard: {
    backgroundColor: Colors.alpha.slate1555,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  skeletonLineLg: { height: 16, width: '70%', backgroundColor: Colors.alpha.gray25, borderRadius: 8, marginBottom: 10 },
  skeletonLineMd: { height: 12, width: '50%', backgroundColor: Colors.alpha.gray20, borderRadius: 8, marginBottom: 12 },
  skeletonRow: { height: 10, width: '100%', backgroundColor: Colors.alpha.gray18, borderRadius: 999 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.alpha.black55,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  modalTitle: { color: Colors.text, fontWeight: '900', fontSize: Typography.subheading.fontSize, marginBottom: 12 },
  modalSection: { color: MUTED, fontWeight: '800', fontSize: Typography.caption.fontSize, marginTop: 10, marginBottom: 6 },
  modalBig: { fontSize: Typography.heading.fontSize, fontWeight: '900', marginBottom: 4 },
  modalActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' },
  modalCloseBtn: {
    backgroundColor: INDIGO_600,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  modalCloseText: { color: Colors.text, fontWeight: '900', fontSize: Typography.caption.fontSize },
})

