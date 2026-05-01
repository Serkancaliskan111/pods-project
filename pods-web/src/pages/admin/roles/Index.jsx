import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import getSupabase from '../../../lib/supabaseClient'
import Card from '../../../components/ui/Card'
import { toast } from 'sonner'
import {
  emptyRoleSwitchState,
  hydrateRoleEditorPermissions,
  mergeRoleYetkilerForSave,
} from '../../../lib/permissions.js'
import RolePermissionsEditor from '../../../components/admin/RolePermissionsEditor.jsx'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

/** Şema farkları için: silindi_at / yetkiler / FK embed yoksa sırayla daha sade seçimler dene */
const ROLLER_SELECT_FALLBACKS = [
  'id,rol_adi,ana_sirket_id,yetkiler,silindi_at,ana_sirketler(ana_sirket_adi)',
  'id,rol_adi,ana_sirket_id,yetkiler,ana_sirketler(ana_sirket_adi)',
  'id,rol_adi,ana_sirket_id,yetkiler,silindi_at',
  'id,rol_adi,ana_sirket_id,yetkiler',
  'id,rol_adi,ana_sirket_id,silindi_at,ana_sirketler(ana_sirket_adi)',
  'id,rol_adi,ana_sirket_id,ana_sirketler(ana_sirket_adi)',
  'id,rol_adi,ana_sirket_id,silindi_at',
  'id,rol_adi,ana_sirket_id',
]

function shouldRetryRoleSelect(err) {
  if (!err) return false
  const code = String(err.code || '').toLowerCase()
  const msg = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase()
  return (
    code === '42703' ||
    code === 'pgrst204' ||
    code === 'pgrst200' ||
    /column|does not exist|relationship|schema cache|could not find/i.test(msg)
  )
}

async function fetchRolesWithFallback(supabaseClient, companyScoped, currentCompanyId) {
  let lastErr = null
  for (const sel of ROLLER_SELECT_FALLBACKS) {
    let q = supabaseClient.from('roller').select(sel)
    if (companyScoped && currentCompanyId) {
      q = q.eq('ana_sirket_id', currentCompanyId)
    }
    const res = await q
    if (!res.error) {
      const raw = res.data || []
      const visible = raw.filter((r) => r.silindi_at == null || r.silindi_at === undefined)
      return { data: visible, error: null }
    }
    lastErr = res.error
    if (!shouldRetryRoleSelect(res.error)) break
  }
  return { data: [], error: lastErr }
}

