import { cn } from '../lib/cn'
import { palette } from './tokens'

const VARIANTS = {
  primary:
    'bg-primary-700 text-white border-primary-700 hover:bg-primary-600 shadow-[0_10px_20px_rgba(5,27,63,0.32)]',
  accent:
    'bg-[var(--pods-accent-500)] text-white border-[var(--pods-accent-500)] hover:bg-[var(--pods-accent-600)] shadow-[0_8px_18px_var(--pods-accent-shadow)]',
  blurple:
    'bg-blurple-500 text-white border-blurple-500 hover:bg-blurple-600 shadow-[0_8px_18px_rgba(99,91,255,0.24)]',
  secondary:
    'bg-slate-50 text-primary-700 border-slate-100 hover:bg-slate-100',
  ghost: 'bg-transparent text-primary-700 border-transparent hover:bg-slate-50',
  danger: 'bg-danger-500 text-white border-danger-500 hover:bg-danger-600',
  success: 'bg-success-500 text-white border-success-500 hover:bg-success-600',
  outline: 'bg-white text-primary-700 border-slate-200 hover:bg-slate-50',
}

const SIZES = {
  sm: 'h-9 px-4 text-xs gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-[52px] px-6 text-[15px] gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  fullWidth = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'pods-ui-btn-radius inline-flex items-center justify-center border font-semibold transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          aria-hidden
        />
      ) : (
        iconLeft
      )}
      {children ? <span>{children}</span> : null}
      {!loading && iconRight}
    </button>
  )
}

export { palette }
