import { useContext, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { filterTemplatesVisibleToUser, kapsamLabel } from '../../../lib/taskTemplateScope.js'
import {
  AdminDirectoryRow,
  AdminFiltersBar,
  AdminListPanel,
  AdminPageShell,
  AdminScopeChip,
  AdminSearchField,
  AdminStatusPill,
  Button,
  PageHeader,
} from '../../../components/admin/AdminDirectory.jsx'
import { ConfirmDialog } from '../../../ui'

const supabase = getSupabase()

export default function TaskTemplatesIndex() {
  const { profile, personel, permissions, accessibleUnitIds, loading: authLoading } =
    useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('is_sablonlari')
        .select('id,ana_sirket_id,birim_id,kapsam,baslik,min_sure_dk,aktif_mi')
        .is('silindi_at', null)
        .order('olusturma_tarihi', { ascending: false })

      const { data, error } = await q
      if (error) {
        throw error
      }
      const list = filterTemplatesVisibleToUser(data || [], {
        isSystemAdmin,
        companyId: currentCompanyId,
        accessibleUnitIds: accessibleUnitIds || [],
      })
      setRows(list)
      setSelectedIds((prev) =>
        prev.filter((id) => list.some((r) => String(r.id) === String(id))),
      )

      let compQ = supabase
        .from('ana_sirketler')
        .select('id,ana_sirket_adi')
        .is('silindi_at', null)
      if (companyScoped && currentCompanyId) {
        compQ = compQ.eq('id', currentCompanyId)
      }
      const { data: comps } = await compQ
      setCompanies(comps || [])

      if (currentCompanyId) {
        const { data: unitRows } = await supabase
          .from('birimler')
          .select('id,birim_adi')
          .eq('ana_sirket_id', currentCompanyId)
          .is('silindi_at', null)
        setUnits(unitRows || [])
      } else {
        setUnits([])
      }
    } catch (e) {
      console.error('Şablonlar yüklenemedi:', e)
      toast.error('Şablonlar yüklenemedi', {
        id: 'task-templates-load-error',
      })
      setRows([])
      setSelectedIds([])
    } finally {
      setLoading(false)
    }
  }

  /** Auth oturumu ve kapsam oturunca tek sefer yükle; önceki isteği iptal et (çift toast önlenir) */
  useEffect(() => {
    if (authLoading) return

    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const sys = !!profile?.is_system_admin
        const compId = sys ? null : personel?.ana_sirket_id
        const scoped = !sys && !!compId

        let q = supabase
          .from('is_sablonlari')
          .select('id,ana_sirket_id,birim_id,kapsam,baslik,min_sure_dk,aktif_mi')
          .is('silindi_at', null)
          .order('olusturma_tarihi', { ascending: false })

        const { data, error } = await q
        if (cancelled) return
        if (error) throw error
        const list = filterTemplatesVisibleToUser(data || [], {
          isSystemAdmin: sys,
          companyId: compId,
          accessibleUnitIds: accessibleUnitIds || [],
        })
        setRows(list)
        setSelectedIds((prev) =>
          prev.filter((id) => list.some((r) => String(r.id) === String(id))),
        )

        let compQ = supabase
          .from('ana_sirketler')
          .select('id,ana_sirket_adi')
          .is('silindi_at', null)
        if (scoped && compId) {
          compQ = compQ.eq('id', compId)
        }
        const { data: comps, error: compErr } = await compQ
        if (cancelled) return
        if (compErr) {
          console.error('Şirket listesi (şablon sayfası):', compErr)
          setCompanies([])
        } else {
          setCompanies(comps || [])
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Şablonlar yüklenemedi:', e)
          toast.error('Şablonlar yüklenemedi', { id: 'task-templates-load-error' })
          setRows([])
          setSelectedIds([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    authLoading,
    profile?.is_system_admin,
    personel?.ana_sirket_id,
    accessibleUnitIds,
  ])

  const companyNameById = useMemo(() => {
    const m = {}
    for (const c of companies) m[String(c.id)] = c.ana_sirket_adi
    return m
  }, [companies])

  const unitNameById = useMemo(() => {
    const m = {}
    for (const u of units) m[String(u.id)] = u.birim_adi
    return m
  }, [units])

  const executeDeleteConfirm = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'one') {
        const { error } = await supabase
          .from('is_sablonlari')
          .update({ silindi_at: new Date().toISOString() })
          .eq('id', deleteConfirm.row.id)
        if (error) throw error
        toast.success('Şablon silindi')
      } else {
        setBulkDeleting(true)
        const { error } = await supabase
          .from('is_sablonlari')
          .update({ silindi_at: new Date().toISOString() })
          .in('id', deleteConfirm.ids)
        if (error) throw error
        toast.success(`${deleteConfirm.ids.length} şablon silindi`)
        setSelectedIds([])
      }
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      console.error('Silme başarısız:', e)
      toast.error(
        deleteConfirm.type === 'one' ? 'Şablon silinemedi' : 'Seçili şablonlar silinemedi',
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  const filtered = rows.filter((r) => {
    const term = search.toLowerCase()
    const label = (r.baslik || '').toLowerCase()
    return label.includes(term)
  })
  const filteredIds = useMemo(
    () => filtered.map((r) => String(r.id)),
    [filtered],
  )
  const allFilteredSelected =
    filteredIds.length > 0 &&
    filteredIds.every((id) => selectedIds.some((x) => String(x) === id))

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        return prev.filter((id) => !filteredIds.includes(String(id)))
      }
      const set = new Set(prev.map((x) => String(x)))
      filteredIds.forEach((id) => set.add(id))
      return Array.from(set)
    })
  }

  const toggleRowSelection = (rowId) => {
    setSelectedIds((prev) => {
      const key = String(rowId)
      if (prev.some((id) => String(id) === key)) {
        return prev.filter((id) => String(id) !== key)
      }
      return [...prev, key]
    })
  }

  const requestBulkDelete = () => {
    if (!selectedIds.length) return
    setDeleteConfirm({ type: 'bulk', ids: [...selectedIds] })
  }

  return (
    <AdminPageShell>
      <PageHeader
        title="Görev şablonları"
        subtitle={
          companyScoped
            ? 'Şirketinize özel tekrar kullanılabilir görev şablonları.'
            : 'Saha görevleri için şablonları oluşturun ve düzenleyin.'
        }
        actions={
          <Button
            variant="accent"
            size="sm"
            iconLeft={<Plus size={16} />}
            onClick={() => navigate('/admin/task-templates/new')}
          >
            Yeni şablon
          </Button>
        }
      />

      <AdminFiltersBar>
        {companyScoped && companies[0] ? (
          <AdminScopeChip>{companies[0].ana_sirket_adi}</AdminScopeChip>
        ) : null}
        <AdminSearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Şablon başlığı…"
          className="max-w-sm"
        />
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={allFilteredSelected}
            onChange={toggleSelectAllFiltered}
            disabled={!filtered.length}
          />
          Tümünü seç
        </label>
        <Button
          variant="danger"
          size="sm"
          disabled={!selectedIds.length || bulkDeleting}
          loading={bulkDeleting}
          onClick={requestBulkDelete}
        >
          {selectedIds.length ? `Seçileni sil (${selectedIds.length})` : 'Seçileni sil'}
        </Button>
      </AdminFiltersBar>

      <AdminListPanel
        loading={loading}
        empty={!filtered.length}
        emptyTitle="Şablon bulunamadı"
        emptyDescription="Yeni şablon oluşturun veya aramayı değiştirin."
      >
        {filtered.map((r) => {
          const active = !!r.aktif_mi
          const scopeText = kapsamLabel(r, { companyNameById, unitNameById })
          return (
            <AdminDirectoryRow
              key={r.id}
              title={r.baslik || '—'}
              subtitle={`${scopeText} · Min. süre: ${r.min_sure_dk || 0} dk`}
              badges={
                <>
                  <AdminStatusPill active={active} />
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedIds.some((id) => String(id) === String(r.id))}
                      onChange={() => toggleRowSelection(r.id)}
                    />
                    Seç
                  </label>
                </>
              }
              actions={
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/admin/task-templates/builder/${r.id}`)}
                  >
                    Düzenle
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteConfirm({ type: 'one', row: r })}
                  >
                    Sil
                  </Button>
                </>
              }
            />
          )
        })}
      </AdminListPanel>
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => !bulkDeleting && setDeleteConfirm(null)}
        title={deleteConfirm?.type === 'bulk' ? 'Şablonları sil' : 'Şablonu sil'}
        message={
          deleteConfirm?.type === 'bulk'
            ? `${deleteConfirm.ids.length} şablonu silmek istediğinize emin misiniz? (soft-delete)`
            : deleteConfirm?.type === 'one'
              ? `'${deleteConfirm.row.baslik || 'Şablon'}' şablonunu silmek istediğinize emin misiniz? (soft-delete)`
              : ''
        }
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={() => void executeDeleteConfirm()}
      />
    </AdminPageShell>
  )
}

