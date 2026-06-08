import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  View,
  StyleSheet,
} from 'react-native'
import { useRoute } from '@react-navigation/native'
import { Wifi, WifiOff } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canManageStaff } from '../../../lib/permissions'
import {
  formatRelativeTime,
  formatTs,
  isPresenceFresh,
  getRangeStart,
  computeOnlineDurationMetrics,
  buildPresenceMetricCards,
  groupActivityLogs,
} from '../../../lib/presenceUtils'
import { formatFullName } from '../../../lib/nameFormat'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Heading,
  Text,
  Card,
  StatusBadge,
  Avatar,
  MetricCard,
  EmptyState,
  palette,
  spacing,
} from '../../../ui'

const supabase = getSupabase()
const REFRESH_MS = 5000

const PERSON_SELECT =
  'id,ad,soyad,email,personel_kodu,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at'

export default function PresenceDetail() {
  const route = useRoute()
  const personId = route.params?.personId
  const { profile, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const canTrackPresence = canManageStaff(permissions, isSystemAdmin)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [person, setPerson] = useState(null)
  const [logs, setLogs] = useState([])

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!personId || !canTrackPresence) return
      if (!silent) setLoading(true)
      try {
        const rangeStart = getRangeStart('week')

        const [{ data: personRow, error: personErr }, { data: logRows, error: logErr }] =
          await Promise.all([
            supabase.from('personeller').select(PERSON_SELECT).eq('id', personId).maybeSingle(),
            supabase
              .from('personel_online_kayitlari')
              .select('id,durum,kaydedildi_at')
              .eq('personel_id', personId)
              .gte('kaydedildi_at', rangeStart.toISOString())
              .order('kaydedildi_at', { ascending: true })
              .limit(500),
          ])

        if (personErr) throw personErr
        setPerson(personRow || null)

        if (logErr?.code === '42P01') {
          setLogs([])
        } else if (logErr) {
          console.warn(logErr)
          setLogs([])
        } else {
          setLogs(logRows || [])
        }
      } catch (e) {
        if (!silent) Alert.alert('Hata', e?.message || 'Yüklenemedi')
      } finally {
        if (!silent) setLoading(false)
        setRefreshing(false)
      }
    },
    [personId, canTrackPresence],
  )

  useEffect(() => {
    if (!canTrackPresence) return
    void load()
    const id = setInterval(() => void load({ silent: true }), REFRESH_MS)
    return () => clearInterval(id)
  }, [canTrackPresence, load])

  const fullName = useMemo(() => {
    if (!person) return 'Personel'
    return formatFullName(person.ad, person.soyad, '') || person.email || person.personel_kodu || 'Personel'
  }, [person])

  const isOnline = isPresenceFresh(person?.mobil_last_seen_at)

  const metrics = useMemo(() => {
    if (!logs.length && !person) return null
    const rangeStart = getRangeStart('week')
    const rangeEnd = new Date()
    const beforeRangeLog = null
    return computeOnlineDurationMetrics(logs, {
      beforeRangeLog,
      rangeStart,
      rangeEnd,
      lastSeenAt: person?.mobil_last_seen_at,
      isCurrentlyFresh: isOnline,
    })
  }, [logs, person, isOnline])

  const metricCards = useMemo(
    () => (metrics ? buildPresenceMetricCards('week', metrics) : []),
    [metrics],
  )

  const { recent, earlier } = useMemo(() => groupActivityLogs(logs, { recentMinutes: 60 }), [logs])

  const historyData = useMemo(() => {
    const rows = []
    if (recent.length) {
      rows.push({ type: 'header', key: 'h-recent', label: 'Son 1 saat' })
      for (const log of recent) rows.push({ type: 'log', key: `r-${log.id || log.kaydedildi_at}`, log })
    }
    if (earlier.length) {
      rows.push({ type: 'header', key: 'h-earlier', label: 'Daha önce (bu hafta)' })
      for (const log of earlier.slice(-40)) {
        rows.push({ type: 'log', key: `e-${log.id || log.kaydedildi_at}`, log })
      }
    }
    return rows
  }, [recent, earlier])

  const renderHistoryRow = useCallback(({ item: row }) => {
    if (row.type === 'header') {
      return (
        <Text
          variant="overline"
          color={palette.slate[500]}
          weight="Bold"
          style={{ marginTop: spacing.md, marginBottom: spacing.sm }}
        >
          {row.label}
        </Text>
      )
    }
    const log = row.log
    const online = log.durum === 'online'
    return (
      <View style={styles.logRow}>
        <StatusBadge tone={online ? 'success' : 'soft'} size="sm">
          {online ? 'Online' : 'Offline'}
        </StatusBadge>
        <Text variant="caption" color={palette.slate[500]}>
          {formatTs(log.kaydedildi_at)}
        </Text>
      </View>
    )
  }, [])

  if (!canTrackPresence) {
    return (
      <AdminScreenLayout title="Canlı durum">
        <EmptyState title="Yetki gerekli" description="Personel yönetim yetkisi gerekir." />
      </AdminScreenLayout>
    )
  }

  if (loading && !person) {
    return (
      <AdminScreenLayout title="Canlı durum">
        <ActivityIndicator color={palette.primary[500]} />
      </AdminScreenLayout>
    )
  }

  if (!person) {
    return (
      <AdminScreenLayout title="Canlı durum">
        <EmptyState title="Bulunamadı" description="Personel kaydı yok." />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title={fullName}>
      <View style={styles.hero}>
        <Avatar name={fullName} size="lg" />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text variant="caption" color={palette.slate[500]}>
            {person.email || person.personel_kodu || ''}
          </Text>
          <StatusBadge
            tone={isOnline ? 'success' : 'soft'}
            size="sm"
            style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
          >
            {isOnline ? 'Online' : 'Offline'}
          </StatusBadge>
        </View>
      </View>

      <Card tone="surface" elevated style={{ marginBottom: spacing.lg }}>
        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <Text variant="overline" color={palette.slate[500]}>
              Son görülme
            </Text>
            <Text variant="h2" weight="Bold" color={palette.slate[800]}>
              {formatRelativeTime(person.mobil_last_seen_at)}
            </Text>
            <Text variant="caption" color={palette.slate[400]}>
              {formatTs(person.mobil_last_seen_at)}
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text variant="overline" color={palette.slate[500]}>
              Son çevrimdışı
            </Text>
            <Text variant="h2" weight="Bold" color={palette.slate[800]}>
              {person.mobil_last_offline_at
                ? formatRelativeTime(person.mobil_last_offline_at)
                : '—'}
            </Text>
            {person.mobil_last_offline_at ? (
              <Text variant="caption" color={palette.slate[400]}>
                {formatTs(person.mobil_last_offline_at)}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {metricCards.length ? (
        <View style={styles.metricsRow}>
          {metricCards.map((m) => (
            <MetricCard
              key={m.label}
              label={m.label}
              value={String(m.value)}
              tone={m.tone || 'surface'}
              style={{ flex: 1, minWidth: '45%' }}
            />
          ))}
        </View>
      ) : null}

      <Heading variant="h3" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Bağlantı geçmişi
      </Heading>

      <FlatList
        data={historyData}
        keyExtractor={(row) => row.key}
        renderItem={renderHistoryRow}
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
        ListEmptyComponent={
          <EmptyState
            icon={
              isOnline ? (
                <Wifi size={36} color={palette.success[600]} />
              ) : (
                <WifiOff size={36} color={palette.slate[400]} />
              )
            }
            title="Kayıt yok"
            description="Bu hafta için bağlantı logu bulunamadı."
          />
        }
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
      />
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statGrid: {
    gap: spacing.lg,
  },
  statCell: {
    marginBottom: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
})
