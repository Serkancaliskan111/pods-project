import TaskDetailActionBar, { TaskDetailActionButton } from './TaskDetailActionBar.jsx'

export function buildTaskDetailActions(ctx, navigate) {
  const {
    task,
    showActionBar,
    showCompleteBtn,
    isSiraliTask,
    canSiraliAudit,
    canManageTask,
    showApproveBtn,
    showOperationalEdit,
    showDeleteTaskBtn,
    isApproved,
    isRejected,
    isSelfAssignedTask,
    approveDisabled,
    rejectDisabled,
    actioningTaskId,
    requestApprove,
    requestReject,
    requestDeletion,
    reviewSiraliStep,
  } = ctx

  if (!task || !showActionBar) return null

  return (
    <TaskDetailActionBar>
      {showCompleteBtn ? (
        <TaskDetailActionButton
          variant="success"
          onClick={() => navigate(`/admin/tasks/${task.id}/complete`)}
        >
          Kanıt yükle ve tamamla
        </TaskDetailActionButton>
      ) : null}
      {isSiraliTask && canSiraliAudit ? (
        <>
          <TaskDetailActionButton
            variant="success"
            disabled={actioningTaskId === task.id}
            onClick={() => void reviewSiraliStep('onayla')}
          >
            Onayla
          </TaskDetailActionButton>
          <TaskDetailActionButton
            variant="danger"
            disabled={actioningTaskId === task.id}
            onClick={() => void reviewSiraliStep('reddet')}
          >
            Reddet
          </TaskDetailActionButton>
        </>
      ) : null}
      {canManageTask && showApproveBtn ? (
        <>
          <TaskDetailActionButton
            variant="success"
            disabled={approveDisabled}
            onClick={requestApprove}
            title={
              isApproved
                ? 'Bu görev zaten onaylandı'
                : isSelfAssignedTask
                  ? 'Görevi yapan kişi kendi görevini onaylayamaz'
                  : 'Görevi onayla'
            }
          >
            Onayla
          </TaskDetailActionButton>
          <TaskDetailActionButton
            variant="danger"
            disabled={rejectDisabled}
            onClick={requestReject}
            title={
              isApproved
                ? 'Onaylanmış görev reddedilemez'
                : isRejected
                  ? 'Bu görev zaten reddedildi'
                  : 'Görevi reddet'
            }
          >
            Reddet
          </TaskDetailActionButton>
        </>
      ) : null}
      {showOperationalEdit ? (
        <TaskDetailActionButton
          variant="outline"
          onClick={() => navigate(`/admin/tasks/${task.id}/edit`)}
          title="Görev içeriğini düzenle"
        >
          Düzenle
        </TaskDetailActionButton>
      ) : null}
      {showDeleteTaskBtn ? (
        <TaskDetailActionButton
          variant="danger"
          disabled={actioningTaskId === task.id}
          onClick={requestDeletion}
          title="Silme talebini onaya gönder"
        >
          Sil
        </TaskDetailActionButton>
      ) : null}
    </TaskDetailActionBar>
  )
}
