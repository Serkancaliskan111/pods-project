import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AdminPageShell, Button } from '../../../components/admin/AdminDirectory.jsx'
import UserProfileAvatar from '../../../components/UserProfileAvatar.jsx'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canManageStaff } from '../../../lib/permissions.js'
import { formatRelativeTime, formatTs, isPresenceFresh } from '../../../lib/presenceUtils.js'
import { Card, EmptyState, GradientHero, PageHeader, Spinner, StatusBadge, Text } from '../../../ui'

const supabase = getSupabase()
const REFRESH_MS = 5000

const PERSON_SELECT =
  'id,ad,soyad,email,personel_kodu,profil_foto_yol,avatar_id,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at'

const PERSON_SELECT_FALLBACK =
  'id,ad,soyad,email,personel_kodu,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at'

export default function PresenceDetail() {
  const { personId } = useParams()
  const navigate = useNavigate()
  const { profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canTrackPresence = canManageStaff(permissions, isSystemAdmin)

  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState(null)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!personId) return
      if (!silent) setLoading(true)
      try {
        let { data: personRow, error: personErr } = await supabase
          .from('personeller')
          .select(PERSON_SELECT)
          .eq('id', personId)
          .maybeSingle()

        if (personErr?.code === '42703') {
          const retry = await supabase
            .from('personeller')
            .select(PERSON_SELECT_FALLBACK)
            .eq('id', personId)
            .maybeSingle()
          personRow = retry.data
          personErr = retry.error
        }

        if (personErr) throw personErr
        setPerson(personRow || null)
      } catch (e) {
        if (!silent) {
          console.error(e)
          toast.error('Yüklenemedi')
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [personId],
  )

  useEffect(() => {
    if (!canTrackPresence) return
    void load()
    const id = setInterval(() => void load({ silent: true }), REFRESH_MS)
    return () => clearInterval(id)
  }, [canTrackPresence, load])

  const isOnline = isPresenceFresh(person?.mobil_last_seen_at)

  const fullName = useMemo(() => {
    if (!person) return 'Personel'
    return person.ad && person.soyad
      ? `${person.ad} ${person.soyad}`
      : person.email || person.personel_kodu || 'Personel'
  }, [person])

  if (!canTrackPresence) {
    return (
      <AdminPageShell>
        <PageHeader title="Canlı durum" />
        <Card padding="lg" radius="2xl">
          <EmptyState title="Yetki gerekli" description="Personel yönetim yetkisi gerekir." />
        </Card>
      </AdminPageShell>
    )
  }

  if (loading) {
    return (
      <AdminPageShell>
        <Card padding="lg" radius="2xl" className="flex justify-center py-16">
          <Spinner />
        </Card>
      </AdminPageShell>
    )
  }

  if (!person) {
    return (
      <AdminPageShell>
        <PageHeader title="Canlı durum" />
        <Card padding="lg" radius="2xl">
          <EmptyState title="Bulunamadı" description="Personel kaydı yok." />
        </Card>
      </AdminPageShell>
    )
  }

  return (
    <AdminPageShell>
      <GradientHero
        variant="blurple"
        className="mb-6"
        eyebrow="Personel"
        title={fullName}
        subtitle={person.email || person.personel_kodu || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<ArrowLeft size={16} />}
              onClick={() => navigate('/admin/presence')}
            >
              Listeye dön
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<RefreshCw size={16} />}
              onClick={() => void load()}
            >
              Yenile
            </Button>
          </div>
        }
      >
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserProfileAvatar
            photoPath={person.profil_foto_yol}
            avatarId={person.avatar_id}
            name={fullName}
            size={72}
            className="ring-2 ring-white/30"
          />
          <StatusBadge
            tone={isOnline ? 'success' : 'soft'}
            size="lg"
            icon={
              isOnline ? (
                <Wifi size={16} strokeWidth={2.5} aria-hidden />
              ) : (
                <WifiOff size={16} strokeWidth={2.5} aria-hidden />
              )
            }
          >
            {isOnline ? 'Online' : 'Offline'}
          </StatusBadge>
        </div>
      </GradientHero>

      <Card padding="lg" radius="2xl" elevated>
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <Text variant="overline" className="text-slate-500">
              Son görülme
            </Text>
            <Text variant="h2" className="mt-1 !text-xl text-slate-900">
              {formatRelativeTime(person.mobil_last_seen_at)}
            </Text>
            <Text variant="caption" className="mt-1 block text-slate-400">
              {formatTs(person.mobil_last_seen_at)}
            </Text>
          </div>
          <div>
            <Text variant="overline" className="text-slate-500">
              Son bağlantı kesilmesi
            </Text>
            <Text variant="h2" className="mt-1 !text-xl text-slate-900">
              {person.mobil_last_offline_at ? formatRelativeTime(person.mobil_last_offline_at) : '—'}
            </Text>
            {person.mobil_last_offline_at ? (
              <Text variant="caption" className="mt-1 block text-slate-400">
                {formatTs(person.mobil_last_offline_at)}
              </Text>
            ) : null}
          </div>
        </dl>
      </Card>
    </AdminPageShell>
  )
}
