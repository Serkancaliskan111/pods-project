import ChainOnayPipelinePanel from '../panels/ChainOnayPipelinePanel.jsx'
import TaskDetailViewLayout from '../primitives/TaskDetailViewLayout.jsx'

export default function ZincirOnayTaskDetailView({ ctx }) {
  const { design } = ctx

  return (
    <TaskDetailViewLayout layout={design.layout}>
      <ChainOnayPipelinePanel ctx={ctx} design={design} layout="wide" />
    </TaskDetailViewLayout>
  )
}
