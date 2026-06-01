import { cn } from '../../lib/cn'
import { cubicle } from '../../theme/cubicle'

/**
 * Cubicle görünümlü iç sayfa kabuğu (sidebar dışı alan).
 */
export default function CubiclePageShell({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1400px]', className)}>
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h1 className="text-2xl font-extrabold tracking-tight text-primary-900">{title}</h1>
            ) : null}
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  )
}

/** Cubicle yeşil birincil CTA */
export function CubicleCreateButton({ children, onClick, type = 'button', className }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-0 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors cursor-pointer hover:opacity-95',
        className,
      )}
      style={{ backgroundColor: cubicle.greenCta }}
    >
      {children}
    </button>
  )
}

/** Filtre / araç çubuğu kartı */
export function CubicleFilterBar({ children, className }) {
  return (
    <div
      className={cn(
        'mb-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}
