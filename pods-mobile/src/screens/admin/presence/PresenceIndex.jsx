import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canManageStaff } from '../../../lib/permissions'
import {
  enrichScopeWithJunctionPersonelIds,
  scopeBirimlerQuery,
  scopePersonelQuery,
} from '../../../lib/supabaseScope'
import { resolveStaffOnlineState, formatRelativeTime } from '../../../lib/presenceUtils'
import { formatFullName } from '../../../lib/nameFormat'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import PresenceUnitFilterModal from '../../../components/admin/PresenceUnitFilterModal'
import {
  Text,
  Card,
  StatusBadge,
  Avatar,
  EmptyState,
  SkeletonCard,
  Icon,
  palette,
  spacing,
  radii,
} from '../../../ui'

const supabase = getSupabase()
const REFRESH_MS = 2500

const LIST_MODES = [
  { id: 'all', label: 'Tümü' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
]

function isMissingPresenceColumnsError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42703' ||
    msg.includes('mobil_online') ||
    msg.includes('mobil_online_at') ||
    msg.includes('mobil_last_seen_at') ||
    msg.includes('mobil_last_offline_at')
  )
}

function isMissingPresenceLogTableError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return error?.code === '42P01' || msg.includes('personel_online_kayitlari')
}

export default function PresenceIndex() {
  const navigation = useNavigation()
  const { profile, personel, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const canTrackPresence = canManageStaff(permissions, isSystemAdmin)
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []

  const scope = useMemo(
    () => ({ isSystemAdmin, currentCompanyId, accessibleUnitIds }),
    [isSystemAdmin, currentCompanyId, JSON.stringify(accessibleUnitIds || [])],
  )

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [presenceColumnsAvailable, setPresenceColumnsAvailable] = useState(true)
  const [logsTableAvailable, setLogsTableAvailable] = useState(true)
  const [staffRows, setStaffRows] = useState([])
  const [units, setUnits] = useState([])
  const [search, setSearch] = useState('')
  const [listMode, setListMode] = useState('all')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [unitModalOpen, setUnitModalOpen] = useState(false)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!canTrackPresence) return
      if (!silent) setLoading(true)
      try {
        let unitsQuery = supabase
          .from('birimler')
          .select('id,birim_adi,ana_sirket_id')
          .is('silindi_at', null)
        unitsQuery = scopeBirimlerQuery(unitsQuery, scope)

        const scoped = await enrichScopeWithJunctionPersonelIds(supabase, scope)
        const personSelect = presenceColumnsAvailable
          ? 'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at'
          : 'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id'

        let personQuery = supabase.from('personeller').select(personSelect).is('silindi_at', null)
        personQuery = scopePersonelQuery(personQuery, scoped)

        let { data: personeller, error: personelErr } = await personQuery
        if (personelErr && isMissingPresenceColumnsError(personelErr)) {
          setPresenceColumnsAvailable(false)
          let fallback = supabase
            .from('personeller')
            .select('id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id')
            .is('silindi_at', null)
          fallback = scopePersonelQuery(fallback, scoped)
          const fb = await fallback
          personeller = fb.data
          personelErr = fb.error
        }
        if (personelErr) throw personelErr

        const { data: unitsData, error: unitsErr } = await unitsQuery
        if (!unitsErr) setUnits(unitsData || [])

        const people = personeller || []
        const personIds = people.map((p) => p.id).filter(Boolean)
        const latestByPerson = new Map()

        if (logsTableAvailable && personIds.length) {
          const { data: logRows, error: logErr } = await supabase
            .from('personel_online_kayitlari')
            .select('personel_id,durum,kaydedildi_at')
            .order('kaydedildi_at', { ascending: false })
            .limit(300)
            .in('personel_id', personIds)

          if (logErr) {
            if (isMissingPresenceLogTableError(logErr)) {
              setLogsTableAvailable(false)
            } else if (!silent) {
              console.warn(logErr)
            }
          } else {
            for (const item of logRows || []) {
              if (!item?.personel_id) continue
              if (!latestByPerson.has(item.personel_id)) latestByPerson.set(item.personel_id, item)
            }
          }
        }

        setStaffRows(
          people.map((p) => {
            const latestLog = latestByPerson.get(p.id)
            return {
              ...p,
              ...resolveStaffOnlineState(p, latestLog, { presenceColumnsAvailable }),
            }
          }),
        )
      } catch (e) {
        if (!silent) Alert.alert('Hata', e?.message || 'Canlı durum yüklenemedi')
      } finally {
        if (!silent) setLoading(false)
        setRefreshing(false)
      }
    },
    [canTrackPresence, logsTableAvailable, presenceColumnsAvailable, scope],
  )

  useEffect(() => {
    if (!canTrackPresence) return
    void load()
    const id = setInterval(() => void load({ silent: true }), REFRESH_MS)
    return () => clearInterval(id)
  }, [canTrackPresence, load])

  const unitName = useCallback(
    (birimId) => units.find((u) => String(u.id) === String(birimId))?.birim_adi || '—',
    [units],
  )

  const selectedUnitLabel = selectedUnitId
    ? unitName(selectedUnitId)
    : 'Tüm birimler'

  const presenceStats = useMemo(() => {
    const online = staffRows.filter((p) => p.mobil_online).length
    return { online, offline: staffRows.length - online, total: staffRows.length }
  }, [staffRows])

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = [...staffRows]

    if (listMode === 'online') base = base.filter((p) => p.mobil_online)
    else if (listMode === 'offline') base = base.filter((p) => !p.mobil_online)

    if (selectedUnitId) {
      base = base.filter((p) => String(p.birim_id || '') === String(selectedUnitId))
    }

    if (q) {
      base = base.filter((p) => {
        const text = `${p.ad || ''} ${p.soyad || ''} ${p.email || ''} ${p.personel_kodu || ''}`.toLowerCase()
        return text.includes(q)
      })
    }

    base.sort((a, b) => {
      if (a.mobil_online !== b.mobil_online) return a.mobil_online ? -1 : 1
      const ta = a.mobil_last_seen_at ? new Date(a.mobil_last_seen_at).getTime() : 0
      const tb = b.mobil_last_seen_at ? new Date(b.mobil_last_seen_at).getTime() : 0
      return tb - ta
    })

    return base
  }, [staffRows, search, listMode, selectedUnitId])

  const renderItem = useCallback(
    ({ item: p }) => {
      const name = formatFullName(p.ad, p.soyad, '') || p.email || p.personel_kodu || 'Personel'
      const seen = formatRelativeTime(p.mobil_last_seen_at)
      return (
        <Card
          tone="surface"
          elevated
          onPress={() => navigation.navigate('PresenceDetail', { personId: p.id })}
          style={styles.personCard}
          padding="sm"
        >
          <View style={styles.row}>
            <View style={styles.avatarCol}>
              <Avatar name={name} size="sm" />
              <View style={[styles.liveDot, p.mobil_online ? styles.liveDotOn : styles.liveDotOff]} />
            </View>
            <View style={styles.personMeta}>
              <Text variant="bodySm" weight="SemiBold" color={palette.slate[900]} numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
                {unitName(p.birim_id)}
              </Text>
              <Text variant="caption" color={palette.slate[400]} numberOfLines={1}>
                {seen}
              </Text>
            </View>
            <StatusBadge tone={p.mobil_online ? 'success' : 'soft'} size="sm">
              {p.mobil_online ? 'Online' : 'Offline'}
            </StatusBadge>
          </View>
        </Card>
      )
    },
    [navigation, unitName],
  )

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.statsRow}>
        <View style={[styles.statChip, styles.statChipOnline]}>
          <Icon.Online size={14} color={palette.success[700]} strokeWidth={2.2} />
          <Text variant="caption" weight="Bold" color={palette.success[800]}>
            {presenceStats.online}
          </Text>
          <Text variant="caption" color={palette.success[700]}>Online</Text>
        </View>
        <View style={styles.statChip}>
          <Icon.Offline size={14} color={palette.slate[600]} strokeWidth={2.2} />
          <Text variant="caption" weight="Bold" color={palette.slate[800]}>
            {presenceStats.offline}
          </Text>
          <Text variant="caption" color={palette.slate[500]}>Offline</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); load() }}>
          <Icon.Refresh size={18} color={palette.primary[700]} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Icon.Search size={16} color={palette.slate[400]} strokeWidth={2} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Ara…"
          placeholderTextColor={palette.slate[400]}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        <View style={styles.segment}>
          {LIST_MODES.map((m) => {
            const active = listMode === m.id
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setListMode(m.id)}
              >
                <Text variant="caption" weight={active ? 'Bold' : 'Medium'} color={active ? palette.primary[700] : palette.slate[600]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {units.length > 0 ? (
          <TouchableOpacity style={styles.unitBtn} onPress={() => setUnitModalOpen(true)}>
            <Text variant="caption" weight="SemiBold" color={palette.slate[700]} numberOfLines={1}>
              {selectedUnitLabel}
            </Text>
            <Icon.Down size={14} color={palette.slate[500]} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text variant="overline" color={palette.slate[400]} style={styles.listHint}>
        {filteredStaff.length} sonuç
      </Text>
    </View>
  )

  if (!canTrackPresence) {
    return (
      <AdminScreenLayout title="Canlı durum">
        <EmptyState title="Yetki gerekli" description="Personel yönetim yetkisi gerekir." />
      </AdminScreenLayout>
    )
  }

  if (loading && !staffRows.length) {
    return (
      <AdminScreenLayout title="Canlı durum">
        <SkeletonCard />
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout
      scroll={false}
      showBack
      padded={false}
      title="Canlı durum"
      subtitle={`${presenceStats.total} personel · otomatik yenileme`}
      right={
        <View style={styles.liveTitleRow}>
          <View style={styles.livePulse} />
        </View>
      }
    >
      <FlatList
        data={filteredStaff}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={palette.primary[500]} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon={<Icon.Presence size={40} color={palette.slate[400]} strokeWidth={1.5} />}
            title="Personel bulunamadı"
            description="Filtreleri değiştirerek tekrar deneyin."
          />
        }
        ListFooterComponent={
          loading ? <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.md }} /> : null
        }
      />
      <PresenceUnitFilterModal
        visible={unitModalOpen}
        units={units}
        selectedUnitId={selectedUnitId}
        onSelect={setSelectedUnitId}
        onClose={() => setUnitModalOpen(false)}
      />
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  liveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.success[500],
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[200],
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[200],
  },
  statChipOnline: {
    borderColor: palette.success[200],
    backgroundColor: palette.success[50],
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: palette.surface,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: palette.slate[800],
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: palette.slate[100],
    borderRadius: radii.lg,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  segmentBtnActive: {
    backgroundColor: palette.surface,
  },
  unitBtn: {
    flexShrink: 1,
    maxWidth: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[200],
  },
  listHint: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  personCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCol: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  liveDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  liveDotOn: {
    backgroundColor: palette.success[500],
  },
  liveDotOff: {
    backgroundColor: palette.slate[400],
  },
  personMeta: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.sm,
    gap: 1,
  },
})
