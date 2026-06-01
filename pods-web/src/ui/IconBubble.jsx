import { cn } from '../lib/cn'
import { tones } from './tokens'

const SIZES = {
  sm: 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-12 w-12 [&_svg]:h-6 [&_svg]:w-6',
}

export default function IconBubble({ icon, tone = 'primary', size = 'md', className }) {
  const t = tones[tone] || tones.primary
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-2xl', SIZES[size], className)}
      style={{ backgroundColor: t.iconBg, color: t.icon }}
    >
      {icon}
    </span>
  )
}
