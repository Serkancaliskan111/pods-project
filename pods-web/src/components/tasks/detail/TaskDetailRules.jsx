import { Chip } from '../../../ui'
import TaskDetailSection from './TaskDetailSection.jsx'
import { buildTaskRuleChips } from './taskDetailConfig.js'

const CHIP_TONE = {
  danger: 'danger',
  primary: 'primary',
  warning: 'warning',
  success: 'success',
  soft: 'soft',
}

export default function TaskDetailRules({ task }) {
  const chips = buildTaskRuleChips(task)
  if (!chips.length) return null
  return (
    <TaskDetailSection title="Görev kuralları" subtitle="Tamamlama ve görünürlük koşulları">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Chip key={c.key} tone={CHIP_TONE[c.tone] || 'soft'}>
            {c.label}
          </Chip>
        ))}
      </div>
    </TaskDetailSection>
  )
}
