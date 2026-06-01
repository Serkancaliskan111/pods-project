import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useAuth } from '../contexts/AuthContext'
import getSupabase from '../lib/supabaseClient'
import { formatFullName } from '../lib/nameFormat'
import { AVATAR_TEMPLATES, DEFAULT_AVATAR_ID, getAvatarById } from '../lib/avatarTemplates'
import { loadAvatarPreference, saveAvatarPreference } from '../lib/avatarPreference'
import {
  createProfilePhotoSignedUrl,
  removeProfilePhoto,
  uploadProfilePhoto,
} from '../lib/profilePhotoApi'
import {
  Screen,
  Card,
  Section,
  Button,
  Heading,
  Text,
  Sheet,
  IconBubble,
  GradientHero,
  palette,
  spacing,
  radii,
  shadows,
  Icon,
} from '../ui'

const supabase = getSupabase()

/**
 * Avatar template render helper — sablonun `icon` + `bg` + `fg` alanlarını
 * tek bir daire icine cizer. Kullanim: <AvatarBubble template={tpl} size={48} />
 */
function AvatarBubble({ template, size = 48, iconSize, style }) {
  const tpl = template || getAvatarById(DEFAULT_AVATAR_ID)
  const IconComp = tpl?.icon || Icon.AvatarPerson
  const bg = tpl?.bg || palette.primary[100]
  const fg = tpl?.fg || palette.primary[700]
  const isize = iconSize || Math.round(size * 0.5)
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <IconComp size={isize} color={fg} strokeWidth={2} />
    </View>
  )
}

const supabaseClient = supabase

function ProfilePhotoOrAvatar({ photoPath, template, size = 64, iconSize, style }) {
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

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: palette.slate[200],
          },
          style,
        ]}
      />
    )
  }

  return <AvatarBubble template={template} size={size} iconSize={iconSize} style={style} />
}

