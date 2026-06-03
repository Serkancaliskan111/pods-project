import {
  LogOut,
  Plus,
  EyeOff,
  Settings,
} from 'lucide-react'
import NotificationsPopover from './NotificationsPopover.jsx'
import { useContext, useState } from 'react'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { canAssignTask } from '../../lib/permissions.js'
import { cubicle } from '../../theme/cubicle'
import AnnouncementsPopover from './AnnouncementsPopover.jsx'
import CustomizeAppearanceSheet from './CustomizeAppearanceSheet.jsx'
import { useTaskAssign } from '../../contexts/TaskAssignContext.jsx'
import { useCubicleHomeContextOptional } from '../../contexts/CubicleHomeContext.jsx'
import HelpGuideLauncher from './HelpGuideLauncher.jsx'

export default function CubicleTopBar({ showActions = true, variant = 'default' }) {
  const { profile, personel, signOut } = useContext(AuthContext)
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin
  const canCreate = canAssignTask(permissions, isSystemAdmin, personel)
  const { openTaskAssign } = useTaskAssign()
  const homeCtx = useCubicleHomeContextOptional()
  const isHome = variant === 'home'
  const [customizeOpen, setCustomizeOpen] = useState(false)

  return (
    <header className="relative z-[100] shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <HelpGuideLauncher />
          <AnnouncementsPopover />
          <NotificationsPopover />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showActions && isHome ? (
            <>
              {canCreate ? (
                <button
                  type="button"
                  data-help="task-create-btn"
                  onClick={() => openTaskAssign()}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-[1.03]"
                  style={{ backgroundColor: cubicle.greenCta }}
                >
                  Görev Oluştur
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              ) : null}
              {homeCtx?.operatorMode ? (
                <button
                  type="button"
                  data-help="hidden-tasks-btn"
                  onClick={() => homeCtx.openHiddenModal()}
                  className="relative inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <EyeOff size={16} strokeWidth={1.75} />
                  Gizlenmiş Görevlerim
                  {homeCtx.hiddenCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {homeCtx.hiddenCount > 9 ? '9+' : homeCtx.hiddenCount}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button
                type="button"
                data-help="customize-appearance"
                onClick={() => setCustomizeOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                aria-haspopup="dialog"
                aria-expanded={customizeOpen}
              >
                <Settings size={16} strokeWidth={1.75} />
                Özelleştir
              </button>
              <CustomizeAppearanceSheet
                open={customizeOpen}
                onClose={() => setCustomizeOpen(false)}
              />
            </>
          ) : showActions && canCreate ? (
            <button
              type="button"
              data-help="task-create-btn"
              onClick={() => openTaskAssign()}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-[1.03]"
              style={{ backgroundColor: cubicle.greenCta }}
            >
              Görev Oluştur
              <Plus size={16} strokeWidth={2.5} />
            </button>
          ) : null}

          {!isHome ? (
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={15} strokeWidth={1.75} />
              Çıkış
            </button>
          ) : (
            <button
              type="button"
              onClick={signOut}
              className="ml-1 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Çıkış"
            >
              <LogOut size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
