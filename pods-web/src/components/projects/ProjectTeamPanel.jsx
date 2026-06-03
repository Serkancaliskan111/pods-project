import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { TaskAssignPeopleChipPicker } from '../tasks/TaskAssignPersonPicker.jsx'
import {
  addProjectMember,
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

  const handleAdd = async (personelId) => {
    try {
      const pool = await fetchStaffPoolForProject(projeId, scopeCtx)
      if (!pool.some((p) => String(p.id) === String(personelId))) {
        toast.error('Personel eklenemedi')
        return
      }
      await addProjectMember(projeId, personelId, {
        rol: 'uye',
        sira: members.length,
      })
      await load()
      toast.success('Proje ekibine eklendi')
    } catch (e) {
      toast.error(e?.message || 'Eklenemedi')
    }
  }

  const handleRemove = async (personelId) => {
    try {
      await removeProjectMember(projeId, personelId)
      await load()
      toast.success('Ekipten çıkarıldı')
    } catch (e) {
      toast.error(e?.message || 'Kaldırılamadı')
    }
  }

  const memberOptions = useMemo(
    () => members.map((m) => personToPickerOption(m)).filter(Boolean),
    [members],
  )

  const getSelectedLabel = useCallback(
    (id) => {
      const m = members.find((x) => String(x.personel_id) === String(id))
      return m ? formatPersonelDisplayName(m) : undefined
    },
    [members],
  )

  return (
    <ProjectTeamPickerInner
      loading={loading}
      projeId={projeId}
      scopeCtx={scopeCtx}
      memberIds={memberIds}
      memberOptions={memberOptions}
      getSelectedLabel={getSelectedLabel}
      readOnly={readOnly}
      onAdd={handleAdd}
      onRemove={handleRemove}
    />
  )
}

/** Create modal: henüz proje yok, havuzdan seçim */
export function ProjectTeamPickerDraft({ selectedIds, onChange, staffPool }) {
  const options = useMemo(
    () => (staffPool || []).map((p) => personToPickerOption(p)).filter(Boolean),
    [staffPool],
  )

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedIds.some((id) => String(id) === String(o.id))),
    [options, selectedIds],
  )

  const getSelectedLabel = useCallback(
    (id) => options.find((o) => String(o.id) === String(id))?.name,
    [options],
  )

  return (
    <TaskAssignPeopleChipPicker
      title="Proje ekibi"
      countLabel={selectedIds.length ? `${selectedIds.length} kişi` : null}
      tone="emerald"
      icon={UserCheck}
      options={options}
      selectedOptions={selectedOptions}
      getSelectedLabel={getSelectedLabel}
      selectedIds={selectedIds}
      onAdd={(id) => onChange?.([...selectedIds, id])}
      onRemove={(id) => onChange?.(selectedIds.filter((x) => String(x) !== String(id)))}
      emptyText="Henüz kimse eklenmedi. Yeşil + ile proje ekibini oluşturun."
    />
  )
}

function ProjectTeamPickerInner({
  loading,
  projeId,
  scopeCtx,
  memberIds,
  memberOptions = [],
  getSelectedLabel,
  readOnly = false,
  onAdd,
  onRemove,
}) {
  const [poolOptions, setPoolOptions] = useState([])

  useEffect(() => {
    if (!projeId || readOnly) return
    fetchStaffPoolForProject(projeId, scopeCtx)
      .then((pool) => setPoolOptions(pool.map((p) => personToPickerOption(p)).filter(Boolean)))
      .catch(() => setPoolOptions([]))
  }, [projeId, scopeCtx, memberIds.length, readOnly])

  const addOptions = useMemo(() => {
    const inTeam = new Set(memberIds.map(String))
    return poolOptions.filter((o) => !inTeam.has(String(o.id)))
  }, [poolOptions, memberIds])

  if (loading) {
    return <p className="text-sm text-slate-500">Ekip yükleniyor…</p>
  }

  return (
    <div>
      <TaskAssignPeopleChipPicker
        title="Proje ekibi"
        countLabel={memberIds.length ? `${memberIds.length} kişi` : null}
        tone="emerald"
        icon={UserCheck}
        options={addOptions}
        selectedOptions={memberOptions}
        getSelectedLabel={getSelectedLabel}
        selectedIds={memberIds}
        readOnly={readOnly}
        onAdd={readOnly ? undefined : onAdd}
        onRemove={readOnly ? undefined : onRemove}
        emptyText="Henüz proje sorumlusu yok. Görev atamak için önce ekibe personel ekleyin."
      />
      <p className="mt-2 text-xs text-slate-500">
        {readOnly
          ? 'Ekip listesi salt okunurdur. Düzenlemek için proje yönetimi yetkisi gerekir.'
          : 'Görev ve alt görevlerde yalnızca ekip üyeleri atanabilir. Proje yönetimi yetkililer listesindedir.'}
      </p>
    </div>
  )
}
