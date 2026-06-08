import React from 'react'
import { Text } from 'react-native'
import TaskDetailSection from './TaskDetailSection'
import { taskDetailStyles as s } from './taskDetailStyles'

export default function TaskDetailMetaCard({ design, accentStyle, sonTarih, assignerLabel }) {
  return (
    <TaskDetailSection design={design} accentStyle={accentStyle}>
      {sonTarih ? (
        <>
          <Text style={s.label}>Son tarih</Text>
          <Text style={s.value}>{sonTarih}</Text>
        </>
      ) : null}
      <Text style={s.label}>Görev atayan</Text>
      <Text style={s.value}>{assignerLabel}</Text>
    </TaskDetailSection>
  )
}
