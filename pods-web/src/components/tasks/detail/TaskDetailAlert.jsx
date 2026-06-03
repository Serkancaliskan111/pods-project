import { AlertTriangle } from 'lucide-react'
import Text from '../../../ui/Text'
import { formatTaskTs } from './taskDetailUtils.js'

export function TaskDetailDeletionAlert({ pendingDeletion }) {
  if (!pendingDeletion) return null
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <Text variant="h3" className="text-amber-900">
          Silme talebi bekliyor
        </Text>
        <Text variant="caption" className="mt-1 block text-amber-800/90">
          Oluşturulma: {formatTaskTs(pendingDeletion.created_at)}
          {pendingDeletion.talep_aciklama ? (
            <> · Neden: {pendingDeletion.talep_aciklama}</>
          ) : null}
        </Text>
      </div>
    </div>
  )
}
