import React, { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import getSupabase from '../../lib/supabaseClient'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { OPERATOR_TASKS_LIMIT } from '../../lib/supabaseScope.js'
import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../lib/taskStatus.js'
import { isTaskVisibleNow } from '../../lib/taskVisibility.js'

const supabase = getSupabase()

function formatRelativeTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'az önce'
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return 'az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  if (diffHour < 24) return `${diffHour} saat önce`
  if (diffDay < 7) return `${diffDay} gün önce`
  return date.toLocaleDateString('tr-TR')
}

function isDoneStatus(durum) {
  return isApprovedTaskStatus(durum)
}

function isOverdueTask(task, now = new Date()) {
  const d = normalizeTaskStatus(task?.durum)
  if (isDoneStatus(d)) return false
  if (!task?.son_tarih) return false
  const due = new Date(task.son_tarih)
  if (Number.isNaN(due.getTime()) || due >= now) return false
  if (isPendingApprovalTaskStatus(d)) {
    const completedAt = new Date(task.updated_at || task.created_at || 0)
    if (!Number.isNaN(completedAt.getTime()) && completedAt <= due) {
      return false
    }
  }
  return true
}

/**
 * Yönetim / sistem rol eylemi olmayan kullanıcılar için ana sayfa (görev özeti).
 * Tam kokpit yalnızca hasManagementDashboardAccess ile açılır.
 */
