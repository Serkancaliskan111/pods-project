import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Edit2, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canManageStaff, canAssignTask } from '../../../lib/permissions.js'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  isUnitInScope,
} from '../../../lib/supabaseScope.js'

const supabase = getSupabase()

function isPermTruthy(permissions, key) {
  const v = permissions?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

export default function StaffIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const accessibleUnitIdsKey = JSON.stringify(accessibleUnitIds || [])
  const permissions = profile?.yetkiler || {}
  const isTopCompanyScope =
    !!personel?.ana_sirket_id &&
    personel?.birim_id == null &&
    (isPermTruthy(permissions, 'is_admin') ||
      isPermTruthy(permissions, 'is_manager') ||
      isPermTruthy(permissions, 'sirket.yonet') ||
      isPermTruthy(permissions, 'rol.yonet') ||
      isPermTruthy(permissions, 'sube.yonet') ||
      isPermTruthy(permissions, 'personel.yonet'))
  const scopedUnitIds = useMemo(
    () => (isTopCompanyScope ? [] : accessibleUnitIds || []),
    [isTopCompanyScope, accessibleUnitIdsKey],
  )
  const canStaffCrud = canManageStaff(permissions, isSystemAdmin)
  const canAssign = isSystemAdmin || canAssignTask(permissions)
  const [staff, setStaff] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')

  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const scope = {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds: scopedUnitIds,
    }
    try {
      const [{ data: comps }, { data: urs }] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase
            .from('ana_sirketler')
            .select('id, ana_sirket_adi')
            .is('silindi_at', null),
          scope,
        ),
        scopeBirimlerQuery(
          supabase
            .from('birimler')
            .select('id, birim_adi, ana_sirket_id')
            .is('silindi_at', null),
          scope,
        ),
      ])

      let prsQuery = supabase
        .from('personeller')
        .select(
          `
            id,
            personel_kodu,
            ad,
            soyad,
            email,
            durum,
            ana_sirket_id,
            birim_id,
            rol_id,
            ana_sirketler(ana_sirket_adi),
            birimler(birim_adi),
            roller(rol_adi)
          `,
        )
        .is('silindi_at', null)

      if (!isSystemAdmin && currentCompanyId) {
        prsQuery = prsQuery.eq('ana_sirket_id', currentCompanyId)
        if (scopedUnitIds && scopedUnitIds.length) {
          prsQuery = prsQuery.in('birim_id', scopedUnitIds)
        }
      }

      const { data: prs, error: prsErr } = await prsQuery

      if (prsErr) {
        console.warn(
          'Nested personeller select failed, falling back to flat select',
          prsErr,
        )
        let flatQuery = supabase
          .from('personeller')
          .select('id, personel_kodu, ad, soyad, email, durum, ana_sirket_id, birim_id, rol_id')
          .is('silindi_at', null)

        if (!isSystemAdmin && currentCompanyId) {
          flatQuery = flatQuery.eq('ana_sirket_id', currentCompanyId)
          if (scopedUnitIds && scopedUnitIds.length) {
            flatQuery = flatQuery.in('birim_id', scopedUnitIds)
          }
        }

        const { data: flatPrs, error: flatErr } = await flatQuery
        if (flatErr) {
          toast.error('Personeller yüklenemedi')
          console.error(flatErr)
          setStaff([])
        } else {
          setStaff(flatPrs || [])
        }
      } else {
        setStaff(prs || [])
      }

      setCompanies(comps || [])
      setUnits(urs || [])

      setRoles([
        { id: 'SUPER_ADMIN', rol_adi: 'SUPER_ADMIN' },
        { id: 'SIRKET_SAHIBI', rol_adi: 'SIRKET_SAHIBI' },
        { id: 'YONETICI', rol_adi: 'YONETICI' },
        { id: 'DENETIMCI', rol_adi: 'DENETIMCI' },
        { id: 'PERSONEL', rol_adi: 'PERSONEL' },
      ])
    } catch (e) {
      console.error('Failed to load staff page data', e)
      toast.error('Veriler yüklenirken hata oluştu')
    } finally {
      setLoading(false)
    }
  }, [
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIdsKey,
    scopedUnitIds,
    isTopCompanyScope,
  ])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

  const getCompanyName = (p) =>
    p.ana_sirketler?.ana_sirket_adi ??
    companies.find((c) => c.id === p.ana_sirket_id)?.ana_sirket_adi ??
    '-'

  const getUnitName = (p) =>
    p.birimler?.birim_adi ??
    units.find((u) => u.id === p.birim_id)?.birim_adi ??
    '-'

  const getRoleName = (p) =>
    p.roller?.rol_adi ??
    roles.find((r) => r.id === p.rol_id)?.rol_adi ??
    p.rol_id ??
    '-'

  const softDelete = async (row) => {
    if (!isSystemAdmin) {
      if (currentCompanyId && row.ana_sirket_id !== currentCompanyId) {
        toast.error('Bu işlem için yetkiniz yok.')
        return
      }
      if (
        accessibleUnitIds &&
        accessibleUnitIds.length &&
        row.birim_id &&
        !isUnitInScope(accessibleUnitIds, row.birim_id)
      ) {
        toast.error('Bu işlem için yetkiniz yok.')
        return
      }
    }
    if (
      !window.confirm(
        `'${row.ad && row.soyad ? `${row.ad} ${row.soyad}` : row.email || 'Bu personel'
        }' kaydını silmek (pasif yapmak) istediğinize emin misiniz?`,
      )
    )
      return
    try {
      const { error } = await supabase
        .from('personeller')
        .update({ silindi_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) {
        throw error
      }
      toast.success('Personel silindi')
      await load()
    } catch (e) {
      console.error('Silme başarısız', e)
      toast.error('Silme başarısız')
    }
  }

  const filtered = staff.filter((p) => {
    const term = search.toLowerCase()
    const name =
      p.ad && p.soyad
        ? `${p.ad} ${p.soyad}`
        : p.email || p.personel_kodu || ''
    const textMatch =
      name.toLowerCase().includes(term) ||
      (p.personel_kodu || '').toLowerCase().includes(term)

    const companyMatch = companyScoped
      ? String(p.ana_sirket_id) === String(currentCompanyId)
      : selectedCompanyId
        ? String(p.ana_sirket_id) === String(selectedCompanyId)
        : true
    const unitMatch = selectedUnitId
      ? String(p.birim_id) === String(selectedUnitId)
      : true
    const roleMatch = selectedRoleId ? getRoleName(p) === selectedRoleId : true

    return textMatch && companyMatch && unitMatch && roleMatch
  })

  const containerStyle = {
    padding: '32px',
    backgroundColor: '#f3f4f6',
    minHeight: '100vh',
  }

  const rowStyleBase = {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #e2e8f0',
  }

  return (
    <div style={containerStyle}>
      {/* Başlık + Yeni Personel */}
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
            Personel Portföyü
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketiniz ve yetkili birimlerinizdeki personeli yönetin.'
              : 'Tüm personel kayıtlarını şirket, birim ve role göre yönetin.'}
          </p>
        </div>
        {canStaffCrud && (
          <button
            type="button"
            onClick={() => navigate('/admin/staff/new')}
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
            + Yeni Personel Ekle
          </button>
        )}
      </div>

      {/* Filtreler ve arama */}
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
            onChange={(e) => {
              const val = e.target.value
              setSelectedCompanyId(val)
              setSelectedUnitId('')
            }}
            style={{
              minWidth: 160,
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

        <select
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
          style={{
            minWidth: 160,
            borderRadius: 9999,
            border: '1px solid #e2e8f0',
            padding: '8px 12px',
            fontSize: 12,
            backgroundColor: '#ffffff',
          }}
        >
          <option value="">Tüm Birimler</option>
          {units
            .filter((u) => {
              const cid = companyScoped
                ? currentCompanyId
                : selectedCompanyId
              return cid
                ? String(u.ana_sirket_id) === String(cid)
                : true
            })
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.birim_adi}
              </option>
            ))}
        </select>

        <select
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
          style={{
            minWidth: 140,
            borderRadius: 9999,
            border: '1px solid #e2e8f0',
            padding: '8px 12px',
            fontSize: 12,
            backgroundColor: '#ffffff',
          }}
        >
          <option value="">Tüm Roller</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rol_adi}
            </option>
          ))}
        </select>

        <div style={{ flex: 1, minWidth: 180 }}>
          <input
            type="text"
            placeholder="Ad, e-posta veya kod ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
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
          Kayıtlı personel bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((p) => {
          const fullName =
            p.ad && p.soyad
              ? `${p.ad} ${p.soyad}`
              : p.email || p.personel_kodu || 'Personel'

          const rowStyle = {
            ...rowStyleBase,
          }

          return (
            <div key={p.id} style={rowStyle}>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#0a1e42',
                  }}
                >
                  {fullName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    marginTop: 2,
                  }}
                >
                  {p.email || 'E-posta yok'}{' '}
                  {p.personel_kodu ? `• Kod: ${p.personel_kodu}` : ''}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: '#9ca3af',
                    marginTop: 2,
                  }}
                >
                  {companyScoped ? (
                    <>
                      {getUnitName(p)} • Rol: {getRoleName(p)}
                    </>
                  ) : (
                    <>
                      {getCompanyName(p)} • {getUnitName(p)} • Rol:{' '}
                      {getRoleName(p)}
                    </>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {canAssign && (
                  <button
                    type="button"
                    title="Görev Ata"
                    onClick={() =>
                      navigate(`/admin/tasks/new?personId=${p.id}`)
                    }
                    style={{
                      padding: '6px 12px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: '#0a1e42',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Görev Ata
                  </button>
                )}
                {canStaffCrud && (
                  <>
                    <button
                      type="button"
                      title="Düzenle"
                      onClick={() => navigate(`/admin/staff/edit/${p.id}`)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 6,
                        borderRadius: 9999,
                        cursor: 'pointer',
                      }}
                    >
                      <Edit2 size={16} color="#4b5563" />
                    </button>
                    <button
                      type="button"
                      title="Sil"
                      onClick={() => softDelete(p)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 6,
                        borderRadius: 9999,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={16} color="#dc2626" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
    </div>
  )
}

