import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Search, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import CubiclePageShell, { CubicleCreateButton } from '../../../components/cubicle/CubiclePageShell.jsx'
import ProjectCreateModal from '../../../components/projects/ProjectCreateModal.jsx'
import {
  EmptyState,
  Input,
  Spinner,
  StatusBadge,
} from '../../../ui'
import {
  PROJECT_STATUS_OPTIONS,
  getProjectStatusOption,
} from '../../../lib/projectStatus.js'
import {
  fetchProjectTasks,
  fetchProjects,
} from '../../../lib/projectApi.js'
import { computeProjectProgress, formatProjectDateLabel } from '../../../lib/projectGanttUtils.js'
import { canManageProjects } from '../../../lib/permissions.js'

export default function ProjectsIndex() {
  const navigate = useNavigate()
  const { personel, profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id || null

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
    }),
    [isSystemAdmin, currentCompanyId, personel],
  )

  const [projects, setProjects] = useState([])
  const [progressMap, setProgressMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const permissions = profile?.yetkiler || {}
  const mayManageProjects = canManageProjects(permissions, isSystemAdmin, personel)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchProjects(scopeCtx, {
        status: statusFilter || undefined,
        search,
        personelId: personel?.id,
        userId: profile?.id,
      })
      setProjects(list)

      const prog = {}
      await Promise.all(
        list.slice(0, 40).map(async (p) => {
          try {
            const tasks = await fetchProjectTasks(p.id)
            prog[p.id] = computeProjectProgress(tasks)
          } catch {
            prog[p.id] = { pct: 0, total: 0, done: 0, blocked: 0 }
          }
        }),
      )
      setProgressMap(prog)
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Projeler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [scopeCtx, statusFilter, search, personel?.id, profile?.id])

  useEffect(() => {
    load()
  }, [load])

  return (
    <CubiclePageShell
      title="Projeler"
      subtitle="Size atanan, ekip veya yetkili olduğunuz projeler. Şirketteki diğer projeler bu listede görünmez."
      actions={
        mayManageProjects ? (
          <CubicleCreateButton onClick={() => setCreateOpen(true)}>
            <Plus size={18} strokeWidth={2.5} />
            Yeni proje
          </CubicleCreateButton>
        ) : null
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Proje adı veya kod ara…"
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
        >
          <option value="">Tüm durumlar</option>
          {PROJECT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={48} strokeWidth={1.25} />}
          title="Görüntülenecek proje yok"
          description={
            mayManageProjects
              ? 'Yeni proje oluşturun veya bir projeye ekip / yetkili olarak eklendiğinizde burada listelenir.'
              : 'Size atanan görev, ekip üyeliği veya yetkili olduğunuz bir proje bulunmuyor.'
          }
          actionLabel={mayManageProjects ? 'Proje oluştur' : undefined}
          onAction={mayManageProjects ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const st = getProjectStatusOption(p.durum)
            const prog = progressMap[p.id] || { pct: 0, total: 0, done: 0 }
            return (
              <Link
                key={p.id}
                to={`/admin/projects/${p.id}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: p.renk || '#2563EB' }}
                  >
                    <FolderKanban size={20} strokeWidth={1.75} />
                  </div>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                </div>
                <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-700">
                  {p.baslik}
                </h2>
                {p.kod ? (
                  <p className="mt-0.5 text-xs font-medium text-slate-400">{p.kod}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarRange size={14} />
                  {formatProjectDateLabel(p.baslangic_tarihi)} – {formatProjectDateLabel(p.bitis_tarihi)}
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>
                      {prog.done}/{prog.total} görev tamam
                    </span>
                    <span className="font-semibold text-slate-700">%{prog.pct}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${prog.pct}%`,
                        backgroundColor: p.renk || '#2563EB',
                      }}
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <ProjectCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => navigate(`/admin/projects/${created.id}`)}
      />
    </CubiclePageShell>
  )
}
