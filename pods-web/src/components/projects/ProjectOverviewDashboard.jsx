import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Layers,
  ListChecks,
  Rocket,
  Users,
  Pencil,
} from 'lucide-react'
import { MetricCard, StatusBadge, Text } from '../../ui'
import { buildProjectSummary } from '../../lib/projectSummary.js'
import { formatPersonelDisplayName } from '../../lib/projectApi.js'
import { formatProjectDateLabel } from '../../lib/projectGanttUtils.js'
import {
  PROJECT_PRIORITY_OPTIONS,
  getProjectStatusOption,
} from '../../lib/projectStatus.js'
import { cn } from '../../lib/cn'


function TaskMiniRow({ task, accent, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(task)}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-left transition hover:border-slate-200 hover:bg-white"
    >
      <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{task.baslik}</span>
      <span className="shrink-0 text-xs text-slate-500">
        {formatProjectDateLabel(task.bitis_tarihi)}
      </span>
    </button>
  )
}

export default function ProjectOverviewDashboard({
  project,
  projectId,
  tasks,
  teamMembers,
  birimLabel,
  accent,
  canManage = true,
  onOpenTask,
  showMetricRow = true,
  showTeamChips = true,
  showHero = true,
  showStatusSection = true,
  showOperationalSection = true,
  showOverdueSection = true,
  showDueSoonSection = true,
}) {
  const summary = buildProjectSummary(project, tasks)
  const st = getProjectStatusOption(project.durum)
  const pri = PROJECT_PRIORITY_OPTIONS.find((o) => o.value === project.oncelik)
  const heroGradient = `linear-gradient(135deg, ${accent} 0%, ${adjustColor(accent, -25)} 55%, #0f172a 100%)`

  return (
    <div className="space-y-5">
      {showHero ? (
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white shadow-md md:p-6"
        style={{ background: heroGradient }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={st.tone} className="!bg-white/20 !text-white !border-white/30">
                {st.label}
              </StatusBadge>
              {pri ? (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white/90">
                  {pri.label} öncelik
                </span>
              ) : null}
              {birimLabel ? (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white/90">
                  {birimLabel}
                </span>
              ) : null}
              {summary.projectPastDue ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/25 px-2.5 py-0.5 text-xs font-bold text-amber-100">
                  <AlertTriangle size={12} /> Proje süresi geçti
                </span>
              ) : null}
            </div>
            {project.aciklama ? (
              <p className="max-w-2xl text-sm leading-relaxed text-white/85 line-clamp-3">
                {project.aciklama}
              </p>
            ) : (
              <p className="text-sm text-white/60">Açıklama eklenmemiş.</p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/75">
              <span>
                {formatProjectDateLabel(project.baslangic_tarihi)} –{' '}
                {formatProjectDateLabel(project.bitis_tarihi)}
              </span>
              {summary.daysRemaining != null && project.durum !== 'tamamlandi' ? (
                <span>
                  {summary.daysRemaining >= 0
                    ? `${summary.daysRemaining} gün kaldı`
                    : `${Math.abs(summary.daysRemaining)} gün gecikme`}
                </span>
              ) : null}
            </p>
          </div>
          {canManage ? (
            <Link
              to={`/admin/projects/${projectId}/edit`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              <Pencil size={15} /> Projeyi düzenle
            </Link>
          ) : null}
        </div>
        <div className="relative mt-5">
          <div className="mb-1.5 flex justify-between text-xs font-semibold text-white/80">
            <span>Görev ilerlemesi %{summary.progress.pct}</span>
            <span>
              {summary.progress.done}/{summary.progress.total} tamamlandı
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${summary.progress.pct}%` }}
            />
          </div>
          {summary.timelinePct != null ? (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-white/65">
                <span>Zaman çizelgesi</span>
                <span>%{summary.timelinePct} süre geçti</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white/50"
                  style={{ width: `${summary.timelinePct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      ) : null}

      {showMetricRow ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Planlama görevleri"
            value={summary.progress.total}
            tone="surface"
            icon={<ListChecks size={20} />}
          />
          <MetricCard
            label="Tamamlanan"
            value={summary.progress.done}
            tone="success"
            icon={<CheckCircle2 size={20} />}
          />
          <MetricCard
            label="Geciken"
            value={summary.overdueTasks.length}
            tone={summary.overdueTasks.length ? 'warning' : 'surface'}
            icon={<AlertTriangle size={20} />}
          />
          <MetricCard
            label="Proje ekibi"
            value={teamMembers.length}
            tone="info"
            icon={<Users size={20} />}
          />
        </div>
      ) : null}

      <div
        className={cn(
          'grid gap-4',
          showStatusSection && showOperationalSection
            ? 'lg:grid-cols-2'
            : 'grid-cols-1',
        )}
      >
        {showStatusSection ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Görev durumu</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {summary.rootCount} ana · {summary.subCount} alt görev
          </p>
          {!summary.hasTasks ? (
            <p className="mt-4 text-sm text-slate-500">Henüz planlama görevi yok.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {summary.statusBreakdown.map((row) => (
                <li key={row.value}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold text-slate-700">{row.label}</span>
                    <span className="text-slate-500">
                      {row.count} · %{row.pct}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${row.pct}%`, backgroundColor: row.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}

        {showOperationalSection ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Operasyonel bağlantı</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Planlama görevlerinin operasyonel iş akışına aktarımı
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <Rocket size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Başlatılmış</span>
              </div>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">
                {summary.operationalLinked}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-slate-600">
                <Layers size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Bekleyen</span>
              </div>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {summary.operationalPending}
              </p>
            </div>
          </div>
          {summary.progress.blocked > 0 ? (
            <p className="mt-3 text-xs font-semibold text-red-600">
              {summary.progress.blocked} görev bloke durumda
            </p>
          ) : null}
          {showDueSoonSection && summary.dueSoonTasks.length > 0 ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
              <CalendarClock size={14} />
              {summary.dueSoonTasks.length} görev önümüzdeki 7 günde bitiyor
            </p>
          ) : null}
        </section>
        ) : null}
      </div>

      {showOverdueSection || showDueSoonSection ? (
      <div
        className={cn(
          'grid gap-4',
          showOverdueSection && showDueSoonSection ? 'lg:grid-cols-2' : 'grid-cols-1',
        )}
      >
        {showOverdueSection ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <AlertTriangle size={16} className="text-amber-600" />
            Geciken görevler
          </h3>
          {summary.overdueTasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Geciken görev yok.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.overdueTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <TaskMiniRow task={t} accent={accent} onOpen={onOpenTask} />
                </li>
              ))}
              {summary.overdueTasks.length > 6 ? (
                <li className="text-center text-xs text-slate-500">
                  +{summary.overdueTasks.length - 6} daha
                </li>
              ) : null}
            </ul>
          )}
        </section>
        ) : null}

        {showDueSoonSection ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <CalendarClock size={16} className="text-blue-600" />
            Yaklaşan bitişler
          </h3>
          {summary.dueSoonTasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Önümüzdeki 7 günde biten görev yok.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.dueSoonTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <TaskMiniRow task={t} accent={accent} onOpen={onOpenTask} />
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}
      </div>
      ) : null}

      {showTeamChips ? (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Proje ekibi</h3>
            <Text variant="caption" className="mt-0.5">
              Görev atamaları yalnızca bu listeden yapılır.
            </Text>
          </div>
          {canManage ? (
            <Link
              to={`/admin/projects/${projectId}/edit`}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Ekibi düzenle
            </Link>
          ) : null}
        </div>
        {teamMembers.length === 0 ? (
          <p className="mt-3 text-sm text-amber-700">
            Henüz ekip üyesi yok. Görev eklemek için önce sorumlu ekleyin.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {teamMembers.map((m) => (
              <li
                key={m.personel_id}
                title={formatPersonelDisplayName(m)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  {(m.ad?.[0] || m.email?.[0] || '?').toUpperCase()}
                </span>
                {formatPersonelDisplayName(m)}
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}
    </div>
  )
}

/** Hex rengi koyulaştır (basit) */
function adjustColor(hex, amount) {
  const h = String(hex || '#2563EB').replace('#', '')
  if (h.length !== 6) return '#1e40af'
  const r = Math.max(0, Math.min(255, parseInt(h.slice(0, 2), 16) + amount))
  const g = Math.max(0, Math.min(255, parseInt(h.slice(2, 4), 16) + amount))
  const b = Math.max(0, Math.min(255, parseInt(h.slice(4, 6), 16) + amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
