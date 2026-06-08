import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  CalendarDays,
  ListTree,
  LayoutDashboard,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { useTaskAssign } from '../../../contexts/TaskAssignContext.jsx'
import CubiclePageShell, { CubicleCreateButton } from '../../../components/cubicle/CubiclePageShell.jsx'
import ProjectKokpitEmbed from '../../../components/projects/ProjectKokpitEmbed.jsx'
import ProjectTaskCalendar from '../../../components/projects/ProjectTaskCalendar.jsx'
import ProjectTaskAssignModal from '../../../components/projects/ProjectTaskAssignModal.jsx'
import ProjectTasksListPage from '../../../components/projects/ProjectTasksListPage.jsx'
import { ConfirmDialog, Spinner, StatusBadge } from '../../../ui'
import { canAssignTask } from '../../../lib/permissions.js'
import { canManageProjectRecord, splitProjectMembers } from '../../../lib/projectAccess.js'
import { buildOperationalPrefillParams } from '../../../lib/projectTaskOperationalPrefill.js'
import { getProjectStatusOption } from '../../../lib/projectStatus.js'
import {
  fetchProjectById,
  fetchProjectMembers,
  fetchProjectTasks,
  fetchProjectOperationalTasks,
  fetchProjectUnitLabel,
  softDeleteProjectTask,
} from '../../../lib/projectApi.js'
import { mergeProjectTaskSources } from '../../../lib/projectTasksMerge.js'
import {
  computeProjectProgress,
  formatProjectDateLabel,
} from '../../../lib/projectGanttUtils.js'
import { cn } from '../../../lib/cn'

const TABS = [
  { id: 'home', label: 'Ana Sayfa', icon: LayoutDashboard },
  { id: 'tasks', label: 'Görevler', icon: ListTree },
  { id: 'calendar', label: 'Takvim', icon: CalendarDays },
]

