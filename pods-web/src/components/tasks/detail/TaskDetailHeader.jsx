import { ArrowLeft, Calendar, User } from 'lucide-react'
import { Button, StatusBadge } from '../../../ui'
import TaskWorkStatusBadge from '../TaskWorkStatusBadge.jsx'
import TaskWorkStatusSelect from '../TaskWorkStatusSelect.jsx'
import { taskStatusTone } from './taskDetailUtils.js'
import { cn } from '../../../lib/cn'

export default function TaskDetailHeader({
  task,
  assigneeLabel,
  normalizedStatus,
  isApproved,
  canEditWorkStatus,
  onWorkStatusUpdated,
  onBack,
  actions = null,
  alerts = null,
  design,
  compact = false,
}) {
  const statusTone = taskStatusTone(normalizedStatus, { isApproved })
  const barColor = design?.barColor || '#2563EB'
  const showTypeBadge = !compact && design?.Icon && design?.key !== 'normal'

  const endLabel = task?.son_tarih
    ? new Date(task.son_tarih).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  if (compact) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-3 sm:px-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1 px-2 text-xs font-semibold text-slate-600"
          >
            <ArrowLeft size={14} />
            Görevler
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={statusTone} size="sm">
              {normalizedStatus || '—'}
            </StatusBadge>
            {canEditWorkStatus ? (
              <TaskWorkStatusSelect
                taskId={task.id}
                value={task.calisma_durumu}
                onUpdated={onWorkStatusUpdated}
              />
            ) : (
              <TaskWorkStatusBadge value={task.calisma_durumu} />
            )}
          </div>
        </div>

        <article
          data-help="task-detail-header"
          className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="flex">
            <div className="w-1 shrink-0" style={{ backgroundColor: barColor }} aria-hidden />
            <div className="min-w-0 flex-1 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-extrabold leading-snug text-primary-900">
                    {task?.baslik || 'Görev detayı'}
                  </h1>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <User size={12} className="text-slate-400" />
                      <span className="font-medium text-slate-700">{assigneeLabel}</span>
                    </span>
                    {endLabel ? (
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" />
                        Son: {endLabel}
                      </span>
                    ) : null}
                  </p>
                </div>
                {actions ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
                ) : null}
              </div>
              {alerts ? <div className="mt-3">{alerts}</div> : null}
            </div>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mb-3 h-9 gap-1.5 px-2 text-sm font-semibold text-slate-600 hover:bg-white/80"
      >
        <ArrowLeft size={16} />
        Görevlere dön
      </Button>

      <article
        data-help="task-detail-header"
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06)]"
      >
        <div className="flex min-h-0">
          <div className="w-1.5 shrink-0 sm:w-2" style={{ backgroundColor: barColor }} aria-hidden />
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              {showTypeBadge ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold"
                  style={{
                    borderColor: `${barColor}35`,
                    backgroundColor: `${barColor}10`,
                    color: barColor,
                  }}
                >
                  <design.Icon size={14} strokeWidth={2.25} />
                  {design.label}
                </span>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTone} size="md">
                  {normalizedStatus || '—'}
                </StatusBadge>
                {canEditWorkStatus ? (
                  <TaskWorkStatusSelect
                    taskId={task.id}
                    value={task.calisma_durumu}
                    onUpdated={onWorkStatusUpdated}
                  />
                ) : (
                  <TaskWorkStatusBadge value={task.calisma_durumu} />
                )}
              </div>
            </div>

            <h1 className="mt-3 text-xl font-extrabold leading-tight text-primary-900">
              {task?.baslik || 'Görev detayı'}
            </h1>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                <User size={12} className="text-slate-400" />
                {assigneeLabel}
              </span>
              {endLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                  <Calendar size={12} className="text-slate-400" />
                  Son tarih: {endLabel}
                </span>
              ) : null}
            </div>

            {alerts ? <div className="mt-3">{alerts}</div> : null}

            {actions ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </div>
  )
}
