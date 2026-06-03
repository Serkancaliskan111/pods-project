import ChainGorevStepsPanel from '../panels/ChainGorevStepsPanel.jsx'
import TaskReferenceMediaPanel from '../panels/TaskReferenceMediaPanel.jsx'
import TaskDetailViewLayout from '../primitives/TaskDetailViewLayout.jsx'

export default function ZincirGorevTaskDetailView({ ctx }) {
  const { design } = ctx

  return (
    <TaskDetailViewLayout layout={design.layout}>
      <ChainGorevStepsPanel ctx={ctx} design={design} variant="exec" />
      <TaskReferenceMediaPanel
        taskReferenceMedia={ctx.taskReferenceMedia}
        onPreview={ctx.openPhotoPreview}
        accent={design.accent}
      />
    </TaskDetailViewLayout>
  )
}
