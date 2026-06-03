import { cn } from '../../../lib/cn'
import Text from '../../../ui/Text'
import { getTaskTypePresentation } from './taskDetailConfig.js'

export default function TaskDetailTypeHero({ gorevTuru, activeStepNo, totalSteps, compact = false }) {
  const { label, sub, color, Icon } = getTaskTypePresentation(gorevTuru)
  const showProgress = totalSteps > 0 && activeStepNo > 0

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
        style={{ borderColor: `${color}33`, backgroundColor: `${color}0c` }}
      >
        <Icon size={14} style={{ color }} />
        <Text variant="caption" className="font-bold" style={{ color }}>
          {label}
        </Text>
        <Text variant="caption" className="text-slate-500">
          {sub}
        </Text>
        {showProgress ? (
          <Text variant="caption" className="ml-auto tabular-nums text-slate-500">
            {activeStepNo}/{totalSteps}
          </Text>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border px-3 py-2.5"
      style={{
        borderColor: `${color}33`,
        background: `linear-gradient(135deg, ${color}10 0%, #fff 100%)`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <Text variant="caption" className="font-bold uppercase tracking-wide" style={{ color }}>
            {label}
          </Text>
          <Text variant="caption" className="block text-slate-600">
            {sub}
          </Text>
        </div>
        {showProgress ? (
          <Text variant="caption" className="shrink-0 tabular-nums font-bold text-slate-600">
            {activeStepNo}/{totalSteps}
          </Text>
        ) : null}
      </div>
    </div>
  )
}
