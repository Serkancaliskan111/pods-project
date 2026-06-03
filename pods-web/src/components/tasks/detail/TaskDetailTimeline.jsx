import { ChevronDown, History } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatTaskTs } from './taskDetailUtils.js'

function TimelineBlock({ title, empty, children }) {
  return (
    <div>
      <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      {empty ? (
        <p className="text-sm text-slate-400">Kayıt yok</p>
      ) : (
        <ul className="relative space-y-0 border-l-2 border-slate-200 pl-4">{children}</ul>
      )}
    </div>
  )
}

function TimelineItem({ children, isLast }) {
  return (
    <li className={cn('relative pb-4', isLast && 'pb-0')}>
      <span
        className="absolute -left-[calc(0.5rem+5px)] top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary-500 ring-2 ring-primary-100"
        aria-hidden
      />
      <div className="text-sm leading-snug text-slate-600">{children}</div>
    </li>
  )
}

export default function TaskDetailTimeline({
  resubmissionCount = 0,
  workStatusHistory = [],
  completionHistory = [],
  reviewHistory = [],
  formatWorkStatusLine,
  denetimActorLabel,
}) {
  const entryCount =
    workStatusHistory.length + completionHistory.length + reviewHistory.length

  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-slate-50/80',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-primary-900">
          <History size={16} className="text-slate-400" />
          Aktivite
          {entryCount > 0 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {entryCount}
            </span>
          ) : null}
        </span>
        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-slate-100 px-4 py-4">
        <TimelineBlock title="Çalışma durumu" empty={workStatusHistory.length === 0}>
          {workStatusHistory.map((row, i) => {
            const line = formatWorkStatusLine(row)
            return (
              <TimelineItem key={row.id} isLast={i === workStatusHistory.length - 1}>
                <span className="font-semibold text-primary-900">{line.at}</span>
                <span className="text-slate-500"> — {line.text}</span>
              </TimelineItem>
            )
          })}
        </TimelineBlock>
        <TimelineBlock title="Tamamlama" empty={completionHistory.length === 0}>
          {completionHistory.map((row, idx) => (
            <TimelineItem key={`cmp-${idx}`} isLast={idx === completionHistory.length - 1}>
              {formatTaskTs(row?.at)}
            </TimelineItem>
          ))}
        </TimelineBlock>
        <TimelineBlock title="Denetim" empty={reviewHistory.length === 0}>
          {reviewHistory.map((row, idx) => (
            <TimelineItem key={`rvw-${idx}`} isLast={idx === reviewHistory.length - 1}>
              {formatTaskTs(row?.at)}
              <span className="text-slate-500"> · {denetimActorLabel(row)}</span>
            </TimelineItem>
          ))}
        </TimelineBlock>
        {resubmissionCount > 0 ? (
          <p className="text-xs font-medium text-slate-500">
            {resubmissionCount} kez yeniden gönderildi
          </p>
        ) : null}
      </div>
    </details>
  )
}
