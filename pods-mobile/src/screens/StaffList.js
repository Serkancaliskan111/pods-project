import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, View, StyleSheet } from 'react-native'
import { Users } from 'lucide-react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { restrictQueryByPersonelBirimHierarchy } from '../lib/supabaseScope'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import { formatFullName } from '../lib/nameFormat'
import { isApprovedTaskStatus } from '../lib/taskStatus'
import {
  Screen,
  Text,
  Heading,
  Card,
  Avatar,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
  CenterModal,
  palette,
  spacing,
  radii,
} from '../ui'

const supabase = getSupabase()

function isCompleted(durum) {
  return isApprovedTaskStatus(durum)
}

function isRedStatus(durum) {
  const s = String(durum || '').trim().toUpperCase()
  return s.includes('REVİZE') || s.includes('REVIZE') || s.includes('RED') || s.includes('REDD')
}

export default function StaffList() {
  const { personel, permissions, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
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

  const birimHierarchyCtx = useMemo(
    () => ({
      isSystemAdmin,
      isTopCompanyScope,
      accessibleUnitIds: Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : [],
      fallbackBirimId: personel?.birim_id ?? null,
    }),
    [isSystemAdmin, isTopCompanyScope, personel?.accessibleUnitIds, personel?.birim_id],
  )

  const tenant = useMemo(
    () => ({ anaSirketId: personel?.ana_sirket_id ?? null, birimId: personel?.birim_id ?? null }),
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
        let staffQuery = supabase
          .from('personeller')
          .select('id, ad, soyad, email, durum')
          .eq('ana_sirket_id', tenant.anaSirketId)
          .is('silindi_at', null)
          .order('ad', { ascending: true })
          .range(pageOffset, pageOffset + PAGE_SIZE - 1)

        staffQuery = restrictQueryByPersonelBirimHierarchy(staffQuery, birimHierarchyCtx)

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

        let tasksQuery = supabase
          .from('isler')
          .select('sorumlu_personel_id, durum, puan')
          .eq('ana_sirket_id', tenant.anaSirketId)
          .in('sorumlu_personel_id', ids)

        tasksQuery = restrictQueryByPersonelBirimHierarchy(tasksQuery, birimHierarchyCtx)

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
          const assigned = (p.completedCount || 0) + (p.redCount || 0) + (p.openCount || 0)
          return {
            ...p,
            assignedCount: assigned,
            successPercent: assigned ? Math.round(((p.completedCount || 0) / assigned) * 100) : 0,
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
    [tenant.anaSirketId, tenant.birimId, isTopCompanyScope, birimHierarchyCtx, loadingMore, loading, PAGE_SIZE],
  )

  useEffect(() => {
    loadPage(0, true)
  }, [loadPage])

  const renderItem = useCallback(({ item }) => {
    const name = formatFullName(item?.ad, item?.soyad, '') || item?.email || 'Personel'
    const isActive = item?.durum === true
    return (
      <Card
        tone="surface"
        elevated
        onPress={() => {
          setSelectedPerson(item)
          setDetailOpen(true)
        }}
        style={{ marginBottom: spacing.md }}
      >
        <View style={styles.headerRow}>
          <Avatar name={name} size="md" />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="bodyLg" weight="Bold" color={palette.slate[800]}>
              {name}
            </Text>
            <Text variant="caption" color={palette.slate[500]}>
              {isActive ? 'Aktif Çalışıyor' : 'Aktif Görevi Yok'}
            </Text>
          </View>
          <StatusBadge tone={isActive ? 'success' : 'soft'} size="sm">
            {isActive ? 'Aktif' : 'Müsait'}
          </StatusBadge>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metric, { backgroundColor: palette.success[50] }]}>
            <Text variant="overline" color={palette.success[700]}>
              Tamamlanan
            </Text>
            <Text variant="h2" weight="ExtraBold" color={palette.success[700]} align="center" style={{ marginTop: 4 }}>
              {item?.completedCount ?? 0}
            </Text>
          </View>
          <View style={[styles.metric, { backgroundColor: palette.primary[50] }]}>
            <Text variant="overline" color={palette.primary[700]}>
              Toplam Puan
            </Text>
            <Text variant="h2" weight="ExtraBold" color={palette.primary[700]} align="center" style={{ marginTop: 4 }}>
              {item?.totalPuan ?? 0}
            </Text>
          </View>
          <View style={[styles.metric, { backgroundColor: palette.slate[50] }]}>
            <Text variant="overline" color={palette.slate[600]}>
              Bekleyen
            </Text>
            <Text variant="h2" weight="ExtraBold" color={palette.slate[700]} align="center" style={{ marginTop: 4 }}>
              {item?.openCount ?? 0}
            </Text>
          </View>
        </View>
      </Card>
    )
  }, [])

  if (loading && people.length === 0) {
    return (
      <Screen padded>
        <Heading variant="h1">Personel Performansı</Heading>
        <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.lg }}>
          Toplam puan, tamamlanan, reddedilen ve bekleyen iş özeti
        </Text>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    )
  }

  return (
    <Screen padded>
      <View style={{ marginBottom: spacing.lg }}>
        <Heading variant="h1">Personel Performansı</Heading>
        <Text variant="bodySm" color={palette.slate[500]}>
          Toplam puan, tamamlanan, reddedilen ve bekleyen iş özeti
        </Text>
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => String(item?.id ?? '')}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadPage(0, true)}
            tintColor={palette.primary[500]}
            colors={[palette.primary[700], palette.accent[500]]}
          />
        }
        onEndReachedThreshold={0.2}
        onEndReached={() => {
          if (!hasMore) return
          if (loadingMore || loading) return
          loadPage(offset, false)
        }}
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: spacing.md }}>
              <ActivityIndicator size="small" color={palette.primary[500]} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={42} color={palette.slate[400]} strokeWidth={1.5} />}
            title="Personel bulunamadı"
            description="Şu anda görüntülenecek personel yok."
          />
        }
      />

      <CenterModal visible={detailOpen} onClose={() => setDetailOpen(false)}>
        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <Avatar
            name={formatFullName(selectedPerson?.ad, selectedPerson?.soyad, '') || selectedPerson?.email || '?'}
            size="lg"
          />
          <Heading variant="h2" align="center" style={{ marginTop: spacing.sm }}>
            {formatFullName(selectedPerson?.ad, selectedPerson?.soyad, '') || selectedPerson?.email || 'Personel'}
          </Heading>
        </View>

        <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
          <View style={styles.statRow}>
            <Text variant="bodySm" color={palette.slate[500]} weight="SemiBold">
              Başarı %
            </Text>
            <Text variant="h2" weight="ExtraBold" color={palette.success[700]}>
              {selectedPerson?.successPercent ?? 0}%
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text variant="bodySm" color={palette.slate[500]} weight="SemiBold">
              Red Oranı %
            </Text>
            <Text variant="h2" weight="ExtraBold" color={palette.danger[600]}>
              {selectedPerson?.redRate ?? 0}%
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text variant="bodySm" color={palette.slate[500]} weight="SemiBold">
              Toplam Puan
            </Text>
            <Text variant="h2" weight="ExtraBold" color={palette.primary[700]}>
              {selectedPerson?.totalPuan ?? 0}
            </Text>
          </View>
        </View>
        <Button variant="primary" size="md" fullWidth onPress={() => setDetailOpen(false)}>
          Kapat
        </Button>
      </CenterModal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  metric: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
})
