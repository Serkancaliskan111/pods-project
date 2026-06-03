import { useEffect, useRef } from 'react'
import { GitBranch } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import {
  extractKanitVideosFromJob,
  extractPhotoUrls,
} from '../../../../pages/admin/tasks/taskShow/taskShowUtils.js'
import StepSelectorChip from '../primitives/StepSelectorChip.jsx'
import TaskDetailSectionCard from '../primitives/TaskDetailSectionCard.jsx'

export default function ChainGorevStepsPanel({
  ctx,
  design,
  title = 'Yürütme zinciri',
  variant,
}) {
  const {
    chainGorevStepsForViewer,
    chainNameMap,
    expandedChainPerson,
    setExpandedChainPerson,
    openPhotoPreview,
    fullNameOrPersonelRef,
    canRejectChainStep,
    isReadOnlyApprovedTask,
    isReviewLockedByOwnership,
    rejectChainStep,
    rejectingStepId,
    task,
  } = ctx

  const accent = design?.accent || '#0D9488'
  const activeNo = Number(task?.zincir_aktif_adim) || 1
  const steps = chainGorevStepsForViewer || []
  const didAutoExpand = useRef(false)

  useEffect(() => {
    if (didAutoExpand.current || !steps.length) return
    const activeRow = steps.find((r) => Number(r.adim_no) === activeNo) || steps[0]
    if (activeRow?.id) {
      setExpandedChainPerson(activeRow.id)
      didAutoExpand.current = true
    }
  }, [steps, activeNo, setExpandedChainPerson])

  if (!steps.length) return null

  const inner = (
    <>
      <p className="border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs font-medium text-slate-600">
        Adımlara tıklayarak o adıma ait kanıt ve notları görüntüleyin.
      </p>
      <div className="flex gap-3 overflow-x-auto px-5 py-4 [-ms-overflow-style:none] [scrollbar-width:thin]">
        {steps.map((row) => {
          const isWorkflowActive = Number(row.adim_no) === activeNo
          const isSelected = expandedChainPerson === row.id
          const name = chainNameMap[row.personel_id] || fullNameOrPersonelRef(null, row.personel_id)
          return (
            <StepSelectorChip
              key={row.id}
              stepNo={row.adim_no}
              title={name}
              status={row.adim_durum || row.durum}
              isWorkflowActive={isWorkflowActive}
              isSelected={isSelected}
              accent={accent}
              onClick={() => setExpandedChainPerson(isSelected ? null : row.id)}
            />
          )
        })}
      </div>
      <div className="space-y-3 p-5">
        {steps.map((row) => {
          if (expandedChainPerson !== row.id) return null
          const stepPhotoUrls = extractPhotoUrls(row)
          const stepVideos = extractKanitVideosFromJob(row)
          return (
            <div
              key={row.id}
              className="rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm"
              style={{ borderLeftWidth: 4, borderLeftColor: accent }}
            >
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Adım {row.adim_no} · Kanıtlar
              </p>
              {row.aciklama ? (
                <p className="mb-3 text-sm text-slate-600">{String(row.aciklama)}</p>
              ) : null}
              {stepPhotoUrls.length === 0 && stepVideos.length === 0 ? (
                <p className="text-sm text-slate-400">Bu adımda kanıt yok</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {stepPhotoUrls.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => openPhotoPreview(url, stepPhotoUrls)}
                      className="h-28 w-28 overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:ring-2 hover:ring-blue-300"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                  {stepVideos.map((v, vi) => (
                    <video
                      key={vi}
                      src={v.url}
                      controls
                      playsInline
                      className="max-h-40 max-w-full rounded-xl border border-slate-200"
                    />
                  ))}
                </div>
              )}
              {canRejectChainStep && !isReadOnlyApprovedTask && !isReviewLockedByOwnership ? (
                <button
                  type="button"
                  onClick={() => rejectChainStep(row)}
                  disabled={rejectingStepId === row.id}
                  className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Bu adımı reddet
                </button>
              ) : null}
            </div>
          )
        })}
        {!expandedChainPerson ? (
          <div
            className={cn(
              'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200',
              'bg-gradient-to-b from-slate-50 to-white px-6 py-10 text-center',
            )}
          >
            <p className="text-sm font-semibold text-slate-700">Henüz adım seçilmedi</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Yukarıdaki adım kartlarından birine tıklayın; kanıtlar burada açılır.
            </p>
          </div>
        ) : null}
      </div>
    </>
  )

  if (variant === 'embedded') return inner

  return (
    <TaskDetailSectionCard
      title={title}
      subtitle="Adımlara tıklayın · kanıtlar altta açılır"
      icon={GitBranch}
      accent={accent}
      flushBody
      bodyClassName="p-0"
    >
      {inner}
    </TaskDetailSectionCard>
  )
}
