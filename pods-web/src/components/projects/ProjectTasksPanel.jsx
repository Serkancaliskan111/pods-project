import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListTree, Plus, Search } from 'lucide-react'
import { EmptyState } from '../../ui'
import { PROJECT_TASK_STATUS_OPTIONS } from '../../lib/projectStatus.js'
import {
  PROJECT_TASK_LIST_VIEW,
  PROJECT_TASK_SORT,
  collectExpandableTaskIds,
  computeProjectTaskListStats,
  filterProjectTaskList,
  filterTasksPreservingTreeAncestors,
  getProjectTaskParentChain,
  getProjectTaskRoots,
  sortFlatProjectTasks,
} from '../../lib/projectTasksListUtils.js'
import ProjectTaskCard, { ProjectTaskTree } from './ProjectTaskCard.jsx'
import { cn } from '../../lib/cn'

const ASSIGNEE_FILTERS = [
  { id: 'all', label: 'Tüm sorumlular' },
  { id: 'mine', label: 'Benim görevlerim' },
  { id: 'unassigned', label: 'Atanmamış' },
]

function selectClass() {
  return 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700'
}

export default function ProjectTasksPanel({
  tasks = [],
  teamMembers = [],
  personMap = {},
  personelId,
  canManage = false,
  onAddTask,
  onEdit,
  onAddChild,
  onDelete,
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [assigneePersonelId, setAssigneePersonelId] = useState('')
  const [sortBy, setSortBy] = useState(PROJECT_TASK_SORT.ORDER)
  const [view, setView] = useState(PROJECT_TASK_LIST_VIEW.TREE)
  const [collapsed, setCollapsed] = useState(() => new Set())

  const stats = useMemo(
    () => computeProjectTaskListStats(tasks, personelId),
    [tasks, personelId],
  )

  const filterOpts = useMemo(
    () => ({
      search,
      status,
      assignee: assignee === 'person' && assigneePersonelId ? 'person' : assignee,
      personelId,
      assigneePersonelId: assignee === 'person' ? assigneePersonelId : null,
    }),
    [search, status, assignee, assigneePersonelId, personelId],
  )

  const hasActiveFilters =
    !!search.trim() ||
    status !== 'all' ||
    assignee !== 'all' ||
    (assignee === 'person' && assigneePersonelId)

  const filteredForTree = useMemo(
    () => filterTasksPreservingTreeAncestors(tasks, filterOpts),
    [tasks, filterOpts],
  )

  const filteredFlat = useMemo(
    () => sortFlatProjectTasks(filterProjectTaskList(tasks, filterOpts), sortBy),
    [tasks, filterOpts, sortBy],
  )

  const rootTasks = useMemo(() => getProjectTaskRoots(filteredForTree), [filteredForTree])

  const handlers = {
    onEdit,
    onAddChild,
    onDelete,
    readOnly: !canManage,
  }

  const expandableIds = useMemo(() => collectExpandableTaskIds(filteredForTree), [filteredForTree])

  const toggleCollapse = (taskId) => {
    const id = String(taskId)
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setAllExpanded = (expanded) => {
    if (expanded) setCollapsed(new Set())
    else setCollapsed(new Set(expandableIds))
  }

  const allExpanded = expandableIds.size > 0 && collapsed.size === 0

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setAssignee('all')
    setAssigneePersonelId('')
  }

  if (stats.total === 0) {
    return (
      <EmptyState
        icon={<ListTree size={40} strokeWidth={1.25} />}
        title="Henüz planlama görevi yok"
        description="Proje iş paketlerini burada planlayın; operasyonel bağlantı görev düzenleme ekranından yapılır."
        actionLabel={canManage ? 'İlk görevi ekle' : undefined}
        onAction={canManage ? onAddTask : undefined}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="Toplam" value={stats.total} />
        <StatChip label="Tamamlanan" value={stats.done} tone="success" />
        <StatChip label="Operasyonel" value={stats.operational} tone="info" />
        <StatChip
          label="Geciken"
          value={stats.overdue}
          tone={stats.overdue > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Görev adı veya açıklama ara…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass()}
              aria-label="Durum filtresi"
            >
              <option value="all">Tüm durumlar</option>
              {PROJECT_TASK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={assignee === 'person' ? `person:${assigneePersonelId}` : assignee}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('person:')) {
                  setAssignee('person')
                  setAssigneePersonelId(v.slice(7))
                } else {
                  setAssignee(v)
                  setAssigneePersonelId('')
                }
              }}
              className={selectClass()}
              aria-label="Sorumlu filtresi"
            >
              {ASSIGNEE_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              {teamMembers.length ? (
                <optgroup label="Ekip üyesi">
                  {teamMembers.map((m) => (
                    <option key={m.personel_id} value={`person:${m.personel_id}`}>
                      {[m.ad, m.soyad].filter(Boolean).join(' ') || m.email || 'Personel'}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            {view === PROJECT_TASK_LIST_VIEW.FLAT ? (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={selectClass()}
                aria-label="Sıralama"
              >
                <option value={PROJECT_TASK_SORT.ORDER}>Sıra</option>
                <option value={PROJECT_TASK_SORT.START}>Başlangıç</option>
                <option value={PROJECT_TASK_SORT.END}>Bitiş</option>
                <option value={PROJECT_TASK_SORT.TITLE}>Başlık</option>
              </select>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setView(PROJECT_TASK_LIST_VIEW.TREE)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-bold transition',
                view === PROJECT_TASK_LIST_VIEW.TREE
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600',
              )}
            >
              Hiyerarşi
            </button>
            <button
              type="button"
              onClick={() => setView(PROJECT_TASK_LIST_VIEW.FLAT)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-bold transition',
                view === PROJECT_TASK_LIST_VIEW.FLAT
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600',
              )}
            >
              Liste
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              {view === PROJECT_TASK_LIST_VIEW.TREE
                ? `${filteredForTree.length} görev (ağaç)`
                : `${filteredFlat.length} görev`}
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="font-semibold text-blue-600 hover:underline"
              >
                Filtreleri temizle
              </button>
            ) : null}
            {view === PROJECT_TASK_LIST_VIEW.TREE && expandableIds.size > 0 ? (
              <button
                type="button"
                onClick={() => setAllExpanded(!allExpanded)}
                className="font-semibold text-slate-600 hover:text-slate-900"
              >
                {allExpanded ? 'Tümünü daralt' : 'Tümünü genişlet'}
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={onAddTask}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus size={14} /> Görev ekle
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {view === PROJECT_TASK_LIST_VIEW.TREE ? (
        rootTasks.length === 0 ? (
          <FilterEmpty onClear={clearFilters} />
        ) : (
          <ProjectTaskTree
            tasks={filteredForTree}
            rootTasks={rootTasks}
            personMap={personMap}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            {...handlers}
          />
        )
      ) : filteredFlat.length === 0 ? (
        <FilterEmpty onClear={clearFilters} />
      ) : (
        <ul className="space-y-2">
          {filteredFlat.map((task) => {
            const chain = getProjectTaskParentChain(tasks, task.id)
            return (
              <li key={task.id}>
                <ProjectTaskCard
                  task={task}
                  depth={0}
                  personMap={personMap}
                  contextLine={
                    chain.length ? `Üst: ${chain.join(' › ')}` : null
                  }
                  {...handlers}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StatChip({ label, value, tone = 'neutral' }) {
  const tones = {
    success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-100 bg-amber-50 text-amber-900',
    info: 'border-blue-100 bg-blue-50 text-blue-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-900',
  }
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', tones[tone] || tones.neutral)}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  )
}

function FilterEmpty({ onClear }) {
  return (
    <EmptyState
      icon={<Search size={36} strokeWidth={1.25} />}
      title="Filtreye uygun görev yok"
      description="Arama veya filtreleri değiştirin; hiyerarşi görünümünde eşleşen alt görevlerin üstleri de listelenir."
      actionLabel="Filtreleri temizle"
      onAction={onClear}
    />
  )
}
