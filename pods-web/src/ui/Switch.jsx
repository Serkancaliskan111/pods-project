import { cn } from '../lib/cn'

export default function Switch({ checked, onChange, disabled, className, label }) {
  return (
    <label className={cn('inline-flex items-center gap-2 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-accent-500' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
      {label ? <span className="text-sm font-medium text-slate-700">{label}</span> : null}
    </label>
  )
}
