import React, { useEffect, useMemo, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useTaskCalendarData } from '../../../hooks/useTaskCalendarData'
import TaskMonthGrid from '../../../components/calendar/TaskMonthGrid'
import TaskWeekStrip from '../../../components/calendar/TaskWeekStrip'
import TaskDayAgenda from '../../../components/calendar/TaskDayAgenda'
import TaskCalendarList from '../../../components/calendar/TaskCalendarList'
import CalendarTeamPersonFilter from '../../../components/calendar/CalendarTeamPersonFilter'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  CALENDAR_FILTER,
  CALENDAR_VIEW,
  formatCalendarRangeLabel,
  shiftAnchor,
  startOfDay,
} from '../../../lib/taskCalendarUtils'
import { Text, palette, spacing, radii } from '../../../ui'

/** Mobilde okunaklı 3 görünüm — saat ızgarası / Gantt telefonda kullanılmaz */
const MOBILE_VIEWS = [
  { id: CALENDAR_VIEW.MONTH, label: 'Ay' },
  { id: CALENDAR_VIEW.DAY, label: 'Gün' },
  { id: CALENDAR_VIEW.LIST, label: 'Liste' },
]

function ViewTab({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.viewTab, active && styles.viewTabActive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <Text variant="caption" weight="Bold" color={active ? palette.primary[700] : palette.slate[500]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function FilterTab({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.filterTab, active && styles.filterTabActive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <Text variant="caption" weight="Bold" color={active ? palette.surface : palette.slate[600]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export default function TaskCalendar() {
  const navigation = useNavigation()
  const [viewMode, setViewMode] = useState(CALENDAR_VIEW.MONTH)
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [taskFilter, setTaskFilter] = useState(CALENDAR_FILTER.MINE)
  const [selectedTeamPersonelIds, setSelectedTeamPersonelIds] = useState([])

  const {
    loading,
    range,
    filteredTasks,
    canManageTeam,
    taskCount,
    teamMemberOptions,
    teamSelectionRequired,
    reload,
  } = useTaskCalendarData({
    viewMode,
    anchorDate,
    taskFilter,
    selectedTeamPersonelIds,
  })

  useEffect(() => {
    const allowed = new Set(teamMemberOptions.map((r) => String(r.id)))
    setSelectedTeamPersonelIds((prev) => prev.filter((id) => allowed.has(String(id))))
  }, [teamMemberOptions])

  const rangeLabel = useMemo(() => {
    if (viewMode === CALENDAR_VIEW.MONTH) {
      return anchorDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    }
    return formatCalendarRangeLabel(range.start, range.end, viewMode)
  }, [viewMode, anchorDate, range.start, range.end])

  const goToday = () => {
    const today = startOfDay(new Date())
    setAnchorDate(today)
    setSelectedDate(today)
  }

  const shift = (dir) => {
    setAnchorDate((prev) => shiftAnchor(viewMode, prev, dir))
    if (viewMode === CALENDAR_VIEW.MONTH) {
      setSelectedDate((prev) => shiftAnchor(CALENDAR_VIEW.MONTH, prev, dir))
    }
  }

  const onSelectDay = (day) => {
    setSelectedDate(day)
    setAnchorDate(day)
  }

  const openTask = (task) => {
    if (task?.id) navigation.navigate('TaskDetail', { taskId: task.id })
  }

  const agendaDay = viewMode === CALENDAR_VIEW.MONTH ? selectedDate : anchorDate

  return (
    <AdminScreenLayout
      title="Takvim"
      scroll
      refreshing={loading}
      onRefresh={() => void reload()}
      screenProps={{ bottomInset: true, contentContainerStyle: styles.screenContent }}
    >
      {/* Ay / Gün / Liste */}
      <View style={styles.viewTabs}>
        {MOBILE_VIEWS.map((v) => (
          <ViewTab
            key={v.id}
            label={v.label}
            active={viewMode === v.id}
            onPress={() => setViewMode(v.id)}
          />
        ))}
      </View>

      {/* Görevlerim / Ekip */}
      {canManageTeam ? (
        <View style={styles.filterRow}>
          <FilterTab
            label="Görevlerim"
            active={taskFilter === CALENDAR_FILTER.MINE}
            onPress={() => setTaskFilter(CALENDAR_FILTER.MINE)}
          />
          <FilterTab
            label="Ekip görevlerim"
            active={taskFilter === CALENDAR_FILTER.TEAM}
            onPress={() => setTaskFilter(CALENDAR_FILTER.TEAM)}
          />
        </View>
      ) : null}

      {canManageTeam && taskFilter === CALENDAR_FILTER.TEAM ? (
        <View style={styles.teamPicker}>
          <CalendarTeamPersonFilter
            options={teamMemberOptions}
            selectedIds={selectedTeamPersonelIds}
            onChange={setSelectedTeamPersonelIds}
            loading={loading}
          />
        </View>
      ) : null}

      {/* Tarih gezinme */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => shift('prev')} hitSlop={8}>
          <ChevronLeft size={22} color={palette.slate[700]} />
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text variant="body" weight="Bold" color={palette.slate[900]} style={styles.navTitle}>
            {rangeLabel}
          </Text>
          <Text variant="caption" color={palette.slate[500]}>
            {taskCount} görev
          </Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={() => shift('next')} hitSlop={8}>
          <ChevronRight size={22} color={palette.slate[700]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.todayPill} onPress={goToday}>
          <Text variant="caption" weight="Bold" color={palette.primary[700]}>
            Bugün
          </Text>
        </TouchableOpacity>
      </View>

      {teamSelectionRequired && !loading ? (
        <View style={styles.teamHint}>
          <Text variant="bodySm" color={palette.slate[600]}>
            Ekip görevlerim için yukarıdan personel seçin.
          </Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        {viewMode === CALENDAR_VIEW.MONTH ? (
          <>
            <TaskMonthGrid
              anchorDate={anchorDate}
              selectedDate={selectedDate}
              tasks={filteredTasks}
              loading={loading}
              onSelectDay={onSelectDay}
            />
            <View style={styles.divider} />
            <TaskDayAgenda
              day={agendaDay}
              tasks={filteredTasks}
              loading={loading}
              onOpenTask={openTask}
            />
          </>
        ) : null}

        {viewMode === CALENDAR_VIEW.DAY ? (
          <>
            <TaskWeekStrip anchorDate={anchorDate} onSelectDay={onSelectDay} />
            <View style={styles.divider} />
            <TaskDayAgenda
              day={anchorDate}
              tasks={filteredTasks}
              loading={loading}
              onOpenTask={openTask}
            />
          </>
        ) : null}

        {viewMode === CALENDAR_VIEW.LIST ? (
          <TaskCalendarList
            days={range.days}
            tasks={filteredTasks}
            loading={loading}
            onOpenTask={openTask}
          />
        ) : null}
      </View>
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing['2xl'],
  },
  viewTabs: {
    flexDirection: 'row',
    backgroundColor: palette.slate[100],
    borderRadius: radii.lg,
    padding: 3,
    marginBottom: spacing.sm,
  },
  viewTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  viewTabActive: {
    backgroundColor: palette.surface,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: palette.slate[100],
  },
  filterTabActive: {
    backgroundColor: palette.primary[600],
  },
  teamPicker: {
    marginBottom: spacing.sm,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
  },
  navCenter: {
    flex: 1,
    minWidth: 0,
  },
  navTitle: {
    textTransform: 'capitalize',
  },
  todayPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.primary[50],
  },
  teamHint: {
    marginBottom: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.lg,
    backgroundColor: palette.primary[50],
  },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.slate[100],
  },
  divider: {
    height: 1,
    backgroundColor: palette.slate[100],
  },
})
