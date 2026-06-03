import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  GanttChart,
  ListTree,
  LayoutDashboard,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { useTaskAssign } from '../../../contexts/TaskAssignContext.jsx'
import CubiclePageShell, { CubicleCreateButton } from '../../../components/cubicle/CubiclePageShell.jsx'
import ProjectGantt from '../../../components/projects/ProjectGantt.jsx'
import ProjectOverviewDashboard from '../../../components/projects/ProjectOverviewDashboard.jsx'
import ProjectTaskAssignModal from '../../../components/projects/ProjectTaskAssignModal.jsx'
import { ProjectTaskTree } from '../../../components/projects/ProjectTaskCard.jsx'
import { ConfirmDialog, EmptyState, Spinner, StatusBadge } from '../../../ui'
import { canAssignTask } from '../../../lib/permissions.js'
import { canManageProjectRecord, splitProjectMembers } from '../../../lib/projectAccess.js'
import { buildOperationalPrefillParams } from '../../../lib/projectTaskOperationalPrefill.js'
import { getProjectStatusOption } from '../../../lib/projectStatus.js'
import {
  fetchProjectById,
  fetchProjectMembers,
  fetchProjectTasks,
  fetchProjectUnitLabel,
  softDeleteProjectTask,
} from '../../../lib/projectApi.js'
import {
  buildProjectGanttRows,
  computeProjectProgress,
  formatProjectDateLabel,
  resolveProjectGanttRange,
} from '../../../lib/projectGanttUtils.js'
import { cn } from '../../../lib/cn'

const TABS = [
  { id: 'overview', label: 'Özet', icon: LayoutDashboard },
  { id: 'tasks', label: 'Görevler', icon: ListTree },
  { id: 'gantt', label: 'Gantt', icon: GanttChart },
]

