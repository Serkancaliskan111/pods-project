import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2, Pencil } from 'lucide-react'
import { getGorevModuOption } from '../../lib/gorevModuOptions.js'
import { formatPlanAssigneeDetail } from '../../lib/projectTaskPlan.js'
import { formatProjectDateLabel, isProjectTaskOverdue } from '../../lib/projectGanttUtils.js'
import { getProjectTaskStatusOption } from '../../lib/projectStatus.js'
import {
  getProjectTaskProgressLabel,
  getProjectTaskProgressPct,
} from '../../lib/projectTasksListUtils.js'
import { cn } from '../../lib/cn'

function personLabel(p) {
  if (!p) return null
  return [p.ad, p.soyad].filter(Boolean).join(' ') || p.email || null
}

export default function ProjectTaskCard({
  task,
  depth = 0,
  personMap,
  contextLine = null,
  onEdit,
  onAddChild,
  onDelete,
  readOnly = false,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
}) {
  const st = getProjectTaskStatusOption(task.durum)
  const typeOpt = getGorevModuOption(task.gorev_tipi || 'normal')
  const overdue = isProjectTaskOverdue(task)
  const assigneeDetail = formatPlanAssigneeDetail(task.gorev_tipi || 'normal', task.plan_meta, personMap)
  const assignee = personMap?.[String(task.sorumlu_personel_id)]
  const assigneeText = assigneeDetail || personLabel(assignee)
  const unassigned = !assigneeText && !task.bagli_is_id
  const progressPct = getProjectTaskProgressPct(task)
  const progressLabel = getProjectTaskProgressLabel(task)
  const linked = !!task.bagli_is_id

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-slate-200/80 pl-3 sm:ml-5' : ''}>
      <div
        className={cn(
          'mb-2 rounded-xl border bg-white p-3 shadow-sm transition',
          overdue ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200',
          !readOnly && 'hover:border-blue-200',
        )}
      >
        <div className="flex gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="mt-0.5 shrink-0 rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label={collapsed ? 'Genişlet' : 'Daralt'}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button>
          ) : (
            <span className="w-7 shrink-0" aria-hidden />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h4 className="text-sm font-semibold text-slate-900">{task.baslik || 'Görev'}</h4>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: st.bg, color: st.color }}
                  >
                    {st.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: `${typeOpt.color}18`, color: typeOpt.color }}
                  >
                    {typeOpt.label}
                  </span>
                  {linked ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Operasyonel bağlı
                    </span>
                  ) : null}
                  {overdue ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700">
                      <AlertTriangle size={11} /> Gecikmiş
                    </span>
                  ) : null}
                </div>
                {contextLine ? (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{contextLine}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {formatProjectDateLabel(task.baslangic_tarihi)} –{' '}
                  {formatProjectDateLabel(task.bitis_tarihi)}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-xs',
                    unassigned ? 'font-semibold text-amber-700' : 'text-slate-600',
                  )}
                >
                  {unassigned ? 'Sorumlu atanmadı' : `Sorumlu: ${assigneeText}`}
                </p>
                {progressLabel ? (
                  <div className="mt-2 max-w-md">
                    <div className="mb-1 flex justify-between text-[10px] font-semibold text-slate-500">
                      <span>{progressLabel}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-0.5">
                {linked ? (
                  <Link
                    to={`/admin/tasks/${task.bagli_is_id}`}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Operasyonel görev
                  </Link>
                ) : null}
                {!readOnly ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit?.(task)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
                      aria-label="Düzenle"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddChild?.(task.id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
                      aria-label="Alt görev ekle"
                      title="Alt görev ekle"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete?.(task.id)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                      aria-label="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectTaskTree({
  tasks,
  rootTasks,
  personMap,
  collapsed,
  onToggleCollapse,
  ...handlers
}) {
  function Node({ task, depth }) {
    const children = tasks
      .filter((c) => String(c.parent_id) === String(task.id))
      .sort((a, b) => (a.sira || 0) - (b.sira || 0))
    const hasChildren = children.length > 0
    const isCollapsed = collapsed?.has?.(String(task.id))

    return (
      <>
        <ProjectTaskCard
          task={task}
          depth={depth}
          personMap={personMap}
          hasChildren={hasChildren}
          collapsed={isCollapsed}
          onToggleCollapse={hasChildren ? () => onToggleCollapse?.(task.id) : undefined}
          {...handlers}
        />
        {hasChildren && !isCollapsed
          ? children.map((c) => <Node key={c.id} task={c} depth={depth + 1} />)
          : null}
      </>
    )
  }

  return <div>{rootTasks.map((t) => <Node key={t.id} task={t} depth={0} />)}</div>
}
