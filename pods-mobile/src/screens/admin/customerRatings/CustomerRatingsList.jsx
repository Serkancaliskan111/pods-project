import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, Building2, QrCode } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  EmptyState,
  IconButton,
  StatusBadge,
  palette,
  spacing,
  radii,
} from '../../../ui'

const supabase = getSupabase()

export default function CustomerRatingsList() {
  const navigation = useNavigation()
  const { profile, personel } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []

  const [units, setUnits] = useState([])
  const [qrRows, setQrRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterUnitId, setFilterUnitId] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let q = supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null)
      if (currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
      const { data, error } = await q.order('birim_adi', { ascending: true })
      if (cancelled) return
      if (error) {
        Alert.alert('Hata', 'Birimler yüklenemedi')
        return
      }
      const scoped = (data || []).filter((u) => {
        if (isSystemAdmin) return true
        if (!accessibleUnitIds?.length) return true
        return accessibleUnitIds.some((id) => String(id) === String(u.id))
      })
      setUnits(scoped)
    })()
    return () => {
      cancelled = true
    }
  }, [currentCompanyId, isSystemAdmin, accessibleUnitIds])

  const loadQrRows = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('customer_unit_qr_links')
        .select('id,code,birim_id,aktif,created_at,birimler(birim_adi),ana_sirket_id')
      if (currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      setQrRows(data || [])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'QR listesi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [currentCompanyId])

  useEffect(() => {
    void loadQrRows()
  }, [loadQrRows])

  const displayedRows = useMemo(() => {
    if (!filterUnitId) return qrRows
    return qrRows.filter((r) => String(r.birim_id) === String(filterUnitId))
  }, [qrRows, filterUnitId])

  const openDetail = (row) => {
    navigation.navigate('CustomerRatingShow', { qrId: row.id })
  }

  const renderRow = ({ item: row }) => {
    const unitName = row?.birimler?.birim_adi || row.birim_id
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => openDetail(row)}>
        <Card style={styles.rowCard}>
          <View style={styles.rowTop}>
            <View style={styles.rowTitleWrap}>
              <Building2 size={14} color={palette.slate[400]} />
              <Text variant="body" style={styles.unitName} numberOfLines={1}>
                {unitName}
              </Text>
            </View>
            <StatusBadge tone={row.aktif ? 'success' : 'soft'}>
              {row.aktif ? 'Aktif' : 'Pasif'}
            </StatusBadge>
          </View>
          <Text variant="caption" style={styles.code}>
            {row.code}
          </Text>
          <Text variant="caption" style={styles.date}>
            {new Date(row.created_at).toLocaleString('tr-TR')}
          </Text>
        </Card>
      </TouchableOpacity>
    )
  }

  return (
    <AdminScreenLayout title="Müşteri anketi" screenProps={{ bottomInset: true }}>
      <View style={styles.headerRow}>
        <Text variant="caption" style={styles.subtitle}>
          Birim QR kodları ve puanlar
        </Text>
        <IconButton onPress={() => void loadQrRows()} accessibilityLabel="Yenile">
          <QrCode size={20} color={palette.primary[700]} />
        </IconButton>
      </View>

      {units.length > 1 ? (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !filterUnitId && styles.filterChipActive]}
            onPress={() => setFilterUnitId('')}
          >
            <Text variant="caption" style={!filterUnitId ? styles.filterTextActive : null}>
              Tümü
            </Text>
          </TouchableOpacity>
          {units.map((u) => {
            const active = String(filterUnitId) === String(u.id)
            return (
              <TouchableOpacity
                key={u.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilterUnitId(String(u.id))}
              >
                <Text variant="caption" numberOfLines={1} style={active ? styles.filterTextActive : null}>
                  {u.birim_adi}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary[700]} />
        </View>
      ) : displayedRows.length === 0 ? (
        <Card style={styles.emptyWrap}>
          <EmptyState
            title="Henüz QR yok"
            description="Web panelden birim için müşteri değerlendirme QR kodu oluşturabilirsiniz."
          />
        </Card>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={displayedRows}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerCenter: { flex: 1 },
  subtitle: { color: palette.slate[500], marginTop: 2 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: palette.slate[100],
    maxWidth: 140,
  },
  filterChipActive: {
    backgroundColor: palette.primary[700],
  },
  filterTextActive: { color: palette.surface, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { marginHorizontal: spacing.lg },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] },
  sep: { height: spacing.sm },
  rowCard: { gap: spacing.xs },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unitName: { flex: 1, fontWeight: '700' },
  code: { fontFamily: 'PlusJakartaSans-Medium', color: palette.slate[600] },
  date: { color: palette.slate[400] },
})
