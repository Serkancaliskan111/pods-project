import { GraduationCap } from 'lucide-react'
import { HELP_GUIDE_DEMO_LABEL } from '../../lib/helpGuideDemoData.js'

export default function HelpGuideDemoBanner({ className = '' }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-2.5 text-xs leading-relaxed text-blue-900 ${className}`}
      role="status"
    >
      <GraduationCap size={16} className="mt-0.5 shrink-0 text-blue-600" />
      <span>
        <strong className="font-bold">{HELP_GUIDE_DEMO_LABEL}</strong> — Bu alandaki kartlar ve
        listeler gerçek veritabanı kaydı değildir; yalnızca kılavuz turu sırasında gösterilir.
      </span>
    </div>
  )
}
