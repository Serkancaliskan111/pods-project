import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import getSupabase from '../lib/supabaseClient'
import Theme from '../theme/theme'
import { formatFullName } from '../lib/nameFormat'
import { AVATAR_TEMPLATES, DEFAULT_AVATAR_ID, getAvatarById } from '../lib/avatarTemplates'
import { loadAvatarPreference, saveAvatarPreference } from '../lib/avatarPreference'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const supabase = getSupabase()
const ThemeObj = Theme?.default ?? Theme
const { Typography } = ThemeObj

export default function Profile() {
  const { user, profile, personel, signOut } = useAuth()
  const [companyName, setCompanyName] = useState(null)
  const [unitName, setUnitName] = useState(null)
  const [loading, setLoading] = useState(false)
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID)
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false)

  const displayName =
    formatFullName(profile?.ad, profile?.soyad, '') ||
    profile?.ad_soyad ||
    formatFullName(personel?.ad, personel?.soyad, '') ||
    personel?.ad_soyad ||
    user?.email?.split('@')[0] ||
    'Kullanıcı'
  const email = user?.email ?? profile?.email ?? personel?.email ?? ''
  const selectedAvatar = useMemo(() => getAvatarById(avatarId), [avatarId])

  const tenant = useMemo(
    () => ({
      anaSirketId: personel?.ana_sirket_id ?? null,
      birimId: personel?.birim_id ?? null,
    }),
    [personel?.ana_sirket_id, personel?.birim_id],
  )

  useEffect(() => {
    const loadNames = async () => {
      if (!tenant.anaSirketId) return
      setLoading(true)
      try {
        const { data: companyData, error: companyErr } = await supabase
          .from('ana_sirketler')
          .select('ana_sirket_adi')
          .eq('id', tenant.anaSirketId)
          .maybeSingle()

        if (companyErr) {
          if (__DEV__) console.warn('Profile company load error', companyErr)
        }
        setCompanyName(companyData?.ana_sirket_adi ?? null)

        if (tenant.birimId) {
          const { data: unitData, error: unitErr } = await supabase
            .from('birimler')
            .select('birim_adi')
            .eq('id', tenant.birimId)
            .eq('ana_sirket_id', tenant.anaSirketId)
            .maybeSingle()

          if (unitErr) {
            if (__DEV__) console.warn('Profile unit load error', unitErr)
          }
          setUnitName(unitData?.birim_adi ?? null)
        } else {
          setUnitName(null)
        }
      } catch (e) {
        if (__DEV__) console.warn('Profile load error', e)
      } finally {
        setLoading(false)
      }
    }
    loadNames()
  }, [tenant.anaSirketId, tenant.birimId])

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return
      const next = await loadAvatarPreference(user.id)
      setAvatarId(next || DEFAULT_AVATAR_ID)
    }
    run()
  }, [user?.id])

  const onSelectAvatar = async (nextId) => {
    if (!user?.id) return
    setAvatarId(nextId)
    await saveAvatarPreference(user.id, nextId)
    setAvatarPickerVisible(false)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PremiumBackgroundPattern />
      <View style={styles.page}>
        <Text style={styles.heading}>Profil</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Avatar</Text>
          <View style={styles.avatarPreviewRow}>
            <View style={styles.avatarPreviewCircle}>
              <Text style={styles.avatarPreviewEmoji}>{selectedAvatar?.emoji || '👤'}</Text>
            </View>
            <View style={styles.avatarPreviewMeta}>
              <Text style={styles.avatarPreviewText}>{selectedAvatar?.label || 'Avatar'}</Text>
              <TouchableOpacity
                style={styles.avatarSelectBtn}
                onPress={() => setAvatarPickerVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.avatarSelectBtnText}>Avatar Seç</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.label}>Ad Soyad</Text>
          <Text style={styles.value}>{displayName}</Text>

          {loading ? <ActivityIndicator size="small" color={ThemeObj.Colors.primary} /> : null}

          <Text style={styles.label}>Şirket</Text>
          <Text style={styles.valueSmall}>{companyName ?? '-'}</Text>

          <Text style={styles.label}>Birim</Text>
          <Text style={styles.valueSmall}>{unitName ?? '-'}</Text>

          <Text style={styles.label}>E-posta</Text>
          <Text style={styles.value}>{email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={signOut} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={avatarPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarPickerVisible(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setAvatarPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Avatar Seç</Text>
            <ScrollView contentContainerStyle={styles.avatarGrid}>
              {AVATAR_TEMPLATES.map((item) => {
                const isActive = item.id === avatarId
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.avatarOption, isActive && styles.avatarOptionActive]}
                    onPress={() => onSelectAvatar(item.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.avatarOptionEmoji}>{item.emoji}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ThemeObj.Colors.background },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  heading: { fontSize: ThemeObj.Typography.heading.fontSize, fontWeight: '700', color: ThemeObj.Colors.text, marginBottom: 20 },
  card: {
    backgroundColor: ThemeObj.Colors.surface,
    padding: 20,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    marginBottom: 24,
    ...ThemeObj.Shadows.card,
  },
  label: {
    fontSize: ThemeObj.Typography.caption.fontSize,
    color: ThemeObj.Colors.mutedText,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  value: { fontSize: ThemeObj.Typography.body.fontSize, color: ThemeObj.Colors.text, marginBottom: 16, fontWeight: '500' },
  valueSmall: { fontSize: ThemeObj.Typography.body.fontSize, color: ThemeObj.Colors.text, marginBottom: 16, fontWeight: '500' },
  avatarPreviewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarPreviewCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ThemeObj.Colors.alpha.navy05,
    borderWidth: 1,
    borderColor: ThemeObj.Colors.alpha.gray20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarPreviewEmoji: { fontSize: 28 },
  avatarPreviewMeta: { flex: 1, justifyContent: 'center' },
  avatarPreviewText: { color: ThemeObj.Colors.primary, fontWeight: '700', fontSize: ThemeObj.Typography.body.fontSize, marginBottom: 8 },
  avatarSelectBtn: {
    alignSelf: 'flex-start',
    backgroundColor: ThemeObj.Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  avatarSelectBtnText: {
    color: ThemeObj.Colors.surface,
    fontWeight: '700',
    fontSize: ThemeObj.Typography.caption.fontSize,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: ThemeObj.Colors.alpha.black40,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pickerSheet: {
    backgroundColor: ThemeObj.Colors.surface,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    padding: 16,
    maxHeight: '70%',
    ...ThemeObj.Shadows.card,
  },
  pickerTitle: {
    color: ThemeObj.Colors.primary,
    fontWeight: '700',
    fontSize: ThemeObj.Typography.subheading.fontSize,
    marginBottom: 12,
  },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ThemeObj.Colors.alpha.navy05,
    borderWidth: 1,
    borderColor: ThemeObj.Colors.alpha.gray20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOptionActive: {
    borderColor: ThemeObj.Colors.accent,
    backgroundColor: ThemeObj.Colors.alpha.indigo06,
  },
  avatarOptionEmoji: { fontSize: 24 },
  logoutBtn: {
    backgroundColor: ThemeObj.Colors.accent,
    padding: 16,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    alignItems: 'center',
  },
  logoutText: { color: ThemeObj.Colors.surface, fontWeight: '600', fontSize: ThemeObj.Typography.body.fontSize },
})
