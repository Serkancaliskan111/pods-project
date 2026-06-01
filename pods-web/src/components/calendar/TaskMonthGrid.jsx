import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buildMonthGridCells,
  getCalendarEventColors,
  startOfDay,
  tasksOnCalendarDay,
} from '../../lib/taskCalendarUtils.js'

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function isToday(d) {
  const t = new Date()
  return (
    d.getDate() === t.getDate() &&
    d.getMonth() === t.getMonth() &&
    d.getFullYear() === t.getFullYear()
  )
}

export default function TaskMonthGrid({ anchorDate, tasks, loading, onSelectDay }) {
  const navigate = useNavigate()
  const cells = useMemo(() => buildMonthGridCells(anchorDate), [anchorDate])

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-sm text-slate-500">
        Takvim yükleniyor…
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, outside }) => {
          const dayTasks = tasksOnCalendarDay(tasks, date)
          const today = isToday(date)
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDay?.(startOfDay(date))}
              className={`min-h-[88px] border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-slate-50/80 ${
                outside ? 'bg-slate-50/50 text-slate-400' : 'bg-white'
              } ${today ? 'ring-1 ring-inset ring-blue-300' : ''}`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  today ? 'bg-blue-600 text-white' : 'text-slate-700'
                }`}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayTasks.slice(0, 3).map((task) => {
                  const c = getCalendarEventColors(task)
                  return (
                    <span
                      key={task.id}
                      role="presentation"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/admin/tasks/${task.id}`)
                      }}
                      className="block w-full truncate rounded px-1 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: c.bg,
                        color: c.text,
                        borderLeft: `2px solid ${c.border}`,
                      }}
                    >
                      {task.baslik || 'Görev'}
                    </span>
                  )
                })}
                {dayTasks.length > 3 ? (
                  <span className="block text-[10px] font-semibold text-slate-500">
                    +{dayTasks.length - 3} daha
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
