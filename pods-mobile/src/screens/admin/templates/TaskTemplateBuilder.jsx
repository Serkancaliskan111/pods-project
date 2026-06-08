import React, { useEffect, useState } from 'react'
import { ScrollView, View, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Plus, Trash2 } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import {
  TEMPLATE_KAPSAM,
  allowedTemplateScopesForCreator,
  buildTemplateScopePayload,
  pickAllowedKapsam,
} from '../../../lib/taskTemplateScope'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import { Text, Button, Card, palette, spacing } from '../../../ui'
import { AdminTextField } from '../adminScreenUtils'

const supabase = getSupabase()

function newItem() {
  return { id: crypto.randomUUID(), soru_metni: '', soru_tipi: 'METIN', puan_degeri: 1, zorunlu_mu: true }
}

export default function TaskTemplateBuilder() {
  const navigation = useNavigation()
  const route = useRoute()
  const templateIdParam = route.params?.templateId
  const { user, profile, personel, permissions, accessibleUnitIds } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const allowedScopes = allowedTemplateScopesForCreator({
    isSystemAdmin,
    permissions,
    accessibleUnitIds: accessibleUnitIds || personel?.accessibleUnitIds || [],
    personel,
  })

  const [loading, setLoading] = useState(!!templateIdParam)
  const [saving, setSaving] = useState(false)
  const [templateId, setTemplateId] = useState(templateIdParam || '')
  const [title, setTitle] = useState('')
  const [items, setItems] = useState([newItem()])
  const [kapsam, setKapsam] = useState(pickAllowedKapsam(TEMPLATE_KAPSAM.SIRKET, allowedScopes))

  useEffect(() => {
    if (!templateIdParam) {
      if (companyScoped && currentCompanyId) setKapsam(pickAllowedKapsam(TEMPLATE_KAPSAM.SIRKET, allowedScopes))
      return
    }
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('is_sablonlari')
        .select('id,baslik,kapsam,ana_sirket_id')
        .eq('id', templateIdParam)
        .maybeSingle()
      if (error || !data) {
        Alert.alert('Hata', 'Şablon yüklenemedi')
        navigation.goBack()
        return
      }
      setTemplateId(data.id)
      setTitle(data.baslik || '')
      setKapsam(data.kapsam || TEMPLATE_KAPSAM.SIRKET)
      const { data: qs } = await supabase
        .from('is_sablon_sorulari')
        .select('id,soru_metni,soru_tipi,puan_degeri,zorunlu_mu,sira')
        .eq('sablon_id', templateIdParam)
        .order('sira', { ascending: true })
      setItems(
        (qs || []).length
          ? qs.map((q) => ({
              id: q.id || crypto.randomUUID(),
              soru_metni: q.soru_metni || '',
              soru_tipi: q.soru_tipi || 'METIN',
              puan_degeri: Number(q.puan_degeri) || 1,
              zorunlu_mu: q.zorunlu_mu !== false,
            }))
          : [newItem()],
      )
      setLoading(false)
    })()
  }, [templateIdParam, navigation, companyScoped, currentCompanyId, allowedScopes])

  const save = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      Alert.alert('Uyarı', 'Şablon başlığı zorunludur')
      return
    }
    const validItems = items.filter((i) => i.soru_metni?.trim())
    if (!validItems.length) {
      Alert.alert('Uyarı', 'En az bir madde ekleyin')
      return
    }
    setSaving(true)
    try {
      const scopePayload = buildTemplateScopePayload({
        kapsam: pickAllowedKapsam(kapsam, allowedScopes),
        anaSirketId: companyScoped ? currentCompanyId : currentCompanyId,
        birimId: null,
        userId: user?.id,
      })
      const genelPuan = validItems.reduce((s, q) => s + (Number(q.puan_degeri) || 0), 0)
      let nextId = templateId

      if (!nextId) {
        const { data, error } = await supabase
          .from('is_sablonlari')
          .insert([
            {
              baslik: trimmed,
              ...scopePayload,
              varsayilan_puan: genelPuan,
              puan: genelPuan,
              aktif_mi: true,
            },
          ])
          .select('id')
          .maybeSingle()
        if (error) throw error
        nextId = data?.id
        setTemplateId(nextId)
      } else {
        const { error } = await supabase
          .from('is_sablonlari')
          .update({
            baslik: trimmed,
            ...scopePayload,
            varsayilan_puan: genelPuan,
            puan: genelPuan,
          })
          .eq('id', nextId)
        if (error) throw error
        await supabase.from('is_sablon_sorulari').delete().eq('sablon_id', nextId)
      }

      const toInsert = validItems.map((q, idx) => ({
        sablon_id: nextId,
        soru_metni: q.soru_metni.trim(),
        soru_tipi: q.soru_tipi || 'METIN',
        puan_degeri: Number(q.puan_degeri) || 1,
        foto_zorunlu: false,
        min_foto_sayisi: 0,
        max_video_suresi_sn: 60,
        zorunlu_mu: !!q.zorunlu_mu,
        sira: idx + 1,
      }))
      const { error: qErr } = await supabase.from('is_sablon_sorulari').insert(toInsert)
      if (qErr) throw qErr

      Alert.alert('Başarılı', 'Şablon kaydedildi')
      navigation.navigate('TaskTemplatesList')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const screenTitle = templateId ? 'Şablon düzenle' : 'Yeni şablon'

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
        <AdminTextField label="Başlık *" value={title} onChangeText={setTitle} />

        <Text variant="caption" weight="SemiBold" color={palette.slate[600]} style={{ marginBottom: spacing.sm }}>
          Checklist maddeleri
        </Text>

        {items.map((item, idx) => (
          <Card key={item.id} tone="surface" style={{ marginBottom: spacing.sm }}>
            <AdminTextField
              label={`Madde ${idx + 1}`}
              value={item.soru_metni}
              onChangeText={(v) =>
                setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, soru_metni: v } : x)))
              }
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                disabled={items.length <= 1}
              >
                <Trash2 size={20} color={items.length <= 1 ? palette.slate[300] : palette.danger[500]} />
              </TouchableOpacity>
            </View>
          </Card>
        ))}

        <Button
          variant="outline"
          size="sm"
          iconLeft={<Plus size={16} color={palette.primary[700]} />}
          onPress={() => setItems((prev) => [...prev, newItem()])}
          style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}
        >
          Madde ekle
        </Button>

        <Button variant="primary" size="md" fullWidth loading={saving} onPress={save}>
          Kaydet
        </Button>
      </ScrollView>
    </AdminScreenLayout>
  )
}
