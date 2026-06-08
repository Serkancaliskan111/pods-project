import { useEffect, useMemo, useState } from 'react'
import { AdminDashboardKokpit } from '../../pages/admin/AdminDashboard.jsx'
import { ManagementKokpitProvider } from '../../contexts/ManagementKokpitContext.jsx'
import {
  buildProjectKokpitEmbedValue,
  buildProjectKokpitMeta,
  fetchProjectLinkedIsler,
  fetchProjectOperationalIslerForKokpit,
} from '../../lib/projectKokpitDataset.js'

/**
 * Yönetici ana sayfa kokpitinin bire bir gömülmesi — veri yalnızca proje kapsamında.
 */
export default function ProjectKokpitEmbed({
  project,
  projectId,
  tasks,
  teamMembers,
  birimLabel = '',
  loading: parentLoading = false,
  onNavigateTasks,
  onOpenTask,
}) {
  const [linkedIsler, setLinkedIsler] = useState([])
  const [operationalOnlyIsler, setOperationalOnlyIsler] = useState([])
  const [meta, setMeta] = useState({ companies: [], units: [] })
  const [extrasLoading, setExtrasLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setExtrasLoading(true)
      try {
        const bagliIds = (tasks || []).map((t) => t.bagli_is_id).filter(Boolean)
        const [isler, projeIsler, kokpitMeta] = await Promise.all([
          fetchProjectLinkedIsler(bagliIds),
          fetchProjectOperationalIslerForKokpit(projectId),
          buildProjectKokpitMeta(project, birimLabel),
        ])
        if (cancelled) return
        setLinkedIsler(isler)
        setOperationalOnlyIsler(projeIsler || [])
        setMeta(kokpitMeta)
      } catch (e) {
        console.warn('[ProjectKokpitEmbed] load', e)
        if (!cancelled) {
          setLinkedIsler([])
          setOperationalOnlyIsler([])
          setMeta({ companies: [], units: [] })
        }
      } finally {
        if (!cancelled) setExtrasLoading(false)
      }
    }
    if (project?.id) load()
    else setExtrasLoading(false)
    return () => {
      cancelled = true
    }
  }, [project, projectId, tasks, birimLabel])

  const embedValue = useMemo(() => {
    const base = buildProjectKokpitEmbedValue({
      project,
      projectId,
      tasks,
      teamMembers,
      linkedIsler,
      operationalOnlyIsler,
      loading: parentLoading || extrasLoading,
      onTasksList: onNavigateTasks,
      onTaskOpen: onOpenTask,
    })
    return {
      ...base,
      companies: meta.companies?.length ? meta.companies : base.companies,
      units: meta.units?.length ? meta.units : base.units,
      loading: parentLoading || extrasLoading,
    }
  }, [
    project,
    projectId,
    tasks,
    teamMembers,
    linkedIsler,
    operationalOnlyIsler,
    meta,
    parentLoading,
    extrasLoading,
    onNavigateTasks,
    onOpenTask,
  ])

  return (
    <ManagementKokpitProvider value={embedValue}>
      <AdminDashboardKokpit />
    </ManagementKokpitProvider>
  )
}
