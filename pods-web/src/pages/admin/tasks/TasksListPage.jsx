import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { useHelpGuideDemo } from '../../../hooks/useHelpGuideDemo.js'
import {
  DEMO_SCENE_LABELS,
  DEMO_TASKS_PENDING,
  isHelpGuideDemoEntity,
} from '../../../lib/helpGuideDemoData.js'
import HelpGuideDemoBanner from '../../../components/cubicle/HelpGuideDemoBanner.jsx'
import getSupabase from '../../../lib/supabaseClient'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { pageSurfaceStyle } from '../../../lib/userUiPreferences'
import { useTasksListPage } from './hooks/useTasksListPage.js'
import { getTaskWorkAction } from '../../../lib/taskWorkEligibility.js'
import TasksPageFilters from './components/TasksPageFilters.jsx'
import TaskListCard from './components/TaskListCard.jsx'
import TaskTimeAccordion from './components/TaskTimeAccordion.jsx'

const supabase = getSupabase()

const PAGE_CONFIG = {
  pending: {
    title: 'Bekleyen görevler',
    description:
      'Devam eden ve onay bekleyen görevleri bugün, yarın ve önümüzdeki 7 güne göre görüntüleyin.',
    quickFilters: [
      { id: 'all', label: 'Tümü' },
      { id: 'assigned_by_me', label: 'Benim atadığım görevler' },
      { id: 'assigned_to_me', label: 'Bana atanan görevler' },
      { id: 'urgent', label: 'Acil görevler' },
    ],
  },
  completed: {
    title: 'Tamamlanan görevler',
    description:
      'Onaylanmış görevleri bugün, dün ve son 7 güne göre gruplu olarak inceleyin.',
    quickFilters: [
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'assigned_by_me', label: 'Benim atadığım' },
      { id: 'urgent', label: 'Acil görevler' },
    ],
  },
}

