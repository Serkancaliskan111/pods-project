import { useMemo } from 'react'
import {
  computeProjectBarPlacement,
  formatProjectDateLabel,
  getProjectTaskSpan,
} from '../../lib/projectGanttUtils.js'

const LABEL_WIDTH = 260
const DAY_MIN_WIDTH = 72
const ROW_H = 44

function isToday(d) {
  const t = new Date()
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  )
}

export default function ProjectGantt({
  days,
  rangeStart,
  rangeEnd,
  rows,
  loading,
  projectColor = '#2563EB',
  onSelectTask,
}) {
  const gridWidth = Math.max(days.length * DAY_MIN_WIDTH, 400)

  const dayMarkers = useMemo(() => {
    const totalMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime() + 1)
    return days.map((d) => {
      const dayStart = new Date(d)
      dayStart.setHours(0, 0, 0, 0)
      const leftPct = ((dayStart.getTime() - rangeStart.getTime()) / totalMs) * 100
      return { date: d, leftPct: Math.max(0, Math.min(100, leftPct)) }
    })
  }, [days, rangeStart, rangeEnd])

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-sm text-slate-500">Gantt yükleniyor…</div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
        Henüz görev eklenmedi. Görevler sekmesinden planlamaya başlayın.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_WIDTH + gridWidth }}>
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"
              style={{ width: LABEL_WIDTH }}
            >
              Görev / Alt görev
            </div>
            <div className="relative shrink-0" style={{ width: gridWidth, height: 52 }}>
              {dayMarkers.map(({ date, leftPct }) => (
                <div
                  key={date.toISOString()}
                  className="absolute top-0 flex h-full flex-col justify-center border-l border-slate-200/80 px-1 text-center"
                  style={{
                    left: `${leftPct}%`,
                    width: `${100 / Math.max(1, days.length)}%`,
                    backgroundColor: isToday(date) ? `${projectColor}14` : undefined,
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    {date.toLocaleDateString('tr-TR', { weekday: 'short' })}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            {rows.map((row) => {
              const task = row.task
              const placement = computeProjectBarPlacement(task, rangeStart, rangeEnd, days)
              const span = getProjectTaskSpan(task)
              const indentPx = 12 + row.depth * 18

              return (
                <div
                  key={row.id}
                  className="flex border-b border-slate-100 hover:bg-slate-50/60"
                  style={{ minHeight: ROW_H }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTask?.(task)}
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r border-slate-200 bg-white px-3 text-left text-xs transition hover:bg-blue-50/40"
                    style={{ width: LABEL_WIDTH, paddingLeft: indentPx }}
                  >
                    <span
                      className="mr-2 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.colors.dot }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{row.label}</span>
                      {row.typeLabel ? (
                        <span className="block truncate text-[9px] font-medium text-slate-400">
                          {row.typeLabel}
                        </span>
                      ) : null}
                    </span>
                    {row.assignee ? (
                      <span className="ml-1 hidden max-w-[72px] truncate text-[10px] text-slate-400 lg:inline">
                        {row.assignee}
                      </span>
                    ) : null}
                  </button>
                  <div className="relative shrink-0" style={{ width: gridWidth }}>
                    {dayMarkers.map(({ date, leftPct }) => (
                      <div
                        key={`grid-${row.id}-${date.toISOString()}`}
                        className="pointer-events-none absolute top-0 h-full border-l border-slate-100"
                        style={{
                          left: `${leftPct}%`,
                          width: `${100 / Math.max(1, days.length)}%`,
                          backgroundColor: isToday(date) ? `${projectColor}08` : undefined,
                        }}
                      />
                    ))}
                    {placement ? (
                      <button
                        type="button"
                        onClick={() => onSelectTask?.(task)}
                        title={`${row.label}\n${formatProjectDateLabel(task.baslangic_tarihi)} – ${formatProjectDateLabel(task.bitis_tarihi)}`}
                        className="absolute top-1/2 z-[1] flex max-w-full -translate-y-1/2 items-center truncate rounded-md px-2 py-1 text-[11px] font-semibold shadow-sm transition hover:brightness-95"
                        style={{
                          left: `${placement.leftPct}%`,
                          width: `${placement.widthPct}%`,
                          minWidth: 28,
                          backgroundColor: row.colors.bg,
                          color: row.colors.color,
                          border: `1px solid ${row.colors.dot}44`,
                        }}
                      >
                        <span className="truncate">
                          {row.statusLabel}
                          {task.ilerleme > 0 && task.ilerleme < 100 ? ` · %${task.ilerleme}` : ''}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
