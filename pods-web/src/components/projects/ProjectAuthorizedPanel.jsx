import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { TaskAssignPeopleChipPicker } from '../tasks/TaskAssignPersonPicker.jsx'
import {
  addProjectAuthorized,
  fetchProjectAuthorizedMembers,
  fetchAuthorizedPoolForProject,
  formatPersonelDisplayName,
  personToPickerOption,
  removeProjectMember,
} from '../../lib/projectApi.js'

/**
 * Proje yetkilileri — `proje.yonet` yetkisi olan yöneticiler; projeyi düzenleyebilir, göreve atanmaz.
 */
export default function ProjectAuthorizedPanel({ projeId, scopeCtx, readOnly = false }) {
  const [authorized, setAuthorized] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!projeId) return
    setLoading(true)
    try {
      const list = await fetchProjectAuthorizedMembers(projeId)
      setAuthorized(list)
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Yetkililer yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [projeId])

  useEffect(() => {
    load()
  }, [load])

  const authorizedIds = useMemo(() => authorized.map((m) => m.personel_id), [authorized])

  const handleAdd = async (personelId) => {
    try {
      await addProjectAuthorized(projeId, personelId, scopeCtx, {
        userId: scopeCtx?.userId,
        isSystemAdmin: scopeCtx?.isSystemAdmin,
      })
      await load()
      toast.success('Proje yetkilisi eklendi')
    } catch (e) {
      toast.error(e?.message || 'Eklenemedi')
    }
  }

  const handleRemove = async (personelId) => {
    try {
      await removeProjectMember(projeId, personelId, {
        userId: scopeCtx?.userId,
        isSystemAdmin: scopeCtx?.isSystemAdmin,
      })
      await load()
      toast.success('Yetkili kaldırıldı')
    } catch (e) {
      toast.error(e?.message || 'Kaldırılamadı')
    }
  }

  const memberOptions = useMemo(
    () => authorized.map((m) => personToPickerOption(m)).filter(Boolean),
    [authorized],
  )

  const getSelectedLabel = useCallback(
    (id) => {
      const m = authorized.find((x) => String(x.personel_id) === String(id))
      return m ? formatPersonelDisplayName(m) : undefined
    },
    [authorized],
  )

  const [poolOptions, setPoolOptions] = useState([])

  useEffect(() => {
    if (!projeId || readOnly) return
    fetchAuthorizedPoolForProject(projeId, scopeCtx)
      .then((pool) => setPoolOptions(pool.map((p) => personToPickerOption(p)).filter(Boolean)))
      .catch(() => setPoolOptions([]))
  }, [projeId, scopeCtx, authorizedIds.length, readOnly])

  const addOptions = useMemo(() => {
    const onList = new Set(authorizedIds.map(String))
    return poolOptions.filter((o) => !onList.has(String(o.id)))
  }, [poolOptions, authorizedIds])

  if (loading) {
    return <p className="text-sm text-slate-500">Yetkililer yükleniyor…</p>
  }

  return (
    <div>
      <TaskAssignPeopleChipPicker
        title="Proje yetkilileri"
        countLabel={authorizedIds.length ? `${authorizedIds.length} kişi` : null}
        tone="fuchsia"
        icon={ShieldCheck}
        options={addOptions}
        selectedOptions={memberOptions}
        getSelectedLabel={getSelectedLabel}
        selectedIds={authorizedIds}
        readOnly={readOnly}
        onAdd={readOnly ? undefined : handleAdd}
        onRemove={readOnly ? undefined : handleRemove}
        emptyText="Henüz yetkili yok. Proje.yonet yetkisi olan bir yönetici ekleyin."
      />
      <p className="mt-2 text-xs text-slate-500">
        {readOnly
          ? 'Yetkili listesini yalnızca projeyi oluşturan kişi düzenleyebilir.'
          : 'Listede yalnızca proje.yonet yetkisi olan personel görünür. Yetkililer projeyi düzenler; görev ataması ekip listesinden yapılır.'}
      </p>
    </div>
  )
}
