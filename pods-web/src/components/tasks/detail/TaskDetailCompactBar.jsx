import Text from '../../../ui/Text'
import { cn } from '../../../lib/cn'

function truncate(str, max = 100) {
  const s = String(str || '').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * Özet meta + notlar — tek satırlık kompakt şerit (scroll azaltmak için).
 */
export default function TaskDetailCompactBar({
  items = [],
  managerNote,
  completerNote,
  description,
  className,
}) {
  const mgr = truncate(managerNote, 80)
  const emp = truncate(completerNote, 80)
  const desc = truncate(description, 140)
  const hasNotes = mgr || emp
  const hasDesc = !!desc

  if (!items.length && !hasNotes && !hasDesc) return null

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-[11px] leading-snug text-slate-600',
        className,
      )}
    >
      {items.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {items.map(({ key, label, value }) => (
            <div key={key || label} className="inline-flex min-w-0 max-w-full gap-1">
              <dt className="shrink-0 text-slate-400">{label}</dt>
              <dd className="truncate font-semibold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hasDesc ? (
        <p className={cn('text-slate-700', items.length > 0 && 'mt-1 border-t border-slate-100 pt-1')}>
          <span className="font-semibold text-slate-400">Açıklama: </span>
          {desc}
        </p>
      ) : null}

      {hasNotes ? (
        <div
          className={cn(
            'flex flex-wrap gap-x-3 gap-y-0.5',
            (items.length > 0 || hasDesc) && 'mt-1 border-t border-slate-100 pt-1',
          )}
        >
          {mgr ? (
            <span className="min-w-0 max-w-full">
              <span className="font-semibold text-slate-400">Yön. </span>
              <span className="text-slate-700">{mgr}</span>
            </span>
          ) : null}
          {emp ? (
            <span className="min-w-0 max-w-full">
              <span className="font-semibold text-slate-400">Pers. </span>
              <span className="text-slate-700">{emp}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
