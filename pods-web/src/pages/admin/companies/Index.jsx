import { useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { normalizeIpList } from '../../../lib/ipAccess.js'

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
  const [formFixedIpEnabled, setFormFixedIpEnabled] = useState(false)
  const [formAllowedIps, setFormAllowedIps] = useState([''])

  const isIpColumnMissingError = (error) => {
    const msg = String(error?.message || '').toLowerCase()
    return (
      error?.code === '42703' ||
      msg.includes('sabit_ip_aktif') ||
      msg.includes('izinli_ipler')
    )
  }

  const switchTrackStyle = {
    position: 'relative',
    width: 44,
    height: 24,
    borderRadius: 9999,
    border: '1px solid #cbd5e1',
    backgroundColor: formFixedIpEnabled ? '#0a1e42' : '#e2e8f0',
    transition: 'all .2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    padding: 2,
    boxSizing: 'border-box',
  }

  const switchThumbStyle = {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 2px rgba(15,23,42,.25)',
    transform: formFixedIpEnabled ? 'translateX(20px)' : 'translateX(0)',
    transition: 'transform .2s ease',
  }

  const load = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi,vergi_no,silindi_at,sabit_ip_aktif,izinli_ipler')
        .order('id', { ascending: false }) // yeni eklenen en üstte

      if (!isSystemAdmin && currentCompanyId) {
        query = query.eq('id', currentCompanyId)
      }

      let { data, error } = await query
      if (error && isIpColumnMissingError(error)) {
        let fallback = supabase
          .from('ana_sirketler')
          .select('id,ana_sirket_adi,vergi_no,silindi_at')
          .order('id', { ascending: false })
        if (!isSystemAdmin && currentCompanyId) {
          fallback = fallback.eq('id', currentCompanyId)
        }
        const fb = await fallback
        data = (fb.data || []).map((r) => ({
          ...r,
          sabit_ip_aktif: false,
          izinli_ipler: [],
        }))
        error = fb.error
      }
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
    setFormFixedIpEnabled(false)
    setFormAllowedIps([''])
    setShowModal(true)
  }

  const openEditModal = (row) => {
    setEditing(row)
    setFormName(row.ana_sirket_adi || '')
    setFormVergiNo(row.vergi_no || '')
    setFormFixedIpEnabled(!!row.sabit_ip_aktif)
    setFormAllowedIps(
      (row.izinli_ipler || []).length ? row.izinli_ipler : [''],
    )
    setShowModal(true)
  }

  const updateAllowedIp = (idx, value) => {
    setFormAllowedIps((prev) =>
      prev.map((ip, i) => (i === idx ? value : ip)),
    )
  }

  const addAllowedIpInput = () => {
    setFormAllowedIps((prev) => {
      if (prev.length >= 5) return prev
      return [...prev, '']
    })
  }

  const removeAllowedIpInput = (idx) => {
    setFormAllowedIps((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== idx)
    })
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
    const allowList = normalizeIpList(formAllowedIps)
    if (allowList.length > 5) {
      toast.error('En fazla 5 IP ekleyebilirsiniz')
      return
    }
    if (formFixedIpEnabled && allowList.length === 0) {
      toast.error('Sabit IP aktifken en az 1 IP girilmelidir')
      return
    }

    try {
      if (editing) {
        let { error } = await supabase
          .from('ana_sirketler')
          .update({
            ana_sirket_adi: formName.trim(),
            vergi_no: formVergiNo.trim(),
            sabit_ip_aktif: formFixedIpEnabled,
            izinli_ipler: allowList,
          })
          .eq('id', editing.id)
        if (error && isIpColumnMissingError(error)) {
          const fallback = await supabase
            .from('ana_sirketler')
            .update({
              ana_sirket_adi: formName.trim(),
              vergi_no: formVergiNo.trim(),
            })
            .eq('id', editing.id)
          error = fallback.error
        }
        if (error) throw error
        toast.success('Şirket güncellendi')
      } else {
        let { error } = await supabase.from('ana_sirketler').insert([
          {
            ana_sirket_adi: formName.trim(),
            vergi_no: formVergiNo.trim(),
            durum: true,
            sabit_ip_aktif: formFixedIpEnabled,
            izinli_ipler: allowList,
          },
        ])
        if (error && isIpColumnMissingError(error)) {
          const fallback = await supabase.from('ana_sirketler').insert([
            {
              ana_sirket_adi: formName.trim(),
              vergi_no: formVergiNo.trim(),
              durum: true,
            },
          ])
          error = fallback.error
        }
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
                  Ana şirket adını, vergi numarasını ve IP güvenlik kurallarını tanımlayın.
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
                  Sabit IP
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '10px 14px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formFixedIpEnabled}
                    onClick={() => setFormFixedIpEnabled((v) => !v)}
                    style={{
                      ...switchTrackStyle,
                      cursor: 'pointer',
                      border: 'none',
                      outline: 'none',
                    }}
                  >
                    <span style={switchThumbStyle} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormFixedIpEnabled((v) => !v)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#111827',
                      fontSize: 13,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Aktif
                  </button>
                </div>
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
                  İzinli IP'ler (max 5)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {formAllowedIps.map((ip, idx) => (
                    <div
                      key={`ip-${idx}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <input
                        type="text"
                        disabled={!formFixedIpEnabled}
                        placeholder="Örn: 88.227.10.45"
                        value={ip}
                        onChange={(e) => updateAllowedIp(idx, e.target.value)}
                        style={{
                          width: '100%',
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          padding: '10px 14px',
                          fontSize: 14,
                          color: '#111827',
                          backgroundColor: '#f9fafb',
                          boxSizing: 'border-box',
                          opacity: formFixedIpEnabled ? 1 : 0.55,
                          flex: 1,
                        }}
                      />
                      <button
                        type="button"
                        disabled={!formFixedIpEnabled || formAllowedIps.length <= 1}
                        onClick={() => removeAllowedIpInput(idx)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9999,
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          fontSize: 18,
                          lineHeight: '18px',
                          cursor:
                            formFixedIpEnabled && formAllowedIps.length > 1
                              ? 'pointer'
                              : 'not-allowed',
                          opacity: formFixedIpEnabled ? 1 : 0.55,
                        }}
                        aria-label="IP satırını sil"
                      >
                        -
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={!formFixedIpEnabled || formAllowedIps.length >= 5}
                    onClick={addAllowedIpInput}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 9999,
                      border: '1px dashed #94a3b8',
                      backgroundColor: '#f8fafc',
                      color: '#334155',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor:
                        formFixedIpEnabled && formAllowedIps.length < 5
                          ? 'pointer'
                          : 'not-allowed',
                      opacity: formFixedIpEnabled ? 1 : 0.55,
                      alignSelf: 'flex-start',
                    }}
                  >
                    + IP Ekle
                  </button>
                </div>
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

