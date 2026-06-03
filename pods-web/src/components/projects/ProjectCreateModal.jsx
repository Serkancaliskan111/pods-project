import { useContext, useEffect, useMemo, useState } from 'react'
import { FolderKanban, X } from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import Modal from '../../ui/Modal'
import { Input } from '../../ui'
import { cubicle } from '../../theme/cubicle.js'
import {
  PROJECT_COLOR_PRESETS,
  PROJECT_PRIORITY_OPTIONS,
} from '../../lib/projectStatus.js'
import { ProjectTeamPickerDraft } from './ProjectTeamPanel.jsx'
import {
  createProject,
  fetchCompaniesForProjects,
  fetchStaffForProjects,
  resolveDefaultProjectBirimId,
} from '../../lib/projectApi.js'

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function buildInitialForm(companyId) {
  return {
    baslik: '',
    aciklama: '',
    kod: '',
    oncelik: 'normal',
    baslangic_tarihi: todayInput(),
    bitis_tarihi: '',
    renk: PROJECT_COLOR_PRESETS[0],
    ana_sirket_id: companyId || '',
  }
}

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-600">
      {children}
    </label>
  )
}

export default function ProjectCreateModal({ open, onClose, onCreated }) {
  const { user, personel, profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id || null

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: !!personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
    }),
    [isSystemAdmin, currentCompanyId, personel],
  )

  const [form, setForm] = useState(() => buildInitialForm(currentCompanyId))
  const [saving, setSaving] = useState(false)
  const [teamMemberIds, setTeamMemberIds] = useState([])
  const [staffPool, setStaffPool] = useState([])
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    if (!open) return
    setForm(buildInitialForm(currentCompanyId))
    setTeamMemberIds([])
    Promise.all([
      fetchStaffForProjects(scopeCtx),
      isSystemAdmin ? fetchCompaniesForProjects(scopeCtx) : Promise.resolve([]),
    ])
      .then(([s, c]) => {
        setStaffPool(s)
        setCompanies(c)
      })
      .catch(() => {})
  }, [open, scopeCtx, isSystemAdmin, currentCompanyId])

  const handleClose = () => {
    if (saving) return
    onClose?.()
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const created = await createProject(
        {
          ...form,
          birim_id: resolveDefaultProjectBirimId(scopeCtx, personel),
        },
        {
          userId: user?.id || profile?.id,
          companyId: form.ana_sirket_id || currentCompanyId,
          memberIds: teamMemberIds,
          creatorPersonelId: personel?.id,
        },
      )
      toast.success('Proje oluşturuldu')
      onCreated?.(created)
      onClose?.()
    } catch (e) {
      toast.error(e?.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Proje oluştur"
      size="xl"
      className="!flex !h-auto !max-h-[min(90vh,calc(100vh-2rem))] !w-full !max-w-[min(920px,calc(100vw-2rem))] !flex-col !overflow-hidden !rounded-2xl !border-[#E2E8F0] !p-0 !shadow-[0_20px_50px_rgba(15,23,42,0.12)]"
    >
      {open ? (
        <div className="task-assign-embedded flex max-h-[min(90vh,calc(100vh-2rem))] flex-col overflow-hidden">
          <div className="task-assign-embedded__header shrink-0 border-b px-5 py-2.5">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: form.renk || cubicle.sidebarBg }}
              >
                <FolderKanban size={18} strokeWidth={1.75} />
              </span>
              <p className="min-w-0 text-xs text-slate-500">
                Tarih, görev ve Gantt takibi için proje kartını oluşturun.
              </p>
            </div>
          </div>

          <div className="task-assign-embedded__body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="mb-4">
              <Label htmlFor="proje-baslik">Proje adı *</Label>
              <Input
                id="proje-baslik"
                value={form.baslik}
                onChange={(e) => setForm((f) => ({ ...f, baslik: e.target.value }))}
                placeholder="Örn. Mağaza yenileme 2026"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="proje-kod">Kod</Label>
                    <Input
                      id="proje-kod"
                      value={form.kod}
                      onChange={(e) => setForm((f) => ({ ...f, kod: e.target.value }))}
                      placeholder="PRJ-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="proje-oncelik">Öncelik</Label>
                    <select
                      id="proje-oncelik"
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
                </div>

                {isSystemAdmin && companies.length > 0 ? (
                  <div>
                    <Label htmlFor="proje-sirket">Şirket</Label>
                    <select
                      id="proje-sirket"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="proje-baslangic">Başlangıç</Label>
                    <Input
                      id="proje-baslangic"
                      type="date"
                      value={form.baslangic_tarihi}
                      onChange={(e) => setForm((f) => ({ ...f, baslangic_tarihi: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="proje-bitis">Bitiş</Label>
                    <Input
                      id="proje-bitis"
                      type="date"
                      value={form.bitis_tarihi}
                      onChange={(e) => setForm((f) => ({ ...f, bitis_tarihi: e.target.value }))}
                    />
                  </div>
                </div>

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
              </div>

              <div className="flex flex-col gap-3">
                <ProjectTeamPickerDraft
                  selectedIds={teamMemberIds}
                  onChange={setTeamMemberIds}
                  staffPool={staffPool}
                />
                <div>
                  <Label htmlFor="proje-aciklama">Açıklama</Label>
                  <textarea
                    id="proje-aciklama"
                    className="input mt-0 min-h-[72px] w-full flex-1 resize-none"
                    value={form.aciklama}
                    onChange={(e) => setForm((f) => ({ ...f, aciklama: e.target.value }))}
                    placeholder="Proje kapsamı, hedefler…"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="task-assign-embedded__footer flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
            >
              <X size={16} strokeWidth={2.2} />
              İptal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !form.baslik.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: cubicle.greenCta }}
            >
              {saving ? 'Oluşturuluyor…' : 'Projeyi oluştur'}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