export default function ProjectShow() {
  const { projectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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

  const [tab, setTab] = useState('home')
  const [tasksListMode, setTasksListMode] = useState('pending')
  const [tasksQuickFilter, setTasksQuickFilter] = useState(null)
  const [birimLabel, setBirimLabel] = useState('')
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [defaultParentId, setDefaultParentId] = useState(null)
  const [deleteTaskId, setDeleteTaskId] = useState(null)
  const [defaultAssigneeId, setDefaultAssigneeId] = useState(null)

  const personMap = useMemo(() => {
    const m = {}
    for (const p of teamMembers) m[String(p.personel_id)] = p
    return m
  }, [teamMembers])

  const progress = useMemo(() => computeProjectProgress(tasks), [tasks])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [p, t, ops, members] = await Promise.all([
        fetchProjectById(projectId, scopeCtx, {
          personelId: personel?.id,
          userId: profile?.id,
        }),
        fetchProjectTasks(projectId),
        fetchProjectOperationalTasks(projectId),
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
      const unitLabel = p.birim_id ? await fetchProjectUnitLabel(p.birim_id) : ''
      setProject(p)
      setTasks(mergeProjectTaskSources(t, ops, projectId))
      setTeamMembers(teamOnly)
      setBirimLabel(unitLabel || '')
      setMayManageThisProject(canManage)
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

  const openNewTask = (parentId = null, assigneeId = null) => {
    if (!mayManageThisProject) {
      toast.error('Proje yönetimi yetkiniz yok.')
      return
    }
    if (!teamMembers.length) {
      toast.error('Önce proje ekibine sorumlu ekleyin.')
      if (mayManageThisProject) navigate(`/admin/projects/${projectId}/edit`)
      return
    }
    if (mayAssignOperational && !parentId) {
      openTaskAssign({
        projeId: projectId,
        company: project?.ana_sirket_id,
        unitId: project?.birim_id,
        baslangic: project?.baslangic_tarihi?.slice?.(0, 10) || '',
        bitis: project?.bitis_tarihi?.slice?.(0, 10) || '',
        ...(assigneeId ? { personId: String(assigneeId) } : {}),
      })
      return
    }
    setEditingTask(null)
    setDefaultParentId(parentId)
    setDefaultAssigneeId(assigneeId ? String(assigneeId) : null)
    setTaskModalOpen(true)
  }

  const openEditTask = (task) => {
    if (!mayManageThisProject) return
    if (task?._operational_only && task.bagli_is_id) {
      navigate(`/admin/tasks/${task.bagli_is_id}`)
      return
    }
    setEditingTask(task)
    setDefaultParentId(null)
    setDefaultAssigneeId(null)
    setTaskModalOpen(true)
  }

  const launchOperational = (task) => {
    if (!mayAssignOperational) {
      toast.error('Görev atama yetkiniz yok.')
      return
    }
    openTaskAssign(buildOperationalPrefillParams(task, { project, projectId }))
  }

  useEffect(() => {
    const openTaskId = searchParams.get('openTask')
    if (!openTaskId || loading || !tasks.length) return
    const target = tasks.find((t) => String(t.id) === String(openTaskId))
    if (!target) return
    setTab('tasks')
    if (mayManageThisProject) openEditTask(target)
    const next = new URLSearchParams(searchParams)
    next.delete('openTask')
    setSearchParams(next, { replace: true })
  }, [searchParams, tasks, loading, mayManageThisProject, setSearchParams])

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

  const requestDeleteTask = (taskId) => {
    const target = tasks.find((t) => String(t.id) === String(taskId))
    if (target?._operational_only) {
      toast.message('Bu görev operasyonel kayıttır; silme işlemi görev detayından yapılır.')
      return
    }
    setDeleteTaskId(taskId)
  }

  const taskHandlers = mayManageThisProject
    ? {
        onEdit: openEditTask,
        onAddChild: openNewTask,
        onDelete: requestDeleteTask,
        readOnly: false,
      }
    : {
        readOnly: true,
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

      {tab === 'home' && (
        <ProjectKokpitEmbed
          project={project}
          projectId={projectId}
          tasks={tasks}
          teamMembers={teamMembers}
          birimLabel={birimLabel}
          loading={loading}
          onOpenTask={(t) => {
            if (t?._projectPlanning === false && t?.id && !t?._proje_gorev_id) {
              navigate(`/admin/tasks/${t.id}`)
              return
            }
            const raw = t?._proje_gorev_id || t?.id
            const target = tasks.find((x) => String(x.id) === String(raw))
            if (target && mayManageThisProject) openEditTask(target)
            else setTab('tasks')
          }}
          onNavigateTasks={({ mode = 'pending', quickFilter = 'all' } = {}) => {
            setTasksListMode(mode)
            setTasksQuickFilter(quickFilter)
            setTab('tasks')
          }}
        />
      )}

      {tab === 'tasks' && (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTasksListMode('pending')}
              className={cn(
                'rounded-md px-4 py-2 text-xs font-bold transition',
                tasksListMode === 'pending'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              Bekleyen
            </button>
            <button
              type="button"
              onClick={() => setTasksListMode('completed')}
              className={cn(
                'rounded-md px-4 py-2 text-xs font-bold transition',
                tasksListMode === 'completed'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              Tamamlanan
            </button>
          </div>
          <ProjectTasksListPage
            listMode={tasksListMode}
            tasks={tasks}
            personMap={personMap}
            personelId={personel?.id}
            projectLabel={project.baslik || 'Proje'}
            canManage={mayManageThisProject}
            initialQuickFilter={tasksQuickFilter}
            onAddTask={() => openNewTask()}
            onEdit={taskHandlers.onEdit}
            onDelete={taskHandlers.onDelete}
          />
        </div>
      )}

      {tab === 'calendar' && (
        <ProjectTaskCalendar
          project={project}
          tasks={tasks}
          teamMembers={teamMembers}
          personMap={personMap}
          personelId={personel?.id}
          loading={loading}
          canManage={mayManageThisProject}
          onEditTask={mayManageThisProject ? openEditTask : undefined}
          onNewTaskForAssignee={
            mayManageThisProject ? (assigneeId) => openNewTask(null, assigneeId) : undefined
          }
          onRefresh={load}
        />
      )}

      <ProjectTaskAssignModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false)
          setEditingTask(null)
          setDefaultParentId(null)
          setDefaultAssigneeId(null)
        }}
        project={project}
        projectId={projectId}
        tasks={tasks}
        teamMembers={teamMembers}
        editingTask={editingTask}
        defaultParentId={defaultParentId}
        defaultAssigneeId={defaultAssigneeId}
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
