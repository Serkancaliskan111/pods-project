import React, { useEffect, useState } from 'react'
import { ScrollView, Switch, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canEditStaffRecord, canManageStaff } from '../../../lib/permissions'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import { Button, Text, palette, spacing } from '../../../ui'
import { AdminTextField, pickFromList } from '../adminScreenUtils'
import {
  isPersonelKoduTaken,
  isPersonelKoduUniqueViolation,
  normalizePersonelKodu,
  personelKoduDuplicateMessage,
  suggestNextPersonelKodu,
} from '../../../lib/personelKodu'

const supabase = getSupabase()

export default function StaffForm() {
  const navigation = useNavigation()
  const route = useRoute()
  const id = route.params?.id
  const isNew = !id

  const { profile, personel, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const isOwnRecord = !!(id && personel?.id && String(id) === String(personel.id))
  const allowEdit = canEditStaffRecord(permissions, isSystemAdmin, { isOwnRecord })
  const limitedSelf = !isSystemAdmin && !canManageStaff(permissions, false) && isOwnRecord

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [roles, setRoles] = useState([])
  const [ad, setAd] = useState('')
  const [soyad, setSoyad] = useState('')
  const [email, setEmail] = useState('')
  const [kod, setKod] = useState('')
  const [sifre, setSifre] = useState('')
  const [sifreTekrar, setSifreTekrar] = useState('')
  const [companyId, setCompanyId] = useState(companyScoped ? String(currentCompanyId) : '')
  const [birimId, setBirimId] = useState('')
  const [rolId, setRolId] = useState('')
  const [durum, setDurum] = useState(true)
  const [loadedEmail, setLoadedEmail] = useState('')

  useEffect(() => {
    if (!allowEdit) {
      Alert.alert('Yetki', 'Personel düzenleme yetkiniz yok.')
      navigation.goBack()
    }
  }, [allowEdit, navigation])

  useEffect(() => {
    let q = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
    if (companyScoped) q = q.eq('id', currentCompanyId)
    q.then(({ data }) => setCompanies(data || []))
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    if (!companyId) {
      setUnits([])
      setRoles([])
      return
    }
    let uq = supabase.from('birimler').select('id,birim_adi').eq('ana_sirket_id', companyId).is('silindi_at', null)
    if (!isSystemAdmin && personel?.accessibleUnitIds?.length) {
      uq = uq.in('id', personel.accessibleUnitIds)
    }
    uq.then(({ data }) => setUnits(data || []))
    supabase
      .from('roller')
      .select('id,rol_adi')
      .or(`ana_sirket_id.eq.${companyId},ana_sirket_id.is.null`)
      .then(({ data }) => setRoles(data || []))
  }, [companyId, isSystemAdmin, personel?.accessibleUnitIds])

  useEffect(() => {
    if (!isNew) return
    let cancelled = false
    ;(async () => {
      try {
        const cid =
          companyScoped && currentCompanyId
            ? String(currentCompanyId)
            : companyId
              ? String(companyId)
              : null
        const suggested = await suggestNextPersonelKodu(supabase, { companyId: cid })
        if (!cancelled) setKod(suggested)
      } catch {
        // öneri opsiyonel
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isNew, companyScoped, currentCompanyId, companyId])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      const { data: row, error } = await supabase
        .from('personeller')
        .select('id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id,rol_id,durum')
        .eq('id', id)
        .is('silindi_at', null)
        .maybeSingle()
      setLoading(false)
      if (error || !row) {
        Alert.alert('Hata', 'Personel bulunamadı')
        navigation.goBack()
        return
      }
      setAd(row.ad || '')
      setSoyad(row.soyad || '')
      setEmail(row.email || '')
      setLoadedEmail(row.email || '')
      setKod(row.personel_kodu || '')
      setCompanyId(String(row.ana_sirket_id || ''))
      setBirimId(row.birim_id ? String(row.birim_id) : '')
      setRolId(row.rol_id ? String(row.rol_id) : '')
      setDurum(row.durum !== false)
    })()
  }, [id, navigation])

  const save = async () => {
    const personelKodu = normalizePersonelKodu(kod)
    if (!ad.trim() || !soyad.trim() || !personelKodu) {
      Alert.alert('Uyarı', 'Ad, soyad ve personel kodu zorunludur')
      return
    }

    try {
      if (await isPersonelKoduTaken(supabase, personelKodu, { excludePersonelId: id })) {
        Alert.alert('Uyarı', personelKoduDuplicateMessage(personelKodu))
        return
      }
    } catch (preErr) {
      console.warn('[StaffForm] personel kodu ön kontrol:', preErr)
    }
    if (isNew) {
      if (!email.trim()) {
        Alert.alert('Uyarı', 'E-posta zorunludur')
        return
      }
      if (!sifre || sifre.length < 6) {
        Alert.alert('Uyarı', 'Parola en az 6 karakter olmalı')
        return
      }
      if (sifre !== sifreTekrar) {
        Alert.alert('Uyarı', 'Parolalar eşleşmiyor')
        return
      }
    }
    const effectiveCompany = companyScoped ? currentCompanyId : companyId
    if (!effectiveCompany) {
      Alert.alert('Uyarı', 'Şirket seçin')
      return
    }
    if (!rolId) {
      Alert.alert('Uyarı', 'Rol seçin')
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        const selectedRole = roles.find((r) => String(r.id) === String(rolId))
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr || !session?.access_token) {
          throw new Error('Oturum bulunamadı. Tekrar giriş yapın.')
        }
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: email.trim(),
            password: sifre,
            full_name: `${ad} ${soyad}`.trim(),
            role: selectedRole?.rol_adi || '',
            company_id: effectiveCompany,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (fnErr) throw new Error(fnErr.message || 'Kullanıcı oluşturulamadı')
        const authUserId = fnData?.user?.id || fnData?.userId
        if (!authUserId) throw new Error('Auth kullanıcısı oluşturulamadı')

        await supabase.from('kullanicilar').upsert(
          [
            {
              id: authUserId,
              email: email.trim(),
              ad_soyad: `${ad} ${soyad}`.trim(),
              is_system_admin: false,
            },
          ],
          { onConflict: 'id' },
        )

        const { error: pErr } = await supabase.from('personeller').insert([
          {
            ana_sirket_id: effectiveCompany,
            birim_id: birimId || null,
            kullanici_id: authUserId,
            rol_id: rolId,
            personel_kodu: personelKodu,
            durum: true,
            ad: ad.trim(),
            soyad: soyad.trim(),
            email: email.trim(),
          },
        ])
        if (pErr) {
          if (isPersonelKoduUniqueViolation(pErr)) {
            Alert.alert('Hata', personelKoduDuplicateMessage(personelKodu))
            return
          }
          throw pErr
        }
        Alert.alert('Başarılı', 'Personel oluşturuldu')
        navigation.goBack()
        return
      }

      const patch = {
        ad: ad.trim(),
        soyad: soyad.trim(),
        personel_kodu: personelKodu,
        durum,
      }
      if (!limitedSelf) {
        patch.ana_sirket_id = effectiveCompany
        patch.birim_id = birimId || null
        patch.rol_id = rolId
      } else {
        patch.rol_id = rolId
      }

      const { error } = await supabase.from('personeller').update(patch).eq('id', id)
      if (error) {
        if (isPersonelKoduUniqueViolation(error)) {
          Alert.alert('Hata', personelKoduDuplicateMessage(personelKodu))
          return
        }
        throw error
      }
      Alert.alert('Başarılı', 'Personel güncellendi')
      navigation.goBack()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const screenTitle = isNew ? 'Yeni personel' : 'Personel düzenle'

  if (loading) {
    return (
      <AdminScreenLayout title={screenTitle}>
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  const companyLabel = companies.find((c) => String(c.id) === String(companyId))?.ana_sirket_adi || '—'
  const birimLabel = units.find((u) => String(u.id) === String(birimId))?.birim_adi || 'Birim seç'
  const rolLabel = roles.find((r) => String(r.id) === String(rolId))?.rol_adi || 'Rol seç'

  return (
    <AdminScreenLayout title={screenTitle}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['3xl'] }}>
        <AdminTextField label="Ad *" value={ad} onChangeText={setAd} editable={!limitedSelf} />
        <AdminTextField label="Soyad *" value={soyad} onChangeText={setSoyad} editable={!limitedSelf} />
        {isNew ? (
          <>
            <AdminTextField label="E-posta *" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <AdminTextField label="Parola *" value={sifre} onChangeText={setSifre} secureTextEntry />
            <AdminTextField label="Parola tekrar *" value={sifreTekrar} onChangeText={setSifreTekrar} secureTextEntry />
          </>
        ) : (
          <AdminTextField label="E-posta" value={loadedEmail || email} editable={false} />
        )}
        <AdminTextField label="Personel kodu *" value={kod} onChangeText={setKod} editable={!limitedSelf} />

        {!limitedSelf && !companyScoped ? (
          <TouchableOpacity
            onPress={() =>
              pickFromList('Şirket', companies.map((c) => ({ label: c.ana_sirket_adi, value: String(c.id) })), setCompanyId)
            }
          >
            <AdminTextField label="Şirket" value={companyLabel} editable={false} />
          </TouchableOpacity>
        ) : (
          <AdminTextField label="Şirket" value={companyLabel} editable={false} />
        )}

        {!limitedSelf ? (
          <TouchableOpacity
            onPress={() =>
              pickFromList('Birim', [{ label: '—', value: '' }, ...units.map((u) => ({ label: u.birim_adi, value: String(u.id) }))], setBirimId)
            }
          >
            <AdminTextField label="Birim" value={birimLabel} editable={false} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={() => pickFromList('Rol', roles.map((r) => ({ label: r.rol_adi, value: String(r.id) })), setRolId)}
        >
          <AdminTextField label="Rol *" value={rolLabel} editable={false} />
        </TouchableOpacity>

        {!limitedSelf ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <Switch value={durum} onValueChange={setDurum} />
            <Text variant="bodySm">Aktif</Text>
          </View>
        ) : null}

        <Button variant="primary" size="md" fullWidth loading={saving} onPress={save}>
          Kaydet
        </Button>
      </ScrollView>
    </AdminScreenLayout>
  )
}
