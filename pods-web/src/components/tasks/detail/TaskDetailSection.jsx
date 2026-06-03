import { cn } from '../../../lib/cn'
import Text from '../../../ui/Text'

export default function TaskDetailSection({
  title,
  subtitle,
  children,
  className,
  bodyClassName,
  variant = 'default',
}) {
  const elevated = variant === 'elevated'
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-white',
        elevated
          ? 'border-slate-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
          : 'border-slate-200/80',
        className,
      )}
    >
      {title ? (
        <div
          className={cn(
            'border-b border-slate-100 px-4 py-3',
            elevated && 'bg-slate-50/80',
          )}
        >
          <Text variant="h3" className="text-slate-900">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" className="mt-0.5 block text-slate-500">
              {subtitle}
            </Text>
          ) : null}
        </div>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
