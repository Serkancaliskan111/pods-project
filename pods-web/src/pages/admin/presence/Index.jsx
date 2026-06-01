import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  AdminFilterSelect,
  AdminFiltersBar,
  AdminListPanel,
  AdminPageShell,
  AdminSearchField,
  Button,
  PageHeader,
} from '../../../components/admin/AdminDirectory.jsx'
import getSupabase from '../../../lib/supabaseClient'
import { Card, Chip, EmptyState, GradientHero, Section, Text } from '../../../ui'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  enrichScopeWithJunctionPersonelIds,
  scopeBirimlerQuery,
  scopePersonelQuery,
} from '../../../lib/supabaseScope.js'
import { canManageStaff } from '../../../lib/permissions.js'
import { resolveStaffOnlineState } from '../../../lib/presenceUtils.js'
import PresenceStaffRow from './components/PresenceStaffRow.jsx'

const supabase = getSupabase()
const REFRESH_MS = 2500

function isMissingPresenceColumnsError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42703' ||
    msg.includes('mobil_online') ||
    msg.includes('mobil_online_at') ||
    msg.includes('mobil_last_seen_at') ||
    msg.includes('mobil_last_offline_at')
  )
}

function isMissingPresenceLogTableError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return error?.code === '42p01' || msg.includes('personel_online_kayitlari')
}

function PresenceStatPill({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon size={20} strokeWidth={2.25} aria-hidden />
        </span>
        <div>
          <p className="text-3xl font-extrabold leading-none tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm font-medium text-white/80">{label}</p>
        </div>
      </div>
    </div>
  )
}

function PresenceStaffSection({ title, subtitle, tone, rows, unitName, emptyTitle, emptyDescription }) {
  return (
    <Section
      title={title}
      subtitle={subtitle}
      icon={<Radio size={18} strokeWidth={2.5} />}
      tone={tone}
      className="min-w-0"
    >
      <AdminListPanel
        loading={false}
        empty={!rows.length}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      >
        {rows.map((p) => (
          <PresenceStaffRow key={p.id} person={p} unitLabel={unitName(p.birim_id)} />
        ))}
      </AdminListPanel>
    </Section>
  )
}

