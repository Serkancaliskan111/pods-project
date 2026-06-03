import ChainGorevStepsPanel from '../panels/ChainGorevStepsPanel.jsx'
import ChainOnayPipelinePanel from '../panels/ChainOnayPipelinePanel.jsx'
import TaskDetailViewLayout from '../primitives/TaskDetailViewLayout.jsx'
import TaskDetailPhaseBlock from '../primitives/TaskDetailPhaseBlock.jsx'
import { getGorevModuOption } from '../../../../lib/gorevModuOptions.js'

export default function ZincirHybridTaskDetailView({ ctx }) {
  const { design } = ctx
  const execColor = getGorevModuOption('zincir_gorev').color
  const approveColor = getGorevModuOption('zincir_onay').color

  return (
    <TaskDetailViewLayout layout={design.layout}>
      <TaskDetailPhaseBlock
        phase="1"
        title="Yürütme zinciri"
        subtitle="Sırayla görev devri ve adım kanıtları"
        accent={execColor}
      >
        <ChainGorevStepsPanel ctx={ctx} design={{ ...design, accent: execColor }} variant="embedded" />
      </TaskDetailPhaseBlock>
      <TaskDetailPhaseBlock
        phase="2"
        title="Onay zinciri"
        subtitle="Yürütme tamamlandıktan sonra onaylayıcı sırası"
        accent={approveColor}
      >
        <ChainOnayPipelinePanel
          ctx={ctx}
          design={{ ...design, accent: approveColor }}
          layout="wide"
          variant="embedded"
        />
      </TaskDetailPhaseBlock>
    </TaskDetailViewLayout>
  )
}
