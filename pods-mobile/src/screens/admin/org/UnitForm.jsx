import React, { useEffect, useState } from 'react'
import { ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import { Button, Text, palette, spacing } from '../../../ui'
import { AdminTextField, pickFromList } from '../adminScreenUtils'

const supabase = getSupabase()
const BIRIM_TYPES = [
  { label: 'Şube', value: 'SUBE' },
  { label: 'Departman', value: 'DEPARTMAN' },
  { label: 'Ekip', value: 'EKIP' },
]

export default function UnitForm() {
  const navigation = useNavigation()
  const route = useRoute()
  const id = route.params?.id
  const { profile, personel } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin

  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState([])
  const [parentUnits, setParentUnits] = useState([])
  const [companyId, setCompanyId] = useState(personel?.ana_sirket_id ? String(personel.ana_sirket_id) : '')
  const [parentId, setParentId] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('SUBE')

  useEffect(() => {
    let q = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
    if (!isSystemAdmin && personel?.ana_sirket_id) q = q.eq('id', personel.ana_sirket_id)
    q.then(({ data }) => setCompanies(data || []))
  }, [isSystemAdmin, personel?.ana_sirket_id])

  useEffect(() => {
    if (!companyId) {
      setParentUnits([])
      return
    }
    supabase
      .from('birimler')
      .select('id,birim_adi')
      .eq('ana_sirket_id', companyId)
      .is('silindi_at', null)
      .then(({ data }) => setParentUnits((data || []).filter((u) => String(u.id) !== String(id))))
  }, [companyId, id])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('birimler')
        .select('id,ana_sirket_id,ust_birim_id,birim_adi,birim_tipi')
        .eq('id', id)
        .maybeSingle()
      setLoading(false)
      if (error || !data) {
        Alert.alert('Hata', 'Birim yüklenemedi')
        navigation.goBack()
        return
      }
      setCompanyId(String(data.ana_sirket_id || ''))
      setParentId(data.ust_birim_id ? String(data.ust_birim_id) : '')
      setName(data.birim_adi || '')
      setType(data.birim_tipi || 'SUBE')
    })()
  }, [id, navigation])

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Uyarı', 'Birim adı zorunludur')
      return
    }
    if (!companyId) {
      Alert.alert('Uyarı', 'Şirket seçin')
      return
    }
    setSaving(true)
    try {
      const row = {
        ana_sirket_id: companyId,
        ust_birim_id: parentId || null,
        birim_adi: name.trim(),
        birim_tipi: type,
      }
      if (id) {
        const { error } = await supabase.from('birimler').update(row).eq('id', id)
        if (error) throw error
        Alert.alert('Başarılı', 'Birim güncellendi')
      } else {
        const { error } = await supabase.from('birimler').insert([row])
        if (error) throw error
        Alert.alert('Başarılı', 'Birim oluşturuldu')
      }
      navigation.navigate('UnitsList')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kayıt hatası')
    } finally {
      setSaving(false)
    }
  }

  const deleteUnit = () => {
    Alert.alert('Birimi pasife al', 'Emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Pasife al',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('birimler')
            .update({ silindi_at: new Date().toISOString() })
            .eq('id', id)
          if (error) Alert.alert('Hata', error.message)
          else navigation.navigate('UnitsList')
        },
      },
    ])
  }

  const screenTitle = id ? 'Birim düzenle' : 'Yeni birim'

  if (loading) {
    return (
      <AdminScreenLayout title={screenTitle}>
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  const companyLabel = companies.find((c) => String(c.id) === String(companyId))?.ana_sirket_adi || 'Şirket seç'
  const parentLabel = parentUnits.find((u) => String(u.id) === String(parentId))?.birim_adi || 'Üst birim yok'
  const typeLabel = BIRIM_TYPES.find((t) => t.value === type)?.label || type

  return (
    <AdminScreenLayout title={screenTitle}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
        {isSystemAdmin ? (
          <TouchableOpacity
            style={{ marginBottom: spacing.md }}
            onPress={() =>
              pickFromList('Şirket', companies.map((c) => ({ label: c.ana_sirket_adi, value: String(c.id) })), setCompanyId)
            }
          >
            <AdminTextField label="Şirket" value={companyLabel} editable={false} pointerEvents="none" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() =>
            pickFromList('Üst birim', [{ label: 'Yok', value: '' }, ...parentUnits.map((u) => ({ label: u.birim_adi, value: String(u.id) }))], setParentId)
          }
        >
          <AdminTextField label="Üst birim" value={parentLabel} editable={false} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => pickFromList('Birim tipi', BIRIM_TYPES, setType)}>
          <AdminTextField label="Tip" value={typeLabel} editable={false} />
        </TouchableOpacity>
        <AdminTextField label="Birim adı *" value={name} onChangeText={setName} />
        <Button variant="primary" size="md" fullWidth loading={saving} onPress={save}>
          Kaydet
        </Button>
        {id ? (
          <Button variant="danger" size="md" fullWidth onPress={deleteUnit} style={{ marginTop: spacing.sm }}>
            Pasife al
          </Button>
        ) : null}
      </ScrollView>
    </AdminScreenLayout>
  )
}