export default function ProjectShow() {
  const { projectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { personel, profile } = useContext(AuthContext)
  const { openTaskAssign } = useTaskAssign()
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const currentCompanyId = personel?.ana_sirket_id || null
  const [mayManageThisProject, setMayManageThisProject] = useState(false)
  const mayAssignOperational =
    mayManageThisProject && canAssignTask(permissions, isSystemAdmin, personel)

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
    }),
    [isSystemAdmin, currentCompanyId, personel],
  )

  const [tab, setTab] = useState('overview')
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [defaultParentId, setDefaultParentId] = useState(null)
  const [deleteTaskId, setDeleteTaskId] = useState(null)
  const [birimLabel, setBirimLabel] = useState(null)

  const personMap = useMemo(() => {
    const m = {}
    for (const p of teamMembers) m[String(p.personel_id)] = p
    return m
  }, [teamMembers])

  const progress = useMemo(() => computeProjectProgress(tasks), [tasks])
  const ganttRange = useMemo(
    () =>
      project
        ? resolveProjectGanttRange(project, tasks)
        : { start: new Date(), end: new Date(), days: [] },
    [project, tasks],
  )
  const ganttRows = useMemo(() => buildProjectGanttRows(tasks, personMap), [tasks, personMap])
  const rootTasks = useMemo(
    () => tasks.filter((t) => !t.parent_id).sort((a, b) => (a.sira || 0) - (b.sira || 0)),
    [tasks],
  )

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [p, t, members] = await Promise.all([
        fetchProjectById(projectId, scopeCtx, {
          personelId: personel?.id,
          userId: profile?.id,
        }),
        fetchProjectTasks(projectId),
        fetchProjectMembers(projectId),
      ])
      if (!p) {
        toast.error('Proje bulunamadı veya erişim yetkiniz yok')
        navigate('/admin/projects')
        return
      }
      const { team: teamOnly } = splitProjectMembers(members)
      const canManage = canManageProjectRecord({
        isSystemAdmin,
        permissions,
        personelId: personel?.id,
        userId: profile?.id,
        project: p,
        members,
      })
      setProject(p)
      setTasks(t)
      setTeamMembers(teamOnly)
      setMayManageThisProject(canManage)
      setBirimLabel(p.birim_id ? await fetchProjectUnitLabel(p.birim_id) : null)
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [projectId, scopeCtx, navigate, personel?.id, profile?.id, permissions, isSystemAdmin])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (location.state?.refreshAt) load()
  }, [location.state?.refreshAt, load])

  const openNewTask = (parentId = null) => {
    if (!mayManageThisProject) {
      toast.error('Proje yönetimi yetkiniz yok.')
      return
    }
    if (!teamMembers.length) {
      toast.error('Önce proje ekibine sorumlu ekleyin.')
      if (mayManageThisProject) navigate(`/admin/projects/${projectId}/edit`)
      return
    }
    setEditingTask(null)
    setDefaultParentId(parentId)
    setTaskModalOpen(true)
  }

  const openEditTask = (task) => {
    if (!mayManageThisProject) return
    setEditingTask(task)
    setDefaultParentId(null)
    setTaskModalOpen(true)
  }

  const launchOperational = (task) => {
    if (!mayAssignOperational) {
      toast.error('Görev atama yetkiniz yok.')
      return
    }
    openTaskAssign(buildOperationalPrefillParams(task, { project, projectId }))
  }

  const handleDeleteTask = async () => {
    if (!deleteTaskId) return
    try {
      await softDeleteProjectTask(deleteTaskId)
      toast.success('Görev silindi')
      setDeleteTaskId(null)
      await load()
    } catch (e) {
      toast.error(e?.message || 'Silinemedi')
    }
  }

  const taskHandlers = mayManageThisProject
    ? {
        onEdit: openEditTask,
        onAddChild: openNewTask,
        onDelete: setDeleteTaskId,
        onLaunch: launchOperational,
        mayLaunch: mayAssignOperational,
        readOnly: false,
      }
    : {
        readOnly: true,
        mayLaunch: false,
      }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (!project) return null

  const accent = project.renk || '#2563EB'
  const st = getProjectStatusOption(project.durum)
  const subtitleParts = [
    project.kod,
    `${formatProjectDateLabel(project.baslangic_tarihi)} – ${formatProjectDateLabel(project.bitis_tarihi)}`,
    `%${progress.pct} ilerleme`,
  ].filter(Boolean)

  return (
    <CubiclePageShell
      title={project.baslik}
      subtitle={subtitleParts.join(' · ')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/projects"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={16} /> Projeler
          </Link>
          {mayManageThisProject ? (
            <>
              <Link
                to={`/admin/projects/${projectId}/edit`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={16} /> Düzenle
              </Link>
              <CubicleCreateButton onClick={() => openNewTask()}>
                <Plus size={18} /> Görev ekle
              </CubicleCreateButton>
            </>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        <span className="text-sm text-slate-500">
          {progress.done}/{progress.total} görev tamam · {teamMembers.length} ekip üyesi
        </span>
        {!mayManageThisProject ? (
          <span className="text-xs font-semibold text-amber-700">Salt okunur — proje yönetimi yetkisi yok</span>
        ) : null}
      </div>

      <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition',
              tab === id ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
            {id === 'tasks' && progress.total > 0 ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  tab === id ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {progress.total}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <ProjectOverviewDashboard
          project={project}
          projectId={projectId}
          tasks={tasks}
          teamMembers={teamMembers}
          birimLabel={birimLabel}
          accent={accent}
          canManage={mayManageThisProject}
          onOpenTask={
            mayManageThisProject
              ? (t) => {
                  openEditTask(t)
                  setTab('tasks')
                }
              : undefined
          }
        />
      )}

      {tab === 'tasks' && (
        <>
          {rootTasks.length === 0 ? (
            <EmptyState
              icon={<ListTree size={40} strokeWidth={1.25} />}
              title="Henüz görev yok"
              description="Planlama görevi ekleyerek başlayın."
              actionLabel={mayManageThisProject ? 'Görev ekle' : undefined}
              onAction={mayManageThisProject ? () => openNewTask() : undefined}
            />
          ) : (
            <ProjectTaskTree
              tasks={tasks}
              rootTasks={rootTasks}
              personMap={personMap}
              {...taskHandlers}
            />
          )}
        </>
      )}

      {tab === 'gantt' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ProjectGantt
            days={ganttRange.days}
            rangeStart={ganttRange.start}
            rangeEnd={ganttRange.end}
            rows={ganttRows}
            loading={false}
            projectColor={accent}
            onSelectTask={
              mayManageThisProject
                ? (t) => {
                    openEditTask(t)
                    setTab('tasks')
                  }
                : undefined
            }
          />
        </div>
      )}

      <ProjectTaskAssignModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false)
          setEditingTask(null)
          setDefaultParentId(null)
        }}
        project={project}
        projectId={projectId}
        tasks={tasks}
        teamMembers={teamMembers}
        editingTask={editingTask}
        defaultParentId={defaultParentId}
        scopeCtx={scopeCtx}
        onSaved={load}
        onLaunchOperational={
          mayManageThisProject && mayAssignOperational ? launchOperational : undefined
        }
      />

      <ConfirmDialog
        open={!!deleteTaskId}
        onClose={() => setDeleteTaskId(null)}
        title="Görevi sil"
        message="Bu görev ve alt görevleri kaldırılır."
        confirmLabel="Sil"
        variant="danger"
        onConfirm={handleDeleteTask}
      />
    </CubiclePageShell>
  )
}
