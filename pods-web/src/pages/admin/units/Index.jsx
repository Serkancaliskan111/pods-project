import { useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

export default function UnitsIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [units, setUnits] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formCompanyId, setFormCompanyId] = useState('')
  const [formParentId, setFormParentId] = useState('')
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('SUBE')

  const load = async () => {
    setLoading(true)
    try {
      let compQuery = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi')
        .is('silindi_at', null)
        .order('ana_sirket_adi')

      if (companyScoped && currentCompanyId) {
        compQuery = compQuery.eq('id', currentCompanyId)
      }

      let unitQuery = supabase
        .from('birimler')
        .select(
          'id,ana_sirket_id,ust_birim_id,birim_adi,birim_tipi,silindi_at',
        )
        .order('id', { ascending: false })

      if (companyScoped && currentCompanyId) {
        unitQuery = unitQuery.eq('ana_sirket_id', currentCompanyId)
      }
      if (
        companyScoped &&
        accessibleUnitIds &&
        accessibleUnitIds.length > 0
      ) {
        unitQuery = unitQuery.in('id', accessibleUnitIds)
      }

      const [{ data: comps, error: compErr }, { data: uns, error: unitErr }] =
        await Promise.all([compQuery, unitQuery])
      if (compErr || unitErr) throw compErr || unitErr
      setCompanies(comps || [])
      setUnits(uns || [])
    } catch (e) {
      console.error(e)
      toast.error('Birimler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [
    companyScoped,
    currentCompanyId,
    JSON.stringify(accessibleUnitIds || []),
    isSystemAdmin,
  ])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

  const getCompanyName = (id) =>
    companies.find((c) => c.id === id)?.ana_sirket_adi ?? '-'

  const getParentName = (id) =>
    units.find((u) => u.id === id)?.birim_adi ?? '-'

  const softToggleActive = async (row) => {
    const isActive = !row.silindi_at
    const nextValue = isActive ? new Date().toISOString() : null
    const prev = units

    setUnits((old) =>
      old.map((u) => (u.id === row.id ? { ...u, silindi_at: nextValue } : u)),
    )

    try {
      const { error } = await supabase
        .from('birimler')
        .update({ silindi_at: nextValue })
        .eq('id', row.id)
      if (error) throw error
      toast.success(isActive ? 'Birim pasif yapıldı' : 'Birim tekrar aktif')
    } catch (e) {
      console.error('Durum güncellenemedi:', e)
      toast.error('Durum güncellenemedi')
      setUnits(prev)
    }
  }

  const hardDelete = async (row) => {
    if (
      !window.confirm(
        `'${row.birim_adi}' birimini KALICI olarak silmek istediğinize emin misiniz?`,
      )
    )
      return
    const prev = units
    setUnits((old) => old.filter((u) => u.id !== row.id))
    try {
      const { error } = await supabase.from('birimler').delete().eq('id', row.id)
      if (error) throw error
      toast.success('Birim kalıcı olarak silindi')
    } catch (e) {
      console.error('Silme hatası:', e)
      toast.error('Birim silinemedi')
      setUnits(prev)
    }
  }

  const filtered = units.filter((u) => {
    const term = search.toLowerCase()
    const nameMatch = (u.birim_adi || '').toLowerCase().includes(term)
    const companyMatch = getCompanyName(u.ana_sirket_id)
      .toLowerCase()
      .includes(term)
    const matchesSearch = nameMatch || companyMatch
    const matchesCompany = companyScoped
      ? String(u.ana_sirket_id) === String(currentCompanyId)
      : selectedCompanyId
        ? String(u.ana_sirket_id) === String(selectedCompanyId)
        : true
    return matchesSearch && matchesCompany
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
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    boxShadow: '0 24px 60px rgba(15,23,42,0.4)',
    border: '1px solid #e5e7eb',
  }

  const openNewModal = () => {
    setEditing(null)
    setFormCompanyId(
      companyScoped && currentCompanyId ? String(currentCompanyId) : '',
    )
    setFormParentId('')
    setFormName('')
    setFormType('SUBE')
    setShowModal(true)
  }

  const openEditModal = (row) => {
    setEditing(row)
    setFormCompanyId(row.ana_sirket_id ? String(row.ana_sirket_id) : '')
    setFormParentId(row.ust_birim_id ? String(row.ust_birim_id) : '')
    setFormName(row.birim_adi || '')
    setFormType(row.birim_tipi || 'SUBE')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formCompanyId) {
      toast.error('Lütfen bir şirket seçin')
      return
    }
    if (!formName.trim()) {
      toast.error('Birim adı zorunludur')
      return
    }
    if (!formType) {
      toast.error('Birim tipi zorunludur')
      return
    }

    try {
      if (editing) {
        const { error } = await supabase
          .from('birimler')
          .update({
            ana_sirket_id: formCompanyId,
            ust_birim_id: formParentId || null,
            birim_adi: formName.trim(),
            birim_tipi: formType,
            durum: true,
          })
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Birim güncellendi')
      } else {
        const { error } = await supabase.from('birimler').insert([
          {
            ana_sirket_id: formCompanyId,
            ust_birim_id: formParentId || null,
            birim_adi: formName.trim(),
            birim_tipi: formType,
            durum: true,
          },
        ])
        if (error) throw error
        toast.success('Yeni birim eklendi')
      }
      setShowModal(false)
      await load()
    } catch (e) {
      console.error('Birim kaydedilirken hata:', e)
      toast.error(e.message || 'Kayıt hatası')
    }
  }

  const parentOptions = formCompanyId
    ? units.filter((u) => String(u.ana_sirket_id) === String(formCompanyId))
    : []

  return (
    <div style={containerStyle}>
      {/* Başlık + Yeni Birim */}
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
            Birim & Şube Yönetimi
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketinize bağlı yetkili birimleri görüntüleyin ve yönetin.'
              : 'Şirketlere bağlı birimleri görüntüleyin, filtreleyin ve yönetin.'}
          </p>
        </div>
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
          + Yeni Birim
        </button>
      </div>

      {/* Filtreler */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {!companyScoped ? (
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            style={{
              minWidth: 180,
              borderRadius: 9999,
              border: '1px solid #e2e8f0',
              padding: '8px 12px',
              fontSize: 12,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">Tüm şirketler</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ana_sirket_adi}
              </option>
            ))}
          </select>
        ) : (
          companies[0] && (
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
          )
        )}
        <input
          type="text"
          placeholder={
            companyScoped
              ? 'Birim adına göre ara...'
              : 'Birim adı veya şirket adına göre ara...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
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
          Kayıtlı birim bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((u) => {
          const isActive = !u.silindi_at
          return (
            <div key={u.id} style={cardStyle}>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#0a1e42',
                  }}
                >
                  {u.birim_adi}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    marginTop: 2,
                  }}
                >
                  {getCompanyName(u.ana_sirket_id)}{' '}
                  {u.birim_tipi ? `• ${u.birim_tipi}` : ''}
                </div>
                {u.ust_birim_id && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9ca3af',
                      marginTop: 2,
                    }}
                  >
                    Üst birim: {getParentName(u.ust_birim_id)}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => softToggleActive(u)}
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
                <button
                  type="button"
                  onClick={() => openEditModal(u)}
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
                <button
                  type="button"
                  onClick={() => hardDelete(u)}
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
                  {editing ? 'Birim Düzenle' : 'Yeni Birim Ekle'}
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b7280',
                    marginTop: 4,
                  }}
                >
                  Şirket, birim adı ve tipini belirleyin; isteğe bağlı üst birim
                  seçin.
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
                  Şirket
                </label>
                {companyScoped && companies.length === 1 ? (
                  <div
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      padding: '10px 14px',
                      fontSize: 14,
                      color: '#111827',
                      backgroundColor: '#f1f5f9',
                      fontWeight: 600,
                    }}
                  >
                    {companies[0].ana_sirket_adi}
                  </div>
                ) : (
                  <select
                    value={formCompanyId}
                    onChange={(e) => {
                      setFormCompanyId(e.target.value)
                      setFormParentId('')
                    }}
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      padding: '10px 14px',
                      fontSize: 14,
                      color: '#111827',
                      backgroundColor: '#f9fafb',
                    }}
                  >
                    <option value="">Şirket seçin</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ana_sirket_adi}
                      </option>
                    ))}
                  </select>
                )}
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
                  Üst Birim (opsiyonel)
                </label>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '10px 14px',
                    fontSize: 14,
                    color: '#111827',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <option value="">Üst birim yok</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.birim_adi}
                    </option>
                  ))}
                </select>
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
                  Birim Adı
                </label>
                <input
                  type="text"
                  placeholder="Örn: İstanbul Bölge"
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
                  Birim Tipi
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '10px 14px',
                    fontSize: 14,
                    color: '#111827',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <option value="BOLGE">BÖLGE</option>
                  <option value="SUBE">ŞUBE</option>
                  <option value="BAYI">BAYİ</option>
                  <option value="BIRIM">BİRİM</option>
                </select>
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

