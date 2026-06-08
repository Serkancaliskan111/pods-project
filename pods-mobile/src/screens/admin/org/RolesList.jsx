import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, Alert } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Shield, Plus } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canSeeRoles } from '../../../lib/permissions'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  Button,
  EmptyState,
  SkeletonCard,
  palette,
  spacing,
} from '../../../ui'

const supabase = getSupabase()

export default function RolesList() {
  const navigation = useNavigation()
  const { profile, personel, scopeReady, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!canSeeRoles(permissions, isSystemAdmin)) {
      Alert.alert('Yetki', 'Rol listesine erişim yetkiniz yok.')
      navigation.goBack()
    }
  }, [permissions, isSystemAdmin, navigation])

  const load = useCallback(async () => {
    if (!isSystemAdmin && !scopeReady) return
    setLoading(true)
    try {
      let q = supabase.from('roller').select('id,rol_adi,ana_sirket_id,silindi_at').is('silindi_at', null)
      if (!isSystemAdmin && currentCompanyId) {
        q = q.or(`ana_sirket_id.eq.${currentCompanyId},ana_sirket_id.is.null`)
      }
      const { data, error } = await q
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      Alert.alert('Hata', 'Roller yüklenemedi')
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isSystemAdmin, currentCompanyId, scopeReady])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !rows.length) {
    return (
      <AdminScreenLayout title="Roller">
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Roller">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        Yetki tanımları
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md }}>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={16} color="#fff" />}
          onPress={() => navigation.navigate('RoleForm')}
        >
          Yeni
        </Button>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />
        }
        renderItem={({ item: r }) => (
          <Card
            tone="surface"
            elevated
            onPress={() => navigation.navigate('RoleForm', { roleId: r.id })}
            style={{ marginBottom: spacing.md }}
          >
            <Text variant="bodyLg" weight="Bold">
              {r.rol_adi}
            </Text>
            <Text variant="caption" color={palette.slate[500]}>
              {r.ana_sirket_id ? 'Şirket rolü' : 'Global rol'}
            </Text>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon={<Shield size={42} color={palette.slate[400]} />} title="Rol bulunamadı" />}
      />
    </AdminScreenLayout>
  )
}
