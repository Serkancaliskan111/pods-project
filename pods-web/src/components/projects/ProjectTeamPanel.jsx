import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import ProjectTeamBulkPicker from './ProjectTeamBulkPicker.jsx'
import {
  addProjectMembers,
  fetchProjectTeamMembers,
  fetchStaffPoolForProject,
  formatPersonelDisplayName,
  personToPickerOption,
  removeProjectMember,
} from '../../lib/projectApi.js'

/**
 * Proje sorumluları — yalnızca buraya eklenen personel görevlere atanabilir.
 */
export default function ProjectTeamPanel({ projeId, scopeCtx, onTeamChange, readOnly = false }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!projeId) return
    setLoading(true)
    try {
      const list = await fetchProjectTeamMembers(projeId)
      setMembers(list)
      onTeamChange?.(list)
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Ekip yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [projeId, onTeamChange])

  useEffect(() => {
    load()
  }, [load])

  const memberIds = useMemo(() => members.map((m) => m.personel_id), [members])

  const handleBulkChange = async (nextIds) => {
    const prev = new Set(memberIds.map(String))
    const next = new Set(nextIds.map(String))
    const toAdd = [...next].filter((id) => !prev.has(id))
    const toRemove = [...prev].filter((id) => !next.has(id))
    if (!toAdd.length && !toRemove.length) return
    try {
      for (const id of toRemove) {
        await removeProjectMember(projeId, id)
      }
      if (toAdd.length) {
        await addProjectMembers(projeId, toAdd)
      }
      await load()
      toast.success('Proje ekibi güncellendi')
    } catch (e) {
      toast.error(e?.message || 'Ekip güncellenemedi')
      await load()
    }
  }

  return (
    <ProjectTeamPickerInner
      loading={loading}
      projeId={projeId}
      scopeCtx={scopeCtx}
      memberIds={memberIds}
      readOnly={readOnly}
      onBulkChange={readOnly ? undefined : handleBulkChange}
    />
  )
}

/** Create modal: henüz proje yok, havuzdan seçim */
export function ProjectTeamPickerDraft({ selectedIds, onChange, staffPool }) {
  const options = useMemo(
    () => (staffPool || []).map((p) => personToPickerOption(p)).filter(Boolean),
    [staffPool],
  )

  return (
    <ProjectTeamBulkPicker
      selectedIds={selectedIds}
      onChange={onChange}
      options={options}
      emptyText="Henüz kimse eklenmedi. «Ekip seç» ile personel işaretleyin."
    />
  )
}

function ProjectTeamPickerInner({
  loading,
  projeId,
  scopeCtx,
  memberIds,
  readOnly = false,
  onBulkChange,
}) {
  const [poolOptions, setPoolOptions] = useState([])

  useEffect(() => {
    if (!projeId || readOnly) return
    fetchStaffPoolForProject(projeId, scopeCtx)
      .then((pool) => setPoolOptions(pool.map((p) => personToPickerOption(p)).filter(Boolean)))
      .catch(() => setPoolOptions([]))
  }, [projeId, scopeCtx, memberIds.length, readOnly])

  const allOptions = useMemo(() => {
    const byId = new Map(poolOptions.map((o) => [String(o.id), o]))
    for (const id of memberIds) {
      const key = String(id)
      if (!byId.has(key)) byId.set(key, { id, name: 'Personel' })
    }
    return [...byId.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'tr'),
    )
  }, [poolOptions, memberIds])

  const handleChange = (nextIds) => {
    if (readOnly || !onBulkChange) return
    onBulkChange(nextIds)
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Ekip yükleniyor…</p>
  }

  return (
    <div>
      <ProjectTeamBulkPicker
        selectedIds={memberIds}
        onChange={handleChange}
        options={allOptions}
        readOnly={readOnly}
        emptyText="Henüz proje sorumlusu yok. «Ekip seç» ile personel ekleyin."
      />
      <p className="mt-2 text-xs text-slate-500">
        {readOnly
          ? 'Ekip listesi salt okunurdur. Düzenlemek için proje yönetimi yetkisi gerekir.'
          : 'Görev ve alt görevlerde yalnızca ekip üyeleri atanabilir. Proje yönetimi yetkililer listesindedir.'}
      </p>
    </div>
  )
}
