import { cn } from '../lib/cn'
import Card from './Card'
import Text from './Text'
import { tones } from './tokens'

export default function MetricCard({
  label,
  value,
  tone = 'surface',
  size = 'md',
  icon,
  className,
  onClick,
}) {
  const t = tones[tone] || tones.surface
  const isExecutive = tone === 'executive' || tone === 'executiveAccent'
  return (
    <Card
      tone={tone}
      padding="lg"
      radius="2xl"
      elevated
      interactive={!!onClick}
      onClick={onClick}
      className={cn('min-w-0', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text variant="overline" style={{ color: isExecutive ? t.softText : undefined }}>
            {label}
          </Text>
          <p
            className={cn(
              'mt-1 font-extrabold tracking-tight',
              size === 'sm' ? 'text-xl' : 'text-[28px] leading-8',
            )}
            style={{ color: t.text }}
          >
            {value}
          </p>
        </div>
        {icon ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: t.iconBg, color: t.icon }}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  )
}
