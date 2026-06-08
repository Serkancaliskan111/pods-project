import React from 'react'
import { View } from 'react-native'
import TaskFlowWizardFooter from '../tasks/TaskFlowWizardFooter'

/**
 * Görev tamamlama / onay — sabit alt çubuk.
 */
export default function TaskDetailActionFooter({
  showComplete,
  showApprove,
  showReject,
  onComplete,
  onApprove,
  onReject,
  completing,
}) {
  if (!showComplete && !showApprove && !showReject) return null

  if (showReject && showApprove) {
    return (
      <View style={{ gap: 8 }}>
        <TaskFlowWizardFooter
          showBack={false}
          onNext={onApprove}
          nextLabel="Onayla"
          nextVariant="success"
        />
        <TaskFlowWizardFooter
          showBack={false}
          onNext={onReject}
          nextLabel="Reddet"
          nextVariant="danger"
        />
      </View>
    )
  }

  if (showComplete) {
    return (
      <TaskFlowWizardFooter
        showBack={false}
        onNext={onComplete}
        nextLabel={completing ? 'Kaydediliyor…' : 'Görevi Tamamla'}
        nextLoading={completing}
        nextDisabled={completing}
        nextVariant="accent"
      />
    )
  }

  if (showApprove) {
    return (
      <TaskFlowWizardFooter
        showBack={false}
        onNext={onApprove}
        nextLabel="Onayla"
        nextVariant="success"
      />
    )
  }

  return null
}
