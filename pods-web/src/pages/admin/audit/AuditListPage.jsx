import { useCallback, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { TASK_STATUS } from '../../../lib/taskStatus.js'
import { logTaskTimelineEvent } from '../../../lib/taskTimeline.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import { pageSurfaceStyle } from '../../../lib/userUiPreferences'
import { useAuditListPage } from './hooks/useAuditListPage.js'
import TasksPageFilters from '../tasks/components/TasksPageFilters.jsx'
import TaskListCard from '../tasks/components/TaskListCard.jsx'
import TaskTimeAccordion from '../tasks/components/TaskTimeAccordion.jsx'

const supabase = getSupabase()

const PAGE_CONFIG = {
  pending: {
    title: 'Onay bekleyenler',
    description: 'Onaya gönderilen görevleri inceleyin, onaylayın veya reddedin.',
    quickFilters: [
      { id: 'assigned_by_me', label: 'Benim atadığım' },
      { id: 'urgent', label: 'Acil görevler' },
    ],
    emptyMessage: 'Onay bekleyen görev bulunamadı.',
  },
  approved: {
    title: 'Onaylananlar',
    description: 'Onaylanmış görevleri filtreleyerek görüntüleyin.',
    quickFilters: [
      { id: 'assigned_by_me', label: 'Benim atadığım' },
      { id: 'assigned_to_me', label: 'Bana atanan' },
      { id: 'urgent', label: 'Acil görevler' },
    ],
    emptyMessage: 'Onaylanan görev bulunamadı.',
  },
}

export default function AuditListPage({ auditMode }) {
  const config = PAGE_CONFIG[auditMode] || PAGE_CONFIG.pending
  const page = useAuditListPage(auditMode)
  const [actioningTaskId, setActioningTaskId] = useState(null)
  const [confirmCtx, setConfirmCtx] = useState(null)

  const reviewAction = useCallback(
    async (task, type, reason = '') => {
      setActioningTaskId(task.id)
      try {
        const payload =
          type === 'approve'
            ? { durum: TASK_STATUS.APPROVED, red_nedeni: null }
            : { durum: TASK_STATUS.REJECTED, red_nedeni: String(reason || '').trim() }
        if (type === 'reject' && !payload.red_nedeni) {
          toast.error('Red nedeni zorunludur')
          return
        }
        let updateQ = supabase.from('isler').update(payload)
        if (task?.grup_id) {
          updateQ = updateQ.eq('grup_id', task.grup_id)
          if (task?.ana_sirket_id) updateQ = updateQ.eq('ana_sirket_id', task.ana_sirket_id)
        } else {
          updateQ = updateQ.eq('id', task.id)
        }
        const { error } = await updateQ
        if (error) throw error
        await logTaskTimelineEvent(task.id, 'review', page.personel?.id, type)
        toast.success(type === 'approve' ? 'Görev onaylandı' : 'Görev reddedildi')
        await page.reload()
      } catch (e) {
        toast.error(e?.message || 'İşlem başarısız')
      } finally {
        setActioningTaskId(null)
      }
    },
    [page],
  )

  const handleConfirm = (reason) => {
    const ctx = confirmCtx
    setConfirmCtx(null)
    if (!ctx?.task) return
    void reviewAction(ctx.task, ctx.type, reason)
  }

  if (!page.canReview) {
    return (
      <div className="px-6 py-10 text-sm text-slate-500">Bu sayfa için yetkiniz yok.</div>
    )
  }

  const isPending = auditMode === 'pending'

  const renderCard = (task) => {
    const isSelfAssigned =
      String(task?.sorumlu_personel_id || '') === String(page.personel?.id || '')
    const actioning = actioningTaskId === task.id
    return (
      <TaskListCard
        key={task.id}
        task={task}
        companyName={page.getCompanyName(task.ana_sirket_id)}
        assigneeName={page.getStaffName(task.sorumlu_personel_id)}
        taskTypeLabel={page.getTaskTypeLabel(task.gorev_turu)}
        showApprove={isPending}
        showReject={isPending}
        approveDisabled={isSelfAssigned}
        rejectDisabled={false}
        onApprove={() => setConfirmCtx({ type: 'approve', task })}
        onReject={() => setConfirmCtx({ type: 'reject', task })}
        actioning={actioning}
      />
    )
  }

  const timeSections =
    isPending && page.pendingGroups
      ? [
          {
            key: 'today',
            label: 'Bugün',
            tasks: page.pendingGroups.today,
            emptyText: 'Bugün için onay bekleyen görev yok.',
          },
          {
            key: 'tomorrow',
            label: 'Yarın',
            tasks: page.pendingGroups.tomorrow,
            emptyText: 'Yarın için onay bekleyen görev yok.',
          },
          {
            key: 'week',
            label: '7 Gün',
            tasks: page.pendingGroups.week,
            emptyText: 'Önümüzdeki 7 gün içinde onay bekleyen görev yok.',
          },
        ]
      : !isPending && page.approvedGroups
        ? [
            {
              key: 'today',
              label: 'Bugün',
              tasks: page.approvedGroups.today,
              emptyText: 'Bugün onaylanan görev yok.',
            },
            {
              key: 'yesterday',
              label: 'Dün',
              tasks: page.approvedGroups.yesterday,
              emptyText: 'Dün onaylanan görev yok.',
            },
            {
              key: 'last7',
              label: 'Son 7 gün',
              tasks: page.approvedGroups.last7Days,
              emptyText: 'Bu aralıkta onaylanan görev yok.',
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
          {config.quickFilters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => page.setQuickFilter(page.quickFilter === f.id ? 'all' : f.id)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                page.quickFilter === f.id
                  ? 'bg-[#2563EB] text-white shadow-md'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
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

      {page.loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : timeSections.length > 0 ? (
        <TaskTimeAccordion sections={timeSections} renderTask={renderCard} />
      ) : null}

      {hasNoTasks ? (
        <p className="py-8 text-center text-sm text-slate-500">{config.emptyMessage}</p>
      ) : null}

      <ConfirmDialog
        open={!!confirmCtx}
        onClose={() => setConfirmCtx(null)}
        title={confirmCtx?.type === 'approve' ? 'Görevi onayla' : 'Görevi reddet'}
        message={
          confirmCtx?.type === 'approve'
            ? 'Bu görevi onaylamak istediğinize emin misiniz?'
            : 'Bu görevi reddetmek için red nedenini yazın.'
        }
        confirmLabel={confirmCtx?.type === 'approve' ? 'Onayla' : 'Reddet'}
        variant={confirmCtx?.type === 'approve' ? 'primary' : 'danger'}
        reasonInput={confirmCtx?.type === 'reject'}
        reasonRequired={confirmCtx?.type === 'reject'}
        reasonLabel="Red nedeni"
        reasonPlaceholder="Red gerekçesini yazın…"
        onConfirm={handleConfirm}
      />
    </div>
  )
}
