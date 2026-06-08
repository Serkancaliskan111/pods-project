import React, { useEffect, useState } from 'react'
import { ScrollView, Switch, View, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { normalizeIpList } from '../../../lib/ipAccess'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import { Text, Button, palette, spacing } from '../../../ui'
import { AdminTextField } from '../adminScreenUtils'

const supabase = getSupabase()

function isIpColumnMissingError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return error?.code === '42703' || msg.includes('sabit_ip_aktif') || msg.includes('izinli_ipler')
}

export default function CompanyForm() {
  const navigation = useNavigation()
  const route = useRoute()
  const id = route.params?.id
  const { profile, personel } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id

  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [vergiNo, setVergiNo] = useState('')
  const [fixedIp, setFixedIp] = useState(false)
  const [ips, setIps] = useState([''])

  useEffect(() => {
    if (!id && !isSystemAdmin) {
      Alert.alert('Yetki', 'Yeni şirket oluşturma yetkiniz yok.')
      navigation.goBack()
    }
  }, [id, isSystemAdmin, navigation])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let { data, error } = await supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi,vergi_no,sabit_ip_aktif,izinli_ipler')
        .eq('id', id)
        .maybeSingle()
      if (error && isIpColumnMissingError(error)) {
        const fb = await supabase.from('ana_sirketler').select('id,ana_sirket_adi,vergi_no').eq('id', id).maybeSingle()
        data = fb.data ? { ...fb.data, sabit_ip_aktif: false, izinli_ipler: [] } : null
        error = fb.error
      }
      if (cancelled) return
      setLoading(false)
      if (error || !data) {
        Alert.alert('Hata', 'Şirket yüklenemedi')
        navigation.goBack()
        return
      }
      if (!isSystemAdmin && currentCompanyId && String(data.id) !== String(currentCompanyId)) {
        Alert.alert('Yetki', 'Bu şirkete erişim yetkiniz yok.')
        navigation.goBack()
        return
      }
      setName(data.ana_sirket_adi || '')
      setVergiNo(data.vergi_no || '')
      setFixedIp(!!data.sabit_ip_aktif)
      setIps((data.izinli_ipler || []).length ? data.izinli_ipler : [''])
    })()
    return () => {
      cancelled = true
    }
  }, [id, isSystemAdmin, currentCompanyId, navigation])

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Uyarı', 'Şirket adı zorunludur')
      return
    }
    if (!vergiNo.trim()) {
      Alert.alert('Uyarı', 'Vergi no zorunludur')
      return
    }
    const allowList = normalizeIpList(ips)
    if (fixedIp && !allowList.length) {
      Alert.alert('Uyarı', 'Sabit IP aktifken en az 1 IP girin')
      return
    }
    setSaving(true)
    try {
      const row = {
        ana_sirket_adi: name.trim(),
        vergi_no: vergiNo.trim(),
        sabit_ip_aktif: fixedIp,
        izinli_ipler: allowList,
      }
      if (id) {
        let { error } = await supabase.from('ana_sirketler').update(row).eq('id', id)
        if (error && isIpColumnMissingError(error)) {
          const fb = await supabase
            .from('ana_sirketler')
            .update({ ana_sirket_adi: row.ana_sirket_adi, vergi_no: row.vergi_no })
            .eq('id', id)
          error = fb.error
        }
        if (error) throw error
        Alert.alert('Başarılı', 'Şirket güncellendi')
      } else {
        let { error } = await supabase.from('ana_sirketler').insert([{ ...row, durum: true }])
        if (error && isIpColumnMissingError(error)) {
          const fb = await supabase.from('ana_sirketler').insert([
            { ana_sirket_adi: row.ana_sirket_adi, vergi_no: row.vergi_no, durum: true },
          ])
          error = fb.error
        }
        if (error) throw error
        Alert.alert('Başarılı', 'Şirket oluşturuldu')
      }
      navigation.navigate('CompaniesList')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kayıt hatası')
    } finally {
      setSaving(false)
    }
  }

  const screenTitle = id ? 'Şirket düzenle' : 'Yeni şirket'

  if (loading) {
    return (
      <AdminScreenLayout title={screenTitle}>
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title={screenTitle}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
        <AdminTextField label="Şirket adı" value={name} onChangeText={setName} />
        <AdminTextField label="Vergi no" value={vergiNo} onChangeText={setVergiNo} keyboardType="number-pad" />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
          <Switch value={fixedIp} onValueChange={setFixedIp} />
          <Text variant="bodySm">Sabit IP kısıtı</Text>
        </View>
        {ips.map((ip, idx) => (
          <AdminTextField
            key={`ip-${idx}`}
            label={`İzinli IP ${idx + 1}`}
            value={ip}
            onChangeText={(v) => setIps((prev) => prev.map((x, i) => (i === idx ? v : x)))}
            editable={fixedIp}
          />
        ))}
        {fixedIp && ips.length < 5 ? (
          <TouchableOpacity onPress={() => setIps((p) => [...p, ''])}>
            <Text variant="bodySm" color={palette.primary[700]}>
              + IP ekle
            </Text>
          </TouchableOpacity>
        ) : null}
        <Button variant="primary" size="md" fullWidth loading={saving} onPress={save} style={{ marginTop: spacing.lg }}>
          Kaydet
        </Button>
      </ScrollView>
    </AdminScreenLayout>
  )
}
