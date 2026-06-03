import { cn } from '../../../../lib/cn'

export default function TaskDetailSectionCard({
  title,
  subtitle,
  icon: Icon,
  accent,
  badge,
  headerExtra,
  children,
  className,
  bodyClassName,
  flushBody = false,
  variant = 'default',
}) {
  const hasHeader = title || subtitle || Icon || badge || headerExtra
  const filled = variant === 'filled'

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/80 shadow-[0_1px_4px_rgba(15,23,42,0.06)]',
        filled ? 'bg-white' : 'bg-white',
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4',
            accent && 'border-l-[3px]',
          )}
          style={
            accent
              ? {
                  borderLeftColor: accent,
                  background: `linear-gradient(90deg, ${accent}0f 0%, #fff 55%)`,
                }
              : undefined
          }
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {Icon ? (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ backgroundColor: accent || '#051b3f' }}
              >
                <Icon size={18} strokeWidth={2.25} />
              </span>
            ) : null}
            <div>
              {title ? (
                <h2 className="text-base font-extrabold text-primary-900">{title}</h2>
              ) : null}
              {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {badge}
            {headerExtra}
          </div>
        </div>
      ) : null}
      <div className={cn(flushBody ? '' : 'p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
