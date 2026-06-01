import { cn } from '../lib/cn'
import { tones, shadowCss } from './tokens'

const PADDINGS = {
  none: 'p-0',
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-5',
  xl: 'p-6',
}

const RADIUS = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-[20px]',
  '2xl': 'rounded-3xl',
}

export default function Card({
  tone = 'surface',
  elevated = false,
  floating = false,
  interactive = false,
  onClick,
  padding = 'md',
  radius = '2xl',
  className,
  style,
  children,
  ...rest
}) {
  const t = tones[tone] || tones.surface
  const shadow = floating ? shadowCss.lg : elevated ? shadowCss.md : shadowCss.sm
  const isButton = interactive || onClick

  const radiusClass =
    radius === '2xl' ? 'pods-ui-card-radius' : RADIUS[radius] || RADIUS['2xl']

  const baseClass = cn(
    'border text-left',
    isButton ? 'w-full cursor-pointer transition-all hover:brightness-[0.98] active:scale-[0.995]' : 'block',
    PADDINGS[padding] ?? PADDINGS.md,
    radiusClass,
    className,
  )

  const mergedStyle = {
    backgroundColor: t.background,
    borderColor: t.border,
    color: t.text,
    boxShadow: shadow,
    ...style,
  }

  if (isButton) {
    return (
      <button type="button" className={baseClass} style={mergedStyle} onClick={onClick} {...rest}>
        {children}
      </button>
    )
  }

  return (
    <div className={baseClass} style={mergedStyle} {...rest}>
      {children}
    </div>
  )
}
