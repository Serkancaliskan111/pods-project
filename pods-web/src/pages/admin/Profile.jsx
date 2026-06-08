import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Camera, LogOut, Mail, Pencil, Trash2, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../lib/supabaseClient'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { canEditStaffRecord } from '../../lib/permissions.js'
import { pageSurfaceStyle } from '../../lib/userUiPreferences.js'
import {
  removeProfilePhoto,
  uploadProfilePhoto,
} from '../../lib/profilePhotoApi.js'
import UserProfileAvatar from '../../components/UserProfileAvatar.jsx'
import ProfileAppearanceSettings from './profile/ProfileAppearanceSettings.jsx'
import {
  Button,
  Card,
  GradientHero,
  PageHeader,
  Section,
  Spinner,
  Text,
} from '../../ui'

const supabase = getSupabase()

function ProfileField({ label, value, icon: Icon }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-3 last:border-0 last:pb-0 first:pt-0">
      {Icon ? (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <Text variant="caption" className="text-slate-500 block">
          {label}
        </Text>
        <Text variant="body" className="mt-0.5 font-semibold text-slate-900 block break-words">
          {value || '—'}
        </Text>
      </div>
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, profile, personel, signOut, refreshProfile } = useContext(AuthContext)
  const [loading, setLoading] = useState(false)
  const [companyName, setCompanyName] = useState(null)
  const [unitName, setUnitName] = useState(null)
  const [personelKodu, setPersonelKodu] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileInputRef = useRef(null)

  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin

  const displayName = useMemo(() => {
    if (profile?.ad && profile?.soyad) return `${profile.ad} ${profile.soyad}`.trim()
    if (profile?.ad_soyad) return profile.ad_soyad
    return user?.email?.split('@')[0] || 'Kullanıcı'
  }, [profile?.ad, profile?.soyad, profile?.ad_soyad, user?.email])

  const email = user?.email ?? profile?.email ?? ''
  const roleLabel = isSystemAdmin
    ? 'Sistem yöneticisi'
    : personel?.roleName || 'Personel'

  const canEditOwnProfile =
    !!personel?.id &&
    canEditStaffRecord(permissions, isSystemAdmin, { isOwnRecord: true })
  const editPath = canEditOwnProfile ? `/admin/staff/edit/${personel.id}` : null

  const profilFotoYol = profile?.profil_foto_yol || null
  const avatarId = profile?.avatar_id || null

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
        console.error('Profile load', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [personel?.id, personel?.ana_sirket_id, personel?.birim_id, isSystemAdmin])

  const onPickPhoto = () => {
    if (!user?.id || photoBusy) return
    fileInputRef.current?.click()
  }

  const onPhotoSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user?.id) return
    setPhotoBusy(true)
    try {
      await uploadProfilePhoto(user.id, file)
      await refreshProfile?.()
      toast.success('Profil fotoğrafı güncellendi.')
    } catch (err) {
      toast.error(err?.message || 'Profil fotoğrafı yüklenemedi.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const onRemovePhoto = async () => {
    if (!user?.id || photoBusy) return
    setPhotoBusy(true)
    try {
      await removeProfilePhoto(user.id, profilFotoYol)
      await refreshProfile?.()
      toast.success('Profil fotoğrafı kaldırıldı.')
    } catch (err) {
      toast.error(err?.message || 'Profil fotoğrafı kaldırılamadı.')
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className="px-4 pb-10 pt-2 sm:px-6" style={pageSurfaceStyle}>
      <PageHeader title="Profil" subtitle="Hesap ve organizasyon bilgileriniz" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={onPhotoSelected}
      />

      <GradientHero
        variant="blurple"
        className="mb-6"
        title={displayName}
        subtitle={email}
        actions={
          editPath ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Pencil size={16} />}
              onClick={() => navigate(editPath)}
            >
              Bilgilerimi düzenle
            </Button>
          ) : null
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="relative">
            <UserProfileAvatar
              photoPath={profilFotoYol}
              avatarId={avatarId}
              name={displayName}
              size={80}
              className="ring-2 ring-white/40"
            />
            <button
              type="button"
              onClick={onPickPhoto}
              disabled={photoBusy}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-md disabled:opacity-60"
              aria-label="Profil fotoğrafı yükle"
            >
              <Camera size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <Text variant="caption" className="!text-white/85 block">
              {roleLabel}
            </Text>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Camera size={14} />}
                onClick={onPickPhoto}
                disabled={photoBusy}
              >
                {photoBusy ? 'Yükleniyor…' : profilFotoYol ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}
              </Button>
              {profilFotoYol ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<Trash2 size={14} />}
                  onClick={onRemovePhoto}
                  disabled={photoBusy}
                  className="!text-white hover:!bg-white/10"
                >
                  Kaldır
                </Button>
              ) : null}
            </div>
            <Text variant="caption" className="!text-white/70 mt-2 block">
              JPEG, PNG, WebP veya HEIC · en fazla 30 MB
            </Text>
          </div>
        </div>
      </GradientHero>

      <Section title="Hesap bilgileri">
        <Card padding="lg" radius="2xl">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
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
        <ProfileAppearanceSettings
          userId={user.id}
          initialPrefs={profile?.arayuz_tercihleri}
          onSaved={refreshProfile}
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        {editPath ? (
          <Button
            variant="outline"
            iconLeft={<Pencil size={16} />}
            onClick={() => navigate(editPath)}
          >
            Bilgilerimi düzenle
          </Button>
        ) : null}
        <Button variant="danger" iconLeft={<LogOut size={16} />} onClick={() => signOut?.()}>
          Çıkış yap
        </Button>
      </div>
    </div>
  )
}
