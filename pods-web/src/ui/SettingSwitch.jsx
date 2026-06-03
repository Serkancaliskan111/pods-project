import { cn } from '../lib/cn'

const ACCENTS = {
  emerald: {
    on: 'bg-emerald-500',
    ring: 'focus-visible:ring-emerald-500/30',
    activeBg: 'bg-emerald-50 border-emerald-200/80',
  },
  indigo: {
    on: 'bg-indigo-600',
    ring: 'focus-visible:ring-indigo-500/30',
    activeBg: 'bg-indigo-50 border-indigo-200/80',
  },
  blue: {
    on: 'bg-blue-600',
    ring: 'focus-visible:ring-blue-500/30',
    activeBg: 'bg-blue-50 border-blue-200/80',
  },
}

function SwitchTrack({ id, checked, disabled, onChange, size = 'md', accent = 'indigo' }) {
  const a = ACCENTS[accent] || ACCENTS.indigo
  const sm = size === 'sm'
  // Track içinde thumb: solda/sağda 2px boşluk (taşma olmaması için left kullanılır)
  const thumbClass = sm ? 'h-[18px] w-[18px] top-[2px]' : 'h-5 w-5 top-0.5'
  const thumbOff = sm ? 'left-[2px]' : 'left-0.5'
  const thumbOn = sm ? 'left-[20px]' : 'left-[22px]'

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        a.ring,
        sm ? 'h-[22px] w-[40px]' : 'h-6 w-11',
        checked ? a.on : 'bg-slate-300/90',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.15)] transition-[left] duration-200 ease-out',
          thumbClass,
          checked ? thumbOn : thumbOff,
        )}
      />
    </button>
  )
}

/**
 * @param {'card'|'row'|'toolbar'} variant
 */
export default function SettingSwitch({
  id,
  checked,
  onChange,
  disabled = false,
  label,
  description,
  variant = 'card',
  accent = 'indigo',
  className,
}) {
  const a = ACCENTS[accent] || ACCENTS.indigo

  if (variant === 'toolbar') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2.5 rounded-lg border px-3 py-1.5 transition-colors',
          checked ? a.activeBg : 'border-slate-200/90 bg-white',
          disabled && 'opacity-50',
          className,
        )}
      >
        <label htmlFor={id} className="cursor-pointer text-xs font-semibold text-slate-700">
          {label}
        </label>
        <SwitchTrack
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          size="sm"
          accent={accent}
        />
      </div>
    )
  }

  if (variant === 'row') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-4 px-4 py-3.5 transition-colors',
          disabled && 'opacity-50',
          className,
        )}
      >
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">{label}</div>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        <SwitchTrack id={id} checked={checked} disabled={disabled} onChange={onChange} accent={accent} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3.5',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <SwitchTrack id={id} checked={checked} disabled={disabled} onChange={onChange} accent={accent} />
    </div>
  )
}
