import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FolderKanban, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import CubiclePageShell from '../../../components/cubicle/CubiclePageShell.jsx'
import ProjectTeamPanel from '../../../components/projects/ProjectTeamPanel.jsx'
import ProjectAuthorizedPanel from '../../../components/projects/ProjectAuthorizedPanel.jsx'
import { Button, ConfirmDialog, Input, Spinner } from '../../../ui'
import { cubicle } from '../../../theme/cubicle.js'
import {
  PROJECT_COLOR_PRESETS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from '../../../lib/projectStatus.js'
import {
  canManageProjectAuthorized,
  canManageProjectRecord,
} from '../../../lib/projectAccess.js'
import {
  fetchProjectById,
  fetchProjectMembers,
  fetchCompaniesForProjects,
  fetchProjectUnitLabel,
  softDeleteProject,
  updateProject,
} from '../../../lib/projectApi.js'

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-600">
      {children}
    </label>
  )
}

function projectToForm(p) {
  return {
    baslik: p.baslik || '',
    aciklama: p.aciklama || '',
    kod: p.kod || '',
    durum: p.durum || 'planlama',
    oncelik: p.oncelik || 'normal',
    baslangic_tarihi: p.baslangic_tarihi?.slice?.(0, 10) || '',
    bitis_tarihi: p.bitis_tarihi?.slice?.(0, 10) || '',
    renk: p.renk || PROJECT_COLOR_PRESETS[0],
    ana_sirket_id: p.ana_sirket_id || '',
  }
}

