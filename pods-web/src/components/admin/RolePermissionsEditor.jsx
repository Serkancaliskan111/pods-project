import {
  ROLE_ACTIONS_BY_CATEGORY,
  ROLE_ACTION_LABELS,
  ROLE_CATEGORY_LABELS,
} from '../../lib/roleActionKeys.js'
import Switch from '../ui/Switch.jsx'

/**
 * @param {Record<string, boolean>} permissions — anahtar → açık/kapalı
 * @param {(key: string, value: boolean) => void} onToggle
 * @param {string} [className] — grid sarmalayıcı (örn. max-height + scroll)
 */
export default function RolePermissionsEditor({
  permissions,
  onToggle,
  className = 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4',
}) {
  return (
    <div className={className}>
      {Object.entries(ROLE_ACTIONS_BY_CATEGORY).map(([cat, keys]) => (
        <div
          key={cat}
          className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50 to-white p-3 shadow-sm sm:p-3.5"
        >
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {ROLE_CATEGORY_LABELS[cat] || cat}
          </div>
          <div className="flex flex-col gap-2">
            {keys.map((k) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:px-3"
              >
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-slate-700">
                  {ROLE_ACTION_LABELS[k] || k}
                </span>
                <Switch
                  checked={!!permissions[k]}
                  onCheckedChange={(next) => onToggle(k, next)}
                  aria-label={ROLE_ACTION_LABELS[k] || k}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
