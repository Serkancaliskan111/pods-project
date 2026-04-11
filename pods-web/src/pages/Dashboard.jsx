import React, { useEffect, useMemo, useState } from 'react'
import getSupabase from '../lib/supabaseClient'
import { formatTimestampForFilter } from '../lib/postgrestFilters.js'

const supabase = getSupabase()

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({
    totalCompanies: 0,
    activeStaff: 0,
    pendingTasks: 0,
    completedToday: 0,
  })
  const [companies, setCompanies] = useState([])
  const [staff, setStaff] = useState([])
  const [jobs, setJobs] = useState([])
  const [hoveredDay, setHoveredDay] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
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
        const todayStartIso = formatTimestampForFilter(todayStart)
        const todayEndIso = formatTimestampForFilter(todayEnd)

        const [
          { data: companiesData, error: compErr, count: companyCount },
          { data: staffData, error: staffErr, count: staffCount },
          { data: jobsData, error: jobsErr },
          { count: pendingCount },
          { count: cDoneA, error: completedErrA },
          { count: cDoneB, error: completedErrB },
        ] = await Promise.all([
          supabase
            .from('ana_sirketler')
            .select('id,ana_sirket_adi,vergi_no', { count: 'exact' })
            .is('silindi_at', null),
          supabase
            .from('personeller')
            .select('id,ad,soyad,email,ana_sirket_id', { count: 'exact' })
            .is('silindi_at', null),
          supabase
            .from('isler')
            .select(
              'id,baslik,durum,ana_sirket_id,sorumlu_personel_id,son_tarih,created_at,updated_at',
            ),
          supabase
            .from('isler')
            .select('id', { count: 'exact' })
            .limit(0)
            .eq('durum', 'Onay Bekliyor'),
          supabase
            .from('isler')
            .select('id', { count: 'exact' })
            .limit(0)
            .eq('durum', 'TAMAMLANDI')
            .gte('updated_at', todayStartIso)
            .lte('updated_at', todayEndIso),
          supabase
            .from('isler')
            .select('id', { count: 'exact' })
            .limit(0)
            .eq('durum', 'Tamamlandı')
            .gte('updated_at', todayStartIso)
            .lte('updated_at', todayEndIso),
        ])

        const completedTodayCount = (cDoneA || 0) + (cDoneB || 0)
        if (completedErrA || completedErrB) {
          console.error(completedErrA || completedErrB)
        }

        if (compErr || staffErr || jobsErr) {
          console.error(compErr || staffErr || jobsErr)
          setLoading(false)
          return
        }

        const companiesSafe = companiesData || []
        const staffSafe = staffData || []
        const jobsSafe = jobsData || []

        setCompanies(companiesSafe)
        setStaff(staffSafe)
        setJobs(jobsSafe)

        setKpis({
          totalCompanies: companyCount || 0,
          activeStaff: staffCount || 0,
          pendingTasks: pendingCount || 0,
          completedToday: completedTodayCount || 0,
        })
      } catch (e) {
        console.error('Dashboard load error', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const companyById = useMemo(
    () =>
      companies.reduce((acc, c) => {
        acc[c.id] = c
        return acc
      }, {}),
    [companies],
  )

  const staffById = useMemo(
    () =>
      staff.reduce((acc, s) => {
        acc[s.id] = s
        return acc
      }, {}),
    [staff],
  )

  const topCompanySummaries = useMemo(() => {
    if (!companies.length) return []

    if (!jobs.length) {
      return companies.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.ana_sirket_adi,
        vergiNo: c.vergi_no || '-',
        total: 0,
        completionRate: 0,
      }))
    }

    const jobsByCompany = jobs.reduce((acc, j) => {
      if (!j.ana_sirket_id) return acc
      const key = j.ana_sirket_id
      if (!acc[key]) acc[key] = []
      acc[key].push(j)
      return acc
    }, {})

    const entries = Object.entries(jobsByCompany).map(([companyId, list]) => {
      const c = companyById[companyId]
      if (!c) return null
      const total = list.length
      const completed = list.filter((j) =>
        ['Tamamlandı', 'TAMAMLANDI'].includes(String(j.durum || '').trim()),
      ).length
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0
      return {
        id: c.id,
        name: c.ana_sirket_adi,
        vergiNo: c.vergi_no || '-',
        total,
        completionRate: rate,
      }
    })

    return entries
      .filter(Boolean)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)
  }, [jobs, companies, companyById])

  const weeklyVolume = useMemo(() => {
    const now = new Date()
    const days = []
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - i,
        0,
        0,
        0,
        0,
      )
      const key = d.toISOString().slice(0, 10)
      days.push({
        key,
        label: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
      })
    }

    const counts = days.map((day) => {
      const count = jobs.filter((j) => {
        const ts = new Date(j.updated_at || j.created_at || j.son_tarih)
        if (Number.isNaN(ts.getTime())) return false
        const k = ts.toISOString().slice(0, 10)
        return k === day.key
      }).length
      return { ...day, count }
    })

    const max = counts.reduce((m, d) => Math.max(m, d.count), 0)
    return { data: counts, max }
  }, [jobs])

  const activityFeed = useMemo(() => {
    const sorted = jobs
      .slice()
      .sort((a, b) => {
        const da = new Date(a.updated_at || a.created_at || 0).getTime()
        const db = new Date(b.updated_at || b.created_at || 0).getTime()
        return db - da
      })
      .slice(0, 15)

    return sorted.map((j) => {
      const company = companyById[j.ana_sirket_id]
      const person = staffById[j.sorumlu_personel_id]
      const companyName = company?.ana_sirket_adi || 'Bilinmeyen Şirket'
      const personName =
        person && (person.ad || person.soyad)
          ? `${person.ad || ''} ${person.soyad || ''}`.trim()
          : person?.email || 'Bilinmeyen Personel'
      const when = j.updated_at || j.created_at
      const time = when
        ? new Date(when).toLocaleString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          })
        : '-'

      const durum = String(j.durum || '').trim()

      return {
        id: j.id,
        islem: j.baslik || 'Görev',
        company: companyName,
        person: personName,
        time,
        status: durum || '-',
      }
    })
  }, [jobs, companyById, staffById])

  const kpiValue = (val) => (loading ? '−' : val)

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
    } else if (s.includes('gecik') || s.includes('kritik')) {
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

  return (
    <div
      style={{
        marginLeft: '260px',
        padding: '40px',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        position: 'relative',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          width: 12,
          height: 12,
          backgroundColor: '#22c55e',
          borderRadius: '50%',
          zIndex: 9999,
          boxShadow: '0 0 10px #22c55e',
        }}
      />

      <header
        style={{
          marginBottom: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 900,
            color: '#020617',
            letterSpacing: '-0.05em',
          }}
        >
          Genel Yönetim Kokpiti
        </h1>
        <p
          style={{
            color: '#64748b',
            fontSize: 14,
          }}
        >
          Tüm şirketler, personeller ve operasyonlar için canlı yönetim ekranı.
        </p>
      </header>

      {/* Üst Stratejik Metrikler */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 24,
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            Toplam Şirket
          </span>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#111827',
            }}
          >
            {kpiValue(kpis.totalCompanies)}
          </span>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 24,
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            Aktif Personel
          </span>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#111827',
            }}
          >
            {kpiValue(kpis.activeStaff)}
          </span>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 24,
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            Bekleyen İşler
          </span>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#b45309',
            }}
          >
            {kpiValue(kpis.pendingTasks)}
          </span>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: 24,
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(15,23,42,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            Günlük Tamamlanan
          </span>
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#15803d',
            }}
          >
            {kpiValue(kpis.completedToday)}
          </span>
        </div>
      </div>

      {/* Orta Bölüm: Operasyonel Röntgen */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 24,
          marginBottom: 32,
        }}
      >
        {/* Şirket Durum Paneli */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(15,23,42,0.06)',
            padding: 20,
          }}
        >
          <div
            style={{
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
              }}
            >
              Şirket Durum Paneli
            </h2>
            <span
              style={{
                fontSize: 12,
                color: '#9ca3af',
              }}
            >
              En aktif 4 şirket
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {topCompanySummaries.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 16,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#111827',
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      Vergi No: {c.vergiNo}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#64748b',
                    }}
                  >
                    {c.total} iş • {c.completionRate}% tamamlandı
                  </div>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: '#e2e8f0',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${c.completionRate}%`,
                      height: '100%',
                      borderRadius: 4,
                      background:
                        'linear-gradient(to right, #4f46e5, #6366f1)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            ))}
            {!topCompanySummaries.length && !loading && (
              <div
                style={{
                  fontSize: 12,
                  color: '#9ca3af',
                }}
              >
                Henüz şirket aktivitesi bulunmuyor.
              </div>
            )}
          </div>
        </div>

        {/* Haftalık İş Grafiği */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(15,23,42,0.06)',
            padding: 20,
          }}
        >
          <div
            style={{
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
              }}
            >
              Haftalık İş Grafiği
            </h2>
            <span
              style={{
                fontSize: 12,
                color: '#9ca3af',
              }}
            >
              Son 7 gün
            </span>
          </div>
          <div
            style={{
              height: 160,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              paddingBottom: 8,
            }}
          >
            {weeklyVolume.data.map((d) => {
              const max = weeklyVolume.max || 1
              const ratio = d.count / max
              const h = 20 + ratio * 120
              const isHovered = hoveredDay === d.key
              return (
                <div
                  key={d.key}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 0,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredDay(d.key)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  <div
                    style={{
                      width: 18,
                      borderRadius: 9999,
                      backgroundColor: '#e5e7eb',
                      overflow: 'hidden',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: h,
                        borderRadius: 9999,
                        background: isHovered
                          ? 'linear-gradient(to top, #4338ca, #6366f1)'
                          : 'linear-gradient(to top, #4f46e5, #6366f1)',
                        boxShadow: isHovered
                          ? '0 10px 20px rgba(79,70,229,0.45)'
                          : 'none',
                        transition:
                          'height 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#6b7280',
                    }}
                  >
                    {d.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#9ca3af',
                    }}
                  >
                    {d.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Alt Bölüm: Son Aktiviteler */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 20,
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 15px -3px rgba(15,23,42,0.06)',
          padding: 20,
        }}
      >
        <div
          style={{
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
            }}
          >
            Son Yapılan İşlemler
          </h2>
          <span
            style={{
              fontSize: 12,
              color: '#9ca3af',
            }}
          >
            En güncel 15 işlem
          </span>
        </div>
        <div
          style={{
            width: '100%',
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  color: '#6b7280',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <th style={{ padding: '8px 4px' }}>İşlem Tipi</th>
                <th style={{ padding: '8px 4px' }}>Şirket</th>
                <th style={{ padding: '8px 4px' }}>Personel</th>
                <th style={{ padding: '8px 4px' }}>Zaman</th>
                <th style={{ padding: '8px 4px' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {activityFeed.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <td style={{ padding: '8px 4px', color: '#0f172a' }}>
                    {row.islem}
                  </td>
                  <td style={{ padding: '8px 4px', color: '#111827' }}>
                    {row.company}
                  </td>
                  <td style={{ padding: '8px 4px', color: '#374151' }}>
                    {row.person}
                  </td>
                  <td style={{ padding: '8px 4px', color: '#6b7280' }}>
                    {row.time}
                  </td>
                  <td style={{ padding: '8px 4px' }}>
                    <span style={statusBadgeStyle(row.status)}>
                      {row.status || '-'}
                    </span>
                  </td>
                </tr>
              ))}
              {!activityFeed.length && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '12px 4px',
                      color: '#9ca3af',
                      textAlign: 'center',
                    }}
                  >
                    Henüz işlem kaydı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

