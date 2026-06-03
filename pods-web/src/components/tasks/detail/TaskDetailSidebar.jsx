import { Calendar, MessageSquare, User, UserPlus } from 'lucide-react'
import { cn } from '../../../lib/cn'

const ICONS = { assignee: User, assigner: UserPlus, calendar: Calendar }

/** Tek satır: solda etiket, sağda değer — okunaklı özet */
function MetaLine({ icon = 'assignee', label, value }) {
  const Icon = ICONS[icon] || User
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-slate-500">
        <Icon size={14} className="shrink-0 text-slate-400" strokeWidth={2} />
        <span className="font-medium">{label}</span>
      </span>
      <span className="max-w-[58%] shrink-0 text-right font-semibold leading-snug text-primary-900">
        {value}
      </span>
    </div>
  )
}

export default function TaskDetailSidebar({
  items = [],
  description,
  completerNote,
  managerNote,
  accent,
  className,
  variant = 'default',
}) {
  const desc = String(description || '').trim()
  const emp = String(completerNote || '').trim()
  const mgr = String(managerNote || '').trim()
  const showMgr = mgr && mgr !== desc
  const bar = accent || '#2563EB'
  const dense = variant === 'dense'

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div
            className={cn('border-b border-slate-100 px-3', dense ? 'py-2' : 'py-2.5')}
            style={{ borderLeftWidth: 3, borderLeftColor: bar }}
          >
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Görev bilgileri
            </h3>
          </div>
          <dl className={cn('divide-y divide-slate-100', dense ? 'px-3 py-1' : 'px-3 py-0.5')}>
            {items.map(({ key, label, value, icon }) => (
              <MetaLine key={key || label} icon={icon} label={label} value={value} />
            ))}
          </dl>
        </div>
      ) : null}

      {(desc || emp || showMgr) ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Notlar
            </h3>
          </div>
          <div className="space-y-3 px-3 py-3 text-sm text-slate-600">
            {desc ? (
              <div>
                <p className="text-xs font-medium text-slate-400">Görev açıklaması</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700">{desc}</p>
              </div>
            ) : null}
            {emp ? (
              <div className={desc ? 'border-t border-slate-100 pt-3' : ''}>
                <p className="text-xs font-medium text-slate-400">Personel notu</p>
                <p className="mt-1 whitespace-pre-wrap">{emp}</p>
              </div>
            ) : null}
            {showMgr ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                <p className="text-xs font-semibold text-amber-800">Denetim / red notu</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{mgr}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
