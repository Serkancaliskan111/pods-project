import { cn } from '../lib/cn'
import Text from './Text'
import Button from './Button'

export default function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  back,
  className,
}) {
  return (
    <header className={cn('mb-6', className)}>
      {breadcrumb ? (
        <Text variant="caption" className="mb-2 block">
          {breadcrumb}
        </Text>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-3">
          {back}
          <div>
            {title ? <Text variant="displayMd" as="h1">{title}</Text> : null}
            {subtitle ? (
              <Text variant="body" className="mt-1 text-slate-500 block">
                {subtitle}
              </Text>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}
