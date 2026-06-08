import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Camera, LogOut, Mail, Trash2, User, Users, Building2 } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import getSupabase from '../lib/supabaseClient'
import { formatFullName } from '../lib/nameFormat'
import {
  createProfilePhotoSignedUrl,
  removeProfilePhoto,
  uploadProfilePhoto,
} from '../lib/profilePhotoApi'
import { useTabBarScrollPadding } from '../navigation/tabBarLayout'
import ProfileAppearanceSettings from '../components/ProfileAppearanceSettings'
import {
  Screen,
  Card,
  Section,
  Button,
  Heading,
  Text,
  palette,
  spacing,
  radii,
} from '../ui'

const supabase = getSupabase()
const PHOTO_SIZE = 56

function ProfileField({ label, value, icon: IconComp }) {
  return (
    <View style={styles.fieldRow}>
      {IconComp ? (
        <View style={styles.fieldIcon}>
          <IconComp size={16} color={palette.slate[600]} strokeWidth={1.75} />
        </View>
      ) : null}
      <View style={styles.fieldBody}>
        <Text variant="caption" color={palette.slate[500]}>
          {label}
        </Text>
        <Text variant="bodySm" weight="SemiBold" color={palette.slate[900]} numberOfLines={2}>
          {value || '—'}
        </Text>
      </View>
    </View>
  )
}

function ProfilePhoto({ photoPath, name, onPressCamera, photoBusy }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    const path = String(photoPath || '').trim()
    if (!path) {
      setUrl(null)
      return undefined
    }
    let alive = true
    void createProfilePhotoSignedUrl(path, 3600)
      .then((signed) => {
        if (alive) setUrl(signed)
      })
      .catch(() => {
        if (alive) setUrl(null)
      })
    return () => {
      alive = false
    }
  }, [photoPath])

  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <View style={styles.photoWrap}>
      {url ? (
        <Image source={{ uri: url }} style={styles.photo} />
      ) : (
        <View style={styles.photoFallback}>
          <Text variant="bodyLg" weight="Bold" color={palette.primary[700]}>
            {initial}
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.cameraBtn}
        activeOpacity={0.85}
        onPress={onPressCamera}
        disabled={photoBusy}
        accessibilityLabel="Profil fotoğrafı yükle"
      >
        <Camera size={14} color={palette.surface} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}

