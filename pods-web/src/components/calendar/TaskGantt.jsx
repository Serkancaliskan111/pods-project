import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  computeBarPlacement,
  formatCalendarDayHeader,
  getTaskBarColors,
  getTaskSpan,
} from '../../lib/taskCalendarUtils.js'
import { getTaskWorkStatusOption } from '../../lib/taskWorkStatus.js'
import { cubicle } from '../../theme/cubicle'

const LABEL_WIDTH = 220
const DAY_MIN_WIDTH = 88
const ROW_H = 40
const PERSON_ROW_H = 36

function isToday(d) {
  const t = new Date()
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  )
}

export default function TaskGantt({ days, rangeStart, rangeEnd, rows, loading }) {
  const navigate = useNavigate()
  const gridWidth = Math.max(days.length * DAY_MIN_WIDTH, 320)

  const dayMarkers = useMemo(() => {
    const totalMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime() + 1)
    return days.map((d) => {
      const dayStart = new Date(d)
      dayStart.setHours(0, 0, 0, 0)
      const leftPct = ((dayStart.getTime() - rangeStart.getTime()) / totalMs) * 100
      return { date: d, leftPct: Math.max(0, Math.min(100, leftPct)) }
    })
  }, [days, rangeStart, rangeEnd])

  const openTask = (task) => {
    if (!task?.id) return
    navigate(`/admin/tasks/${task.id}`)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-sm text-slate-500">Gantt yükleniyor…</div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
        Seçilen aralıkta görev bulunamadı.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_WIDTH + gridWidth }}>
          {/* Header */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"
              style={{ width: LABEL_WIDTH }}
            >
              Görev / Personel
            </div>
            <div className="relative shrink-0" style={{ width: gridWidth, height: 56 }}>
              {dayMarkers.map(({ date, leftPct }) => (
                <div
                  key={date.toISOString()}
                  className="absolute top-0 flex h-full flex-col justify-center border-l border-slate-200/80 px-1 text-center"
                  style={{
                    left: `${leftPct}%`,
                    width: `${100 / Math.max(1, days.length)}%`,
                    backgroundColor: isToday(date) ? 'rgba(91, 124, 255, 0.08)' : undefined,
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

          {/* Body */}
          <div>
            {rows.map((row) => {
              if (row.kind === 'person') {
                return (
                  <div
                    key={row.id}
                    className="flex border-b border-slate-100 bg-slate-50/90"
                    style={{ minHeight: PERSON_ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-10 flex items-center border-r border-slate-200 bg-slate-50/95 px-3 text-xs font-bold text-slate-700"
                      style={{ width: LABEL_WIDTH }}
                    >
                      {row.label}
                      <span className="ml-2 font-normal text-slate-400">({row.taskCount})</span>
                    </div>
                    <div style={{ width: gridWidth }} />
                  </div>
                )
              }

              const task = row.task
              const placement = computeBarPlacement(task, rangeStart, rangeEnd, days)
              const colors = getTaskBarColors(task)
              const status = getTaskWorkStatusOption(task?.calisma_durumu)
              const span = getTaskSpan(task)

              return (
                <div
                  key={row.id}
                  className="flex border-b border-slate-100 hover:bg-slate-50/50"
                  style={{ minHeight: ROW_H }}
                >
                  <button
                    type="button"
                    onClick={() => openTask(task)}
                    className={`sticky left-0 z-10 flex shrink-0 items-center border-r border-slate-200 bg-white px-3 text-left text-xs transition hover:bg-blue-50/40 ${
                      row.indent ? 'pl-6' : ''
                    }`}
                    style={{ width: LABEL_WIDTH }}
                  >
                    <span
                      className="mr-2 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: status.dot }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate font-medium text-slate-800">{row.label}</span>
                  </button>
                  <div className="relative shrink-0" style={{ width: gridWidth }}>
                    {dayMarkers.map(({ date, leftPct }) => (
                      <div
                        key={`grid-${row.id}-${date.toISOString()}`}
                        className="pointer-events-none absolute top-0 h-full border-l border-slate-100"
                        style={{
                          left: `${leftPct}%`,
                          width: `${100 / Math.max(1, days.length)}%`,
                          backgroundColor: isToday(date) ? 'rgba(91, 124, 255, 0.04)' : undefined,
                        }}
                      />
                    ))}
                    {placement ? (
                      <button
                        type="button"
                        onClick={() => openTask(task)}
                        title={`${row.label}\n${span.start ? formatCalendarDayHeader(span.start, true) : ''} – ${span.end ? formatCalendarDayHeader(span.end, true) : ''}`}
                        className="absolute top-1/2 z-[1] flex max-w-full -translate-y-1/2 items-center truncate rounded-md px-2 py-1 text-[11px] font-semibold shadow-sm transition hover:brightness-95"
                        style={{
                          left: `${placement.leftPct}%`,
                          width: `${placement.widthPct}%`,
                          minWidth: 24,
                          backgroundColor: colors.bg,
                          color: colors.color,
                          border: `1px solid ${colors.dot}33`,
                        }}
                      >
                        <span className="truncate">{status.label}</span>
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
