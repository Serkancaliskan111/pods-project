import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { EyeOff, Trophy } from 'lucide-react'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { hasManagementDashboardAccess } from '../../lib/permissions.js'
import { isPendingApprovalTaskStatus, normalizeTaskStatus } from '../../lib/taskStatus.js'
import { getTaskWorkStatusOption } from '../../lib/taskWorkStatus.js'
import { cubicle } from '../../theme/cubicle'
import { blockHelpGuideDemoAction } from '../../lib/helpGuideDemoGuard.js'
import { isHelpGuideDemoEntity } from '../../lib/helpGuideDemoData.js'

const BAR = {
  onTime: cubicle.statusOnTime,
  overdue: cubicle.statusOverdue,
  waiting: cubicle.statusWaiting,
  todo: cubicle.statusTodo,
  cancelled: cubicle.statusCancelled,
}

const STATUS_BADGE = {
  onTime: { bg: '#dcfce7', color: '#166534', label: 'Aktif' },
  overdue: { bg: '#fee2e2', color: '#991b1b', label: 'Gecikmiş' },
  waiting: { bg: '#ffedd5', color: '#9a3412', label: 'Bekliyor' },
  todo: { bg: '#dbeafe', color: '#1e40af', label: 'Yapılacak' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', label: 'Askıda' },
}

function formatCubicleDate(d) {
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

function formatCubicleTime(d) {
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function formatTaskDateRange(task) {
  const start = task?.baslama_tarihi ? new Date(task.baslama_tarihi) : null
  const end = task?.son_tarih ? new Date(task.son_tarih) : null
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const sameDay = start.toDateString() === end.toDateString()
    if (sameDay) {
      return `Tarih: ${formatCubicleDate(start)}, ${formatCubicleTime(start)} - ${formatCubicleTime(end)}`
    }
    return `Tarih: ${formatCubicleDate(start)} - ${formatCubicleDate(end)}`
  }
  if (end && !Number.isNaN(end.getTime())) {
    return `Tarih: ${formatCubicleDate(end)}, ${formatCubicleTime(end)}`
  }
  return 'Tarih: —'
}

function estimateProgress(task) {
  const photos = task?.kanit_resim_ler
  const videos = task?.kanit_videolar
  const note = task?.personel_tamamlama_notu
  let n = 0
  if (Array.isArray(photos) && photos.length) n += 1
  if (Array.isArray(videos) && videos.length) n += 1
  if (note && String(note).trim()) n += 1
  if (isPendingApprovalTaskStatus(normalizeTaskStatus(task?.durum))) return 100
  if (n === 0) return null
  return Math.min(100, Math.round((n / 3) * 100))
}

export default function CubicleTaskCard({
  task,
  onOpenTask,
  onHideFromHome,
  hidingFromHome = false,
  variant,
}) {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const management = hasManagementDashboardAccess(profile?.yetkiler, !!profile?.is_system_admin)
  const isMine = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
  const isUrgent = variant === 'urgent' || task?.acil === true || task?.acil === 1
  const bar = isUrgent ? cubicle.urgentBar : BAR[task.tone] || BAR.todo
  const badge = STATUS_BADGE[task.tone] || STATUS_BADGE.todo
  const workStatus = getTaskWorkStatusOption(task?.calisma_durumu)
  const progress = estimateProgress(task)

  const workAction = task.workAction
  const showDoTask = workAction?.show || (!management && isMine)
  const useModal = !!onOpenTask && !management && isMine

  const openTask = () => {
    if (isHelpGuideDemoEntity(task)) {
      blockHelpGuideDemoAction(task)
      return
    }
    if (useModal) {
      onOpenTask(task)
      return
    }
    if (!management && isMine) {
      navigate(`/admin/tasks/${task.id}/complete`)
      return
    }
    navigate(`/admin/tasks/${task.id}`)
  }

  return (
    <article
      className={`overflow-hidden rounded-xl bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06)] ${
        isUrgent
          ? 'border-2 border-red-300 ring-2 ring-red-100/80'
          : 'border border-slate-200/80'
      }`}
    >
      <button type="button" onClick={openTask} className="relative flex w-full text-left">
        {isUrgent ? (
          <span className="absolute right-3 top-3 z-10 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm">
            Acil
          </span>
        ) : null}
        <div
          className="w-1 shrink-0 self-stretch sm:w-1.5"
          style={{ backgroundColor: bar }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 p-4">
          <p
            className={`text-base font-bold leading-snug ${isUrgent ? 'pr-14 text-red-950' : 'text-slate-900'}`}
          >
            {task.baslik || 'Görev'}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            Proje: {task.projectLabel || '—'}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className="rounded-md px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: badge.bg, color: badge.color }}
            >
              Durum: {task.statusLabel || badge.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: workStatus.pillBg, color: workStatus.pillText }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: workStatus.dot }}
                aria-hidden
              />
              {workStatus.label}
            </span>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {formatTaskDateRange(task)}
            </span>
          </div>

          {progress != null && progress > 0 && progress < 100 ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, backgroundColor: cubicle.statusOnTime }}
                />
              </div>
              <p className="mt-1 text-center text-[11px] font-semibold text-slate-600">
                %{progress} Tamamlandı
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-500">Görevliler</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Trophy size={16} strokeWidth={2} />
            </span>
          </div>
        </div>
      </button>

      {showDoTask || onHideFromHome ? (
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 pb-4 pt-3 sm:flex-row">
          {onHideFromHome ? (
            <button
              type="button"
              disabled={hidingFromHome}
              onClick={(e) => {
                e.stopPropagation()
                void onHideFromHome()
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <EyeOff size={16} strokeWidth={1.75} />
              {hidingFromHome ? 'Gizleniyor…' : 'Görevi gizle'}
            </button>
          ) : null}
          {showDoTask ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openTask()
              }}
              className="flex flex-1 items-center justify-center rounded-lg py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-[1.03]"
              style={{ backgroundColor: cubicle.greenCta }}
            >
              {workAction?.label || 'Görevi Yap'}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
