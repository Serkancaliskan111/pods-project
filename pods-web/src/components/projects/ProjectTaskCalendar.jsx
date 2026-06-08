import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TaskTimeGrid from '../calendar/TaskTimeGrid.jsx'
import TaskMonthGrid from '../calendar/TaskMonthGrid.jsx'
import TaskCalendarList from '../calendar/TaskCalendarList.jsx'
import TaskGantt from '../calendar/TaskGantt.jsx'
import CalendarTeamPersonFilter from '../calendar/CalendarTeamPersonFilter.jsx'
import {
  CALENDAR_FILTER,
  CALENDAR_VIEW,
  formatCalendarRangeLabel,
  resolveCalendarRange,
  shiftAnchor,
  startOfDay,
} from '../../lib/taskCalendarUtils.js'
import {
  buildProjectCalendarGanttRows,
  buildProjectTeamPickerOptions,
  filterProjectTasksForCalendar,
  filterProjectTasksInRange,
} from '../../lib/projectCalendarFilter.js'
import {
  getProjectGanttBarColors,
  getProjectGanttStatusLabel,
} from '../../lib/projectGanttUtils.js'
import { mapProjectTasksForPodsUI } from '../../lib/projectTaskPodsAdapter.js'
import { cn } from '../../lib/cn'

const VIEW_OPTIONS = [
  { id: CALENDAR_VIEW.MONTH, label: 'Ay' },
  { id: CALENDAR_VIEW.WEEK, label: 'Hafta' },
  { id: CALENDAR_VIEW.DAY, label: 'Gün' },
  { id: CALENDAR_VIEW.GANTT, label: 'Gantt' },
  { id: CALENDAR_VIEW.LIST, label: 'Liste' },
]

function filterBtnClass(active) {
  return cn(
    'rounded-md px-3 py-1.5 text-xs font-bold transition',
    active ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50',
  )
}

