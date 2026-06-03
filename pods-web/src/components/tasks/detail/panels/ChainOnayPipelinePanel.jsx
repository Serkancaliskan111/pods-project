import { ShieldCheck } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import StepStatusPill from '../primitives/StepStatusPill.jsx'
import TaskDetailSectionCard from '../primitives/TaskDetailSectionCard.jsx'

export default function ChainOnayPipelinePanel({
  ctx,
  design,
  title = 'Onay zinciri',
  layout,
  variant,
}) {
  const { chainOnayStepsForViewer, chainNameMap, task, fullNameOrPersonelRef } = ctx
  const accent = design?.accent || '#D97706'
  const activeNo = Number(task?.zincir_onay_aktif_adim) || 1
  const steps = chainOnayStepsForViewer || []
  if (!steps.length) return null

  const isWide = layout === 'wide'

  const inner = (
    <div
      className={cn(
        'flex flex-wrap items-stretch gap-4 p-5',
        isWide ? 'justify-center md:gap-6' : '',
      )}
    >
      {steps.map((r, idx) => {
        const isActive = Number(r.adim_no) === activeNo
        const name =
          chainNameMap[r.onaylayici_personel_id] ||
          fullNameOrPersonelRef(null, r.onaylayici_personel_id)
        return (
          <div key={r.id} className="flex items-center gap-3">
            {idx > 0 ? (
              <div
                className="hidden h-0.5 w-8 shrink-0 sm:block"
                style={{ backgroundColor: `${accent}40` }}
                aria-hidden
              />
            ) : null}
            <div
              className={cn(
                'min-w-[180px] rounded-2xl border-2 bg-white px-4 py-4 shadow-sm transition',
                isActive ? 'shadow-md' : 'border-slate-200',
                isWide && 'min-w-[200px]',
              )}
              style={isActive ? { borderColor: accent } : undefined}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Onay {r.adim_no}
                {isActive ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                    Sıradaki
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-base font-extrabold text-primary-900">{name}</p>
              <StepStatusPill status={r.durum} className="mt-2" />
              {r.onaylandi_at ? (
                <p className="mt-2 text-[11px] tabular-nums text-slate-500">
                  {new Date(r.onaylandi_at).toLocaleString('tr-TR')}
                </p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )

  if (variant === 'embedded') return inner

  return (
    <TaskDetailSectionCard
      title={title}
      subtitle="Onaylayıcılar belirlenen sırada işlem yapar"
      icon={ShieldCheck}
      accent={accent}
      flushBody
      bodyClassName="p-0"
    >
      {inner}
    </TaskDetailSectionCard>
  )
}
