import { cn } from '../lib/cn'
import { tones } from './tokens'

export default function IconButton({
  icon,
  tone = 'soft',
  size = 'md',
  className,
  'aria-label': ariaLabel,
  ...rest
}) {
  const t = tones[tone] || tones.soft
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-11 w-11' }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center rounded-full border transition-opacity hover:opacity-90',
        sizes[size] || sizes.md,
        className,
      )}
      style={{ backgroundColor: t.iconBg, borderColor: t.border, color: t.icon }}
      {...rest}
    >
      {icon}
    </button>
  )
}
