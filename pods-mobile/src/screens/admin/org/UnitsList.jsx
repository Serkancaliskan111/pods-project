import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  TextInput,
  Alert,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Layers, Plus, Search } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canSeeUnits } from '../../../lib/permissions'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
  Chip,
  palette,
  spacing,
} from '../../../ui'
import { adminStyles, pickFromList } from '../adminScreenUtils'

const supabase = getSupabase()

export default function UnitsList() {
  const navigation = useNavigation()
  const { profile, personel, scopeReady, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id
  const accessibleUnitIds = personel?.accessibleUnitIds || []

  const [units, setUnits] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')

  const canLoad = isSystemAdmin ? true : Boolean(scopeReady && currentCompanyId)

  useEffect(() => {
    if (!canSeeUnits(permissions, isSystemAdmin)) {
      Alert.alert('Yetki', 'Birim listesine erişim yetkiniz yok.')
      navigation.goBack()
    }
  }, [permissions, isSystemAdmin, navigation])

  const load = useCallback(async () => {
    if (!canLoad) return
    setLoading(true)
    try {
      let compQuery = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
      if (!isSystemAdmin && currentCompanyId) compQuery = compQuery.eq('id', currentCompanyId)

      let unitQuery = supabase
        .from('birimler')
        .select('id,ana_sirket_id,ust_birim_id,birim_adi,birim_tipi,silindi_at')
        .order('birim_adi')

      if (!isSystemAdmin && currentCompanyId) unitQuery = unitQuery.eq('ana_sirket_id', currentCompanyId)
      if (!isSystemAdmin && accessibleUnitIds.length) unitQuery = unitQuery.in('id', accessibleUnitIds)

      const [{ data: comps, error: ce }, { data: uns, error: ue }] = await Promise.all([compQuery, unitQuery])
      if (ce || ue) throw ce || ue
      setCompanies(comps || [])
      setUnits(uns || [])
    } catch (e) {
      Alert.alert('Hata', 'Birimler yüklenemedi')
      setUnits([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [canLoad, isSystemAdmin, currentCompanyId, accessibleUnitIds])

  useEffect(() => {
    load()
  }, [load])

  const companyNameById = useMemo(() => {
    const m = {}
    for (const c of companies) m[String(c.id)] = c.ana_sirket_adi
    return m
  }, [companies])

  const filtered = units.filter((u) => {
    if (companyFilter && String(u.ana_sirket_id) !== String(companyFilter)) return false
    const term = search.toLowerCase()
    return (u.birim_adi || '').toLowerCase().includes(term)
  })

  const companyFilterLabel = companyFilter
    ? companyNameById[companyFilter] || 'Şirket'
    : 'Tüm şirketler'

  if (loading && !units.length) {
    return (
      <AdminScreenLayout title="Birimler">
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Birimler">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        Şube ve departman kayıtları
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md }}>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={16} color="#fff" />}
          onPress={() => navigation.navigate('UnitForm')}
        >
          Yeni
        </Button>
      </View>

      {isSystemAdmin && companies.length > 1 ? (
        <TouchableOpacity
          style={{ marginBottom: spacing.sm }}
          onPress={() =>
            pickFromList(
              'Şirket filtresi',
              [{ label: 'Tüm şirketler', value: '' }, ...companies.map((c) => ({ label: c.ana_sirket_adi, value: c.id }))],
              setCompanyFilter,
            )
          }
        >
          <Chip selected={!!companyFilter}>{companyFilterLabel}</Chip>
        </TouchableOpacity>
      ) : null}

      <View style={{ position: 'relative', marginBottom: spacing.md }}>
        <Search size={16} color={palette.slate[400]} style={{ position: 'absolute', left: 12, top: 14, zIndex: 1 }} />
        <TextInput
          style={[adminStyles.input, { paddingLeft: 36, marginBottom: 0 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Birim adı ara…"
          placeholderTextColor={palette.slate[400]}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />
        }
        renderItem={({ item: u }) => {
          const active = !u.silindi_at
          return (
            <Card
              tone="surface"
              elevated
              onPress={() => navigation.navigate('UnitForm', { id: u.id })}
              style={{ marginBottom: spacing.md }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLg" weight="Bold">
                    {u.birim_adi}
                  </Text>
                  <Text variant="caption" color={palette.slate[500]}>
                    {companyNameById[String(u.ana_sirket_id)] || '—'} · {u.birim_tipi || 'Birim'}
                  </Text>
                </View>
                <StatusBadge tone={active ? 'success' : 'soft'} size="sm">
                  {active ? 'Aktif' : 'Pasif'}
                </StatusBadge>
              </View>
            </Card>
          )
        }}
        ListEmptyComponent={
          <EmptyState icon={<Layers size={42} color={palette.slate[400]} />} title="Birim bulunamadı" />
        }
      />
    </AdminScreenLayout>
  )
}
