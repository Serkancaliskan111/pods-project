import { Search } from 'lucide-react'
import TaskTimeAccordion from '../../pages/admin/tasks/components/TaskTimeAccordion.jsx'
import { useProjectTasksListPage } from '../../hooks/useProjectTasksListPage.js'
import { pageSurfaceStyle } from '../../lib/userUiPreferences'
import ProjectTaskListCard from './ProjectTaskListCard.jsx'
import { EmptyState } from '../../ui'
import { ListTree } from 'lucide-react'

const PAGE_CONFIG = {
  pending: {
    title: 'Bekleyen görevler',
    description: 'Devam eden planlama görevleri — bugün, yarın ve önümüzdeki 7 güne göre.',
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'urgent', label: 'Acil' },
      { id: 'overdue', label: 'Geciken' },
      { id: 'blocked', label: 'Bloke' },
      { id: 'unassigned', label: 'Atanmamış' },
    ],
  },
  completed: {
    title: 'Tamamlanan görevler',
    description: 'Tamamlanmış planlama görevleri — zamanına göre gruplu.',
    quickFilters: [
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'all', label: 'Tümü' },
    ],
  },
}

export default function ProjectTasksListPage({
  listMode,
  tasks,
  personMap,
  personelId,
  projectLabel,
  canManage,
  onEdit,
  onDelete,
  onAddTask,
  initialQuickFilter,
}) {
  const config = PAGE_CONFIG[listMode] || PAGE_CONFIG.pending
  const page = useProjectTasksListPage({
    tasks,
    listMode,
    personelId,
    personMap,
    projectLabel,
    initialQuickFilter,
  })

  const renderCard = (task) => (
    <ProjectTaskListCard
      key={task.id}
      task={task}
      companyName={page.getCompanyName()}
      assigneeName={page.getStaffName(task.sorumlu_personel_id)}
      taskTypeLabel={page.getTaskTypeLabel(task.gorev_turu)}
      showEdit={canManage}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )

  const timeSections =
    listMode === 'pending' && page.pendingGroups
      ? [
          { key: 'today', label: 'Bugün', tasks: page.pendingGroups.today, emptyText: 'Bugün için görev yok.' },
          {
            key: 'tomorrow',
            label: 'Yarın',
            tasks: page.pendingGroups.tomorrow,
            emptyText: 'Yarın için görev yok.',
          },
          {
            key: 'week',
            label: '7 Gün',
            tasks: page.pendingGroups.week,
            emptyText: 'Önümüzdeki 7 gün içinde görev yok.',
          },
        ]
      : listMode === 'completed' && page.completedGroups
        ? [
            {
              key: 'today',
              label: 'Bugün',
              tasks: page.completedGroups.today,
              emptyText: 'Bugün tamamlanan yok.',
            },
            {
              key: 'yesterday',
              label: 'Dün',
              tasks: page.completedGroups.yesterday,
              emptyText: 'Dün tamamlanan yok.',
            },
            {
              key: 'last7',
              label: 'Son 7 gün',
              tasks: page.completedGroups.last7Days,
              emptyText: 'Bu aralıkta tamamlanan yok.',
            },
          ]
        : []

  const hasNoTasks =
    timeSections.length > 0 && timeSections.every((s) => s.tasks.length === 0)

  if (!page.filteredTasks.length && !tasks?.length) {
    return (
      <EmptyState
        icon={<ListTree size={40} strokeWidth={1.25} />}
        title="Henüz planlama görevi yok"
        description="Proje iş paketlerini ekleyerek başlayın."
        actionLabel={canManage ? 'Görev ekle' : undefined}
        onAction={canManage ? onAddTask : undefined}
      />
    )
  }

  return (
    <div className="px-0 pb-6 pt-0" style={pageSurfaceStyle}>
      <header className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{config.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">{config.description}</p>
      </header>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {config.quickFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => page.setQuickFilter(f.id)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                page.quickFilter === f.id
                  ? 'bg-[#2563EB] text-white shadow-md'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={page.search}
            onChange={(e) => page.setSearch(e.target.value)}
            placeholder="Görev veya kişi ara…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {timeSections.length > 0 ? (
        <TaskTimeAccordion sections={timeSections} renderTask={renderCard} />
      ) : null}

      {hasNoTasks ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {listMode === 'completed' ? 'Tamamlanan görev bulunamadı.' : 'Bekleyen görev bulunamadı.'}
        </p>
      ) : null}
    </div>
  )
}
