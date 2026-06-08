import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  FlatList,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Building2, Plus, Search } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canSeeCompanies } from '../../../lib/permissions'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
  palette,
  spacing,
} from '../../../ui'
import { adminStyles } from '../adminScreenUtils'

const supabase = getSupabase()

export default function CompaniesList() {
  const navigation = useNavigation()
  const { profile, personel, scopeReady } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!canSeeCompanies(profile?.yetkiler, isSystemAdmin)) {
      Alert.alert('Yetki', 'Şirket listesine yalnızca sistem yöneticisi erişebilir.')
      navigation.goBack()
    }
  }, [isSystemAdmin, profile?.yetkiler, navigation])

  const load = useCallback(async () => {
    if (!scopeReady && !isSystemAdmin) return
    setLoading(true)
    try {
      let q = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi,vergi_no,silindi_at')
        .order('id', { ascending: false })
      if (!isSystemAdmin && personel?.ana_sirket_id) {
        q = q.eq('id', personel.ana_sirket_id)
      }
      const { data, error } = await q
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      Alert.alert('Hata', 'Şirketler yüklenemedi')
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isSystemAdmin, personel?.ana_sirket_id, scopeReady])

  useEffect(() => {
    load()
  }, [load])

  const filtered = rows.filter((c) => {
    const term = search.toLowerCase()
    return (
      (c.ana_sirket_adi || '').toLowerCase().includes(term) ||
      (c.vergi_no || '').toLowerCase().includes(term)
    )
  })

  const toggleActive = (row) => {
    const isActive = !row.silindi_at
    Alert.alert(isActive ? 'Pasife al' : 'Aktifleştir', row.ana_sirket_adi, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Onayla',
        onPress: async () => {
          const nextValue = isActive ? new Date().toISOString() : null
          const { error } = await supabase
            .from('ana_sirketler')
            .update({ silindi_at: nextValue })
            .eq('id', row.id)
          if (error) Alert.alert('Hata', error.message)
          else {
            Alert.alert('Başarılı', isActive ? 'Şirket pasif yapıldı' : 'Şirket aktif')
            load()
          }
        },
      },
    ])
  }

  if (loading && !rows.length) {
    return (
      <AdminScreenLayout title="Şirketler">
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Şirketler">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        {isSystemAdmin ? 'Ana şirket kayıtları' : 'Bağlı şirketiniz'}
      </Text>
      {isSystemAdmin ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md }}>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={16} color="#fff" />}
            onPress={() => navigation.navigate('CompanyForm')}
          >
            Yeni
          </Button>
        </View>
      ) : null}

      <View style={{ position: 'relative', marginBottom: spacing.md }}>
        <Search size={16} color={palette.slate[400]} style={{ position: 'absolute', left: 12, top: 14, zIndex: 1 }} />
        <TextInput
          style={[adminStyles.input, { paddingLeft: 36, marginBottom: 0 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Şirket adı veya vergi no…"
          placeholderTextColor={palette.slate[400]}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />
        }
        renderItem={({ item: c }) => {
          const active = !c.silindi_at
          return (
            <Card
              tone="surface"
              elevated
              onPress={() => navigation.navigate('CompanyForm', { id: c.id })}
              style={{ marginBottom: spacing.md }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLg" weight="Bold">
                    {c.ana_sirket_adi}
                  </Text>
                  <Text variant="caption" color={palette.slate[500]}>
                    Vergi no: {c.vergi_no || '—'}
                  </Text>
                </View>
                <StatusBadge tone={active ? 'success' : 'soft'} size="sm">
                  {active ? 'Aktif' : 'Pasif'}
                </StatusBadge>
              </View>
              {isSystemAdmin ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <Button variant="outline" size="sm" onPress={() => toggleActive(c)}>
                    {active ? 'Pasife al' : 'Aktifleştir'}
                  </Button>
                </View>
              ) : null}
            </Card>
          )
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Building2 size={42} color={palette.slate[400]} />}
            title="Şirket bulunamadı"
          />
        }
        ListFooterComponent={
          loading ? <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: 8 }} /> : null
        }
      />
    </AdminScreenLayout>
  )
}