export default function TaskOperatorHome() {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState([])

  const displayName =
    profile?.ad && profile?.soyad
      ? `${profile.ad} ${profile.soyad}`
      : profile?.ad_soyad || profile?.email || 'Kullanıcı'

  const personelId = personel?.id
  const companyId = personel?.ana_sirket_id

  useEffect(() => {
    const load = async () => {
      if (!personelId) {
        setJobs([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        let q = supabase
          .from('isler')
          .select(
            'id,baslik,durum,baslama_tarihi,son_tarih,updated_at,created_at,gorunur_tarih,birim_id,acil,ana_sirket_id',
          )
          .eq('sorumlu_personel_id', personelId)
        if (companyId) q = q.eq('ana_sirket_id', companyId)
        const { data, error } = await q
          .order('updated_at', {
            ascending: false,
          })
          .limit(OPERATOR_TASKS_LIMIT)
        if (error) {
          console.error('TaskOperatorHome load', error)
          setJobs([])
        } else {
          setJobs((data || []).filter((j) => isTaskVisibleNow(j)))
        }
      } catch (e) {
        console.error(e)
        setJobs([])
      } finally {
        setLoading(false)
      }
    }
    load()
    const timer = window.setInterval(load, 60 * 1000)
    return () => window.clearInterval(timer)
  }, [personelId, companyId])

  useEffect(() => {
    if (!personelId) return
    const filter = `sorumlu_personel_id=eq.${personelId}`
    const channel = supabase
      .channel(`task-operator-home-${personelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'isler',
          filter,
        },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          if (companyId && String(row.ana_sirket_id) !== String(companyId))
            return
          if (!isTaskVisibleNow(row)) return
          setJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === row.id)
            if (idx === -1) {
              if (prev.length >= OPERATOR_TASKS_LIMIT) return prev
              return [row, ...prev]
            }
            const next = prev.slice()
            next[idx] = { ...next[idx], ...row }
            return next
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [personelId, companyId])

  const stats = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    )
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    )
    let active = 0
    let pendingApproval = 0
    let completedToday = 0
    let overdue = 0
    for (const j of jobs) {
      const d = normalizeTaskStatus(j.durum)
      if (isDoneStatus(d)) {
        const u = new Date(j.updated_at || j.created_at || 0)
        if (!Number.isNaN(u.getTime()) && u >= todayStart && u <= todayEnd) {
          completedToday += 1
        }
        continue
      }
      active += 1
      if (isPendingApprovalTaskStatus(d)) pendingApproval += 1
      if (isOverdueTask(j, now)) overdue += 1
    }
    return { active, pendingApproval, completedToday, overdue }
  }, [jobs])

  const upcoming = useMemo(() => {
    return jobs
      .filter((j) => !isDoneStatus(j.durum))
      .slice()
      .sort((a, b) => {
        const da = a.son_tarih
          ? new Date(a.son_tarih).getTime()
          : Number.MAX_SAFE_INTEGER
        const db = b.son_tarih
          ? new Date(b.son_tarih).getTime()
          : Number.MAX_SAFE_INTEGER
        return da - db
      })
      .slice(0, 10)
  }, [jobs])

  const statusBadgeStyle = (status) => {
    const s = String(status || '').toLowerCase()
    let bg = '#e5e7eb'
    let color = '#374151'
    if (s.includes('tamam')) {
      bg = '#dcfce7'
      color = '#166534'
    } else if (s.includes('onay bekliyor') || s.includes('bekliyor')) {
      bg = '#fef3c7'
      color = '#92400e'
    } else if (s.includes('gecik') || s.includes('kritik') || s.includes('acil')) {
      bg = '#fee2e2'
      color = '#b91c1c'
    }
    return {
      padding: '4px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: bg,
      color,
      textTransform: 'uppercase',
    }
  }

  const miniCards = [
    {
      key: 'active',
      label: 'Açık görevlerim',
      value: loading ? '−' : stats.active,
      color: '#4f46e5',
    },
    {
      key: 'overdue',
      label: 'Geciken',
      value: loading ? '−' : stats.overdue,
      color: stats.overdue > 0 ? '#dc2626' : '#64748b',
    },
    {
      key: 'pending',
      label: 'Onay bekleyen',
      value: loading ? '−' : stats.pendingApproval,
      color: '#f59e0b',
    },
    {
      key: 'done',
      label: 'Bugün tamamlanan',
      value: loading ? '−' : stats.completedToday,
      color: '#10b981',
    },
  ]

  return (
    <div
      style={{
        padding: '40px',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: '#020617',
            letterSpacing: '-0.04em',
            margin: 0,
          }}
        >
          Merhaba, {displayName.split(' ')[0] || displayName}
        </h1>
        <p style={{ color: '#64748b', marginTop: 8, fontSize: 15, maxWidth: 560 }}>
          Bu sayfa yalnızca <strong>size atanan görevler</strong> için
          özet gösterir. Tüm listeyi görmek ve işlem yapmak için İşler menüsünü
          kullanın.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 14,
          marginBottom: 28,
        }}
      >
        {miniCards.map((c) => (
          <div
            key={c.key}
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: '18px 16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: c.color,
                marginTop: 6,
                letterSpacing: '-0.03em',
              }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 800,
            color: '#0f172a',
          }}
        >
          Öncelikli görevler
        </h2>
        <button
          type="button"
          onClick={() => navigate('/admin/tasks')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: '#e95422',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(233,84,34,0.35)',
          }}
        >
          <ListChecks size={18} />
          Tüm işlere git
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        {!personelId ? (
          <p style={{ padding: 24, color: '#64748b', margin: 0 }}>
            Personel kaydı bulunamadı. Oturumu kapatıp tekrar deneyin.
          </p>
        ) : loading ? (
          <p style={{ padding: 24, color: '#64748b', margin: 0 }}>Yükleniyor…</p>
        ) : upcoming.length === 0 ? (
          <p style={{ padding: 24, color: '#64748b', margin: 0 }}>
            Açık görev yok. Yeni atamalar burada görünecek.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {upcoming.map((j) => (
              <li
                key={j.id}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  padding: '14px 18px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/admin/tasks/${j.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/admin/tasks/${j.id}`)
                }}
                role="button"
                tabIndex={0}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#0f172a',
                      fontSize: 15,
                    }}
                  >
                    {j.baslik || 'Görev'}
                    {j.acil ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: '#dc2626',
                          fontWeight: 800,
                        }}
                      >
                        ACİL
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    {j.son_tarih
                      ? `Son tarih: ${new Date(j.son_tarih).toLocaleString('tr-TR')}`
                      : 'Son tarih yok'}{' '}
                    · {formatRelativeTime(j.updated_at || j.created_at)}
                  </div>
                </div>
                <span style={statusBadgeStyle(j.durum)}>
                  {normalizeTaskStatus(j.durum) || '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
