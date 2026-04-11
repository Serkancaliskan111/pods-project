import { useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

export default function CompaniesIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null) // null = yeni, obje = düzenle
  const [formName, setFormName] = useState('')
  const [formVergiNo, setFormVergiNo] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi,vergi_no,silindi_at')
        .order('id', { ascending: false }) // yeni eklenen en üstte

      if (!isSystemAdmin && currentCompanyId) {
        query = query.eq('id', currentCompanyId)
      }

      const { data, error } = await query
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      console.error(e)
      toast.error('Şirketler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [isSystemAdmin, currentCompanyId])

  const softToggleActive = async (row) => {
    const isActive = !row.silindi_at
    const nextValue = isActive ? new Date().toISOString() : null
    const previous = rows

    setRows((prev) =>
      prev.map((c) =>
        c.id === row.id ? { ...c, silindi_at: nextValue } : c,
      ),
    )

    try {
      const { error } = await supabase
        .from('ana_sirketler')
        .update({ silindi_at: nextValue })
        .eq('id', row.id)
      if (error) throw error
      toast.success(isActive ? 'Şirket pasif yapıldı' : 'Şirket tekrar aktif')
    } catch (e) {
      console.error('Durum güncellenemedi:', e)
      toast.error('Durum güncellenemedi')
      setRows(previous)
    }
  }

  const softDelete = async (row) => {
    if (
      !window.confirm(
        `'${row.ana_sirket_adi}' şirketini silmek (pasif yapmak) istediğinize emin misiniz?`,
      )
    )
      return

    const previous = rows

    setRows((prev) =>
      prev.map((c) =>
        c.id === row.id ? { ...c, silindi_at: new Date().toISOString() } : c,
      ),
    )

    try {
      const { error } = await supabase
        .from('ana_sirketler')
        .update({ silindi_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      toast.success('Şirket pasif hale getirildi')
    } catch (e) {
      console.error('Şirket silinirken hata:', e)
      toast.error('Şirket silinemedi')
      setRows(previous)
    }
  }

  const filtered = rows.filter((c) => {
    const term = search.toLowerCase()
    return (
      (c.ana_sirket_adi || '').toLowerCase().includes(term) ||
      (c.vergi_no || '').toLowerCase().includes(term)
    )
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

  const modalOverlayStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  }

  const modalCardStyle = {
    width: '100%',
    maxWidth: 640,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    boxShadow: '0 24px 60px rgba(15,23,42,0.4)',
    border: '1px solid #e5e7eb',
  }

  const openNewModal = () => {
    setEditing(null)
    setFormName('')
    setFormVergiNo('')
    setShowModal(true)
  }

  const openEditModal = (row) => {
    setEditing(row)
    setFormName(row.ana_sirket_adi || '')
    setFormVergiNo(row.vergi_no || '')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Şirket adı zorunludur')
      return
    }
    if (!formVergiNo.trim()) {
      toast.error('Vergi no zorunludur')
      return
    }

    try {
      if (editing) {
        const { error } = await supabase
          .from('ana_sirketler')
          .update({
            ana_sirket_adi: formName.trim(),
            vergi_no: formVergiNo.trim(),
          })
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Şirket güncellendi')
      } else {
        const { error } = await supabase.from('ana_sirketler').insert([
          {
            ana_sirket_adi: formName.trim(),
            vergi_no: formVergiNo.trim(),
            durum: true,
          },
        ])
        if (error) throw error
        toast.success('Yeni şirket oluşturuldu')
      }
      setShowModal(false)
      await load()
    } catch (e) {
      console.error('Şirket kaydedilirken hata:', e)
      toast.error(e.message || 'Kayıt hatası')
    }
  }

  return (
    <div style={containerStyle}>
      {/* Başlık + Yeni Şirket */}
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
            Şirket Yönetimi
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {isSystemAdmin
              ? 'Ana şirket kayıtlarını görüntüleyin, arayın ve durumlarını yönetin.'
              : 'Bağlı olduğunuz şirketin bilgilerini görüntüleyin ve güncelleyin.'}
          </p>
        </div>
        {isSystemAdmin && (
          <button
            type="button"
            onClick={openNewModal}
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
            + Yeni Şirket Ekle
          </button>
        )}
      </div>

      {/* Arama */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Şirket adı veya vergi no ile ara..."
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
          Kayıtlı şirket bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((c) => {
          const isActive = !c.silindi_at
          return (
            <div key={c.id} style={cardStyle}>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#0a1e42',
                  }}
                >
                  {c.ana_sirket_adi}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    marginTop: 2,
                  }}
                >
                  Vergi No: {c.vergi_no || '-'}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isSystemAdmin && (
                  <button
                    type="button"
                    onClick={() => softToggleActive(c)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: isActive ? '#bbf7d0' : '#e5e7eb',
                      color: isActive ? '#166534' : '#374151',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isActive ? 'Aktif' : 'Pasif'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEditModal(c)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 9999,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#111827',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Düzenle
                </button>
                {isSystemAdmin && (
                  <button
                    type="button"
                    onClick={() => softDelete(c)}
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
                )}
              </div>
            </div>
          )
        })}

      {/* Ekle/Düzenle Modal */}
      {showModal && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: '#0a1e42',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {editing ? 'Şirketi Düzenle' : 'Yeni Şirket Ekle'}
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b7280',
                    marginTop: 4,
                  }}
                >
                  Ana şirket adını ve vergi numarasını tanımlayın.
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#4b5563',
                    marginBottom: 4,
                  }}
                >
                  Şirket Adı
                </label>
                <input
                  type="text"
                  placeholder="Örn: ACME A.Ş."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '10px 14px',
                    fontSize: 14,
                    color: '#111827',
                    backgroundColor: '#f9fafb',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#4b5563',
                    marginBottom: 4,
                  }}
                >
                  Vergi No
                </label>
                <input
                  type="text"
                  placeholder="10 haneli vergi numarası"
                  value={formVergiNo}
                  onChange={(e) => setFormVergiNo(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '10px 14px',
                    fontSize: 14,
                    color: '#111827',
                    backgroundColor: '#f9fafb',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
              }}
            >
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 9999,
                  border: 'none',
                  backgroundColor: '#e5e7eb',
                  color: '#111827',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  padding: '8px 18px',
                  borderRadius: 9999,
                  border: 'none',
                  backgroundColor: '#0a1e42',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

