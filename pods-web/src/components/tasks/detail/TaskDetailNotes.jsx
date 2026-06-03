import TaskDetailSection from './TaskDetailSection.jsx'
import Text from '../../../ui/Text'

export default function TaskDetailNotes({ managerNote, completerNote }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TaskDetailSection title="Yönetici / denetimci notu" variant="elevated">
        <Text variant="body" className="whitespace-pre-wrap text-slate-700 leading-relaxed">
          {managerNote || 'Not bulunmuyor.'}
        </Text>
      </TaskDetailSection>
      <TaskDetailSection title="Personel notu" variant="elevated">
        <Text variant="body" className="whitespace-pre-wrap text-slate-700 leading-relaxed">
          {completerNote || 'Tamamlayan tarafından not girilmemiş.'}
        </Text>
      </TaskDetailSection>
    </div>
  )
}
