import { cn } from '../../../../lib/cn'

const LAYOUT_CLASS = {
  audit: 'flex flex-col gap-5',
  checklist: 'flex flex-col gap-5',
  'chain-exec': 'flex flex-col gap-5',
  'chain-approve': 'flex flex-col gap-5',
  'chain-hybrid': 'flex flex-col gap-6',
  sequential: 'flex flex-col gap-5',
}

/**
 * Ana sütun — görev türüne göre dikey ritim ve genişlik.
 */
export default function TaskDetailViewLayout({ layout = 'audit', children, className }) {
  const inner = LAYOUT_CLASS[layout] || LAYOUT_CLASS.audit
  const width =
    layout === 'chain-approve'
      ? 'max-w-4xl mx-auto w-full'
      : layout === 'chain-hybrid'
        ? 'w-full'
        : 'w-full'

  return <div className={cn(width, inner, className)}>{children}</div>
}