export default function PresenceIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canTrackPresence = canManageStaff(permissions, isSystemAdmin)
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []
  const scope = useMemo(
    () => ({ isSystemAdmin, currentCompanyId, accessibleUnitIds }),
    [isSystemAdmin, currentCompanyId, JSON.stringify(accessibleUnitIds || [])],
  )

  const [loading, setLoading] = useState(true)
  const [presenceColumnsAvailable, setPresenceColumnsAvailable] = useState(true)
  const [logsTableAvailable, setLogsTableAvailable] = useState(true)
  const [staffRows, setStaffRows] = useState([])
  const [search, setSearch] = useState('')
  const [listMode, setListMode] = useState('all')
  const [units, setUnits] = useState([])
  const [selectedUnitId, setSelectedUnitId] = useState('')

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true)
      try {
        let unitsQuery = supabase
          .from('birimler')
          .select('id,birim_adi,ana_sirket_id')
          .is('silindi_at', null)
        unitsQuery = scopeBirimlerQuery(unitsQuery, scope)

        const scoped = await enrichScopeWithJunctionPersonelIds(supabase, scope)
        const personSelect = presenceColumnsAvailable
          ? 'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at'
          : 'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id'

        let personQuery = supabase.from('personeller').select(personSelect).is('silindi_at', null)
        personQuery = scopePersonelQuery(personQuery, scoped)

        let { data: personeller, error: personelErr } = await personQuery
        if (personelErr && isMissingPresenceColumnsError(personelErr)) {
          setPresenceColumnsAvailable(false)
          let fallback = supabase
            .from('personeller')
            .select('id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id')
            .is('silindi_at', null)
          fallback = scopePersonelQuery(fallback, scoped)
          const fb = await fallback
          personeller = fb.data
          personelErr = fb.error
        }
        if (personelErr) throw personelErr

        const { data: unitsData, error: unitsErr } = await unitsQuery
        if (!unitsErr) setUnits(unitsData || [])

        const people = personeller || []
        const personIds = people.map((p) => p.id).filter(Boolean)
        const latestByPerson = new Map()

        if (logsTableAvailable && personIds.length) {
          const { data: logRows, error: logErr } = await supabase
            .from('personel_online_kayitlari')
            .select('personel_id,durum,kaydedildi_at')
            .order('kaydedildi_at', { ascending: false })
            .limit(300)
            .in('personel_id', personIds)

          if (logErr) {
            if (isMissingPresenceLogTableError(logErr)) {
              setLogsTableAvailable(false)
            } else if (!silent) {
              console.error(logErr)
            }
          } else {
            for (const item of logRows || []) {
              if (!item?.personel_id) continue
              if (!latestByPerson.has(item.personel_id)) latestByPerson.set(item.personel_id, item)
            }
          }
        }

        setStaffRows(
          people.map((p) => {
            const latestLog = latestByPerson.get(p.id)
            return {
              ...p,
              ...resolveStaffOnlineState(p, latestLog, { presenceColumnsAvailable }),
            }
          }),
        )
      } catch (e) {
        if (!silent) {
          console.error(e)
          toast.error('Canlı durum yüklenemedi')
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [logsTableAvailable, presenceColumnsAvailable, scope],
  )

  useEffect(() => {
    if (!canTrackPresence) return
    void load()
    const id = setInterval(() => void load({ silent: true }), REFRESH_MS)
    return () => clearInterval(id)
  }, [canTrackPresence, load])

  useEffect(() => {
    if (!canTrackPresence) return
    const channel = supabase
      .channel(`presence-live-${currentCompanyId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personeller' }, () => {
        void load({ silent: true })
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personel_online_kayitlari' },
        () => void load({ silent: true }),
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [canTrackPresence, currentCompanyId, load])

  const unitName = useCallback(
    (birimId) => units.find((u) => String(u.id) === String(birimId))?.birim_adi || '—',
    [units],
  )

  const presenceStats = useMemo(() => {
    const online = staffRows.filter((p) => p.mobil_online).length
    return { online, offline: staffRows.length - online }
  }, [staffRows])

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = [...staffRows]

    if (listMode === 'online') base = base.filter((p) => p.mobil_online)
    else if (listMode === 'offline') base = base.filter((p) => !p.mobil_online)

    if (selectedUnitId) {
      base = base.filter((p) => String(p.birim_id || '') === String(selectedUnitId))
    }

    if (q) {
      base = base.filter((p) => {
        const text = `${p.ad || ''} ${p.soyad || ''} ${p.email || ''} ${p.personel_kodu || ''}`.toLowerCase()
        return text.includes(q)
      })
    }

    base.sort((a, b) => {
      if (a.mobil_online !== b.mobil_online) return a.mobil_online ? -1 : 1
      const ta = a.mobil_last_seen_at ? new Date(a.mobil_last_seen_at).getTime() : 0
      const tb = b.mobil_last_seen_at ? new Date(b.mobil_last_seen_at).getTime() : 0
      return tb - ta
    })

    return base
  }, [staffRows, search, listMode, selectedUnitId])

  const onlineList = useMemo(() => filteredStaff.filter((p) => p.mobil_online), [filteredStaff])
  const offlineList = useMemo(() => filteredStaff.filter((p) => !p.mobil_online), [filteredStaff])

  if (!canTrackPresence) {
    return (
      <AdminPageShell>
        <PageHeader title="Canlı durum" subtitle="Mobil uygulama bağlantısı" />
        <Card padding="lg" radius="2xl">
          <EmptyState
            title="Yetki gerekli"
            description="Bu sayfayı görüntülemek için personel yönetim yetkisi gerekir."
          />
        </Card>
      </AdminPageShell>
    )
  }

  return (
    <AdminPageShell>
      <GradientHero
        variant="executive"
        className="mb-6"
        eyebrow="Anlık görünüm"
        title="Canlı durum"
        subtitle="Personellerin mobil uygulama bağlantısı. Liste birkaç saniyede bir güncellenir."
        actions={
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw size={16} />}
            onClick={() => void load()}
          >
            Yenile
          </Button>
        }
      >
        <div className="mt-5 grid max-w-lg grid-cols-2 gap-3">
          <PresenceStatPill label="Online" value={presenceStats.online} icon={Wifi} />
          <PresenceStatPill label="Offline" value={presenceStats.offline} icon={WifiOff} />
        </div>
      </GradientHero>

      <AdminFiltersBar>
        <AdminSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad, e-posta veya personel kodu…"
        />
        <AdminFilterSelect
          label="Birim"
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
        >
          <option value="">Tüm birimler</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.birim_adi || 'Birim'}
            </option>
          ))}
        </AdminFilterSelect>
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          <Chip selected={listMode === 'all'} onClick={() => setListMode('all')}>
            Tümü
          </Chip>
          <Chip selected={listMode === 'online'} onClick={() => setListMode('online')}>
            Online
          </Chip>
          <Chip selected={listMode === 'offline'} onClick={() => setListMode('offline')}>
            Offline
          </Chip>
        </div>
      </AdminFiltersBar>

      {loading ? (
        <AdminListPanel loading empty={false}>
          {null}
        </AdminListPanel>
      ) : filteredStaff.length === 0 ? (
        <Card padding="lg" radius="2xl">
          <EmptyState title="Personel bulunamadı" description="Filtreleri değiştirerek tekrar deneyin." />
        </Card>
      ) : listMode === 'all' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <PresenceStaffSection
            title={`Online (${onlineList.length})`}
            subtitle="Mobil uygulamada aktif"
            tone="success"
            rows={onlineList}
            unitName={unitName}
            emptyTitle="Kimse online değil"
            emptyDescription="Şu an mobil uygulamada görünen personel yok."
          />
          <PresenceStaffSection
            title={`Offline (${offlineList.length})`}
            subtitle="Bağlantısı olmayan"
            tone="soft"
            rows={offlineList}
            unitName={unitName}
            emptyTitle="Herkes online"
            emptyDescription="Tüm personel mobil uygulamada görünüyor."
          />
        </div>
      ) : (
        <PresenceStaffSection
          title={listMode === 'online' ? `Online (${onlineList.length})` : `Offline (${offlineList.length})`}
          subtitle={listMode === 'online' ? 'Mobil uygulamada aktif' : 'Bağlantısı olmayan'}
          tone={listMode === 'online' ? 'success' : 'soft'}
          rows={filteredStaff}
          unitName={unitName}
          emptyTitle="Liste boş"
          emptyDescription="Bu filtrede personel yok."
        />
      )}
    </AdminPageShell>
  )
}
