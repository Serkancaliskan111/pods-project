import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { cubicle } from '../../theme/cubicle.js'
import {
  formatUrgentTaskTimelineLabel,
  getUrgentTimelineAxisLabels,
  isCubicleHomeOverdueTask,
  spreadUrgentTimelineLanes,
  urgentTaskTimelineProgress,
} from '../../lib/cubicleHomeTaskBuckets.js'

function clampTimelineProgress(pct) {
  if (pct == null || Number.isNaN(pct)) return 50
  return Math.min(98, Math.max(2, pct))
}

export default function UrgentTasksPanel({
  tasks,
  loading,
  now = new Date(),
  onOpenTask,
}) {
  const count = tasks?.length || 0
  const [open, setOpen] = useState(true)

  const axisLabels = useMemo(() => getUrgentTimelineAxisLabels(now), [now])

  const timeline = useMemo(() => {
    const base = (tasks || []).map((task) => ({
      task,
      timeLabel: formatUrgentTaskTimelineLabel(task, now),
      progress: clampTimelineProgress(urgentTaskTimelineProgress(task, now)),
      overdue: isCubicleHomeOverdueTask(task, now),
    }))
    return spreadUrgentTimelineLanes(base)
  }, [tasks, now])

  const maxLane = timeline.reduce((max, item) => Math.max(max, item.lane || 0), 0)
  const trackHeight = Math.max(6, 6 + maxLane * 10)

  const listItems = useMemo(
    () =>
      (tasks || []).map((task) => ({
        task,
        timeLabel: formatUrgentTaskTimelineLabel(task, now),
        overdue: isCubicleHomeOverdueTask(task, now),
      })),
    [tasks, now],
  )

  return (
    <section
      className="overflow-hidden rounded-xl border shadow-[0_4px_16px_-6px_rgba(220,38,38,0.35)]"
      style={{ borderColor: cubicle.urgentBar, backgroundColor: '#fff' }}
      aria-labelledby="urgent-tasks-heading"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="urgent-tasks-body"
        className="relative flex w-full items-center justify-between gap-2 overflow-hidden px-3 py-2.5 text-left sm:px-3.5"
        style={{
          background: `linear-gradient(135deg, ${cubicle.urgentBar} 0%, ${cubicle.urgentBarDark} 100%)`,
        }}
      >
        <div className="relative flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
            <AlertTriangle size={16} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <h2
              id="urgent-tasks-heading"
              className="text-sm font-extrabold leading-tight tracking-tight text-white"
            >
              Acil Görevler ({loading ? '…' : count})
            </h2>
            <p className="truncate text-[10px] font-medium text-white/80">
              Son 7 gün · atanan aktif acil görevler
            </p>
          </div>
        </div>
        <span className="relative flex shrink-0 items-center gap-1.5">
          {!loading && count > 0 ? (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-extrabold text-red-700">
              {count}
            </span>
          ) : null}
          {open ? (
            <ChevronDown size={18} strokeWidth={2.5} className="text-white" />
          ) : (
            <ChevronRight size={18} strokeWidth={2.5} className="text-white" />
          )}
        </span>
      </button>

      {open ? (
        <div id="urgent-tasks-body">
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">Yükleniyor…</p>
          ) : null}

          {!loading && count === 0 ? (
            <p className="mx-3 mb-3 rounded-lg border border-dashed border-red-200 bg-red-50/60 py-4 text-center text-xs text-red-800/80">
              Son 7 günde acil görev yok.
            </p>
          ) : null}

          {!loading && count > 0 ? (
            <>
              <div
                className="border-b px-3 py-2"
                style={{ borderColor: cubicle.urgentGlow, backgroundColor: cubicle.urgentGlow }}
              >
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-800">
                  <Clock size={11} strokeWidth={2.5} />
                  Çizelge · son 7 gün
                </p>
                <div
                  className="relative overflow-visible rounded-full bg-red-100"
                  style={{ height: trackHeight }}
                >
                  {timeline.map(({ task, progress, overdue, timeLabel, lane }) => (
                    <button
                      key={task.id}
                      type="button"
                      title={`${task.baslik || 'Görev'} · ${timeLabel}`}
                      onClick={() => onOpenTask?.(task)}
                      className="absolute z-10 -translate-x-1/2"
                      style={{
                        left: `${progress}%`,
                        top: `calc(50% + ${(lane || 0) * 10}px)`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <span
                        className={`block h-3 w-3 rounded-full ring-2 ring-white ${
                          overdue ? 'animate-pulse bg-red-800' : 'bg-red-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-3 text-[9px] font-medium text-red-700/65">
                  {axisLabels.map((tick) => (
                    <span
                      key={tick.key}
                      className={
                        tick.key === 'mid'
                          ? 'truncate text-center'
                          : tick.key === 'end'
                            ? 'truncate text-right'
                            : 'truncate text-left'
                      }
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>

              <ul className="space-y-1.5 p-2.5 sm:p-3">
                {listItems.map(({ task, overdue, timeLabel }) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask?.(task)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition hover:bg-red-50 ${
                        overdue
                          ? 'border-red-300 bg-red-50/80'
                          : 'border-red-200/90 bg-white'
                      }`}
                    >
                      <span
                        className={`w-16 shrink-0 text-center text-[10px] font-extrabold leading-tight tabular-nums ${
                          overdue ? 'text-red-800' : 'text-red-600'
                        }`}
                      >
                        {timeLabel}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                        {task.baslik || 'Görev'}
                      </span>
                      <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
                        Acil
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
