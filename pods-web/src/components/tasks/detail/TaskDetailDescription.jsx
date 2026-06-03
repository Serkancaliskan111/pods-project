import TaskDetailSection from './TaskDetailSection.jsx'
import Text from '../../../ui/Text'

export default function TaskDetailDescription({ text, title = 'Görev açıklaması' }) {
  const body = String(text || '').trim()
  if (!body) return null
  return (
    <TaskDetailSection title={title} variant="elevated">
      <Text variant="body" className="whitespace-pre-wrap leading-relaxed text-slate-700">
        {body}
      </Text>
    </TaskDetailSection>
  )
}
