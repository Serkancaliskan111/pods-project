import { cn } from '../lib/cn'
import { tones, palette } from './tokens'

export default function Chip({ tone = 'soft', selected = false, onClick, className, children, ...rest }) {
  const t = tones[tone] || tones.soft
  const isButton = !!onClick
  const Comp = isButton ? 'button' : 'span'
  return (
    <Comp
      type={isButton ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
        isButton && 'cursor-pointer hover:opacity-90',
        selected && 'ring-2 ring-offset-1',
        className,
      )}
      style={{
        backgroundColor: selected ? palette.primary[700] : t.background,
        borderColor: selected ? palette.primary[700] : t.border,
        color: selected ? palette.surface : t.text,
        ...(selected ? { ringColor: palette.accent[500] } : {}),
      }}
      {...rest}
    >
      {children}
    </Comp>
  )
}