export default function RolesIndex() {
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const canLoadWithScope = isSystemAdmin ? true : Boolean(scopeReady && currentCompanyId)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formRoleName, setFormRoleName] = useState('')
  const [formCompanyId, setFormCompanyId] = useState('')
  const [permissions, setPermissions] = useState(() => emptyRoleSwitchState())
  const [editingRoleId, setEditingRoleId] = useState(null)
  const [preservedYetkiler, setPreservedYetkiler] = useState({})
  const hasHydratedDataRef = useRef(false)
  const cacheKey = useMemo(() => {
    if (!canLoadWithScope) return null
    return `web_roles_index_cache_v2:${isSystemAdmin ? 'system' : String(currentCompanyId)}`
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId])
  const load = async () => {
    if (!canLoadWithScope) return
    if (!hasHydratedDataRef.current) setLoading(true)
    try {
      let compQuery = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi')
        .is('silindi_at', null)

      if (companyScoped && currentCompanyId) {
        compQuery = compQuery.eq('id', currentCompanyId)
      }

      const [{ data: comps, error: compErr }, { data: roles, error: roleErr }] =
        await Promise.all([
          compQuery,
          fetchRolesWithFallback(supabase, companyScoped, currentCompanyId),
        ])

      if (compErr || roleErr) {
        console.error(compErr || roleErr)
        const hint = roleErr?.message || compErr?.message
        toast.error(
          hint ? `Roller yüklenemedi: ${hint}` : 'Roller yüklenemedi',
        )
        setRows([])
        setCompanies(comps || [])
      } else {
        setRows(roles || [])
        setCompanies(comps || [])
        if (cacheKey) {
          try {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ rows: roles || [], companies: comps || [] }),
            )
          } catch {
            /* sessionStorage dolu veya kapalı olabilir */
          }
        }
        hasHydratedDataRef.current = true
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!cacheKey || hasHydratedDataRef.current) return
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.rows)) setRows(parsed.rows)
      if (Array.isArray(parsed?.companies)) setCompanies(parsed.companies)
      hasHydratedDataRef.current = true
      setLoading(false)
    } catch {
      /* cache bozuksa yoksay */
    }
  }, [cacheKey])

  useEffect(() => {
    load()
  }, [canLoadWithScope, companyScoped, currentCompanyId, isSystemAdmin])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

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

  const closeModal = () => {
    setShowModal(false)
    setEditingRoleId(null)
    setPreservedYetkiler({})
  }

  const openNewModal = () => {
    setEditingRoleId(null)
    setPreservedYetkiler({})
    setFormRoleName('')
    setFormCompanyId(
      companyScoped && currentCompanyId ? String(currentCompanyId) : '',
    )
    setPermissions(emptyRoleSwitchState())
    setShowModal(true)
  }

  const openEditModal = (row) => {
    const { switches, preserved } = hydrateRoleEditorPermissions(row?.yetkiler)
    setEditingRoleId(row.id)
    setPreservedYetkiler(preserved)
    setFormRoleName(row.rol_adi || '')
    setFormCompanyId(row.ana_sirket_id ? String(row.ana_sirket_id) : '')
    setPermissions(switches)
    setShowModal(true)
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
      const yetkiler = mergeRoleYetkilerForSave(preservedYetkiler, permissions)
      const row = {
        rol_adi: formRoleName.trim(),
        ana_sirket_id: targetCompanyId || null,
        yetkiler,
      }
      const { error } = editingRoleId
        ? await supabase.from('roller').update(row).eq('id', editingRoleId)
        : await supabase.from('roller').insert([row])
      if (error) throw error
      toast.success(editingRoleId ? 'Rol güncellendi' : 'Yeni rol oluşturuldu')
      closeModal()
      hasHydratedDataRef.current = false
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
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openEditModal(r)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3',
                          fontSize: 12,
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
                    </div>
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
            padding: '20px 12px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 'min(880px, calc(100vw - 24px))',
              maxHeight: 'min(90vh, calc(100vh - 40px))',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              borderRadius: 20,
              padding: '22px 24px 18px',
              boxShadow: '0 24px 60px rgba(15,23,42,0.4)',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: '#0a1e42',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {editingRoleId ? 'Rolü düzenle' : 'Yeni rol ekle'}
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  {editingRoleId
                    ? 'Yetkiler kaydedildiğinde bu rolü kullanan personeller bir sonraki oturum yenilemesinde güncellenmiş izinleri alır.'
                    : companyScoped
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
                marginBottom: 8,
                overflow: 'auto',
                flex: 1,
                minHeight: 0,
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
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
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#111827',
                    backgroundColor: '#f9fafb',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
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
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      padding: '8px 12px',
                      fontSize: 13,
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
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      padding: '8px 12px',
                      fontSize: 13,
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
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#4b5563',
                    marginBottom: 8,
                  }}
                >
                  Yetkiler
                </label>
                <div
                  style={{
                    flex: 1,
                    minHeight: 200,
                    maxHeight: 'min(440px, 48vh)',
                    overflowY: 'auto',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <RolePermissionsEditor
                    permissions={permissions}
                    onToggle={(key, value) =>
                      setPermissions((prev) => ({ ...prev, [key]: value }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid #f1f5f9',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: '7px 14px',
                  borderRadius: 9999,
                  border: 'none',
                  backgroundColor: '#e5e7eb',
                  color: '#111827',
                  fontSize: 12,
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
                  padding: '7px 16px',
                  borderRadius: 9999,
                  border: 'none',
                  backgroundColor: '#0a1e42',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {editingRoleId ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

