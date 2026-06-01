import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TaskTimeGrid from '../../../components/calendar/TaskTimeGrid.jsx'
import TaskMonthGrid from '../../../components/calendar/TaskMonthGrid.jsx'
import TaskCalendarList from '../../../components/calendar/TaskCalendarList.jsx'
import { useTaskCalendarData } from '../../../hooks/useTaskCalendarData.js'
import {
  CALENDAR_FILTER,
  CALENDAR_VIEW,
  formatCalendarRangeLabel,
  shiftAnchor,
  startOfDay,
} from '../../../lib/taskCalendarUtils.js'

const VIEW_OPTIONS = [
  { id: CALENDAR_VIEW.MONTH, label: 'Ay' },
  { id: CALENDAR_VIEW.WEEK, label: 'Hafta' },
  { id: CALENDAR_VIEW.DAY, label: 'Gün' },
  { id: CALENDAR_VIEW.LIST, label: 'Liste' },
]

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState(CALENDAR_VIEW.DAY)
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()))
  const [taskFilter, setTaskFilter] = useState(CALENDAR_FILTER.MINE)

  const { loading, range, filteredTasks, canManageTeam, taskCount, reload } = useTaskCalendarData({
    viewMode,
    anchorDate,
    taskFilter,
  })

  const rangeLabel = formatCalendarRangeLabel(range.start, range.end, viewMode)

  const goToday = () => setAnchorDate(startOfDay(new Date()))

  const shift = (dir) => {
    setAnchorDate((prev) => shiftAnchor(viewMode, prev, dir))
  }

  const openDayFromMonth = (day) => {
    setAnchorDate(day)
    setViewMode(CALENDAR_VIEW.DAY)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] pb-6">
        {canManageTeam ? (
          <div className="mb-4 flex justify-end">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setTaskFilter(CALENDAR_FILTER.MINE)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  taskFilter === CALENDAR_FILTER.MINE
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Görevlerim
              </button>
              <button
                type="button"
                onClick={() => setTaskFilter(CALENDAR_FILTER.TEAM)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  taskFilter === CALENDAR_FILTER.TEAM
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Personel görevleri
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Üst araç çubuğu — referans tasarım */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shift('prev')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                aria-label="Önceki"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="min-w-[140px] text-center text-sm font-bold text-slate-800">
                {rangeLabel}
              </span>
              <button
                type="button"
                onClick={() => shift('next')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                aria-label="Sonraki"
              >
                <ChevronRight size={20} />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={() => void reload()}
                className="hidden rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 sm:inline"
              >
                Yenile
              </button>
            </div>

            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setViewMode(opt.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    viewMode === opt.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-slate-50 px-4 py-1.5 text-right text-[11px] font-medium text-slate-400">
            {taskCount} görev
          </div>

          <div className="p-2 sm:p-3">
            {viewMode === CALENDAR_VIEW.MONTH ? (
              <TaskMonthGrid
                anchorDate={anchorDate}
                tasks={filteredTasks}
                loading={loading}
                onSelectDay={openDayFromMonth}
              />
            ) : null}

            {viewMode === CALENDAR_VIEW.LIST ? (
              <TaskCalendarList days={range.days} tasks={filteredTasks} loading={loading} />
            ) : null}

            {viewMode === CALENDAR_VIEW.DAY || viewMode === CALENDAR_VIEW.WEEK ? (
              <TaskTimeGrid
                viewMode={viewMode}
                days={range.days}
                tasks={filteredTasks}
                loading={loading}
              />
            ) : null}
          </div>
        </div>
    </div>
  )
}
