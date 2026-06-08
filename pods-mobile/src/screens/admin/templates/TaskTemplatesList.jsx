import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, TextInput, Alert, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { FileText, Plus, Search } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canSeeTaskTemplates } from '../../../lib/permissions'
import { filterTemplatesVisibleToUser } from '../../../lib/taskTemplateScope'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  Button,
  EmptyState,
  SkeletonCard,
  StatusBadge,
  palette,
  spacing,
} from '../../../ui'
import { adminStyles } from '../adminScreenUtils'

const supabase = getSupabase()

export default function TaskTemplatesList() {
  const navigation = useNavigation()
  const { profile, personel, permissions, accessibleUnitIds } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!canSeeTaskTemplates(permissions, isSystemAdmin)) {
      Alert.alert('Yetki', 'Şablon listesine erişim yetkiniz yok.')
      navigation.goBack()
    }
  }, [permissions, isSystemAdmin, navigation])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('is_sablonlari')
        .select('id,ana_sirket_id,birim_id,kapsam,baslik,min_sure_dk,aktif_mi')
        .is('silindi_at', null)
        .order('olusturma_tarihi', { ascending: false })
      if (error) throw error
      const list = filterTemplatesVisibleToUser(data || [], {
        isSystemAdmin,
        companyId: currentCompanyId,
        accessibleUnitIds: accessibleUnitIds || personel?.accessibleUnitIds || [],
      })
      setRows(list)
    } catch (e) {
      Alert.alert('Hata', 'Şablonlar yüklenemedi')
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isSystemAdmin, currentCompanyId, accessibleUnitIds, personel?.accessibleUnitIds])

  useEffect(() => {
    load()
  }, [load])

  const filtered = rows.filter((r) => (r.baslik || '').toLowerCase().includes(search.toLowerCase()))

  if (loading && !rows.length) {
    return (
      <AdminScreenLayout title="Görev şablonları">
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Görev şablonları">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        Checklist şablonları
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md }}>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={16} color="#fff" />}
          onPress={() => navigation.navigate('TaskTemplateBuilder')}
        >
          Yeni
        </Button>
      </View>

      <View style={{ position: 'relative', marginBottom: spacing.md }}>
        <Search size={16} color={palette.slate[400]} style={{ position: 'absolute', left: 12, top: 14, zIndex: 1 }} />
        <TextInput
          style={[adminStyles.input, { paddingLeft: 36, marginBottom: 0 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Şablon adı ara…"
          placeholderTextColor={palette.slate[400]}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />
        }
        renderItem={({ item: r }) => (
          <Card
            tone="surface"
            elevated
            onPress={() => navigation.navigate('TaskTemplateBuilder', { templateId: r.id })}
            style={{ marginBottom: spacing.md }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyLg" weight="Bold">
                  {r.baslik || 'Şablon'}
                </Text>
                <Text variant="caption" color={palette.slate[500]}>
                  {r.kapsam || 'sirket'} · {r.min_sure_dk ? `${r.min_sure_dk} dk` : '—'}
                </Text>
              </View>
              <StatusBadge tone={r.aktif_mi !== false ? 'success' : 'soft'} size="sm">
                {r.aktif_mi !== false ? 'Aktif' : 'Pasif'}
              </StatusBadge>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState icon={<FileText size={42} color={palette.slate[400]} />} title="Şablon bulunamadı" />
        }
      />
    </AdminScreenLayout>
  )
}
