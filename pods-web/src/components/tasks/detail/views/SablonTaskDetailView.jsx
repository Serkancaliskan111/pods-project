import ChecklistReviewPanel from '../panels/ChecklistReviewPanel.jsx'
import TaskReferenceMediaPanel from '../panels/TaskReferenceMediaPanel.jsx'
import TaskDetailViewLayout from '../primitives/TaskDetailViewLayout.jsx'
import TaskDetailChecklistStats from '../primitives/TaskDetailChecklistStats.jsx'

export default function SablonTaskDetailView({ ctx }) {
  const { design } = ctx

  return (
    <TaskDetailViewLayout layout={design.layout}>
      <TaskDetailChecklistStats ctx={ctx} design={design} />
      <ChecklistReviewPanel ctx={ctx} design={design} />
      <TaskReferenceMediaPanel
        taskReferenceMedia={ctx.taskReferenceMedia}
        onPreview={ctx.openPhotoPreview}
        accent={design.accent}
      />
    </TaskDetailViewLayout>
  )
}
