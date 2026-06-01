import { useNavigate, Link } from 'react-router-dom'
import { normalizeTaskStatus } from '../../../../lib/taskStatus.js'
import { cubicle } from '../../../../theme/cubicle.js'
import { isUrgentTask } from '../lib/tasksListGrouping.js'

function statusBarColor(durum) {
  const d = normalizeTaskStatus(durum)
  if (d === 'Onaylandı') return cubicle.statusOnTime
  if (d === 'Reddedildi') return cubicle.statusOverdue
  if (d === 'Onay Bekliyor') return cubicle.statusWaiting
  return cubicle.statusTodo
}

function formatSchedule(task) {
  const raw = task?.son_tarih || task?.baslama_tarihi
  if (!raw) return 'Tarih: —'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return 'Tarih: —'
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TaskListCard({
  task,
  companyName,
  assigneeName,
  taskTypeLabel,
  showDelete,
  showEdit,
  showApprove,
  showReject,
  approveDisabled,
  rejectDisabled,
  deletionPending,
  onDelete,
  onApprove,
  onReject,
  actioning,
  workAction,
}) {
  const navigate = useNavigate()
  const bar = statusBarColor(task?.durum)
  const urgent = isUrgentTask(task)

  return (
    <article className="flex overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="w-1.5 shrink-0" style={{ backgroundColor: bar }} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-slate-800">{task.baslik || 'Görev'}</h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">{companyName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {urgent ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                Acil
              </span>
            ) : null}
            <span
              className="rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: `${cubicle.statusWaiting}22`, color: '#92400e' }}
            >
              {normalizeTaskStatus(task.durum) || 'Durum yok'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{formatSchedule(task)}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{taskTypeLabel}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
            Atanan: {assigneeName}
          </span>
        </div>

        {deletionPending ? (
          <p className="text-[11px] font-semibold text-amber-800">Silme için onaya gönderildi</p>
        ) : null}

        {workAction?.show ? (
          <Link
            to={workAction.href}
            className="flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-[1.03]"
            style={{ backgroundColor: cubicle.greenCta }}
          >
            {workAction.label || 'Görevi yap'}
          </Link>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {showApprove ? (
            <button
              type="button"
              disabled={approveDisabled || actioning}
              onClick={() => onApprove?.(task)}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Görevi Onayla
            </button>
          ) : null}
          {showReject ? (
            <button
              type="button"
              disabled={rejectDisabled || actioning}
              onClick={() => onReject?.(task)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Görevi Reddet
            </button>
          ) : null}
          {showDelete ? (
            <button
              type="button"
              disabled={actioning}
              onClick={() => onDelete?.(task)}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              Sil
            </button>
          ) : null}
          {showEdit ? (
            <button
              type="button"
              onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
            >
              Düzenle
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(`/admin/tasks/${task.id}`)}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100"
          >
            Detay gör
          </button>
        </div>
      </div>
    </article>
  )
}
