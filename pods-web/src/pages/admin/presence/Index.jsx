import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { scopePersonelQuery } from '../../../lib/supabaseScope.js'
import { canManageStaff } from '../../../lib/permissions.js'

const supabase = getSupabase()
const REFRESH_MS = 2500
const PRESENCE_STALE_MS = 12 * 1000

function formatTs(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('tr-TR')
}

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

function isPresenceFresh(value) {
  if (!value) return false
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= PRESENCE_STALE_MS
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
  const [recentLogs, setRecentLogs] = useState([])
  const [search, setSearch] = useState('')
  const [listMode, setListMode] = useState('online')
  const navigate = useNavigate()

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      let personQuery = supabase
        .from('personeller')
        .select(
          presenceColumnsAvailable
            ? 'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at'
            : 'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id',
        )
        .is('silindi_at', null)
      personQuery = scopePersonelQuery(personQuery, scope)

      let { data: personeller, error: personelErr } = await personQuery
      if (personelErr && isMissingPresenceColumnsError(personelErr)) {
        setPresenceColumnsAvailable(false)
        let fallback = supabase
          .from('personeller')
          .select('id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id')
          .is('silindi_at', null)
        fallback = scopePersonelQuery(fallback, scope)
        const fb = await fallback
        personeller = fb.data
        personelErr = fb.error
      }
      if (personelErr) throw personelErr

      const people = personeller || []
      const personIds = people.map((p) => p.id).filter(Boolean)
      let logs = []

      if (logsTableAvailable && personIds.length) {
        let logsQuery = supabase
          .from('personel_online_kayitlari')
          .select('id,personel_id,durum,aciklama,kaydedildi_at')
          .order('kaydedildi_at', { ascending: false })
          .limit(300)
          .in('personel_id', personIds)

        const { data: logRows, error: logErr } = await logsQuery
        if (logErr) {
          if (isMissingPresenceLogTableError(logErr)) {
            setLogsTableAvailable(false)
          } else if (!silent) {
            console.error(logErr)
            toast.error('Online/offline logları okunamadı')
          }
        } else {
          logs = logRows || []
        }
      }

      const latestByPerson = new Map()
      for (const item of logs) {
        if (!item?.personel_id) continue
        if (!latestByPerson.has(item.personel_id)) latestByPerson.set(item.personel_id, item)
      }

      const merged = people.map((p) => {
        const latestLog = latestByPerson.get(p.id)
        const rawOnlineFromColumns = presenceColumnsAvailable
          ? !!p.mobil_online
          : latestLog?.durum === 'online'
        const lastSeen = p.mobil_last_seen_at || latestLog?.kaydedildi_at || null
        let online = rawOnlineFromColumns && isPresenceFresh(lastSeen)
        if (latestLog?.durum === 'offline') {
          online = false
        } else if (latestLog?.durum === 'online') {
          online = isPresenceFresh(latestLog?.kaydedildi_at || lastSeen)
        }
        return {
          ...p,
          mobil_online: online,
          mobil_online_at: p.mobil_online_at || (latestLog?.durum === 'online' ? latestLog?.kaydedildi_at : null),
          mobil_last_seen_at: lastSeen,
          mobil_last_offline_at:
            p.mobil_last_offline_at || (latestLog?.durum === 'offline' ? latestLog?.kaydedildi_at : null),
        }
      })

      const nameById = Object.fromEntries(
        merged.map((p) => [
          p.id,
          p.ad && p.soyad ? `${p.ad} ${p.soyad}` : p.email || p.personel_kodu || 'Personel',
        ]),
      )

      setStaffRows(merged)
      setRecentLogs(
        logs.map((l) => ({
          ...l,
          personelName: nameById[l.personel_id] || l.personel_id,
        })),
      )
    } catch (e) {
      if (!silent) {
        console.error(e)
        toast.error('Online/offline verileri yüklenemedi')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [logsTableAvailable, presenceColumnsAvailable, scope])

  useEffect(() => {
    if (!canTrackPresence) return
    void load()
    const id = setInterval(() => {
      void load({ silent: true })
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [canTrackPresence, load])

  useEffect(() => {
    if (!canTrackPresence) return
    const channel = supabase
      .channel(`presence-live-${currentCompanyId || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personeller' },
        () => {
          void load({ silent: true })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personel_online_kayitlari' },
        () => {
          void load({ silent: true })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [canTrackPresence, currentCompanyId, load])

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = listMode === 'online'
      ? staffRows.filter((p) => !!p.mobil_online)
      : staffRows
    if (!q) return base
    return base.filter((p) => {
      const text = `${p.ad || ''} ${p.soyad || ''} ${p.email || ''} ${p.personel_kodu || ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [staffRows, search, listMode])

  if (!canTrackPresence) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a1e42' }}>Canli Durum Takibi</h1>
        <p style={{ marginTop: 8, color: '#6b7280' }}>Bu sayfayi goruntulemek icin personel yonetim yetkisi gerekir.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a1e42' }}>Canli Durum Takibi</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Mobil giris yapan personellerin online/offline durum ve saat bilgileri.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            backgroundColor: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Yenile
        </button>
      </div>

      <input
        type="text"
        placeholder="Personel ara..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 320,
          borderRadius: 9999,
          border: '1px solid #e2e8f0',
          padding: '8px 12px',
          fontSize: 12,
          marginBottom: 14,
          backgroundColor: '#fff',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setListMode('online')}
          style={{
            padding: '8px 12px',
            borderRadius: 9999,
            border: '1px solid #cbd5e1',
            backgroundColor: listMode === 'online' ? '#0a1e42' : '#fff',
            color: listMode === 'online' ? '#fff' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Online Kullanicilar
        </button>
        <button
          type="button"
          onClick={() => setListMode('all')}
          style={{
            padding: '8px 12px',
            borderRadius: 9999,
            border: '1px solid #cbd5e1',
            backgroundColor: listMode === 'all' ? '#0a1e42' : '#fff',
            color: listMode === 'all' ? '#fff' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Tum Kullanicilar
        </button>
      </div>

      {!presenceColumnsAvailable && (
        <div style={{ marginBottom: 10, color: '#92400e', fontSize: 12 }}>
          Uyari: `personeller.mobil_*` kolonlari bulunamadi. Durum loglardan tahmini gosteriliyor.
        </div>
      )}
      {!logsTableAvailable && (
        <div style={{ marginBottom: 10, color: '#92400e', fontSize: 12 }}>
          Uyari: `personel_online_kayitlari` tablosu bulunamadi. Olay gecmisi gosterilemiyor.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0a1e42', marginBottom: 8 }}>Anlik Durum</h2>
          {loading ? (
            <div style={{ fontSize: 13, color: '#6b7280' }}>Yukleniyor...</div>
          ) : filteredStaff.length === 0 ? (
            <div style={{ fontSize: 13, color: '#6b7280' }}>Kayit bulunamadi.</div>
          ) : (
            filteredStaff.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid #eef2f7',
                  borderRadius: 12,
                  padding: '10px 12px',
                  marginBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                    {p.ad && p.soyad ? `${p.ad} ${p.soyad}` : p.email || p.personel_kodu || 'Personel'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Son aktif: {formatTs(p.mobil_last_seen_at)} | Son offline: {formatTs(p.mobil_last_offline_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      padding: '4px 9px',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: p.mobil_online ? '#065f46' : '#7f1d1d',
                      backgroundColor: p.mobil_online ? '#d1fae5' : '#fee2e2',
                    }}
                  >
                    {p.mobil_online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/presence/${p.id}`)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    Detay
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0a1e42', marginBottom: 8 }}>Son Olaylar</h2>
          {!recentLogs.length ? (
            <div style={{ fontSize: 13, color: '#6b7280' }}>Kayit yok.</div>
          ) : (
            recentLogs.slice(0, 30).map((log) => (
              <div
                key={log.id}
                style={{
                  borderBottom: '1px dashed #e2e8f0',
                  padding: '8px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{log.personelName}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {log.durum === 'online' ? 'Online oldu' : 'Offline oldu'} - {formatTs(log.kaydedildi_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

