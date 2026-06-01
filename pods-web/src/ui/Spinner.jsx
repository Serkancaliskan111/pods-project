import { cn } from '../lib/cn'

export default function Spinner({ className, size = 'md' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-slate-200 border-t-accent-500',
        sizes[size] || sizes.md,
        className,
      )}
      role="status"
      aria-label="Yükleniyor"
    />
  )
}
