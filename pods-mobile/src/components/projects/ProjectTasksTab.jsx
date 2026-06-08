import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  SectionList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native'
import { Search } from 'lucide-react-native'
import { useProjectTasksListPage } from '../../hooks/useProjectTasksListPage'
import ProjectTaskListCard from './ProjectTaskListCard'
import TasksListModeSwitch from '../../screens/admin/tasks/components/TasksListModeSwitch'
import { TaskListSectionHeader, SECTION_COLORS } from '../../screens/admin/tasks/components/TaskListSectionHeader'
import { Text, EmptyState, palette, spacing, radii, cubicle } from '../../ui'

const PAGE_CONFIG = {
  pending: {
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'urgent', label: 'Acil' },
      { id: 'overdue', label: 'Geciken' },
    ],
    defaultQuickFilter: 'all',
  },
  completed: {
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
    ],
    defaultQuickFilter: 'all',
  },
  all: {
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'urgent', label: 'Acil' },
      { id: 'overdue', label: 'Geciken' },
    ],
    defaultQuickFilter: 'all',
  },
}

function QuickFilterPill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.quickPill, active && styles.quickPillActive]}
    >
      <Text variant="caption" weight="Bold" color={active ? palette.surface : palette.slate[700]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function buildDefaultOpenMap(sections) {
  const map = {}
  for (const s of sections || []) {
    map[s.key] = (s.tasks?.length ?? 0) > 0
  }
  return map
}

export default function ProjectTasksTab({
  tasks = [],
  personMap = {},
  personelId,
  projectLabel,
  listMode: controlledListMode,
  quickFilter: controlledQuickFilter,
  onListModeChange,
  onQuickFilterChange,
  refreshing = false,
  onRefresh,
  onOpenTask,
  canManage = false,
  onEditTask,
  onDeleteTask,
  onLaunchOperational,
  bottomPad = 0,
}) {
  const [listMode, setListMode] = useState(controlledListMode || 'pending')
  const config = PAGE_CONFIG[listMode] || PAGE_CONFIG.pending

  const page = useProjectTasksListPage({
    tasks,
    listMode,
    personelId,
    personMap,
    projectLabel,
    initialQuickFilter: controlledQuickFilter || config.defaultQuickFilter,
  })

  useEffect(() => {
    if (controlledListMode && controlledListMode !== listMode) {
      setListMode(controlledListMode)
    }
  }, [controlledListMode, listMode])

  useEffect(() => {
    if (controlledQuickFilter) page.setQuickFilter(controlledQuickFilter)
  }, [controlledQuickFilter, page])

  const handleListMode = useCallback(
    (mode) => {
      setListMode(mode)
      onListModeChange?.(mode)
      page.setQuickFilter(PAGE_CONFIG[mode]?.defaultQuickFilter || 'all')
    },
    [onListModeChange, page],
  )

  const handleQuickFilter = useCallback(
    (id) => {
      page.setQuickFilter(id)
      onQuickFilterChange?.(id)
    },
    [onQuickFilterChange, page],
  )

  const timeSections = useMemo(() => {
    if (listMode === 'all') {
      return [
        {
          key: 'all',
          label: 'Tüm görevler',
          tasks: page.filteredTasks,
          subtitle: 'Proje görevleri',
          emptyText: 'Görev bulunamadı.',
        },
      ]
    }
    if (listMode === 'pending' && page.pendingGroups) {
      return [
        {
          key: 'today',
          label: 'Bugün',
          tasks: page.pendingGroups.today,
          subtitle: 'Gecikmiş ve bugün bitenler',
          emptyText: 'Bugün için görev yok.',
        },
        {
          key: 'tomorrow',
          label: 'Yarın',
          tasks: page.pendingGroups.tomorrow,
          subtitle: 'Yarın biten görevler',
          emptyText: 'Yarın için görev yok.',
        },
        {
          key: 'week',
          label: '7 Gün',
          tasks: page.pendingGroups.week,
          subtitle: '2–7 gün içinde bitenler',
          emptyText: 'Önümüzdeki 7 gün içinde görev yok.',
        },
      ]
    }
    if (listMode === 'completed' && page.completedGroups) {
      return [
        {
          key: 'today',
          label: 'Bugün',
          tasks: page.completedGroups.today,
          subtitle: 'Bugün tamamlananlar',
          emptyText: 'Bugün tamamlanan görev yok.',
        },
        {
          key: 'yesterday',
          label: 'Dün',
          tasks: page.completedGroups.yesterday,
          subtitle: 'Dün tamamlananlar',
          emptyText: 'Dün tamamlanan görev yok.',
        },
        {
          key: 'last7',
          label: 'Son 7 gün',
          tasks: page.completedGroups.last7Days,
          subtitle: 'Dünden önceki tamamlananlar',
          emptyText: 'Bu aralıkta tamamlanan görev yok.',
        },
      ]
    }
    return []
  }, [listMode, page.filteredTasks, page.pendingGroups, page.completedGroups])

  const [openSectionKeys, setOpenSectionKeys] = useState(() => buildDefaultOpenMap(timeSections))

  useEffect(() => {
    setOpenSectionKeys(buildDefaultOpenMap(timeSections))
  }, [timeSections, listMode])

  const sectionListData = useMemo(
    () =>
      timeSections.map((section) => ({
        ...section,
        data:
          openSectionKeys[section.key] !== false
            ? section.tasks?.length
              ? section.tasks
              : [{ id: `__empty_${section.key}`, __sectionEmpty: true, emptyText: section.emptyText }]
            : [],
      })),
    [timeSections, openSectionKeys],
  )

  const hasNoTasks =
    timeSections.length > 0 && timeSections.every((s) => (s.tasks?.length ?? 0) === 0)

  const toggleSection = useCallback((key) => {
    setOpenSectionKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const renderCard = useCallback(
    (task) => (
      <ProjectTaskListCard
        task={task}
        companyName={page.getCompanyName()}
        assigneeName={page.getStaffName(task.sorumlu_personel_id)}
        taskTypeLabel={page.getTaskTypeLabel(task.gorev_turu || task.gorev_tipi)}
        onPress={onOpenTask}
        showEdit={canManage}
        onEdit={onEditTask}
        onDelete={onDeleteTask}
      />
    ),
    [onOpenTask, onEditTask, onDeleteTask, canManage, page],
  )

  const listHeader = (
    <View style={styles.listHeader}>
      {listMode !== 'all' ? (
        <TasksListModeSwitch
          mode={listMode}
          onChange={handleListMode}
          pendingCount={page.modeCounts.pending}
          completedCount={page.modeCounts.completed}
        />
      ) : (
        <View style={styles.allModeBanner}>
          <Text variant="bodySm" weight="Bold" color={palette.primary[800]}>
            Tüm görevler
          </Text>
          <Text variant="caption" color={palette.slate[500]}>
            {page.modeCounts.all} görev · bekleyen ve tamamlanan birlikte
          </Text>
        </View>
      )}

      {page.filteredTasks.length > 0 ? (
        <Text variant="caption" weight="SemiBold" color={palette.slate[500]} style={styles.summaryLine}>
          {page.filteredTasks.length} görev listeleniyor
          {page.quickFilter !== 'all' ? ' · filtre aktif' : ''}
        </Text>
      ) : null}

      <View style={styles.filterCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickScroll}
        >
          {config.quickFilters.map((f) => (
            <QuickFilterPill
              key={f.id}
              label={f.label}
              active={page.quickFilter === f.id}
              onPress={() => handleQuickFilter(f.id)}
            />
          ))}
        </ScrollView>

        <View style={styles.searchWrap}>
          <Search size={18} color={palette.slate[400]} strokeWidth={2} />
          <TextInput
            value={page.search}
            onChangeText={page.setSearch}
            placeholder="Görev veya kişi ara…"
            placeholderTextColor={palette.slate[400]}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {hasNoTasks && page.filteredTasks.length === 0 && tasks.length > 0 ? (
        <View style={styles.emptyBox}>
          <Text variant="bodyMd" weight="SemiBold" color={palette.slate[700]}>
            {listMode === 'completed' ? 'Tamamlanan görev yok' : 'Bekleyen görev yok'}
          </Text>
          <Text variant="bodySm" color={palette.slate[500]} style={{ marginTop: 4, textAlign: 'center' }}>
            Filtreleri değiştirmeyi veya aramayı sıfırlamayı deneyin.
          </Text>
        </View>
      ) : null}
    </View>
  )

  if (!tasks.length) {
    return (
      <ScrollView
        contentContainerStyle={[styles.emptyWrap, { paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {listHeader}
        <EmptyState
          title="Henüz görev yok"
          description="Bu projede planlanmış görev bulunmuyor."
        />
      </ScrollView>
    )
  }

  return (
    <SectionList
      sections={sectionListData}
      keyExtractor={(item, index) =>
        item.__sectionEmpty ? `empty-${item.id || index}` : String(item.id)
      }
      renderSectionHeader={({ section }) => (
        <TaskListSectionHeader
          label={section.label}
          count={section.tasks?.length ?? 0}
          color={SECTION_COLORS[section.key] || cubicle.todayBar}
          open={openSectionKeys[section.key] !== false}
          subtitle={section.subtitle}
          onToggle={() => toggleSection(section.key)}
        />
      )}
      renderItem={({ item, section }) =>
        item.__sectionEmpty ? (
          openSectionKeys[section.key] !== false ? (
            <Text variant="caption" color={palette.slate[500]} style={styles.sectionEmpty}>
              {item.emptyText}
            </Text>
          ) : null
        ) : (
          <View style={styles.cardWrap}>{renderCard(item)}</View>
        )
      }
      ListHeaderComponent={listHeader}
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: bottomPad }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
      SectionSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListEmptyComponent={
        page.filteredTasks.length === 0 ? (
          <EmptyState
            title={listMode === 'completed' ? 'Tamamlanan görev yok' : 'Görev bulunamadı'}
            description="Filtreleri değiştirmeyi veya aramayı sıfırlamayı deneyin."
          />
        ) : null
      }
    />
  )
}

const styles = StyleSheet.create({
  listHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  summaryLine: {
    marginTop: -2,
  },
  allModeBanner: {
    backgroundColor: palette.primary[50],
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.primary[100],
    padding: spacing.md,
    gap: 2,
  },
  filterCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    padding: spacing.sm,
    gap: spacing.sm,
  },
  quickScroll: {
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  quickPill: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: palette.slate[100],
  },
  quickPillActive: {
    backgroundColor: palette.primary[600],
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 4,
    backgroundColor: palette.slate[50],
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: palette.slate[800],
    paddingVertical: spacing.xs,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  cardWrap: {
    marginBottom: spacing.sm,
  },
  sectionEmpty: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  emptyWrap: {
    paddingHorizontal: spacing.md,
    flexGrow: 1,
  },
})
