import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canManageStaff } from '../../../lib/permissions.js'

const supabase = getSupabase()
const REFRESH_MS = 5000
const PRESENCE_STALE_MS = 12 * 1000

function getRangeStart(rangeKey) {
  const now = new Date()
  if (rangeKey === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  }
  if (rangeKey === 'week') {
    const day = now.getDay()
    const diffToMonday = day === 0 ? 6 : day - 1
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0)
  }
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h === 0) return `${m} dk`
  return `${h} sa ${m} dk`
}

function formatTs(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('tr-TR')
}

function isPresenceFresh(value) {
  if (!value) return false
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= PRESENCE_STALE_MS
}

export default function PresenceDetail() {
  const { personId } = useParams()
  const navigate = useNavigate()
  const { profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canTrackPresence = canManageStaff(permissions, isSystemAdmin)

  const [loading, setLoading] = useState(true)
  const [person, setPerson] = useState(null)
  const [logs, setLogs] = useState([])
  const [beforeRangeLog, setBeforeRangeLog] = useState(null)
  const [range, setRange] = useState('day')

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!personId) return
    if (!silent) setLoading(true)
    try {
      const rangeStart = getRangeStart(range)
      const [{ data: personRow, error: personErr }, { data: logRows, error: logErr }, { data: beforeRows, error: beforeErr }] = await Promise.all([
        supabase
          .from('personeller')
          .select('id,ad,soyad,email,personel_kodu,mobil_online,mobil_online_at,mobil_last_seen_at,mobil_last_offline_at')
          .eq('id', personId)
          .maybeSingle(),
        supabase
          .from('personel_online_kayitlari')
          .select('id,durum,aciklama,kaydedildi_at')
          .eq('personel_id', personId)
          .gte('kaydedildi_at', rangeStart.toISOString())
          .order('kaydedildi_at', { ascending: false })
          .limit(2000),
        supabase
          .from('personel_online_kayitlari')
          .select('id,durum,kaydedildi_at')
          .eq('personel_id', personId)
          .lt('kaydedildi_at', rangeStart.toISOString())
          .order('kaydedildi_at', { ascending: false })
          .limit(1),
      ])
      if (personErr) throw personErr
      if (logErr) throw logErr
      if (beforeErr) throw beforeErr
      setPerson(personRow || null)
      setBeforeRangeLog(beforeRows?.[0] || null)
      setLogs(logRows || [])
    } catch (e) {
      if (!silent) {
        console.error(e)
        toast.error('Detay verisi yuklenemedi')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [personId, range])

  useEffect(() => {
    if (!canTrackPresence) return
    void load()
    const id = setInterval(() => {
      void load({ silent: true })
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [canTrackPresence, load])

  const durationMetrics = useMemo(() => {
    const rangeStart = getRangeStart(range)
    const rangeEnd = new Date()
    const rangeStartMs = rangeStart.getTime()
    const rangeEndMs = rangeEnd.getTime()

    const ascLogs = [...logs].sort(
      (a, b) => new Date(a.kaydedildi_at).getTime() - new Date(b.kaydedildi_at).getTime(),
    )
    let activeStartMs =
      beforeRangeLog?.durum === 'online'
        ? rangeStartMs
        : null
    let totalMs = 0

    let sessions = activeStartMs != null ? 1 : 0

    for (const log of ascLogs) {
      const ts = new Date(log.kaydedildi_at).getTime()
      if (Number.isNaN(ts)) continue
      if (log.durum === 'online') {
        if (activeStartMs == null) {
          activeStartMs = Math.max(ts, rangeStartMs)
          sessions += 1
        }
      } else if (log.durum === 'offline') {
        if (activeStartMs == null) continue
        totalMs += Math.max(0, Math.min(ts, rangeEndMs) - activeStartMs)
        activeStartMs = null
      }
    }

    if (activeStartMs != null) {
      const lastSeenMs = person?.mobil_last_seen_at
        ? new Date(person.mobil_last_seen_at).getTime()
        : null
      let endMs = rangeEndMs
      // Heartbeat kesildiyse (offline log gecikmiş olsa bile), süreyi son görülene kadar say.
      if (lastSeenMs && !Number.isNaN(lastSeenMs)) {
        endMs = Math.min(endMs, lastSeenMs)
      }
      totalMs += Math.max(0, endMs - activeStartMs)
    }

    return {
      totalMs,
      sessions,
      totalLabel: formatDuration(totalMs),
      avgLabel: sessions > 0 ? formatDuration(Math.floor(totalMs / sessions)) : '0 dk',
    }
  }, [logs, beforeRangeLog, person, range])

  const fullName = useMemo(() => {
    if (!person) return 'Personel'
    return person.ad && person.soyad
      ? `${person.ad} ${person.soyad}`
      : person.email || person.personel_kodu || 'Personel'
  }, [person])

  if (!canTrackPresence) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a1e42' }}>Canli Durum Detay</h1>
        <p style={{ marginTop: 8, color: '#6b7280' }}>Bu sayfayi goruntulemek icin personel yonetim yetkisi gerekir.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a1e42' }}>{fullName} - Canli Durum Detay</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Online olma / offline olma saatleri ve olay gecmisi.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/admin/presence')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Listeye Don
          </button>
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
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setRange('day')}
          style={{
            padding: '8px 12px',
            borderRadius: 9999,
            border: '1px solid #cbd5e1',
            backgroundColor: range === 'day' ? '#0a1e42' : '#fff',
            color: range === 'day' ? '#fff' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Gun
        </button>
        <button
          type="button"
          onClick={() => setRange('week')}
          style={{
            padding: '8px 12px',
            borderRadius: 9999,
            border: '1px solid #cbd5e1',
            backgroundColor: range === 'week' ? '#0a1e42' : '#fff',
            color: range === 'week' ? '#fff' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Hafta
        </button>
        <button
          type="button"
          onClick={() => setRange('month')}
          style={{
            padding: '8px 12px',
            borderRadius: 9999,
            border: '1px solid #cbd5e1',
            backgroundColor: range === 'month' ? '#0a1e42' : '#fff',
            color: range === 'month' ? '#fff' : '#0f172a',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Ay
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ backgroundColor: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Toplam Sure</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{durationMetrics.totalLabel}</div>
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Toplam Seans</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{durationMetrics.sessions}</div>
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Ortalama Seans</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{durationMetrics.avgLabel}</div>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 14, marginBottom: 14 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Yukleniyor...</div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#0f172a' }}>
              <strong>Durum:</strong>{' '}
              <span style={{ color: isPresenceFresh(person?.mobil_last_seen_at) ? '#166534' : '#991b1b' }}>
                {isPresenceFresh(person?.mobil_last_seen_at) ? 'Online' : 'Offline'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#0f172a' }}><strong>Son aktif:</strong> {formatTs(person?.mobil_last_seen_at)}</div>
            <div style={{ fontSize: 13, color: '#0f172a' }}><strong>Son offline:</strong> {formatTs(person?.mobil_last_offline_at)}</div>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0a1e42', marginBottom: 8 }}>Olay Gecmisi</h2>
        {!logs.length ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Kayit yok.</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                borderBottom: '1px dashed #e2e8f0',
                padding: '9px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>
                  {log.durum === 'online' ? 'Online oldu' : 'Offline oldu'}
                </span>
                {log.aciklama ? <span style={{ fontSize: 11, color: '#64748b' }}>{log.aciklama}</span> : null}
              </div>
              <span style={{ fontSize: 12, color: '#64748b' }}>{formatTs(log.kaydedildi_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

