import { cn } from '../../../../lib/cn'

/** Hibrit zincir: faz başlığı + içerik */
export default function TaskDetailPhaseBlock({ phase, title, subtitle, accent, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      <div
        className="flex items-center gap-3 border-b px-5 py-4"
        style={{
          borderLeftWidth: 4,
          borderLeftColor: accent,
          background: `linear-gradient(90deg, ${accent}12, transparent 70%)`,
        }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
          style={{ backgroundColor: accent }}
        >
          {phase}
        </span>
        <div>
          <h3 className="text-base font-extrabold text-primary-900">{title}</h3>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}
