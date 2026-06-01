import { cn } from '../lib/cn'
import { tones } from './tokens'
import Text from './Text'

const SIZES = {
  sm: 'h-[22px] px-2 text-[10px]',
  md: 'h-7 px-3 text-xs',
  lg: 'h-[34px] px-4 text-[13px]',
}

export default function StatusBadge({
  tone = 'soft',
  icon,
  children,
  size = 'md',
  uppercase = false,
  className,
}) {
  const t = tones[tone] || tones.soft
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full border font-bold',
        SIZES[size] || SIZES.md,
        uppercase && 'uppercase tracking-wide',
        className,
      )}
      style={{ backgroundColor: t.background, borderColor: t.border, color: t.text }}
    >
      {icon}
      {typeof children === 'string' ? <span>{children}</span> : children}
    </span>
  )
}
