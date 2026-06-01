import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { normalizeIpList } from '../../../lib/ipAccess.js'
import {
  AdminDirectoryRow,
  AdminFiltersBar,
  AdminListPanel,
  AdminPageShell,
  AdminSearchField,
  AdminStatusPill,
  Button,
  PageHeader,
} from '../../../components/admin/AdminDirectory.jsx'
import { ConfirmDialog, Input, Switch, Text } from '../../../ui'

const supabase = getSupabase()

export default function CompaniesIndex() {
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const canLoadWithScope = isSystemAdmin ? true : Boolean(scopeReady && currentCompanyId)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editing, setEditing] = useState(null) // null = yeni, obje = düzenle
  const [formName, setFormName] = useState('')
  const [formVergiNo, setFormVergiNo] = useState('')
  const [formFixedIpEnabled, setFormFixedIpEnabled] = useState(false)
  const [formAllowedIps, setFormAllowedIps] = useState([''])
  const hasHydratedDataRef = useRef(false)
  const cacheKey = useMemo(() => {
    if (!canLoadWithScope) return null
    return `web_companies_index_cache_v1:${isSystemAdmin ? 'system' : String(currentCompanyId)}`
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId])

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
    if (!canLoadWithScope) return
    if (!hasHydratedDataRef.current) setLoading(true)
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
      if (cacheKey) {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ rows: data || [] }),
          )
        } catch (_) {}
      }
      hasHydratedDataRef.current = true
    } catch (e) {
      console.error(e)
      toast.error('Şirketler yüklenemedi')
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
      if (Array.isArray(parsed?.rows)) {
        setRows(parsed.rows)
        hasHydratedDataRef.current = true
        setLoading(false)
      }
    } catch (_) {}
  }, [cacheKey])

  useEffect(() => {
    load()
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId])

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
      toast.error(e?.message || e?.error?.message || 'Durum güncellenemedi')
      setRows(previous)
    }
  }

  const executeSoftDelete = async () => {
    const row = deleteConfirm
    if (!row) return
    setDeleteLoading(true)
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
      setDeleteConfirm(null)
    } catch (e) {
      console.error('Şirket silinirken hata:', e)
      toast.error(e?.message || e?.error?.message || 'Şirket silinemedi')
      setRows(previous)
    } finally {
      setDeleteLoading(false)
    }
  }

  const filtered = rows.filter((c) => {
    const term = search.toLowerCase()
    return (
      (c.ana_sirket_adi || '').toLowerCase().includes(term) ||
      (c.vergi_no || '').toLowerCase().includes(term)
    )
  })

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
    <AdminPageShell>
      <PageHeader
        title="Şirketler"
        subtitle={
          isSystemAdmin
            ? 'Ana şirket kayıtlarını görüntüleyin ve yönetin.'
            : 'Bağlı olduğunuz şirketin bilgilerini görüntüleyin.'
        }
        actions={
          isSystemAdmin ? (
            <Button variant="accent" size="sm" iconLeft={<Plus size={16} />} onClick={openNewModal}>
              Yeni şirket
            </Button>
          ) : null
        }
      />

      <AdminFiltersBar>
        <AdminSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Şirket adı veya vergi no…"
          className="max-w-md"
        />
      </AdminFiltersBar>

      <AdminListPanel
        loading={loading}
        empty={!filtered.length}
        emptyTitle="Şirket bulunamadı"
        emptyDescription="Arama kriterlerini değiştirin veya yeni şirket ekleyin."
      >
        {filtered.map((c) => {
          const isActive = !c.silindi_at
          return (
            <AdminDirectoryRow
              key={c.id}
              title={c.ana_sirket_adi}
              subtitle={`Vergi no: ${c.vergi_no || '—'}`}
              meta={c.sabit_ip_aktif ? 'Sabit IP kısıtı aktif' : undefined}
              badges={<AdminStatusPill active={isActive} />}
              actions={
                <>
                  {isSystemAdmin ? (
                    <Button variant="outline" size="sm" onClick={() => void softToggleActive(c)}>
                      {isActive ? 'Pasife al' : 'Aktifleştir'}
                    </Button>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => openEditModal(c)}>
                    Düzenle
                  </Button>
                  {isSystemAdmin ? (
                    <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(c)}>
                      Sil
                    </Button>
                  ) : null}
                </>
              }
            />
          )
        })}
      </AdminListPanel>

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
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => !deleteLoading && setDeleteConfirm(null)}
        title="Şirketi sil"
        message={
          deleteConfirm
            ? `'${deleteConfirm.ana_sirket_adi}' şirketini silmek (pasif yapmak) istediğinize emin misiniz?`
            : ''
        }
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        loading={deleteLoading}
        onConfirm={() => void executeSoftDelete()}
      />
    </AdminPageShell>
  )
}

