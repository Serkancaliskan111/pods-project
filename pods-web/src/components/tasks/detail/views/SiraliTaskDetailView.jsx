import SiraliStepsPanel from '../panels/SiraliStepsPanel.jsx'
import TaskReferenceMediaPanel from '../panels/TaskReferenceMediaPanel.jsx'
import TaskDetailViewLayout from '../primitives/TaskDetailViewLayout.jsx'

export default function SiraliTaskDetailView({ ctx }) {
  const { design } = ctx

  return (
    <TaskDetailViewLayout layout={design.layout}>
      <SiraliStepsPanel ctx={ctx} design={design} />
      <TaskReferenceMediaPanel
        taskReferenceMedia={ctx.taskReferenceMedia}
        onPreview={ctx.openPhotoPreview}
        accent={design.accent}
      />
    </TaskDetailViewLayout>
  )
}