export default function ProjectEdit() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const [canEditProject, setCanEditProject] = useState(false)
  const [canEditAuthorized, setCanEditAuthorized] = useState(false)
  const currentCompanyId = personel?.ana_sirket_id || null
  const userId = profile?.id

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
      userId,
    }),
    [isSystemAdmin, currentCompanyId, personel, userId],
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [companies, setCompanies] = useState([])
  const [birimLabel, setBirimLabel] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [p, members] = await Promise.all([
        fetchProjectById(projectId, scopeCtx, {
          personelId: personel?.id,
          userId,
        }),
        fetchProjectMembers(projectId),
      ])
      if (!p) {
        toast.error('Proje bulunamadı veya erişim yetkiniz yok')
        navigate('/admin/projects')
        return
      }
      const canManage = canManageProjectRecord({
        isSystemAdmin,
        permissions,
        personelId: personel?.id,
        userId,
        project: p,
        members,
      })
      setCanEditProject(canManage)
      setCanEditAuthorized(
        canManageProjectAuthorized({
          isSystemAdmin,
          userId,
          project: p,
        }),
      )
      if (!canManage) {
        toast.error('Bu projeyi düzenleme yetkiniz yok.')
        navigate(`/admin/projects/${projectId}`, { replace: true })
        return
      }
      setForm(projectToForm(p))
      const [c, unitName] = await Promise.all([
        isSystemAdmin ? fetchCompaniesForProjects(scopeCtx) : Promise.resolve([]),
        fetchProjectUnitLabel(p.birim_id),
      ])
      setCompanies(c)
      setBirimLabel(unitName)
    } catch (e) {
      toast.error(e?.message || 'Yüklenemedi')
      navigate('/admin/projects')
    } finally {
      setLoading(false)
    }
  }, [
    projectId,
    scopeCtx,
    navigate,
    isSystemAdmin,
    permissions,
    personel?.id,
    userId,
  ])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!form?.baslik?.trim()) {
      toast.error('Proje adı zorunludur')
      return
    }
    setSaving(true)
    try {
      const { ana_sirket_id: _omit, ...patch } = form
      await updateProject(projectId, patch)
      toast.success('Proje kaydedildi')
      navigate(`/admin/projects/${projectId}`, { state: { refreshAt: Date.now() } })
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await softDeleteProject(projectId)
      toast.success('Proje silindi')
      navigate('/admin/projects')
    } catch (e) {
      toast.error(e?.message || 'Silinemedi')
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const accent = form.renk || '#2563EB'

  return (
    <CubiclePageShell
      title="Projeyi düzenle"
      subtitle={form.baslik || 'Proje ayarları ve ekip'}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/admin/projects/${projectId}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={16} /> Detaya dön
          </Link>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5"
          >
            <Save size={16} />
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          style={{ borderLeftWidth: 4, borderLeftColor: accent }}
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: accent }}
          >
            <FolderKanban size={22} strokeWidth={1.75} />
          </span>
          <p className="text-sm text-slate-600">
            Proje kartı, tarihler, durum ve ekip burada güncellenir. Görev planlaması detay
            sayfasından yapılır.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-900">Temel bilgiler</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-baslik">Proje adı *</Label>
              <Input
                id="edit-baslik"
                value={form.baslik}
                onChange={(e) => setForm((f) => ({ ...f, baslik: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-kod">Kod</Label>
                <Input
                  id="edit-kod"
                  value={form.kod}
                  onChange={(e) => setForm((f) => ({ ...f, kod: e.target.value }))}
                  placeholder="PRJ-001"
                />
              </div>
              <div>
                <Label htmlFor="edit-durum">Durum</Label>
                <select
                  id="edit-durum"
                  className="input w-full"
                  value={form.durum}
                  onChange={(e) => setForm((f) => ({ ...f, durum: e.target.value }))}
                >
                  {PROJECT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="edit-oncelik">Öncelik</Label>
                <select
                  id="edit-oncelik"
                  className="input w-full"
                  value={form.oncelik}
                  onChange={(e) => setForm((f) => ({ ...f, oncelik: e.target.value }))}
                >
                  {PROJECT_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {isSystemAdmin && companies.length > 0 ? (
                <div>
                  <Label htmlFor="edit-sirket">Şirket</Label>
                  <select
                    id="edit-sirket"
                    className="input w-full"
                    value={form.ana_sirket_id}
                    onChange={(e) => setForm((f) => ({ ...f, ana_sirket_id: e.target.value }))}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ana_sirket_adi}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-baslangic">Başlangıç</Label>
                <Input
                  id="edit-baslangic"
                  type="date"
                  value={form.baslangic_tarihi}
                  onChange={(e) => setForm((f) => ({ ...f, baslangic_tarihi: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-bitis">Bitiş</Label>
                <Input
                  id="edit-bitis"
                  type="date"
                  value={form.bitis_tarihi}
                  onChange={(e) => setForm((f) => ({ ...f, bitis_tarihi: e.target.value }))}
                />
              </div>
            </div>
            {birimLabel ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Birim kapsamı:</span> {birimLabel}
                <span className="mt-1 block text-xs text-slate-500">
                  Oluşturulurken otomatik atanır; ekip listesi bu birime göre filtrelenir.
                </span>
              </p>
            ) : null}
            <div>
              <Label>Proje rengi</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PROJECT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, renk: c }))}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      form.renk === c ? 'border-slate-800 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="edit-aciklama">Açıklama</Label>
              <textarea
                id="edit-aciklama"
                className="input min-h-[100px] w-full"
                value={form.aciklama}
                onChange={(e) => setForm((f) => ({ ...f, aciklama: e.target.value }))}
                placeholder="Proje kapsamı, hedefler…"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-bold text-slate-900">Proje yetkilileri</h2>
          <p className="mb-4 text-xs text-slate-500">
            {canEditAuthorized
              ? 'Proje.yonet yetkisi olan yöneticileri ekleyin veya çıkarın.'
              : 'Yetkili listesini yalnızca projeyi oluşturan düzenleyebilir.'}
          </p>
          <ProjectAuthorizedPanel
            projeId={projectId}
            scopeCtx={scopeCtx}
            readOnly={!canEditAuthorized}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-bold text-slate-900">Proje ekibi</h2>
          <p className="mb-4 text-xs text-slate-500">
            Yalnızca bu ekipteki personel planlama görevlerine atanabilir.
          </p>
          <ProjectTeamPanel projeId={projectId} scopeCtx={scopeCtx} readOnly={!canEditProject} />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline"
          >
            <Trash2 size={16} /> Projeyi sil
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: cubicle.greenCta }}
          >
            <Save size={16} />
            {saving ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Projeyi sil"
        message="Proje ve tüm planlama görevleri arşivlenir."
        confirmLabel="Sil"
        variant="danger"
        onConfirm={handleDelete}
      />
    </CubiclePageShell>
  )
}
