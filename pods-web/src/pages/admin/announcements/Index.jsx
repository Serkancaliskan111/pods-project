import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

export default function AnnouncementsIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('duyurular')
        .select('id, metin, created_at, gonderen_personel_id, ana_sirket_id')
        .order('created_at', { ascending: false })
        .limit(200)

      if (!isSystemAdmin && personel?.ana_sirket_id) {
        query = query.eq('ana_sirket_id', personel.ana_sirket_id)
      }

      const { data, error } = await query
      if (error) {
        console.error(error)
        setItems([])
        return
      }

      const rows = Array.isArray(data) ? data : []
      const senderIds = [...new Set(rows.map((d) => d.gonderen_personel_id).filter(Boolean))]
      let senderMap = {}
      if (senderIds.length) {
        const { data: peopleData } = await supabase
          .from('personeller')
          .select('id, ad, soyad, email')
          .in('id', senderIds)
        ;(peopleData || []).forEach((p) => {
          const name = `${p.ad || ''} ${p.soyad || ''}`.trim()
          senderMap[String(p.id)] = name || p.email || 'Yönetici'
        })
      }

      setItems(
        rows.map((row) => ({
          ...row,
          gonderen_adi: senderMap[String(row.gonderen_personel_id)] || 'Yönetici',
        })),
      )
    } finally {
      setLoading(false)
    }
  }, [isSystemAdmin, personel?.ana_sirket_id])

  useEffect(() => {
    load()
  }, [load])

  const subtitle = useMemo(
    () =>
      isSystemAdmin
        ? 'Tüm şirketlerdeki duyurular'
        : 'Şirketiniz için yayımlanan duyurular',
    [isSystemAdmin],
  )

  return (
    <div
      style={{
        padding: 24,
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>Duyurular</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{subtitle}</p>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Henüz duyuru bulunmuyor.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                borderRadius: 14,
                border: '1px solid #dbe2ea',
                backgroundColor: '#ffffff',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>
                {item.metin || '-'}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                Gönderen: {item.gonderen_adi} •{' '}
                {item.created_at
                  ? new Date(item.created_at).toLocaleString('tr-TR')
                  : '-'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

