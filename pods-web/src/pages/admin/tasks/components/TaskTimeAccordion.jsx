import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cubicle } from '../../../../theme/cubicle.js'

export function TaskTimeSectionHeader({ label, count, color, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm font-bold text-white shadow-sm transition hover:brightness-105"
      style={{ backgroundColor: color }}
    >
      <span>
        {label} ({count})
      </span>
      {open ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
    </button>
  )
}

const SECTION_COLORS = {
  today: cubicle.todayBar,
  tomorrow: '#5B8DEF',
  yesterday: '#8B5CF6',
  week: '#6366F1',
  last7: '#6366F1',
  other: '#64748B',
}

export default function TaskTimeAccordion({ sections, renderTask, defaultOpen = true }) {
  const [openKeys, setOpenKeys] = useState(() =>
    Object.fromEntries(sections.map((s) => [s.key, defaultOpen])),
  )

  const toggle = (key) => setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const open = openKeys[section.key] ?? defaultOpen
        const color = section.color || SECTION_COLORS[section.key] || cubicle.todayBar
        return (
          <div key={section.key} className="space-y-2">
            <TaskTimeSectionHeader
              label={section.label}
              count={section.tasks.length}
              color={color}
              open={open}
              onToggle={() => toggle(section.key)}
            />
            {open ? (
              <div className="space-y-2 pl-0.5">
                {section.tasks.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-slate-500">{section.emptyText}</p>
                ) : (
                  section.tasks.map((task) => renderTask(task))
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
