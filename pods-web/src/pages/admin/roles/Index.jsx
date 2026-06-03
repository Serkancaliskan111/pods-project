import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import getSupabase from '../../../lib/supabaseClient'
import { toast } from 'sonner'
import {
  AdminFilterSelect,
  AdminFiltersBar,
  AdminPageShell,
  AdminScopeChip,
  Button,
  PageHeader,
} from '../../../components/admin/AdminDirectory.jsx'
import {
  Card,
  EmptyState,
  Spinner,
  Table,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Text,
  Th,
  ConfirmDialog,
} from '../../../ui'
import {
  canSeeRoles,
  canEditRoleRow,
  emptyRoleSwitchState,
  hydrateRoleEditorPermissions,
  mergeRoleYetkilerForSave,
} from '../../../lib/permissions.js'
import { saveRollerRole } from '../../../lib/roleApi.js'
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
      q = q.or(`ana_sirket_id.eq.${currentCompanyId},ana_sirket_id.is.null`)
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
  const profilePermissions = profile?.yetkiler || {}
  const mayManageRoles = canSeeRoles(profilePermissions, isSystemAdmin)
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const canLoadWithScope = isSystemAdmin ? true : Boolean(scopeReady && currentCompanyId)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
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

  const executeSoftDelete = async () => {
    const row = deleteConfirm
    if (!row) return
    setDeleteLoading(true)
    try {
      const { error } = await supabase
        .from('roller')
        .update({ silindi_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      toast.success('Rol pasif hale getirildi')
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      console.error('Rol silinirken hata:', e)
      toast.error(e?.message || e?.error?.message || 'Rol silinemedi')
    } finally {
      setDeleteLoading(false)
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
    if (!canEditRoleRow(row, isSystemAdmin, currentCompanyId)) {
      toast.error(
        row?.ana_sirket_id
          ? 'Bu rol şirketinize ait değil; düzenleyemezsiniz.'
          : 'Global roller yalnızca sistem yöneticisi tarafından düzenlenebilir.',
      )
      return
    }
    const { switches, preserved } = hydrateRoleEditorPermissions(row?.yetkiler)
    setEditingRoleId(row.id)
    setPreservedYetkiler(preserved)
    setFormRoleName(row.rol_adi || '')
    setFormCompanyId(row.ana_sirket_id ? String(row.ana_sirket_id) : '')
    setPermissions(switches)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!mayManageRoles) {
      toast.error('Rol düzenleme yetkiniz yok.')
      return
    }
    if (!formRoleName.trim()) {
      toast.error('Rol adı zorunludur')
      return
    }

    if (!companyScoped && !isSystemAdmin && !formCompanyId) {
      toast.error('Global rol oluşturmak için sistem yöneticisi yetkisi gerekir.')
      return
    }

    const targetCompanyId = companyScoped
      ? currentCompanyId
      : formCompanyId || null

    if (companyScoped && !currentCompanyId) {
      toast.error('Şirket bilgisi bulunamadı')
      return
    }

    if (
      editingRoleId &&
      !canEditRoleRow(
        { ana_sirket_id: formCompanyId || targetCompanyId },
        isSystemAdmin,
        currentCompanyId,
      ) &&
      !isSystemAdmin
    ) {
      toast.error('Global veya başka şirkete ait roller kaydedilemez.')
      return
    }

    try {
      const yetkiler = mergeRoleYetkilerForSave(preservedYetkiler, permissions)
      await saveRollerRole({
        rolId: editingRoleId,
        rolAdi: formRoleName.trim(),
        anaSirketId: targetCompanyId,
        yetkiler,
      })
      toast.success(editingRoleId ? 'Rol güncellendi' : 'Yeni rol oluşturuldu')
      closeModal()
      hasHydratedDataRef.current = false
      await load()
    } catch (e) {
      console.error('Rol kaydedilirken hata:', e)
      toast.error(e?.message || 'Rol kaydedilemedi')
    }
  }

  return (
    <AdminPageShell>
      <PageHeader
        title="Roller"
        subtitle={
          companyScoped
            ? 'Şirketinize özel roller ve yetki setleri.'
            : 'Şirket ve global roller; yetkileri düzenleyin.'
        }
        actions={
          mayManageRoles ? (
            <Button variant="accent" size="sm" iconLeft={<Plus size={16} />} onClick={openNewModal}>
              Yeni rol
            </Button>
          ) : null
        }
      />

      <AdminFiltersBar>
        {!companyScoped ? (
          <>
            <AdminFilterSelect
              label="Şirket filtresi"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="!min-w-[220px]"
            >
              <option value="">Tüm şirketler + global</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ana_sirket_adi}
                </option>
              ))}
            </AdminFilterSelect>
            <Text variant="caption" className="max-w-md self-center text-slate-500">
              Boş seçimde global roller de listelenir.
            </Text>
          </>
        ) : (
          <AdminScopeChip>{companies[0]?.ana_sirket_adi}</AdminScopeChip>
        )}
      </AdminFiltersBar>

      <Card padding="none" radius="2xl" className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="Rol bulunamadı"
            description="Filtreyi değiştirin veya yeni rol ekleyin."
            className="py-12"
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <Th>Rol adı</Th>
                <Th>Şirket</Th>
                <Th className="text-right">İşlemler</Th>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <Td className="font-semibold text-slate-900">{r.rol_adi}</Td>
                  <Td>
                    {r.ana_sirketler?.ana_sirket_adi ??
                      (r.ana_sirket_id ? 'Bilinmeyen şirket' : 'Global rol')}
                  </Td>
                  <Td className="text-right">
                    {mayManageRoles && canEditRoleRow(r, isSystemAdmin, currentCompanyId) ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEditModal(r)}>
                          Düzenle
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(r)}>
                          Sil
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Salt okunur</span>
                    )}
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => !deleteLoading && setDeleteConfirm(null)}
        title="Rolü sil"
        message={
          deleteConfirm
            ? `'${deleteConfirm.rol_adi}' rolünü silmek (pasif yapmak) istediğinize emin misiniz?`
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

