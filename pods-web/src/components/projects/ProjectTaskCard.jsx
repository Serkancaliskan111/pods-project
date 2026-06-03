import { Link } from 'react-router-dom'
import { AlertTriangle, Plus, Rocket, Trash2, Pencil } from 'lucide-react'
import { getGorevModuOption } from '../../lib/gorevModuOptions.js'
import { formatPlanAssigneeDetail } from '../../lib/projectTaskPlan.js'
import { formatProjectDateLabel, isProjectTaskOverdue } from '../../lib/projectGanttUtils.js'
import { getProjectTaskStatusOption } from '../../lib/projectStatus.js'
import { cn } from '../../lib/cn'

function personLabel(p) {
  if (!p) return null
  return [p.ad, p.soyad].filter(Boolean).join(' ') || p.email || null
}

export default function ProjectTaskCard({
  task,
  depth = 0,
  personMap,
  onEdit,
  onAddChild,
  onDelete,
  onLaunch,
  mayLaunch,
  readOnly = false,
}) {
  const st = getProjectTaskStatusOption(task.durum)
  const typeOpt = getGorevModuOption(task.gorev_tipi || 'normal')
  const overdue = isProjectTaskOverdue(task)
  const assigneeDetail = formatPlanAssigneeDetail(task.gorev_tipi || 'normal', task.plan_meta, personMap)
  const assignee = personMap?.[String(task.sorumlu_personel_id)]

  return (
    <div className={depth > 0 ? 'ml-3 border-l-2 border-slate-100 pl-3' : ''}>
      <div
        className={cn(
          'mb-2 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm transition hover:border-blue-200',
          overdue ? 'border-amber-200' : 'border-slate-200',
        )}
      >
        <button
          type="button"
          onClick={() => !readOnly && onEdit?.(task)}
          disabled={readOnly}
          className={cn(
            'min-w-0 flex-1 text-left',
            readOnly && 'cursor-default',
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900">{task.baslik}</span>
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
            {task.bagli_is_id ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                Operasyonel
              </span>
            ) : null}
            {overdue ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700">
                <AlertTriangle size={11} /> Gecikmiş
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatProjectDateLabel(task.baslangic_tarihi)} –{' '}
            {formatProjectDateLabel(task.bitis_tarihi)}
            {(assigneeDetail || personLabel(assignee)) &&
              ` · ${assigneeDetail || personLabel(assignee)}`}
          </p>
        </button>
        {!readOnly ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {task.bagli_is_id ? (
            <Link
              to={`/admin/tasks/${task.bagli_is_id}`}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Görüntüle
            </Link>
          ) : mayLaunch ? (
            <button
              type="button"
              onClick={() => onLaunch?.(task)}
              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Rocket size={13} /> Başlat
            </button>
          ) : null}
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
            aria-label="Alt görev"
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
        </div>
        ) : task.bagli_is_id ? (
          <Link
            to={`/admin/tasks/${task.bagli_is_id}`}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Görüntüle
          </Link>
        ) : null}
      </div>
    </div>
  )
}

export function ProjectTaskTree({ tasks, rootTasks, personMap, ...handlers }) {
  function Node({ task, depth }) {
    const children = tasks
      .filter((c) => String(c.parent_id) === String(task.id))
      .sort((a, b) => (a.sira || 0) - (b.sira || 0))
    return (
      <>
        <ProjectTaskCard task={task} depth={depth} personMap={personMap} {...handlers} />
        {children.map((c) => (
          <Node key={c.id} task={c} depth={depth + 1} />
        ))}
      </>
    )
  }
  return rootTasks.map((t) => <Node key={t.id} task={t} depth={0} />)
}
