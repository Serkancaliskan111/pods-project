export default function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={[
        'relative inline-flex h-[26px] w-[48px] shrink-0 cursor-pointer rounded-full border border-slate-200/90 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2',
        disabled ? 'cursor-not-allowed opacity-50' : '',
        checked ? 'border-orange-400/80 bg-[#ea580c] shadow-[0_1px_2px_rgba(234,88,12,0.35)]' : 'bg-slate-200',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'pointer-events-none absolute top-0.5 left-0.5 h-[22px] w-[22px] rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ease-out',
          checked ? 'translate-x-[22px]' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}
