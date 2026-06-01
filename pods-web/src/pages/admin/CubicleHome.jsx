import { useCallback, useContext, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { hasManagementDashboardAccess } from '../../lib/permissions.js'
import { ChevronDown, ChevronRight } from 'lucide-react'
import CubicleTopBar from '../../components/cubicle/CubicleTopBar.jsx'
import CubicleTaskCard from '../../components/cubicle/CubicleTaskCard.jsx'
import UrgentTasksPanel from '../../components/cubicle/UrgentTasksPanel.jsx'
import CubicleTaskCompleteModal from '../../components/cubicle/CubicleTaskCompleteModal.jsx'
import { useCubicleHomeContext } from '../../contexts/CubicleHomeContext.jsx'
import { useCubicleHomeData } from '../../hooks/useCubicleHomeData.js'
import { CUBICLE_REPORT_SCOPE } from '../../lib/cubicleHomeTaskBuckets.js'
import { isForceShownOnHome } from '../../lib/taskHomeHidden.js'
import { cubicle } from '../../theme/cubicle.js'
import Spinner from '../../components/ui/Spinner.jsx'

const REPORT_SCOPE_OPTIONS = [
  { value: CUBICLE_REPORT_SCOPE.TODAY, label: 'Bugün' },
  { value: CUBICLE_REPORT_SCOPE.WEEK, label: 'Bu Hafta' },
  { value: CUBICLE_REPORT_SCOPE.ALL, label: 'Genel Görünüm' },
]

const ASSIGNED_PREVIEW = 5

const REPORT_DOT = {
  todo: cubicle.statusTodo,
  onTime: cubicle.statusOnTime,
  overdue: cubicle.statusOverdue,
  waiting: cubicle.statusWaiting,
  cancelled: cubicle.statusCancelled,
}

function SectionHeader({ label, count, color, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      <span>
        {label} ({count})
      </span>
      {open ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronRight size={20} strokeWidth={2.5} />}
    </button>
  )
}

function formatAssignedEnd(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
}

function assignedStatusDot(tone) {
  if (tone === 'overdue') return cubicle.statusOverdue
  if (tone === 'waiting') return cubicle.statusWaiting
  if (tone === 'onTime') return cubicle.statusOnTime
  return cubicle.statusTodo
}

function CubicleHomeBody({ embedded, home }) {
  const { profile, personel } = useContext(AuthContext)
  const management = hasManagementDashboardAccess(profile?.yetkiler, !!profile?.is_system_admin)
  const {
    loading,
    fetchError,
    overdue,
    today,
    tomorrow,
    assignedToMe,
    reportRows,
    reportScope,
    setReportScope,
    reportTotal,
    reload,
    hideFromHome,
    hidingTaskId,
    forceShowIds,
    loadedAt,
    operatorMode,
    urgentToday,
    enriching,
  } = home
  const navigate = useNavigate()

  const taskHideProps = useCallback(
    (task) => {
      if (!operatorMode || !hideFromHome) return {}
      if (!isForceShownOnHome(task, loadedAt, forceShowIds)) return {}
      return {
        onHideFromHome: () => hideFromHome(task),
        hidingFromHome: hidingTaskId === task.id,
      }
    },
    [operatorMode, hideFromHome, loadedAt, forceShowIds, hidingTaskId],
  )

  const taskPath = (taskId, taskRow) => {
    const mine = String(taskRow?.sorumlu_personel_id || '') === String(personel?.id || '')
    if (!management && mine) return `/admin/tasks/${taskId}/complete`
    return `/admin/tasks/${taskId}`
  }

  const [overdueOpen, setOverdueOpen] = useState(true)
  const [todayOpen, setTodayOpen] = useState(true)
  const [tomorrowOpen, setTomorrowOpen] = useState(true)
  const [assignedExpanded, setAssignedExpanded] = useState(false)
  const [completeModalTask, setCompleteModalTask] = useState(null)

  const openPersonelTask = useCallback(
    (task) => {
      const mine = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
      if (!management && mine) {
        setCompleteModalTask(task)
        return
      }
      navigate(taskPath(task.id, task))
    },
    [management, personel?.id, navigate],
  )

  const handleTaskCompleted = useCallback(() => {
    setCompleteModalTask(null)
    reload()
  }, [reload])

  const visibleAssigned = useMemo(() => {
    if (assignedExpanded) return assignedToMe
    return assignedToMe.slice(0, ASSIGNED_PREVIEW)
  }, [assignedToMe, assignedExpanded])

  const showMoreAssigned = assignedToMe.length > ASSIGNED_PREVIEW

  const hasAnyBucket =
    overdue.length > 0 || today.length > 0 || tomorrow.length > 0 || urgentToday.length > 0
  const showInitialSpinner = loading && !hasAnyBucket

  return (
    <div
      className={embedded ? 'flex min-h-0 flex-col' : 'flex min-h-full flex-col'}
      style={
        embedded
          ? { backgroundColor: 'transparent' }
          : { backgroundColor: 'var(--cubicle-page-bg, #EEF1F5)' }
      }
    >
      {!embedded ? <CubicleTopBar showActions variant="home" /> : null}

      <div
        className={`grid flex-1 gap-5 ${embedded ? 'min-h-0' : 'p-4'} lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)] xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]`}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {showInitialSpinner ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : null}

          {operatorMode && enriching && hasAnyBucket ? (
            <p className="text-center text-[11px] font-medium text-slate-400">
              Zincir görevleri güncelleniyor…
            </p>
          ) : null}

          {operatorMode ? (
            <UrgentTasksPanel
              tasks={urgentToday}
              loading={showInitialSpinner}
              now={loadedAt}
              onOpenTask={openPersonelTask}
            />
          ) : null}

          <section className="space-y-3">
            <SectionHeader
              label="Gecikmiş"
              count={overdue.length}
              color={cubicle.overdueBar}
              open={overdueOpen}
              onToggle={() => setOverdueOpen((v) => !v)}
            />
            {overdueOpen && !showInitialSpinner ? (
              <div className="space-y-3">
                {overdue.length === 0 ? (
                  <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
                    Gecikmiş görev yok.
                  </p>
                ) : (
                  overdue.map((t) => (
                    <CubicleTaskCard
                      key={t.id}
                      task={t}
                      onOpenTask={openPersonelTask}
                      {...taskHideProps(t)}
                    />
                  ))
                )}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <SectionHeader
              label="Bugün"
              count={today.length}
              color={cubicle.todayBar}
              open={todayOpen}
              onToggle={() => setTodayOpen((v) => !v)}
            />
            {todayOpen && !showInitialSpinner ? (
              <div className="space-y-3">
                {today.length === 0 ? (
                  <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
                    Bugün için görev yok.
                  </p>
                ) : (
                  today.map((t) => (
                    <CubicleTaskCard
                      key={t.id}
                      task={t}
                      onOpenTask={openPersonelTask}
                      {...taskHideProps(t)}
                    />
                  ))
                )}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <SectionHeader
              label="Yarın"
              count={tomorrow.length}
              color={cubicle.tomorrowBar}
              open={tomorrowOpen}
              onToggle={() => setTomorrowOpen((v) => !v)}
            />
            {tomorrowOpen && !showInitialSpinner ? (
              <div className="space-y-3">
                {tomorrow.length === 0 ? (
                  <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
                    Yarın için planlanmış görev yok.
                  </p>
                ) : (
                  tomorrow.map((t) => (
                    <CubicleTaskCard
                      key={t.id}
                      task={t}
                      onOpenTask={openPersonelTask}
                      {...taskHideProps(t)}
                    />
                  ))
                )}
              </div>
            ) : null}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-800">Raporlar</h2>
              <select
                value={reportScope}
                onChange={(e) => setReportScope(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                aria-label="Rapor zaman aralığı"
              >
                {REPORT_SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {fetchError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {fetchError}
                <button
                  type="button"
                  onClick={() => reload()}
                  className="ml-2 font-semibold underline"
                >
                  Yeniden dene
                </button>
              </div>
            ) : null}
            <div className="space-y-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_40px] gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <span>Durum</span>
                <span>Oran</span>
                <span className="text-right">Sayı</span>
              </div>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : (
                reportRows.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_40px] items-center gap-2 text-sm"
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: REPORT_DOT[row.key] || row.color }}
                      />
                      {row.label}
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(row.count > 0 ? 8 : 0, Math.round(row.pct * 100))}%`,
                          backgroundColor: row.count > 0 ? row.color : '#e2e8f0',
                        }}
                      />
                    </div>
                    <span className="text-right font-semibold text-slate-800">{row.count}</span>
                  </div>
                ))
              )}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              {reportTotal === 0 && !loading
                ? 'Seçilen aralıkta görev bulunamadı.'
                : `Özet: ${reportTotal} görev (${REPORT_SCOPE_OPTIONS.find((o) => o.value === reportScope)?.label || 'Bugün'}).`}
            </p>
            <Link
              to="/admin/tasks"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2F5F9E] hover:underline"
            >
              &gt; Tüm Görevlere Git
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
              Size Atanan Görevler
              <span
                className="flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold text-white"
                style={{ backgroundColor: cubicle.todayBar }}
              >
                {assignedToMe.length}
              </span>
            </h2>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <span>Durum / Ad</span>
              <span>Bitiş</span>
            </div>
            <ul className="divide-y divide-slate-50">
              {visibleAssigned.map((t, i) => {
                const hide = taskHideProps(t)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openPersonelTask(t)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 py-3 text-left transition hover:bg-slate-50/80"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-sm font-bold text-slate-400">{i + 1}.</span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: assignedStatusDot(t.tone) }}
                        />
                        <span className="truncate text-sm font-medium text-slate-800">
                          {t.baslik || 'Görev'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-500">
                        {formatAssignedEnd(t.son_tarih)}
                      </span>
                    </button>
                    {hide.onHideFromHome ? (
                      <div className="border-t border-slate-50 px-3 pb-2 pt-0">
                        <button
                          type="button"
                          disabled={hide.hidingFromHome}
                          onClick={() => void hide.onHideFromHome()}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-60"
                        >
                          {hide.hidingFromHome ? 'Gizleniyor…' : 'Görevi gizle'}
                        </button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {!loading && assignedToMe.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Atanan görev yok.</p>
            ) : null}
            {showMoreAssigned ? (
              <button
                type="button"
                onClick={() => setAssignedExpanded((v) => !v)}
                className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <ChevronDown
                  size={16}
                  className={`transition ${assignedExpanded ? 'rotate-180' : ''}`}
                />
                {assignedExpanded ? 'Daha az göster' : 'Daha Fazla Göster'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <CubicleTaskCompleteModal
        open={!!completeModalTask}
        task={completeModalTask}
        onClose={() => setCompleteModalTask(null)}
        onCompleted={handleTaskCompleted}
      />
    </div>
  )
}

function CubicleHomeFromContext(props) {
  const home = useCubicleHomeContext()
  return <CubicleHomeBody {...props} home={home} />
}

function CubicleHomeFromHook(props) {
  const home = useCubicleHomeData()
  return <CubicleHomeBody {...props} home={home} />
}

export default function CubicleHome({ embedded = false }) {
  if (embedded) return <CubicleHomeFromContext embedded />
  return <CubicleHomeFromHook embedded={false} />
}
