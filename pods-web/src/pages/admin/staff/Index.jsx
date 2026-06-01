import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import {
  AdminDirectoryRow,
  AdminFilterSelect,
  AdminFiltersBar,
  AdminListPanel,
  AdminPageShell,
  AdminScopeChip,
  AdminSearchField,
  Button,
  PageHeader,
} from '../../../components/admin/AdminDirectory.jsx'
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
import { ConfirmDialog } from '../../../ui'

const supabase = getSupabase()

function staffDisplayName(row) {
  if (row?.ad && row?.soyad) return `${row.ad} ${row.soyad}`
  return row?.email || 'Bu personel'
}

function isPermTruthy(permissions, key) {
  const v = permissions?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

export default function StaffIndex() {
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const canLoadWithScope = isSystemAdmin
    ? true
    : Boolean(scopeReady && currentCompanyId && Array.isArray(personel?.accessibleUnitIds))
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
  const canAssign = canAssignTask(permissions, isSystemAdmin, personel)
  const [staff, setStaff] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const hasHydratedDataRef = useRef(false)
  const cacheKey = useMemo(() => {
    if (!canLoadWithScope) return null
    const companyPart = isSystemAdmin ? 'system' : String(currentCompanyId)
    const unitPart = isSystemAdmin ? 'all' : JSON.stringify(scopedUnitIds || [])
    return `web_staff_index_cache_v1:${companyPart}:${unitPart}`
  }, [canLoadWithScope, isSystemAdmin, currentCompanyId, JSON.stringify(scopedUnitIds || [])])

  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (!canLoadWithScope) return
    if (!hasHydratedDataRef.current) setLoading(true)
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

      let junctionPersonelIds = []
      if (!isSystemAdmin && currentCompanyId && scopedUnitIds?.length) {
        const { data: pbRows, error: pbErr } = await supabase
          .from('personel_birimleri')
          .select('personel_id')
          .eq('ana_sirket_id', currentCompanyId)
          .in('birim_id', scopedUnitIds)
        if (!pbErr && Array.isArray(pbRows)) {
          junctionPersonelIds = [
            ...new Set(pbRows.map((r) => r.personel_id).filter(Boolean)),
          ]
        }
      }

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
          const scopedCsv = scopedUnitIds.join(',')
          if (junctionPersonelIds.length) {
            const juncCsv = junctionPersonelIds.join(',')
            prsQuery = prsQuery.or(
              `birim_id.in.(${scopedCsv}),id.in.(${juncCsv})`,
            )
          } else {
            prsQuery = prsQuery.in('birim_id', scopedUnitIds)
          }
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
            const scopedCsv = scopedUnitIds.join(',')
            if (junctionPersonelIds.length) {
              const juncCsv = junctionPersonelIds.join(',')
              flatQuery = flatQuery.or(
                `birim_id.in.(${scopedCsv}),id.in.(${juncCsv})`,
              )
            } else {
              flatQuery = flatQuery.in('birim_id', scopedUnitIds)
            }
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
      if (cacheKey) {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              staff: prs || [],
              companies: comps || [],
              units: urs || [],
            }),
          )
        } catch (_) {}
      }
      hasHydratedDataRef.current = true
    } catch (e) {
      console.error('Failed to load staff page data', e)
      toast.error('Veriler yüklenirken hata oluştu')
    } finally {
      setLoading(false)
    }
  }, [
    canLoadWithScope,
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIdsKey,
    scopedUnitIds,
    isTopCompanyScope,
    cacheKey,
  ])

  useEffect(() => {
    if (!cacheKey || hasHydratedDataRef.current) return
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.staff)) setStaff(parsed.staff)
      if (Array.isArray(parsed?.companies)) setCompanies(parsed.companies)
      if (Array.isArray(parsed?.units)) setUnits(parsed.units)
      hasHydratedDataRef.current = true
      setLoading(false)
    } catch (_) {}
  }, [cacheKey])

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

  const requestSoftDelete = (row) => {
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
    setDeleteConfirm(row)
  }

  const executeSoftDelete = async () => {
    const row = deleteConfirm
    if (!row) return
    setDeleteLoading(true)
    try {
      const { error } = await supabase
        .from('personeller')
        .update({ silindi_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      toast.success('Personel silindi')
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      console.error('Silme başarısız', e)
      toast.error('Silme başarısız')
    } finally {
      setDeleteLoading(false)
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

  return (
    <AdminPageShell>
      <PageHeader
        title="Personeller"
        subtitle={
          companyScoped
            ? 'Şirketiniz ve yetkili birimlerinizdeki personeli yönetin.'
            : 'Personel kayıtlarını şirket, birim ve role göre filtreleyin.'
        }
        actions={
          canStaffCrud ? (
            <Button
              variant="accent"
              size="sm"
              iconLeft={<Plus size={16} />}
              onClick={() => navigate('/admin/staff/new')}
            >
              Yeni personel
            </Button>
          ) : null
        }
      />

      <AdminFiltersBar>
        {!companyScoped ? (
          <AdminFilterSelect
            label="Şirket"
            value={selectedCompanyId}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value)
              setSelectedUnitId('')
            }}
          >
            <option value="">Tüm şirketler</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ana_sirket_adi}
              </option>
            ))}
          </AdminFilterSelect>
        ) : (
          <AdminScopeChip>{companies[0]?.ana_sirket_adi}</AdminScopeChip>
        )}
        <AdminFilterSelect
          label="Birim"
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
        >
          <option value="">Tüm birimler</option>
          {units
            .filter((u) => {
              const cid = companyScoped ? currentCompanyId : selectedCompanyId
              return cid ? String(u.ana_sirket_id) === String(cid) : true
            })
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.birim_adi}
              </option>
            ))}
        </AdminFilterSelect>
        <AdminFilterSelect
          label="Rol"
          value={selectedRoleId}
          onChange={(e) => setSelectedRoleId(e.target.value)}
        >
          <option value="">Tüm roller</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rol_adi}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad, e-posta veya personel kodu…"
        />
      </AdminFiltersBar>

      <AdminListPanel
        loading={loading}
        empty={!filtered.length}
        emptyTitle="Personel bulunamadı"
        emptyDescription="Filtreleri değiştirin veya yeni personel ekleyin."
      >
        {filtered.map((p) => {
          const fullName =
            p.ad && p.soyad
              ? `${p.ad} ${p.soyad}`
              : p.email || p.personel_kodu || 'Personel'
          const meta = companyScoped
            ? `${getUnitName(p)} · ${getRoleName(p)}`
            : `${getCompanyName(p)} · ${getUnitName(p)} · ${getRoleName(p)}`

          return (
            <AdminDirectoryRow
              key={p.id}
              title={fullName}
              subtitle={p.email || 'E-posta yok'}
              meta={`${p.personel_kodu ? `Kod: ${p.personel_kodu} · ` : ''}${meta}`}
              actions={
                <>
                  {canAssign ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/admin/tasks/new?personId=${p.id}`)}
                    >
                      Görev ata
                    </Button>
                  ) : null}
                  {canStaffCrud ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        iconLeft={<Edit2 size={14} />}
                        onClick={() => navigate(`/admin/staff/edit/${p.id}`)}
                      >
                        Düzenle
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Trash2 size={14} />}
                        onClick={() => requestSoftDelete(p)}
                      >
                        Sil
                      </Button>
                    </>
                  ) : null}
                </>
              }
            />
          )
        })}
      </AdminListPanel>
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => !deleteLoading && setDeleteConfirm(null)}
        title="Personeli sil"
        message={
          deleteConfirm
            ? `'${staffDisplayName(deleteConfirm)}' kaydını silmek (pasif yapmak) istediğinize emin misiniz?`
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

