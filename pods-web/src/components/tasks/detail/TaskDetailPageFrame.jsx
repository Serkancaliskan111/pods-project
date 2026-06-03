import TaskDetailShell from './TaskDetailShell.jsx'
import TaskDetailHeader from './TaskDetailHeader.jsx'
import TaskDetailBody from './TaskDetailBody.jsx'
import TaskDetailSidebar from './TaskDetailSidebar.jsx'
import TaskDetailTimeline from './TaskDetailTimeline.jsx'
import { TaskDetailDeletionAlert } from './TaskDetailAlert.jsx'
import { formatWorkStatusHistoryLine, fetchTaskWorkStatusHistory } from '../../../lib/taskWorkStatusHistory.js'
import getSupabase from '../../../lib/supabaseClient.js'
import { getTaskDetailDesign } from './taskDetailDesign.js'

const supabase = getSupabase()

export default function TaskDetailPageFrame({ ctx, actions, children, sidebarExtra }) {
  const {
    loading,
    task,
    navigate,
    person,
    assigner,
    normalizedStatus,
    isApproved,
    canEditWorkStatus,
    setTask,
    setWorkStatusHistory,
    loadTask,
    chainActiveStep,
    chainTotalSteps,
    pendingDeletion,
    formatTs,
    fullNameOrPersonelRef,
    sidebarDescription,
    managerNote,
    completerNote,
    detailConfig,
    workStatusHistory,
    completionHistory,
    reviewHistory,
    resubmissionCount,
    denetimActorLabel,
  } = ctx

  const design = getTaskDetailDesign(task?.gorev_turu)
  const isNormalTask = design.key === 'normal'

  const sidebar = (
    <>
      <TaskDetailSidebar
        accent={design.accent}
        variant={isNormalTask ? 'dense' : 'default'}
        items={[
          {
            key: 'assignee',
            label: 'Sorumlu',
            value: fullNameOrPersonelRef(person, task?.sorumlu_personel_id),
            icon: 'assignee',
          },
          {
            key: 'assigner',
            label: 'Atayan',
            value: task?.atayan_personel_id
              ? fullNameOrPersonelRef(assigner, task.atayan_personel_id)
              : '—',
            icon: 'assigner',
          },
          {
            key: 'start',
            label: 'Başlangıç',
            value: formatTs(task?.baslama_tarihi),
            icon: 'calendar',
          },
          {
            key: 'end',
            label: 'Bitiş',
            value: formatTs(task?.son_tarih),
            icon: 'calendar',
          },
        ]}
        description={sidebarDescription}
        completerNote={completerNote}
        managerNote={managerNote}
      />
      {sidebarExtra}
      {detailConfig?.timeline ? (
        <TaskDetailTimeline
          resubmissionCount={resubmissionCount}
          workStatusHistory={workStatusHistory}
          completionHistory={completionHistory}
          reviewHistory={reviewHistory}
          formatWorkStatusLine={formatWorkStatusHistoryLine}
          denetimActorLabel={denetimActorLabel}
        />
      ) : null}
    </>
  )

  return (
    <TaskDetailShell loading={loading} notFound={!loading && !task}>
      {task ? (
        <>
          <TaskDetailHeader
            task={task}
            design={design}
            compact={isNormalTask}
            assigneeLabel={fullNameOrPersonelRef(person, task?.sorumlu_personel_id)}
            normalizedStatus={normalizedStatus}
            isApproved={isApproved}
            canEditWorkStatus={canEditWorkStatus}
            onBack={() => navigate('/admin/tasks')}
            alerts={pendingDeletion ? <TaskDetailDeletionAlert pendingDeletion={pendingDeletion} /> : null}
            actions={actions}
            onWorkStatusUpdated={async (next) => {
              setTask((prev) =>
                prev
                  ? {
                      ...prev,
                      calisma_durumu: next,
                      calisma_durumu_guncelleme_at: new Date().toISOString(),
                    }
                  : prev,
              )
              try {
                const hist = await fetchTaskWorkStatusHistory(supabase, task.id)
                setWorkStatusHistory(hist)
              } catch {
                await loadTask()
              }
            }}
          />
          <TaskDetailBody sidebar={sidebar} layout={design.layout}>
            {children}
          </TaskDetailBody>
        </>
      ) : null}
    </TaskDetailShell>
  )
}