export default function ProjectTaskCalendar({
  project,
  tasks = [],
  teamMembers = [],
  personMap = {},
  personelId,
  loading = false,
  canManage = false,
  onEditTask,
  onNewTaskForAssignee,
  onRefresh,
}) {
  const canUseTeamFilter = canManage && teamMembers.length > 0
  const [viewMode, setViewMode] = useState(CALENDAR_VIEW.GANTT)
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()))
  const [taskFilter, setTaskFilter] = useState(
    canUseTeamFilter ? CALENDAR_FILTER.TEAM : CALENDAR_FILTER.MINE,
  )
  const [selectedTeamPersonelIds, setSelectedTeamPersonelIds] = useState([])

  const teamMemberOptions = useMemo(
    () => buildProjectTeamPickerOptions(teamMembers),
    [teamMembers],
  )

  useEffect(() => {
    if (!project?.baslangic_tarihi) return
    const d = new Date(`${String(project.baslangic_tarihi).slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(d.getTime())) setAnchorDate(startOfDay(d))
  }, [project?.id, project?.baslangic_tarihi])

  useEffect(() => {
    const allowed = new Set(teamMemberOptions.map((r) => String(r.id)))
    setSelectedTeamPersonelIds((prev) => prev.filter((id) => allowed.has(String(id))))
  }, [teamMemberOptions])

  const podsTasks = useMemo(() => mapProjectTasksForPodsUI(tasks), [tasks])

  const range = useMemo(
    () => resolveCalendarRange(viewMode, anchorDate),
    [viewMode, anchorDate],
  )

  const tasksInRange = useMemo(
    () => filterProjectTasksInRange(podsTasks, range.start, range.end),
    [podsTasks, range.start, range.end],
  )

  const effectiveFilter = useMemo(() => {
    if (taskFilter === CALENDAR_FILTER.TEAM && canUseTeamFilter) return CALENDAR_FILTER.TEAM
    if (taskFilter === CALENDAR_FILTER.ALL) return CALENDAR_FILTER.ALL
    return CALENDAR_FILTER.MINE
  }, [taskFilter, canUseTeamFilter])

  const filteredTasks = useMemo(
    () =>
      filterProjectTasksForCalendar(tasksInRange, effectiveFilter, {
        personelId,
        selectedTeamPersonelIds,
        canUseTeamFilter,
      }),
    [tasksInRange, effectiveFilter, personelId, selectedTeamPersonelIds, canUseTeamFilter],
  )

  const ganttRows = useMemo(
    () =>
      buildProjectCalendarGanttRows(filteredTasks, effectiveFilter, {
        personelId,
        personMap,
        teamMembers,
        selectedTeamPersonelIds,
        canUseTeamFilter,
      }),
    [
      filteredTasks,
      effectiveFilter,
      personelId,
      personMap,
      teamMembers,
      selectedTeamPersonelIds,
      canUseTeamFilter,
    ],
  )

  const rangeLabel = formatCalendarRangeLabel(range.start, range.end, viewMode)
  const showTeamPicker =
    canUseTeamFilter && effectiveFilter === CALENDAR_FILTER.TEAM
  const goToday = () => setAnchorDate(startOfDay(new Date()))
  const shift = (dir) => setAnchorDate((prev) => shiftAnchor(viewMode, prev, dir))

  const openDayFromMonth = (day) => {
    setAnchorDate(day)
    setViewMode(CALENDAR_VIEW.DAY)
  }

  const handlePersonRowClick = (row) => {
    if (!canManage || !row?.assigneeId || !onNewTaskForAssignee) return
    onNewTaskForAssignee(String(row.assigneeId))
  }

  const ganttLabelHeader =
    effectiveFilter === CALENDAR_FILTER.MINE ? 'Görev' : 'Görev / Personel'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div
          data-help="project-calendar-filter"
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
        >
          <button
            type="button"
            onClick={() => setTaskFilter(CALENDAR_FILTER.MINE)}
            className={filterBtnClass(taskFilter === CALENDAR_FILTER.MINE)}
          >
            Görevlerim
          </button>
          {canUseTeamFilter ? (
            <button
              type="button"
              onClick={() => setTaskFilter(CALENDAR_FILTER.TEAM)}
              className={filterBtnClass(taskFilter === CALENDAR_FILTER.TEAM)}
            >
              Ekip görevleri
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTaskFilter(CALENDAR_FILTER.ALL)}
            className={filterBtnClass(taskFilter === CALENDAR_FILTER.ALL)}
          >
            Tamamını gör
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="hidden rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 sm:inline"
              >
                Yenile
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {showTeamPicker ? (
              <CalendarTeamPersonFilter
                options={teamMemberOptions}
                selectedIds={selectedTeamPersonelIds}
                onChange={setSelectedTeamPersonelIds}
                loading={loading}
              />
            ) : null}
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setViewMode(opt.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-bold transition',
                    viewMode === opt.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-b border-slate-50 px-4 py-1.5 text-right text-[11px] font-medium text-slate-400">
          {filteredTasks.length} görev
        </div>

        <div className={cn('p-2 sm:p-3', viewMode === CALENDAR_VIEW.GANTT && 'p-0')}>
          {viewMode === CALENDAR_VIEW.MONTH ? (
            <TaskMonthGrid
              anchorDate={anchorDate}
              tasks={filteredTasks}
              loading={loading}
              onSelectDay={openDayFromMonth}
            />
          ) : null}

          {viewMode === CALENDAR_VIEW.LIST ? (
            <TaskCalendarList
              days={range.days}
              tasks={filteredTasks}
              loading={loading}
            />
          ) : null}

          {viewMode === CALENDAR_VIEW.DAY || viewMode === CALENDAR_VIEW.WEEK ? (
            <TaskTimeGrid
              viewMode={viewMode}
              days={range.days}
              tasks={filteredTasks}
              loading={loading}
            />
          ) : null}

          {viewMode === CALENDAR_VIEW.GANTT ? (
            <TaskGantt
              embedded
              days={range.days}
              rangeStart={range.start}
              rangeEnd={range.end}
              rows={ganttRows}
              loading={loading}
              labelHeader={ganttLabelHeader}
              emptyMessage="Seçilen aralıkta görev yok. Filtreyi veya tarih aralığını değiştirin."
              getBarColors={getProjectGanttBarColors}
              getStatusLabel={getProjectGanttStatusLabel}
              onTaskClick={onEditTask}
              onPersonRowClick={
                canManage && onNewTaskForAssignee ? handlePersonRowClick : undefined
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
