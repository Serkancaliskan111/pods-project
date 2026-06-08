import { Link } from 'react-router-dom'
import { getProjectTaskStatusOption } from '../../lib/projectStatus.js'
import { getGorevModuOption } from '../../lib/gorevModuOptions.js'
import { isProjectTaskOverdue } from '../../lib/projectGanttUtils.js'
import { cubicle } from '../../theme/cubicle.js'

function formatSchedule(task) {
  const raw = task?.son_tarih || task?.baslama_tarihi
  if (!raw) return 'Tarih: —'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return 'Tarih: —'
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function ProjectTaskListCard({
  task,
  companyName,
  assigneeName,
  taskTypeLabel,
  showEdit,
  onEdit,
  onDelete,
  actioning,
}) {
  const st = getProjectTaskStatusOption(task?.durum)
  const overdue = isProjectTaskOverdue(task)
  const linked = !!task?.bagli_is_id
  const bar = overdue ? cubicle.statusOverdue : st.value === 'tamamlandi' ? cubicle.statusOnTime : cubicle.statusTodo

  return (
    <article className="flex overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="w-1.5 shrink-0" style={{ backgroundColor: bar }} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onEdit?.(task)}
            className="min-w-0 flex-1 text-left"
          >
            <h3 className="truncate text-sm font-bold text-slate-800">{task.baslik || 'Görev'}</h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">{companyName}</p>
          </button>
          <div className="flex flex-wrap items-center gap-1.5">
            {task.acil ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                Acil
              </span>
            ) : null}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: st.bg, color: st.color }}
            >
              {st.label}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{formatSchedule(task)}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{taskTypeLabel}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
            Sorumlu: {assigneeName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {linked ? (
            <Link
              to={`/admin/tasks/${task.bagli_is_id}`}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
              onClick={(e) => e.stopPropagation()}
            >
              Operasyonel görev
            </Link>
          ) : null}
          {showEdit ? (
            <button
              type="button"
              disabled={actioning}
              onClick={() => onEdit?.(task)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Düzenle
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function getProjectCardTypeLabel(task) {
  return getGorevModuOption(task?.gorev_tipi || task?.gorev_turu || 'normal').label
}
