import { cn } from '../lib/cn'
import { gradients } from './tokens'
import Text from './Text'

const VARIANT_STOPS = {
  executive: gradients.executive,
  accent: gradients.accent,
  hero: gradients.hero,
  blurple: gradients.blurple,
}

export default function GradientHero({
  variant = 'executive',
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  children,
}) {
  const stops = VARIANT_STOPS[variant] || VARIANT_STOPS.executive
  return (
    <div
      className={cn('relative overflow-hidden rounded-3xl p-6 md:p-8 text-white', className)}
      style={{
        background: `linear-gradient(135deg, ${stops.join(', ')})`,
        boxShadow: '0 10px 24px rgba(5, 27, 63, 0.2)',
      }}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, rgba(255,80,11,0.5) 0%, transparent 70%)' }}
      />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full opacity-15"
        style={{ background: 'radial-gradient(circle, rgba(99,91,255,0.6) 0%, transparent 70%)' }}
      />
      <div className="relative z-[1]">
        {eyebrow ? (
          <Text variant="overline" className="!text-white/75 mb-2 block">
            {eyebrow}
          </Text>
        ) : null}
        {title ? (
          <h1 className="text-[26px] md:text-[32px] font-extrabold tracking-tight leading-tight m-0 text-white">
            {title}
          </h1>
        ) : null}
        {subtitle ? <p className="mt-2 text-sm text-white/80 max-w-xl">{subtitle}</p> : null}
        {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
        {children}
      </div>
    </div>
  )
}
