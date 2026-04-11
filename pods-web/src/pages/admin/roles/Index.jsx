import { useContext, useEffect, useState } from 'react'
import getSupabase from '../../../lib/supabaseClient'
import Card from '../../../components/ui/Card'
import { toast } from 'sonner'
import { buildYetkilerForSave } from '../../../lib/permissions.js'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

// Rollere atanacak izin/eylem listesi (eski Yeni Rol ekranındaki ACTIONS)
const ACTIONS = {
  OPERASYON: ['is.olustur', 'is.liste_gor', 'is.detay_gor', 'is.fotograf_yukle'],
  DENETIM: ['denetim.olustur', 'denetim.onayla', 'denetim.reddet'],
  YONETIM: ['personel.yonet', 'puan.ver', 'rapor.oku'],
  SISTEM: ['rol.yonet', 'sube.yonet', 'sirket.yonet', 'is_turu.yonet', 'sistem.ayar'],
}

export default function RolesIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formRoleName, setFormRoleName] = useState('')
  const [formCompanyId, setFormCompanyId] = useState('')
  const [permissions, setPermissions] = useState({})
  const load = async () => {
    setLoading(true)
    try {
      let compQuery = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi')
        .is('silindi_at', null)

      if (companyScoped && currentCompanyId) {
        compQuery = compQuery.eq('id', currentCompanyId)
      }

      let roleQuery = supabase
        .from('roller')
        .select('id,rol_adi,ana_sirket_id,ana_sirketler(ana_sirket_adi)')

      if (companyScoped && currentCompanyId) {
        roleQuery = roleQuery.eq('ana_sirket_id', currentCompanyId)
      }

      const [{ data: comps, error: compErr }, { data: roles, error: roleErr }] =
        await Promise.all([compQuery, roleQuery])

      if (compErr || roleErr) {
        console.error(compErr || roleErr)
        toast.error('Roller yüklenemedi')
        setRows([])
        setCompanies(comps || [])
      } else {
        setRows(roles || [])
        setCompanies(comps || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [companyScoped, currentCompanyId, isSystemAdmin])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

  // Başlangıçta tüm izinleri false olarak hazırla
  useEffect(() => {
    const init = {}
    Object.values(ACTIONS)
      .flat()
      .forEach((k) => {
        init[k] = false
      })
    setPermissions(init)
  }, [])

  const softDelete = async (row) => {
    if (
      !window.confirm(
        `'${row.rol_adi}' rolünü silmek (pasif yapmak) istediğinize emin misiniz?`,
      )
    )
      return
    try {
      const { error } = await supabase
        .from('roller')
        .update({ silindi_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) {
        throw error
      }
      toast.success('Rol pasif hale getirildi')
      await load()
    } catch (e) {
      console.error('Rol silinirken hata:', e)
      toast.error('Rol silinemedi')
    }
  }

  const filteredRows = rows.filter((r) => {
    if (companyScoped) {
      return (
        r.ana_sirket_id &&
        String(r.ana_sirket_id) === String(currentCompanyId)
      )
    }
    if (!selectedCompanyId) return true
    if (!r.ana_sirket_id) return false
    return String(r.ana_sirket_id) === String(selectedCompanyId)
  })

  const openNewModal = () => {
    setFormRoleName('')
    setFormCompanyId(
      companyScoped && currentCompanyId ? String(currentCompanyId) : '',
    )
    // Tüm izinleri sıfırla
    const base = {}
    Object.values(ACTIONS)
      .flat()
      .forEach((k) => {
        base[k] = false
      })
    setPermissions(base)
    setShowModal(true)
  }

  const togglePermission = (key) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSave = async () => {
    if (!formRoleName.trim()) {
      toast.error('Rol adı zorunludur')
      return
    }

    const targetCompanyId = companyScoped
      ? currentCompanyId
      : formCompanyId || null

    if (companyScoped && !currentCompanyId) {
      toast.error('Şirket bilgisi bulunamadı')
      return
    }

    try {
      const payload = {
        rol_adi: formRoleName.trim(),
        ana_sirket_id: targetCompanyId || null,
        yetkiler: buildYetkilerForSave(permissions),
      }
      const { error } = await supabase.from('roller').insert([payload])
      if (error) throw error
      toast.success('Yeni rol oluşturuldu')
      setShowModal(false)
      await load()
    } catch (e) {
      console.error('Rol kaydedilirken hata:', e)
      toast.error(e.message || 'Rol kaydedilemedi')
    }
  }

  return (
    <div
      style={{
        padding: '32px',
        backgroundColor: '#f3f4f6',
        minHeight: '100vh',
      }}
    >
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
            Roller
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketinize özel rolleri burada görüntüleyin ve yönetin.'
              : 'Şirketlere atanmış rollerinizi burada yönetin.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openNewModal}
          style={{
            padding: '8px 18px',
            borderRadius: 9999,
            border: 'none',
            backgroundColor: '#0a1e42',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(15,23,42,0.25)',
          }}
        >
          + Yeni Rol Ekle
        </button>
      </div>

      {/* Şirket filtresi (yalnızca sistem yöneticisi) */}
      {!companyScoped ? (
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            style={{
              minWidth: 220,
              borderRadius: 9999,
              border: '1px solid #e2e8f0',
              padding: '8px 12px',
              fontSize: 12,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">Tüm şirketler + global roller</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ana_sirket_adi}
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 12,
              color: '#9ca3af',
            }}
          >
            Boş seçimde global roller de listelenir. Şirket seçince yalnızca o
            şirketin rolleri.
          </span>
        </div>
      ) : (
        companies[0] && (
          <div
            style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#64748b',
              }}
            >
              Şirket:
            </span>
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
          </div>
        )
      )}

      <Card>
        {loading ? (
          <div>Yükleniyor...</div>
        ) : (
          <table
            className="table-root"
            style={{ width: '100%', tableLayout: 'fixed' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '40%' }}>Rol Adı</th>
                <th style={{ textAlign: 'left', width: '40%' }}>Şirket</th>
                <th style={{ textAlign: 'right', width: '20%' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="p-6 text-center text-slate-500"
                  >
                    Seçili filtreye uygun rol bulunamadı.
                  </td>
                </tr>
              )}
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'left' }}>{r.rol_adi}</td>
                  <td style={{ textAlign: 'left' }}>
                    {r.ana_sirketler?.ana_sirket_adi ??
                      (r.ana_sirket_id ? 'Bilinmeyen Şirket' : 'Global Rol')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => softDelete(r)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: '#fee2e2',
                        color: '#b91c1c',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Yeni rol ekleme modalı */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              backgroundColor: '#ffffff',
              borderRadius: 24,
              padding: 24,
              boxShadow: '0 24px 60px rgba(15,23,42,0.4)',
              border: '1px solid #e5e7eb',
            }}
          >
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
                  Yeni Rol Ekle
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: '#6b7280',
                    marginTop: 4,
                  }}
                >
                  {companyScoped
                    ? 'Rol adını ve yetkileri belirleyin; rol şirketinize kaydedilir.'
                    : 'Rol adını belirleyin ve isteğe bağlı olarak bir şirkete bağlayın.'}
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
                  Rol Adı
                </label>
                <input
                  type="text"
                  placeholder="Örn: YÖNETİCİ, PERSONEL"
                  value={formRoleName}
                  onChange={(e) => setFormRoleName(e.target.value)}
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
                  {companyScoped ? 'Şirket' : 'Şirket (opsiyonel)'}
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
                    onChange={(e) => setFormCompanyId(e.target.value)}
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
                    {!companyScoped && (
                      <option value="">Global rol (tüm şirketler)</option>
                    )}
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ana_sirket_adi}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Yetki / eylem listesi */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#4b5563',
                    marginBottom: 6,
                  }}
                >
                  Yetkiler (Eylem Listesi)
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    fontSize: 12,
                    color: '#4b5563',
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {Object.entries(ACTIONS).map(([cat, keys]) => (
                    <div
                      key={cat}
                      style={{
                        borderRadius: 12,
                        border: '1px solid #e5e7eb',
                        padding: 10,
                        backgroundColor: '#f9fafb',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          marginBottom: 6,
                          color: '#0a1e42',
                        }}
                      >
                        {cat}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {keys.map((k) => (
                          <label
                            key={k}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <input
                              type="checkbox"
                              checked={!!permissions[k]}
                              onChange={() => togglePermission(k)}
                            />
                            <span>{k}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
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

