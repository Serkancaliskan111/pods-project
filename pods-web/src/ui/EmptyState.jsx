import { cn } from '../lib/cn'
import Text from './Text'
import Button from './Button'

export default function EmptyState({ icon, title, description, actionLabel, onAction, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-6 text-center', className)}>
      {icon ? <div className="mb-4 text-slate-300">{icon}</div> : null}
      {title ? <Text variant="h3">{title}</Text> : null}
      {description ? (
        <Text variant="body" className="mt-2 max-w-sm text-slate-500">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="accent" className="mt-6" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
