import {
  LogOut,
  Plus,
  EyeOff,
  Settings,
  Megaphone,
} from 'lucide-react'
import NotificationsPopover from './NotificationsPopover.jsx'
import { useContext, useState } from 'react'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { canAssignTask, canCreateAnnouncement } from '../../lib/permissions.js'
import { cubicle } from '../../theme/cubicle'
import AnnouncementsPopover from './AnnouncementsPopover.jsx'
import CustomizeAppearanceSheet from './CustomizeAppearanceSheet.jsx'
import { useTaskAssign } from '../../contexts/TaskAssignContext.jsx'
import { useCubicleHomeContextOptional } from '../../contexts/CubicleHomeContext.jsx'
import HelpGuideLauncher from './HelpGuideLauncher.jsx'
import CreateAnnouncementModal from './CreateAnnouncementModal.jsx'
import { cn } from '../../lib/cn.js'

export default function CubicleTopBar({ showActions = true, variant = 'default' }) {
  const { profile, personel, signOut } = useContext(AuthContext)
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin
  const canCreate = canAssignTask(permissions, isSystemAdmin, personel)
  const canAnnounce = canCreateAnnouncement(permissions, isSystemAdmin, personel)
  const { openTaskAssign } = useTaskAssign()
  const homeCtx = useCubicleHomeContextOptional()
  const isHome = variant === 'home'
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [announcementOpen, setAnnouncementOpen] = useState(false)

  return (
    <header className="relative z-[100] shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <HelpGuideLauncher iconOnly />
          <div className="group/cluster inline-flex items-center gap-1.5">
            <AnnouncementsPopover
              canCreate={canAnnounce}
              onOpenCreate={() => setAnnouncementOpen(true)}
            />
            {canAnnounce ? (
              <button
                type="button"
                data-help="announcement-create"
                title="Yeni duyuru oluştur"
                aria-label="Yeni duyuru oluştur"
                onClick={() => setAnnouncementOpen(true)}
                className={cn(
                  'flex h-9 max-w-0 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white px-0',
                  'opacity-0 shadow-md ring-2 ring-white transition-all duration-200 ease-out',
                  'pointer-events-none',
                  'group-hover/cluster:pointer-events-auto group-hover/cluster:max-w-[6.5rem] group-hover/cluster:px-2.5 group-hover/cluster:opacity-100',
                  'group-focus-within/cluster:pointer-events-auto group-focus-within/cluster:max-w-[6.5rem] group-focus-within/cluster:px-2.5 group-focus-within/cluster:opacity-100',
                  'hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-lg',
                )}
              >
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                  <Megaphone size={15} strokeWidth={2} aria-hidden />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-600 text-white ring-2 ring-white">
                    <Plus size={9} strokeWidth={3} aria-hidden />
                  </span>
                </span>
                <span className="whitespace-nowrap text-[11px] font-bold text-indigo-800">Yeni</span>
              </button>
            ) : null}
            <div className="shrink-0 transition-[margin] duration-200 ease-out">
              <NotificationsPopover />
            </div>
          </div>
          <CreateAnnouncementModal
            open={announcementOpen}
            onClose={() => setAnnouncementOpen(false)}
          />
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