export default function Profile() {
  const { user, profile, personel, signOut } = useAuth()
  const [companyName, setCompanyName] = useState(null)
  const [unitName, setUnitName] = useState(null)
  const [loading, setLoading] = useState(false)
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID)
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false)
  const [profilFotoYol, setProfilFotoYol] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const displayName =
    formatFullName(profile?.ad, profile?.soyad, '') ||
    profile?.ad_soyad ||
    formatFullName(personel?.ad, personel?.soyad, '') ||
    personel?.ad_soyad ||
    user?.email?.split('@')[0] ||
    'Kullanıcı'
  const email = user?.email ?? profile?.email ?? personel?.email ?? ''
  const selectedAvatar = useMemo(() => getAvatarById(avatarId), [avatarId])
  const roleLabel =
    profile?.is_system_admin
      ? 'Sistem Yöneticisi'
      : personel?.is_manager
      ? 'Yönetici'
      : 'Personel'

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
        const { data: companyData, error: companyErr } = await supabaseClient
          .from('ana_sirketler')
          .select('ana_sirket_adi')
          .eq('id', tenant.anaSirketId)
          .maybeSingle()

        if (companyErr) {
          if (__DEV__) console.warn('Profile company load error', companyErr)
        }
        setCompanyName(companyData?.ana_sirket_adi ?? null)

        if (tenant.birimId) {
          const { data: unitData, error: unitErr } = await supabaseClient
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

  useEffect(() => {
    setProfilFotoYol(profile?.profil_foto_yol || null)
  }, [profile?.profil_foto_yol])

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

  const onRemoveProfilePhoto = () => {
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
          } catch (e) {
            Alert.alert('Hata', e?.message || 'Profil fotoğrafı kaldırılamadı.')
          } finally {
            setPhotoBusy(false)
          }
        },
      },
    ])
  }

  const onSelectAvatar = async (nextId) => {
    if (!user?.id) return
    setAvatarId(nextId)
    await saveAvatarPreference(user.id, nextId)
    try {
      const { error } = await supabaseClient
        .from('kullanicilar')
        .update({ avatar_id: String(nextId) })
        .eq('id', user.id)
      if (error && __DEV__) console.warn('Profile avatar sync error', error)
    } catch (e) {
      if (__DEV__) console.warn('Profile avatar sync exception', e)
    }
    setAvatarPickerVisible(false)
  }

  const onPressSignOut = () => {
    Alert.alert(
      'Çıkış Onayı',
      'Sistemden çıkmak istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Son Onay',
              'Çıkış yaparsanız online durumunuz offline olarak işlenecek. Devam edilsin mi?',
              [
                { text: 'Hayır', style: 'cancel' },
                { text: 'Evet, Çıkış Yap', style: 'destructive', onPress: () => void signOut() },
              ],
            )
          },
        },
      ],
    )
  }

  return (
    <Screen scroll padded onRefresh={undefined} bottomInset>
      <GradientHero
        eyebrow="HESABIM"
        title={displayName}
        subtitle={email}
        right={
          <ProfilePhotoOrAvatar
            photoPath={profilFotoYol}
            template={selectedAvatar}
            size={64}
            iconSize={30}
            style={styles.heroAvatarPreview}
          />
        }
        bottom={
          <View style={styles.heroBottom}>
            <View style={styles.heroRolePill}>
              <Text variant="overline" color={palette.surface}>
                {roleLabel}
              </Text>
            </View>
            <Button
              variant="ghost"
              size="sm"
              onPress={onPickProfilePhoto}
              disabled={photoBusy}
              style={styles.heroGhostBtn}
              textStyle={{ color: palette.surface }}
            >
              {photoBusy ? 'Yükleniyor…' : profilFotoYol ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}
            </Button>
          </View>
        }
      />

      <Section
        title="Hesap Bilgileri"
        subtitle="Aktif kapsam ve kimlik"
        icon={
          <IconBubble tone="primary" size="md">
            <Icon.IdCard size={18} color={palette.primary[700]} strokeWidth={2} />
          </IconBubble>
        }
        style={styles.sectionGap}
      >
        <View style={styles.infoGrid}>
          <Card tone="primary" padding="md" radius="2xl" style={styles.infoCard}>
            <Text variant="overline" color={palette.primary[700]}>
              ŞİRKET
            </Text>
            <Text
              variant="bodyLg"
              weight="Bold"
              color={palette.primary[700]}
              style={styles.infoValue}
              numberOfLines={2}
            >
              {loading ? '…' : companyName ?? '—'}
            </Text>
          </Card>
          <Card tone="blurple" padding="md" radius="2xl" style={styles.infoCard}>
            <Text variant="overline" color={palette.blurple[700]}>
              BİRİM
            </Text>
            <Text
              variant="bodyLg"
              weight="Bold"
              color={palette.blurple[700]}
              style={styles.infoValue}
              numberOfLines={2}
            >
              {loading ? '…' : unitName ?? '—'}
            </Text>
          </Card>
        </View>

        <Card tone="surface" padding="md" radius="2xl" style={styles.emailCard}>
          <View style={styles.emailRow}>
            <IconBubble tone="accent" size="md">
              <Icon.Mail size={18} color={palette.accent[700]} strokeWidth={2} />
            </IconBubble>
            <View style={{ flex: 1 }}>
              <Text variant="overline" color={palette.slate[500]}>
                E-POSTA
              </Text>
              <Text
                variant="bodyLg"
                weight="SemiBold"
                color={palette.slate[800]}
                numberOfLines={1}
              >
                {email || '—'}
              </Text>
            </View>
          </View>
        </Card>
      </Section>

      <Section
        title="Tercihler"
        subtitle="Avatar ve oturum"
        icon={
          <IconBubble tone="accent" size="md">
            <Icon.Settings size={18} color={palette.accent[700]} strokeWidth={2} />
          </IconBubble>
        }
        style={styles.sectionGap}
      >
        <Card tone="surface" padding="none" radius="2xl">
          <TouchableOpacity
            style={styles.settingsRow}
            activeOpacity={0.85}
            onPress={onPickProfilePhoto}
            disabled={photoBusy}
          >
            <ProfilePhotoOrAvatar
              photoPath={profilFotoYol}
              template={selectedAvatar}
              size={44}
              iconSize={20}
            />
            <View style={{ flex: 1 }}>
              <Text variant="bodyLg" weight="Bold" color={palette.slate[800]}>
                Profil fotoğrafı
              </Text>
              <Text variant="caption" color={palette.slate[500]}>
                {profilFotoYol ? 'Fotoğraf yüklü' : 'Galeriden fotoğraf seçin'}
              </Text>
            </View>
            <Icon.Forward size={20} color={palette.slate[400]} strokeWidth={2} />
          </TouchableOpacity>
          {profilFotoYol ? (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingsRow}
                activeOpacity={0.85}
                onPress={onRemoveProfilePhoto}
                disabled={photoBusy}
              >
                <IconBubble tone="danger" size="md">
                  <Icon.Trash2 size={18} color={palette.danger[700]} strokeWidth={2} />
                </IconBubble>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLg" weight="Bold" color={palette.danger[700]}>
                    Fotoğrafı kaldır
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          ) : null}
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.settingsRow}
            activeOpacity={0.85}
            onPress={() => setAvatarPickerVisible(true)}
          >
            <AvatarBubble template={selectedAvatar} size={44} iconSize={20} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyLg" weight="Bold" color={palette.slate[800]}>
                Avatar şablonu
              </Text>
              <Text variant="caption" color={palette.slate[500]}>
                Şu an: {selectedAvatar?.label || 'Avatar'}
              </Text>
            </View>
            <Icon.Forward size={20} color={palette.slate[400]} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.settingsRow}
            activeOpacity={0.85}
            onPress={onPressSignOut}
          >
            <IconBubble tone="danger" size="md">
              <Icon.Logout size={18} color={palette.danger[700]} strokeWidth={2} />
            </IconBubble>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLg" weight="Bold" color={palette.danger[700]}>
                Çıkış Yap
              </Text>
              <Text variant="caption" color={palette.danger[600]}>
                Oturumu sonlandır ve online durumu offline yap
              </Text>
            </View>
            <Icon.Forward size={20} color={palette.danger[500]} strokeWidth={2} />
          </TouchableOpacity>
        </Card>
      </Section>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.primary[700]} />
        </View>
      ) : null}

      <Sheet
        visible={avatarPickerVisible}
        onClose={() => setAvatarPickerVisible(false)}
        padding="md"
        maxHeight="80%"
      >
        <View style={styles.pickerHeader}>
          <Heading variant="h1">Avatar Seç</Heading>
          <Text variant="caption" color={palette.slate[500]}>
            Profilinde gösterilecek avatar
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.avatarGrid}>
          {AVATAR_TEMPLATES.map((item) => {
            const isActive = item.id === avatarId
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onSelectAvatar(item.id)}
                style={[styles.avatarOption, isActive && styles.avatarOptionActive]}
                activeOpacity={0.85}
              >
                <AvatarBubble template={item} size={56} iconSize={26} />
                {isActive ? (
                  <View style={styles.avatarActiveDot}>
                    <Icon.Delivered size={14} color={palette.surface} strokeWidth={3} />
                  </View>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heroAvatarPreview: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    ...shadows.sm,
  },
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroRolePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  heroGhostBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  sectionGap: {
    marginTop: spacing.lg,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  infoCard: {
    flex: 1,
  },
  infoValue: {
    marginTop: 4,
  },
  emailCard: {
    marginTop: spacing.md,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: palette.slate[100],
    marginHorizontal: spacing.lg,
  },
  loadingRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  pickerHeader: {
    marginBottom: spacing.lg,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  avatarOption: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 4,
  },
  avatarOptionActive: {
    ...shadows.accent,
  },
  avatarActiveDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
})
