import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ALL_DAY_ROW_HEIGHT,
  formatCalendarDayHeader,
  formatEventTimeRange,
  getCalendarEventColors,
  getTimedEventStyle,
  GRID_END_HOUR,
  GRID_START_HOUR,
  HOUR_HEIGHT_PX,
  layoutOverlappingTimedEvents,
  partitionTasksForDay,
} from '../../lib/taskCalendarUtils.js'

const TIME_COL_WIDTH = 56

function isToday(d) {
  const t = new Date()
  return sameDay(d, t)
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function EventCard({ item, style, onOpen }) {
  const colors = getCalendarEventColors(item.task)
  const isAllDay = item.type === 'allday'
  return (
    <button
      type="button"
      onClick={() => onOpen(item.task)}
      className="absolute overflow-hidden rounded-md px-2 py-1 text-left shadow-sm transition hover:brightness-[0.97]"
      style={{
        ...style,
        backgroundColor: colors.bg,
        color: colors.text,
        borderLeft: `3px solid ${colors.border}`,
      }}
    >
      {!isAllDay ? (
        <span className="block text-[10px] font-semibold opacity-80">
          {formatEventTimeRange(item.segStart, item.segEnd)}
        </span>
      ) : null}
      <span className={`block truncate font-semibold ${isAllDay ? 'text-xs' : 'text-[11px]'}`}>
        {item.task.baslik || 'Görev'}
      </span>
    </button>
  )
}

function DayColumn({ day, tasks, isWeek }) {
  const navigate = useNavigate()
  const { allDay, timed } = useMemo(() => partitionTasksForDay(tasks, day), [tasks, day])
  const laidOut = useMemo(() => layoutOverlappingTimedEvents(timed), [timed])

  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT_PX
  const hours = useMemo(() => {
    const list = []
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) list.push(h)
    return list
  }, [])

  const openTask = (task) => {
    if (task?.id) navigate(`/admin/tasks/${task.id}`)
  }

  return (
    <div className={`flex min-w-0 flex-1 flex-col ${isWeek ? 'border-l border-slate-100' : ''}`}>
      {isWeek ? (
        <div
          className={`flex h-10 shrink-0 items-center justify-center border-b border-slate-200 text-xs font-bold ${
            isToday(day) ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700'
          }`}
        >
          <span className="hidden sm:inline">{formatCalendarDayHeader(day, true)}</span>
          <span className="sm:hidden">
            {day.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' })}
          </span>
        </div>
      ) : null}

      {/* Tüm gün */}
      <div
        className="flex shrink-0 border-b border-slate-200 bg-white"
        style={{ minHeight: ALL_DAY_ROW_HEIGHT }}
      >
        {!isWeek ? (
          <div
            className="shrink-0 border-r border-slate-100 bg-slate-50/80 px-1 py-2 text-right text-[10px] font-semibold text-slate-400"
            style={{ width: TIME_COL_WIDTH }}
          >
            Tüm gün
          </div>
        ) : null}
        <div className="relative min-w-0 flex-1 p-1">
          <div className="flex flex-wrap gap-1">
            {allDay.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => openTask(item.task)}
                className="max-w-full truncate rounded-md px-2 py-1 text-left text-[11px] font-semibold shadow-sm"
                style={{
                  backgroundColor: getCalendarEventColors(item.task).bg,
                  color: getCalendarEventColors(item.task).text,
                  borderLeft: `3px solid ${getCalendarEventColors(item.task).border}`,
                }}
              >
                {item.task.baslik || 'Görev'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Saat ızgarası */}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div
          className="shrink-0 border-r border-slate-100 bg-white"
          style={{ width: isWeek ? 48 : TIME_COL_WIDTH }}
        >
          {hours.map((h) => (
            <div
              key={h}
              className="border-b border-slate-100 pr-1.5 text-right text-[10px] font-medium text-slate-400"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              <span className="-mt-2 inline-block">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 bg-white" style={{ height: gridHeight }}>
          {hours.map((h) => (
            <div
              key={`line-${h}`}
              className="absolute left-0 right-0 border-b border-slate-100"
              style={{ top: (h - GRID_START_HOUR) * HOUR_HEIGHT_PX }}
            />
          ))}
          {laidOut.map((item) => {
            const pos = getTimedEventStyle(item, GRID_START_HOUR, HOUR_HEIGHT_PX)
            return (
              <EventCard
                key={item.key}
                item={item}
                onOpen={openTask}
                style={{
                  top: pos.top,
                  height: pos.height,
                  left: `calc(${item.leftPct}% + 2px)`,
                  width: `calc(${item.widthPct}% - 4px)`,
                  zIndex: 2 + item.column,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function TaskTimeGrid({ viewMode, days, tasks, loading }) {
  const isWeek = viewMode === 'week' && days.length > 1
  const singleDay = days[0]

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-sm text-slate-500">Takvim yükleniyor…</div>
    )
  }

  if (!isWeek) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 py-2 text-center text-sm font-bold text-slate-700">
          {singleDay
            ? singleDay.toLocaleDateString('tr-TR', { weekday: 'long' })
            : '—'}
        </div>
        <DayColumn day={singleDay} tasks={tasks} isWeek={false} />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex">
        <div className="w-12 shrink-0 border-r border-slate-100 bg-slate-50" />
        {days.map((day) => (
          <DayColumn key={day.toISOString()} day={day} tasks={tasks} isWeek />
        ))}
      </div>
    </div>
  )
}
