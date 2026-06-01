import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  formatCalendarDayHeader,
  formatEventTimeRange,
  getCalendarEventColors,
  getTaskSpan,
  partitionTasksForDay,
  startOfDay,
} from '../../lib/taskCalendarUtils.js'

export default function TaskCalendarList({ days, tasks, loading }) {
  const navigate = useNavigate()

  const rows = useMemo(() => {
    const out = []
    for (const day of days || []) {
      const { allDay, timed } = partitionTasksForDay(tasks, day)
      for (const item of [...allDay, ...timed]) {
        out.push({ day, item })
      }
    }
    out.sort((a, b) => {
      const ta = a.item.segStart?.getTime() || 0
      const tb = b.item.segStart?.getTime() || 0
      return ta - tb
    })
    return out
  }, [days, tasks])

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-sm text-slate-500">Liste yükleniyor…</div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-500">
        Bu dönemde görev yok.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.map(({ day, item }) => {
        const colors = getCalendarEventColors(item.task)
        const span = getTaskSpan(item.task)
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => navigate(`/admin/tasks/${item.task.id}`)}
              className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="w-28 shrink-0 text-xs text-slate-500">
                <div className="font-bold text-slate-700">
                  {formatCalendarDayHeader(day, true)}
                </div>
                <div>
                  {item.type === 'allday'
                    ? 'Tüm gün'
                    : formatEventTimeRange(item.segStart, item.segEnd)}
                </div>
              </div>
              <div
                className="min-w-0 flex-1 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: colors.bg,
                  borderLeft: `3px solid ${colors.border}`,
                }}
              >
                <p className="truncate text-sm font-bold" style={{ color: colors.text }}>
                  {item.task.baslik || 'Görev'}
                </p>
                {span.end ? (
                  <p className="mt-0.5 text-[11px] opacity-70" style={{ color: colors.text }}>
                    Son: {formatCalendarDayHeader(span.end, true)}
                  </p>
                ) : null}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
