import { cn } from '../lib/cn'
import Text from './Text'
import IconBubble from './IconBubble'

export default function Section({
  title,
  subtitle,
  icon,
  tone = 'primary',
  action,
  className,
  children,
}) {
  return (
    <section className={cn('mb-6', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            {icon ? <IconBubble icon={icon} tone={tone} size="md" /> : null}
            <div className="min-w-0">
              {title ? <Text variant="h2">{title}</Text> : null}
              {subtitle ? (
                <Text variant="caption" className="mt-0.5 block">
                  {subtitle}
                </Text>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  )
}
