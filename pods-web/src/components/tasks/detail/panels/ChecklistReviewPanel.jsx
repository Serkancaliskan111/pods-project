import { ListChecks } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import TaskDetailSectionCard from '../primitives/TaskDetailSectionCard.jsx'

export default function ChecklistReviewPanel({ ctx, design }) {
  const {
    checklistItems,
    expandedChecklistItemId,
    setExpandedChecklistItemId,
    getChecklistDecision,
    getChecklistDecisionFromDraft,
    checklistDraftDecisions,
    setChecklistDraftDecisions,
    isReadOnlyApprovedTask,
    isReviewLockedByOwnership,
    rejectedChecklistItems,
    submittingChecklistReview,
    submitChecklistReview,
    submitChecklistApproveAll,
    openPhotoPreview,
  } = ctx

  const accent = design?.accent || '#7C3AED'
  const total = checklistItems.length
  const accepted = checklistItems.filter((i) => getChecklistDecision(i) === 'accept').length
  const pct = total ? Math.round((accepted / total) * 100) : 0

  const badge = (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: accent }}
    >
      %{pct}
    </span>
  )

  const progressBar = (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: accent }}
      />
    </div>
  )

  return (
    <TaskDetailSectionCard
      title="Checklist denetimi"
      subtitle={`${accepted} / ${total} madde değerlendirildi`}
      icon={ListChecks}
      accent={accent}
      badge={badge}
      flushBody
      bodyClassName="p-0"
      minHeight="min(360px,55vh)"
    >
      {!isReadOnlyApprovedTask && !isReviewLockedByOwnership && rejectedChecklistItems.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-5 py-3">
          <span className="text-[13px] font-medium text-amber-900">
            {rejectedChecklistItems.length} madde reddedildi
          </span>
          <button
            type="button"
            disabled={submittingChecklistReview}
            onClick={submitChecklistReview}
            className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          >
            Görevi tekrar gönder
          </button>
        </div>
      ) : null}

      <div className="border-b border-slate-100 px-5 pt-4">{progressBar}</div>

      <div className="space-y-3 p-5">
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">Checklist maddesi yok</p>
        ) : (
          checklistItems.map((item) => {
            const decision = getChecklistDecision(item)
            const isAccepted = decision === 'accept'
            const isRejected = decision === 'reject'
            const locked =
              item.karar === 'accept' ||
              item.karar === 'reject' ||
              decision === 'accept' ||
              isReadOnlyApprovedTask ||
              isReviewLockedByOwnership
            const open = expandedChecklistItemId === item.id

            return (
              <div
                key={item.id}
                className={cn(
                  'overflow-hidden rounded-xl border transition-shadow',
                  isAccepted && 'border-emerald-200/90 bg-emerald-50/40 shadow-sm',
                  isRejected && 'border-red-200/90 bg-red-50/30 shadow-sm',
                  !isAccepted && !isRejected && 'border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]',
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02]"
                  onClick={() => setExpandedChecklistItemId(open ? null : item.id)}
                >
                  <span className="text-[14px] font-medium text-slate-900">{item.soru}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      isAccepted && 'bg-emerald-100 text-emerald-800',
                      isRejected && 'bg-red-100 text-red-800',
                      !isAccepted && !isRejected && 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {isAccepted ? 'Kabul' : isRejected ? 'Red' : open ? 'Açık' : 'İncele'}
                  </span>
                </button>

                {open ? (
                  <div className="space-y-3 border-t border-slate-100/80 bg-white/60 px-4 py-4">
                    {item.soruTipi !== 'FOTOGRAF' && item.soruTipi !== 'VIDEO' ? (
                      <p className="text-[13px] text-slate-600">
                        <span className="font-semibold text-slate-800">Cevap:</span>{' '}
                        {item.cevap || '—'}
                      </p>
                    ) : null}
                    {item.photos?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.photos.map((url, pidx) => (
                          <button
                            key={pidx}
                            type="button"
                            onClick={() => openPhotoPreview(url, item.photos)}
                            className="h-24 w-24 overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:ring-2 hover:ring-slate-400"
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {item.videos?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.videos.map((v, vi) => (
                          <video
                            key={vi}
                            src={v.url}
                            controls
                            playsInline
                            className="max-h-44 max-w-full rounded-xl border border-slate-200"
                          />
                        ))}
                      </div>
                    ) : null}
                    {!isReadOnlyApprovedTask && !isReviewLockedByOwnership ? (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={locked || submittingChecklistReview}
                          onClick={async () => {
                            const nextDraft = { ...checklistDraftDecisions, [item.key]: 'accept' }
                            setChecklistDraftDecisions(nextDraft)
                            const allAccepted = checklistItems.every(
                              (it) => getChecklistDecisionFromDraft(it, nextDraft) === 'accept',
                            )
                            if (allAccepted && !submittingChecklistReview) {
                              await submitChecklistApproveAll(nextDraft)
                            }
                          }}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-[13px] font-semibold transition',
                            isAccepted
                              ? 'border-emerald-300 bg-emerald-600 text-white'
                              : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
                          )}
                        >
                          Kabul
                        </button>
                        <button
                          type="button"
                          disabled={locked || submittingChecklistReview}
                          onClick={() =>
                            setChecklistDraftDecisions((prev) => ({
                              ...prev,
                              [item.key]: 'reject',
                            }))
                          }
                          className={cn(
                            'rounded-lg border px-4 py-2 text-[13px] font-semibold transition',
                            isRejected
                              ? 'border-red-300 bg-red-600 text-white'
                              : 'border-red-200 bg-white text-red-700 hover:bg-red-50',
                          )}
                        >
                          Red
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </TaskDetailSectionCard>
  )
}