export default function Profile() {
  const { user, profile, personel, signOut } = useAuth()
  const tabBarPad = useTabBarScrollPadding()
  const isSystemAdmin = !!profile?.is_system_admin

  const [companyName, setCompanyName] = useState(null)
  const [unitName, setUnitName] = useState(null)
  const [personelKodu, setPersonelKodu] = useState(null)
  const [loading, setLoading] = useState(false)
  const [profilFotoYol, setProfilFotoYol] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const displayName = useMemo(() => {
    if (profile?.ad && profile?.soyad) return `${profile.ad} ${profile.soyad}`.trim()
    if (profile?.ad_soyad) return profile.ad_soyad
    return (
      formatFullName(profile?.ad, profile?.soyad, '') ||
      formatFullName(personel?.ad, personel?.soyad, '') ||
      user?.email?.split('@')[0] ||
      'Kullanıcı'
    )
  }, [profile?.ad, profile?.soyad, profile?.ad_soyad, personel?.ad, personel?.soyad, user?.email])

  const email = user?.email ?? profile?.email ?? personel?.email ?? ''
  const roleLabel = isSystemAdmin
    ? 'Sistem yöneticisi'
    : personel?.roleName || 'Personel'

  useEffect(() => {
    setProfilFotoYol(profile?.profil_foto_yol || null)
  }, [profile?.profil_foto_yol])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (isSystemAdmin && !personel?.ana_sirket_id) {
        setCompanyName(null)
        setUnitName(null)
        setPersonelKodu(null)
        return
      }
      if (!personel?.id && !personel?.ana_sirket_id) return

      setLoading(true)
      try {
        const [companyRes, unitRes, personelRes] = await Promise.all([
          personel?.ana_sirket_id
            ? supabase
                .from('ana_sirketler')
                .select('ana_sirket_adi')
                .eq('id', personel.ana_sirket_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          personel?.birim_id
            ? supabase
                .from('birimler')
                .select('birim_adi')
                .eq('id', personel.birim_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          personel?.id
            ? supabase
                .from('personeller')
                .select('personel_kodu')
                .eq('id', personel.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        setCompanyName(companyRes.data?.ana_sirket_adi ?? null)
        setUnitName(unitRes.data?.birim_adi ?? null)
        setPersonelKodu(personelRes.data?.personel_kodu ?? null)
      } catch (e) {
        if (__DEV__) console.warn('Profile load error', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [personel?.id, personel?.ana_sirket_id, personel?.birim_id, isSystemAdmin])

  const onPickProfilePhoto = async () => {
    if (!user?.id || photoBusy) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Galeriye erişim izni verin.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    })
    if (res.canceled || !res.assets?.[0]) return
    setPhotoBusy(true)
    try {
      const path = await uploadProfilePhoto(user.id, res.assets[0])
      setProfilFotoYol(path)
      Alert.alert('Tamam', 'Profil fotoğrafı güncellendi.')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Profil fotoğrafı yüklenemedi.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const onRemoveProfilePhoto = async () => {
    if (!user?.id || photoBusy || !profilFotoYol) return
    Alert.alert('Profil fotoğrafı', 'Fotoğrafı kaldırmak istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: async () => {
          setPhotoBusy(true)
          try {
            await removeProfilePhoto(user.id, profilFotoYol)
            setProfilFotoYol(null)
            Alert.alert('Tamam', 'Profil fotoğrafı kaldırıldı.')
          } catch (e) {
            Alert.alert('Hata', e?.message || 'Profil fotoğrafı kaldırılamadı.')
          } finally {
            setPhotoBusy(false)
          }
        },
      },
    ])
  }

  const onPressSignOut = () => {
    Alert.alert('Çıkış yap', 'Oturumu kapatmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  return (
    <Screen scroll padded contentContainerStyle={{ paddingBottom: tabBarPad }}>
      <View style={styles.pageHeader}>
        <Heading variant="h2">Profil</Heading>
        <Text variant="caption" color={palette.slate[500]}>
          Hesap ve görünüm ayarları
        </Text>
      </View>

      <Card tone="surface" elevated radius="xl" padding="md" style={styles.profileCard}>
        <View style={styles.profileRow}>
          <ProfilePhoto
            photoPath={profilFotoYol}
            name={displayName}
            onPressCamera={onPickProfilePhoto}
            photoBusy={photoBusy}
          />
          <View style={styles.profileMeta}>
            <Text variant="bodyMd" weight="Bold" color={palette.slate[900]} numberOfLines={2}>
              {displayName}
            </Text>
            <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
              {email}
            </Text>
            <View style={styles.rolePill}>
              <Text variant="caption" weight="SemiBold" color={palette.primary[700]}>
                {roleLabel}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.photoActions}>
          <TouchableOpacity
            style={styles.photoActionBtn}
            onPress={onPickProfilePhoto}
            disabled={photoBusy}
            activeOpacity={0.85}
          >
            <Camera size={15} color={palette.primary[700]} strokeWidth={2} />
            <Text variant="caption" weight="SemiBold" color={palette.primary[700]}>
              {photoBusy ? 'Yükleniyor…' : profilFotoYol ? 'Değiştir' : 'Fotoğraf ekle'}
            </Text>
          </TouchableOpacity>
          {profilFotoYol ? (
            <TouchableOpacity
              style={[styles.photoActionBtn, styles.photoActionBtnDanger]}
              onPress={onRemoveProfilePhoto}
              disabled={photoBusy}
              activeOpacity={0.85}
            >
              <Trash2 size={15} color={palette.danger[600]} strokeWidth={2} />
              <Text variant="caption" weight="SemiBold" color={palette.danger[600]}>
                Kaldır
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>

      <Section title="Hesap bilgileri" style={styles.sectionGap}>
        <Card tone="surface" elevated padding="md" radius="xl">
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={palette.primary[700]} />
            </View>
          ) : (
            <>
              <ProfileField label="Ad soyad" value={displayName} icon={User} />
              <ProfileField label="E-posta" value={email} icon={Mail} />
              <ProfileField label="Rol" value={roleLabel} icon={Users} />
              {!isSystemAdmin ? (
                <>
                  <ProfileField label="Şirket" value={companyName} icon={Building2} />
                  <ProfileField label="Birim" value={unitName} icon={Building2} />
                  {personelKodu ? (
                    <ProfileField label="Personel kodu" value={personelKodu} icon={User} />
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </Card>
      </Section>

      {user?.id ? (
        <ProfileAppearanceSettings userId={user.id} initialPrefs={profile?.arayuz_tercihleri} />
      ) : null}

      <Button
        variant="danger"
        iconLeft={<LogOut size={16} color={palette.surface} />}
        onPress={onPressSignOut}
        fullWidth
        style={styles.signOutBtn}
      >
        Çıkış yap
      </Button>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pageHeader: {
    marginBottom: spacing.md,
    gap: 2,
  },
  profileCard: {
    marginBottom: spacing.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: palette.primary[50],
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.slate[100],
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.lg,
    backgroundColor: palette.primary[50],
    borderWidth: 1,
    borderColor: palette.primary[100],
  },
  photoActionBtnDanger: {
    backgroundColor: palette.danger[50],
    borderColor: palette.danger[100],
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: palette.slate[200],
    borderWidth: 2,
    borderColor: palette.slate[100],
  },
  photoFallback: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: palette.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.primary[100],
  },
  cameraBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.primary[600],
    borderWidth: 2,
    borderColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionGap: {
    marginTop: spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  fieldIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: palette.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldBody: {
    flex: 1,
    minWidth: 0,
  },
  loadingBox: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  signOutBtn: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
})
