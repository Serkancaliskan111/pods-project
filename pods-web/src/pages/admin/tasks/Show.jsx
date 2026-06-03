import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import TaskDetailPageFrame from '../../../components/tasks/detail/TaskDetailPageFrame.jsx'
import TaskDetailPhotoLightbox from '../../../components/tasks/detail/TaskDetailPhotoLightbox.jsx'
import TaskDetailViewRouter from '../../../components/tasks/detail/views/TaskDetailViewRouter.jsx'
import { buildTaskDetailActions } from '../../../components/tasks/detail/buildTaskDetailActions.jsx'
import { useTaskShowPage } from './hooks/useTaskShowPage.js'
import { coercePhotoUrl } from './taskShow/taskShowUtils.js'

export default function TaskShow() {
  const ctx = useTaskShowPage()
  const {
    navigate,
    previewPhoto,
    previewPhotoAlbum,
    closePhotoPreview,
    lightboxPhotoUrls,
    confirmCtx,
    setConfirmCtx,
    confirmDialogConfig,
    handleConfirmDialogConfirm,
    actioningTaskId,
  } = ctx

  const actions = buildTaskDetailActions(ctx, navigate)

  return (
    <>
      <TaskDetailPageFrame ctx={ctx} actions={actions}>
        <TaskDetailViewRouter ctx={ctx} />
      </TaskDetailPageFrame>

      {previewPhoto && coercePhotoUrl(previewPhoto) ? (
        <TaskDetailPhotoLightbox
          photos={
            previewPhotoAlbum?.length ? previewPhotoAlbum : lightboxPhotoUrls
          }
          currentUrl={coercePhotoUrl(previewPhoto)}
          onClose={closePhotoPreview}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmCtx}
        onClose={() => setConfirmCtx(null)}
        title={confirmDialogConfig?.title || 'Onay'}
        message={confirmDialogConfig?.message || ''}
        confirmLabel={confirmDialogConfig?.confirmLabel || 'Onayla'}
        variant={confirmDialogConfig?.variant || 'default'}
        loading={!!actioningTaskId}
        reasonInput={!!confirmDialogConfig?.reasonInput}
        reasonRequired={!!confirmDialogConfig?.reasonRequired}
        reasonLabel={confirmDialogConfig?.reasonLabel || 'Açıklama'}
        reasonPlaceholder={confirmDialogConfig?.reasonPlaceholder || ''}
        onConfirm={handleConfirmDialogConfirm}
      />
    </>
  )
}
