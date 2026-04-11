import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

export default function TaskTemplatesIndex() {
  const { profile, personel, loading: authLoading } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('is_sablonlari')
        .select('id,ana_sirket_id,baslik,min_sure_dk,aktif_mi')
        .is('silindi_at', null)
        .order('olusturma_tarihi', { ascending: false })

      if (companyScoped && currentCompanyId) {
        q = q.eq('ana_sirket_id', currentCompanyId)
      }

      const { data, error } = await q
      if (error) {
        throw error
      }
      setRows(data || [])

      let compQ = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi')
        .is('silindi_at', null)
      if (companyScoped && currentCompanyId) {
        compQ = compQ.eq('id', currentCompanyId)
      }
      const { data: comps } = await compQ
      setCompanies(comps || [])
    } catch (e) {
      console.error('Şablonlar yüklenemedi:', e)
      toast.error('Şablonlar yüklenemedi', {
        id: 'task-templates-load-error',
      })
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  /** Auth oturumu ve kapsam oturunca tek sefer yükle; önceki isteği iptal et (çift toast önlenir) */
  useEffect(() => {
    if (authLoading) return

    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const sys = !!profile?.is_system_admin
        const compId = sys ? null : personel?.ana_sirket_id
        const scoped = !sys && !!compId

        let q = supabase
          .from('is_sablonlari')
          .select('id,ana_sirket_id,baslik,min_sure_dk,aktif_mi')
          .is('silindi_at', null)
          .order('olusturma_tarihi', { ascending: false })

        if (scoped && compId) {
          q = q.eq('ana_sirket_id', compId)
        }

        const { data, error } = await q
        if (cancelled) return
        if (error) throw error
        setRows(data || [])

        let compQ = supabase
          .from('ana_sirketler')
          .select('id,ana_sirket_adi')
          .is('silindi_at', null)
        if (scoped && compId) {
          compQ = compQ.eq('id', compId)
        }
        const { data: comps, error: compErr } = await compQ
        if (cancelled) return
        if (compErr) {
          console.error('Şirket listesi (şablon sayfası):', compErr)
          setCompanies([])
        } else {
          setCompanies(comps || [])
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Şablonlar yüklenemedi:', e)
          toast.error('Şablonlar yüklenemedi', { id: 'task-templates-load-error' })
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    authLoading,
    profile?.is_system_admin,
    personel?.ana_sirket_id,
  ])

  const softDelete = async (row) => {
    if (
      !window.confirm(
        `'${row.baslik || 'Şablon'}' şablonunu silmek istediğinize emin misiniz? (soft-delete)`,
      )
    )
      return
    try {
      const { error } = await supabase
        .from('is_sablonlari')
        .update({ silindi_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      toast.success('Şablon silindi')
      await load()
    } catch (e) {
      console.error('Silme başarısız:', e)
      toast.error('Şablon silinemedi')
    }
  }

  const filtered = rows.filter((r) => {
    const term = search.toLowerCase()
    const label = (r.baslik || '').toLowerCase()
    return label.includes(term)
  })

  const containerStyle = {
    padding: '32px',
    backgroundColor: '#f3f4f6',
    minHeight: '100vh',
  }

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #e2e8f0',
  }

  const badgeStyle = (active) => ({
    padding: '4px 10px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: active ? '#bbf7d0' : '#e5e7eb',
    color: active ? '#166534' : '#374151',
  })

  return (
    <div style={containerStyle}>
      {/* Başlık + Yeni Şablon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#0a1e42',
              letterSpacing: '-0.03em',
            }}
          >
            İş Şablonları
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketinize özel görev şablonlarını yönetin.'
              : 'Saha görevleri için tekrar kullanılabilir şablonları yönetin.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/task-templates/new')}
          style={{
            padding: '10px 20px',
            borderRadius: 12,
            border: 'none',
            backgroundColor: '#0a1e42',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(15,23,42,0.25)',
          }}
        >
          + Yeni Şablon Oluştur
        </button>
      </div>

      {/* Şirket etiketi (şirket kullanıcısı) + arama */}
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {companyScoped && companies[0] && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 36,
              padding: '0 14px',
              borderRadius: 9999,
              border: '1px solid #e2e8f0',
              fontSize: 12,
              fontWeight: 600,
              color: '#0a1e42',
              backgroundColor: '#f8fafc',
            }}
          >
            {companies[0].ana_sirket_adi}
          </span>
        )}
        <input
          type="text"
          placeholder="Şablon başlığına göre ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 320,
            borderRadius: 9999,
            border: '1px solid #e2e8f0',
            padding: '8px 12px',
            fontSize: 12,
            color: '#111827',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        />
      </div>

      {/* Liste */}
      {loading && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: '#6b7280',
            padding: '16px 4px',
          }}
        >
          Kayıtlı iş şablonu bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((r) => {
          const active = !!r.aktif_mi
          return (
            <div key={r.id} style={cardStyle}>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#0a1e42',
                  }}
                >
                  {r.baslik || '—'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    marginTop: 2,
                  }}
                >
                  Min süre: {r.min_sure_dk || 0} dk
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={badgeStyle(active)}>
                  {active ? 'Aktif' : 'Pasif'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/admin/task-templates/builder/${r.id}`)
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 9999,
                    border: 'none',
                    backgroundColor: '#4f46e5',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => softDelete(r)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 9999,
                    border: 'none',
                    backgroundColor: '#fee2e2',
                    color: '#b91c1c',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
          )
        })}
    </div>
  )
}

