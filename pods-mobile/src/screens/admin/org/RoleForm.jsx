import React, { useEffect, useState } from 'react'
import { ScrollView, View, Switch, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import {
  canSeeRoles,
  emptyRoleSwitchState,
  hydrateRoleEditorPermissions,
  mergeRoleYetkilerForSave,
} from '../../../lib/permissions'
import { saveRollerRole } from '../../../lib/roleApi'
import {
  ROLE_ACTIONS_BY_CATEGORY,
  ROLE_CATEGORY_LABELS,
  ROLE_ACTION_LABELS,
} from '../../../lib/roleActionKeys'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import { Text, Button, Section, palette, spacing } from '../../../ui'
import { AdminTextField, pickFromList } from '../adminScreenUtils'

const supabase = getSupabase()

export default function RoleForm() {
  const navigation = useNavigation()
  const route = useRoute()
  const roleId = route.params?.roleId
  const { profile, personel, permissions: authPerms } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const companyScoped = !isSystemAdmin && !!personel?.ana_sirket_id

  const [loading, setLoading] = useState(!!roleId)
  const [saving, setSaving] = useState(false)
  const [rolAdi, setRolAdi] = useState('')
  const [companyId, setCompanyId] = useState(companyScoped ? String(personel.ana_sirket_id) : '')
  const [companies, setCompanies] = useState([])
  const [switches, setSwitches] = useState(() => emptyRoleSwitchState())
  const [preserved, setPreserved] = useState({})

  useEffect(() => {
    if (!canSeeRoles(authPerms, isSystemAdmin)) {
      Alert.alert('Yetki', 'Rol düzenleme yetkiniz yok.')
      navigation.goBack()
    }
  }, [authPerms, isSystemAdmin, navigation])

  useEffect(() => {
    let q = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
    if (companyScoped) q = q.eq('id', personel.ana_sirket_id)
    q.then(({ data }) => setCompanies(data || []))
  }, [companyScoped, personel?.ana_sirket_id])

  useEffect(() => {
    if (!roleId) return
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('roller')
        .select('id,rol_adi,ana_sirket_id,yetkiler')
        .eq('id', roleId)
        .maybeSingle()
      setLoading(false)
      if (error || !data) {
        Alert.alert('Hata', 'Rol yüklenemedi')
        navigation.goBack()
        return
      }
      setRolAdi(data.rol_adi || '')
      setCompanyId(data.ana_sirket_id ? String(data.ana_sirket_id) : '')
      const hydrated = hydrateRoleEditorPermissions(data.yetkiler)
      setSwitches(hydrated.switches)
      setPreserved(hydrated.preserved)
    })()
  }, [roleId, navigation])

  const applyPreset = (preset) => {
    const base = emptyRoleSwitchState()
    if (preset === 'SUPER_ADMIN') {
      Object.keys(base).forEach((k) => {
        base[k] = true
      })
    } else if (preset === 'PERSONEL') {
      ;['is.liste_gor', 'is.detay_gor', 'is.fotograf_yukle'].forEach((k) => {
        base[k] = true
      })
    } else if (preset === 'DENETIMCI') {
      ROLE_ACTIONS_BY_CATEGORY.DENETIM.forEach((k) => {
        base[k] = true
      })
    } else if (preset === 'YONETICI_WEB') {
      ;[...ROLE_ACTIONS_BY_CATEGORY.YONETIM, ...ROLE_ACTIONS_BY_CATEGORY.OPERASYON, 'denetim.onayla'].forEach(
        (k) => {
          if (k in base) base[k] = true
        },
      )
    }
    setSwitches(base)
  }

  const save = async () => {
    if (!rolAdi.trim()) {
      Alert.alert('Uyarı', 'Rol adı zorunludur')
      return
    }
    const anaSirketId = companyScoped ? personel?.ana_sirket_id : companyId || null
    setSaving(true)
    try {
      await saveRollerRole({
        rolId: roleId || null,
        rolAdi,
        anaSirketId,
        yetkiler: mergeRoleYetkilerForSave(preserved, switches),
      })
      Alert.alert('Başarılı', 'Rol kaydedildi')
      navigation.navigate('RolesList')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const screenTitle = roleId ? 'Rol düzenle' : 'Yeni rol'

  if (loading) {
    return (
      <AdminScreenLayout title={screenTitle}>
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  const companyLabel =
    companies.find((c) => String(c.id) === String(companyId))?.ana_sirket_adi ||
    (companyId ? 'Şirket' : 'Global')

  return (
    <AdminScreenLayout title={screenTitle}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
        <AdminTextField label="Rol adı *" value={rolAdi} onChangeText={setRolAdi} />
        {!companyScoped ? (
          <TouchableOpacity
            onPress={() =>
              pickFromList(
                'Şirket',
                [{ label: 'Global', value: '' }, ...companies.map((c) => ({ label: c.ana_sirket_adi, value: String(c.id) }))],
                setCompanyId,
              )
            }
          >
            <AdminTextField label="Şirket" value={companyLabel} editable={false} />
          </TouchableOpacity>
        ) : (
          <AdminTextField label="Şirket" value={companyLabel} editable={false} />
        )}

        <TouchableOpacity
          style={{ marginBottom: spacing.md }}
          onPress={() =>
            pickFromList('Şablon', [
              { label: '— Seçin —', value: '' },
              { label: 'SUPER_ADMIN', value: 'SUPER_ADMIN' },
              { label: 'PERSONEL', value: 'PERSONEL' },
              { label: 'DENETIMCI', value: 'DENETIMCI' },
              { label: 'Yönetici (web)', value: 'YONETICI_WEB' },
            ], applyPreset)
          }
        >
          <Text variant="bodySm" color={palette.primary[700]} weight="SemiBold">
            Şablon uygula
          </Text>
        </TouchableOpacity>

        {Object.entries(ROLE_ACTIONS_BY_CATEGORY).map(([cat, keys]) => (
          <Section key={cat} title={ROLE_CATEGORY_LABELS[cat] || cat}>
            {keys.map((key) => (
              <View
                key={key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: palette.slate[100],
                }}
              >
                <Text variant="bodySm" style={{ flex: 1, paddingRight: spacing.sm }}>
                  {ROLE_ACTION_LABELS[key] || key}
                </Text>
                <Switch
                  value={!!switches[key]}
                  onValueChange={(v) => setSwitches((prev) => ({ ...prev, [key]: v }))}
                />
              </View>
            ))}
          </Section>
        ))}

        <Button variant="primary" size="md" fullWidth loading={saving} onPress={save} style={{ marginTop: spacing.lg }}>
          Kaydet
        </Button>
      </ScrollView>
    </AdminScreenLayout>
  )
}