export default function TasksListPage({ listMode }) {
  const config = PAGE_CONFIG[listMode] || PAGE_CONFIG.pending
  const page = useTasksListPage(listMode)
  const { enabled: demoPending } = useHelpGuideDemo('tasks-pending')

  const requestDeletion = (task) => {
    page.setConfirmCtx({ type: 'delete', task })
  }

  const executeDeletion = async (task, reason) => {
    if (!task?.id || !reason?.trim()) {
      toast.error('Silme nedeni zorunludur')
      return
    }
    page.setActioningTaskId(task.id)
    try {
      const { error } = await supabase.from('isler_silme_talepleri').insert({
        is_id: task.id,
        talep_eden_personel_id: page.personel?.id,
        neden: reason.trim(),
        durum: 'bekliyor',
      })
      if (error) throw error
      toast.success('Silme talebi onaya gönderildi')
      page.reload()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Silme talebi oluşturulamadı')
    } finally {
      page.setActioningTaskId(null)
    }
  }

  const handleConfirm = (reason) => {
    if (page.confirmCtx?.type === 'delete') {
      executeDeletion(page.confirmCtx.task, reason)
    }
    page.setConfirmCtx(null)
  }

  const renderCard = (task) => {
    const isDemo = isHelpGuideDemoEntity(task)
    const actions = isDemo ? {} : page.getCardActions(task)
    const demoLabels = DEMO_SCENE_LABELS['tasks-pending']
    return (
      <TaskListCard
        key={task.id}
        task={task}
        companyName={
          isDemo ? demoLabels.companyName : page.getCompanyName(task.ana_sirket_id)
        }
        assigneeName={
          isDemo ? demoLabels.assigneeName : page.getStaffName(task.sorumlu_personel_id)
        }
        taskTypeLabel={
          isDemo ? demoLabels.taskTypeLabel : page.getTaskTypeLabel(task.gorev_turu)
        }
        showDelete={actions.showDelete}
        showEdit={actions.showEdit}
        deletionPending={actions.deletionPending}
        onDelete={requestDeletion}
        actioning={page.actioningTaskId === task.id}
        workAction={
          isDemo ? null : task.workAction || getTaskWorkAction(task, page.personel?.id)
        }
      />
    )
  }

  const timeSections =
    listMode === 'pending' && page.pendingGroups
      ? [
          {
            key: 'today',
            label: 'Bugün',
            tasks: page.pendingGroups.today,
            emptyText: 'Bugün için görev yok.',
          },
          {
            key: 'tomorrow',
            label: 'Yarın',
            tasks: page.pendingGroups.tomorrow,
            emptyText: 'Yarın için görev yok.',
          },
          {
            key: 'week',
            label: '7 Gün',
            tasks: page.pendingGroups.week,
            emptyText: 'Önümüzdeki 7 gün içinde görev yok.',
          },
        ]
      : listMode === 'completed' && page.completedGroups
        ? [
            {
              key: 'today',
              label: 'Bugün',
              tasks: page.completedGroups.today,
              emptyText: 'Bugün tamamlanan görev yok.',
            },
            {
              key: 'yesterday',
              label: 'Dün',
              tasks: page.completedGroups.yesterday,
              emptyText: 'Dün tamamlanan görev yok.',
            },
            {
              key: 'last7',
              label: 'Son 7 gün',
              tasks: page.completedGroups.last7Days,
              emptyText: 'Bu aralıkta tamamlanan görev yok.',
            },
          ]
        : []

  const hasNoTasks =
    !page.loading &&
    timeSections.length > 0 &&
    timeSections.every((s) => s.tasks.length === 0)

  return (
    <div className="px-4 pb-10 pt-2 sm:px-6" style={pageSurfaceStyle}>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{config.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">{config.description}</p>
      </header>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {config.quickFilters.map((f) => {
            const active =
              listMode === 'pending'
                ? page.quickFilter === f.id
                : page.quickFilter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => page.setQuickFilter(f.id)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  active
                    ? 'bg-[#2563EB] text-white shadow-md'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={page.search}
            onChange={(e) => page.setSearch(e.target.value)}
            placeholder="Görev veya kişi ara…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="mb-6">
        <TasksPageFilters
          companyScoped={page.companyScoped}
          companies={page.companies}
          currentCompanyId={page.currentCompanyId}
          selectedCompanyId={page.selectedCompanyId}
          onCompanyChange={(v) => {
            page.setSelectedCompanyId(v)
            page.setSelectedUnitIds([])
          }}
          selectedTaskType={page.selectedTaskType}
          onTaskTypeChange={page.setSelectedTaskType}
          taskTypeOptions={page.taskTypeOptions}
          getTaskTypeLabel={page.getTaskTypeLabel}
          startDate={page.startDate}
          endDate={page.endDate}
          onStartDateChange={page.setStartDate}
          onEndDateChange={page.setEndDate}
          availableUnitOptions={page.availableUnitOptions}
          selectedUnitIds={page.selectedUnitIds}
          onToggleUnit={page.toggleUnitSelection}
          isUnitMenuOpen={page.isUnitMenuOpen}
          onToggleUnitMenu={() => page.setIsUnitMenuOpen((v) => !v)}
          unitMenuRef={page.unitMenuRef}
        />
      </div>

      {page.loading && !(demoPending && listMode === 'pending') ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : demoPending && listMode === 'pending' ? (
        <div className="space-y-2">
          <HelpGuideDemoBanner className="mb-2" />
          {DEMO_TASKS_PENDING.map((task) => renderCard(task))}
        </div>
      ) : timeSections.length > 0 ? (
        <TaskTimeAccordion sections={timeSections} renderTask={renderCard} />
      ) : null}

      {hasNoTasks ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {listMode === 'completed' ? 'Tamamlanan görev bulunamadı.' : 'Bekleyen görev bulunamadı.'}
        </p>
      ) : null}

      <ConfirmDialog
        open={!!page.confirmCtx}
        onClose={() => page.setConfirmCtx(null)}
        title="Silme talebi"
        message="Bu görev için silme talebi oluşturulsun mu? Onay sürecine gönderilecektir."
        confirmLabel="Talep gönder"
        reasonInput
        reasonRequired
        reasonLabel="Silme nedeni"
        reasonPlaceholder="Silme gerekçesini yazın…"
        onConfirm={handleConfirm}
      />
    </div>
  )
}

