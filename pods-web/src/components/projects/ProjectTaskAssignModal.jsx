import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Link2, Plus, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../lib/supabaseClient'
import { filterTemplatesVisibleToUser } from '../../lib/taskTemplateScope.js'
import {
  GOREV_MODU_OPTIONS,
  GOREV_MODU_MODE_ICONS,
} from '../../lib/gorevModuOptions.js'
import {
  createProjectTask,
  personToPickerOption,
  updateProjectTask,
} from '../../lib/projectApi.js'
import { formatTaskTitleCase } from '../../lib/formatTaskTitle.js'
import {
  collectDescendantTaskIds,
  defaultPlanMetaForType,
  EMPTY_PLAN_META,
  moveListItem,
  normalizePlanMeta,
  resolvePrimaryAssignee,
  validateProjectTaskForm,
  validateProjectTaskPlan,
} from '../../lib/projectTaskPlan.js'
import { PROJECT_TASK_STATUS_OPTIONS } from '../../lib/projectStatus.js'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { canMarkBirebirGorev } from '../../lib/permissions.js'
import TaskOperationalOptionsPanel from '../tasks/TaskOperationalOptionsPanel.jsx'
import {
  TaskAssignOrderedPeoplePicker,
  TaskAssignPeopleChipPicker,
  TaskAssignRolePairPicker,
} from '../tasks/TaskAssignPersonPicker.jsx'
import FieldInfoTip from '../../ui/FieldInfoTip.jsx'
import Modal from '../../ui/Modal'
import { Button, Input, SettingSwitch } from '../../ui'
import { cn } from '../../lib/cn'

const supabase = getSupabase()

const STEPS = [
  { id: 'tur', label: 'Görev türü' },
  { id: 'bilgi', label: 'Bilgiler' },
  { id: 'atama', label: 'Atama' },
]

function todayFromProject(project) {
  return project?.baslangic_tarihi?.slice?.(0, 10) || new Date().toISOString().slice(0, 10)
}

function endFromProject(project, start) {
  return project?.bitis_tarihi?.slice?.(0, 10) || start
}

function buildEmptyForm(project, parentId = '') {
  const start = todayFromProject(project)
  return {
    parent_id: parentId || '',
    baslik: '',
    aciklama: '',
    baslangic_tarihi: start,
    bitis_tarihi: endFromProject(project, start),
    durum: 'yapilacak',
  }
}

function taskToState(task, project) {
  const meta = normalizePlanMeta(task?.plan_meta)
  return {
    gorevTipi: task?.gorev_tipi || 'normal',
    form: {
      parent_id: task?.parent_id || '',
      baslik: task?.baslik || '',
      aciklama: task?.aciklama || '',
      baslangic_tarihi: task?.baslangic_tarihi?.slice?.(0, 10) || todayFromProject(project),
      bitis_tarihi: task?.bitis_tarihi?.slice?.(0, 10) || endFromProject(project, todayFromProject(project)),
      durum: task?.durum || 'yapilacak',
    },
    planMeta: meta,
  }
}

function SiraliAdimEditor({ adimlar, teamOptions, onChange }) {
  const update = (idx, patch) => {
    onChange(adimlar.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }
  return (
    <div className="space-y-3">
      {adimlar.map((adim, idx) => (
        <div key={idx} className="space-y-2">
          <Input
            value={adim.baslik}
            onChange={(e) => update(idx, { baslik: e.target.value })}
            placeholder={`${idx + 1}. adım başlığı`}
          />
          <TaskAssignRolePairPicker
            stepIndex={idx + 1}
            yapanValue={adim.yapan_id}
            yapanOptions={teamOptions}
            onYapanChange={(id) => update(idx, { yapan_id: id || '' })}
            denetimciValue={adim.denetimci_id}
            denetimciOptions={teamOptions}
            onDenetimciChange={(id) => update(idx, { denetimci_id: id || '' })}
            onMoveUp={() =>
              onChange(moveListItem(adimlar, idx, -1))
            }
            onMoveDown={() =>
              onChange(moveListItem(adimlar, idx, 1))
            }
            onRemove={() => onChange(adimlar.filter((_, i) => i !== idx))}
            canRemove={adimlar.length > 1}
            compact
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!adim.acil}
                onChange={(e) => update(idx, { acil: e.target.checked })}
              />
              Acil
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!adim.foto_zorunlu}
                onChange={(e) =>
                  update(idx, {
                    foto_zorunlu: e.target.checked,
                    ...(e.target.checked ? { video_zorunlu: false } : {}),
                  })
                }
              />
              Foto
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!adim.video_zorunlu}
                onChange={(e) =>
                  update(idx, {
                    video_zorunlu: e.target.checked,
                    ...(e.target.checked ? { foto_zorunlu: false } : {}),
                  })
                }
              />
              Video
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!adim.aciklama_zorunlu}
                onChange={(e) => update(idx, { aciklama_zorunlu: e.target.checked })}
              />
              Açıklama zorunlu
            </label>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          onChange([
            ...adimlar,
            {
              baslik: '',
              yapan_id: '',
              denetimci_id: '',
              acil: false,
              foto_zorunlu: false,
              min_foto_sayisi: 1,
              video_zorunlu: false,
              min_video_sayisi: 1,
              max_video_suresi_sn: 60,
              aciklama_zorunlu: false,
            },
          ])
        }
      >
        <Plus size={14} /> Adım ekle
      </Button>
    </div>
  )
}

export default function ProjectTaskAssignModal({
  open,
  onClose,
  project,
  projectId,
  tasks = [],
  teamMembers = [],
  editingTask = null,
  defaultParentId = null,
  defaultAssigneeId = null,
  scopeCtx,
  onSaved,
  onLaunchOperational,
}) {
  const [step, setStep] = useState(0)
  const [gorevTipi, setGorevTipi] = useState('normal')
  const [form, setForm] = useState(() => buildEmptyForm(project, defaultParentId))
  const [planMeta, setPlanMeta] = useState(() => ({ ...EMPTY_PLAN_META }))
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState([])
  const [sablonQuestionCount, setSablonQuestionCount] = useState(0)
  const [sablonSorular, setSablonSorular] = useState([])
  const { profile } = useContext(AuthContext)
  const mayMarkBirebirGorev = canMarkBirebirGorev(
    profile?.yetkiler || {},
    !!profile?.is_system_admin,
  )

  const teamOptions = useMemo(
    () => teamMembers.map((m) => personToPickerOption(m)).filter(Boolean),
    [teamMembers],
  )

  const reset = useCallback(() => {
    if (editingTask) {
      const st = taskToState(editingTask, project)
      setGorevTipi(st.gorevTipi)
      setForm(st.form)
      setPlanMeta(st.planMeta)
    } else {
      setGorevTipi('normal')
      const f = buildEmptyForm(project, defaultParentId)
      setForm(f)
      const initialMeta = {
        ...EMPTY_PLAN_META,
        siraliAdimlar: [
          {
            baslik: '',
            yapan_id: '',
            denetimci_id: '',
            acil: false,
            foto_zorunlu: false,
            min_foto_sayisi: 1,
            video_zorunlu: false,
            min_video_sayisi: 1,
            max_video_suresi_sn: 60,
            aciklama_zorunlu: false,
          },
        ],
      }
      const prefillId =
        defaultAssigneeId != null && String(defaultAssigneeId)
          ? String(defaultAssigneeId)
          : teamMembers.length === 1
            ? String(teamMembers[0].personel_id)
            : null
      if (prefillId) {
        initialMeta.assigneeIds = [prefillId]
      }
      setPlanMeta(initialMeta)
    }
    setStep(0)
  }, [editingTask, project, defaultParentId, defaultAssigneeId, teamMembers])

  useEffect(() => {
    if (!open) return
    reset()
  }, [open, reset])

  useEffect(() => {
    if (!open || !project?.ana_sirket_id) {
      setTemplates([])
      return
    }
    supabase
      .from('is_sablonlari')
      .select('id,baslik,aciklama,ana_sirket_id,birim_id,kapsam')
      .is('silindi_at', null)
      .then(({ data, error }) => {
        if (error) {
          console.error(error)
          setTemplates([])
          return
        }
        const unitIds = [
          ...(scopeCtx?.accessibleUnitIds || []),
          project.birim_id,
        ].filter(Boolean)
        setTemplates(
          filterTemplatesVisibleToUser(data || [], {
            isSystemAdmin: scopeCtx?.isSystemAdmin,
            companyId: project.ana_sirket_id,
            accessibleUnitIds: unitIds,
          }),
        )
      })
  }, [open, project?.ana_sirket_id, project?.birim_id, scopeCtx])

  useEffect(() => {
    if (!planMeta.sablonId || gorevTipi !== 'sablon_gorev') {
      setSablonQuestionCount(0)
      setSablonSorular([])
      return
    }
    supabase
      .from('is_sablon_sorulari')
      .select('soru_tipi, foto_zorunlu, min_foto_sayisi, max_video_suresi_sn')
      .eq('sablon_id', planMeta.sablonId)
      .order('sira', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setSablonQuestionCount(0)
          setSablonSorular([])
          return
        }
        const rows = data || []
        setSablonSorular(rows)
        setSablonQuestionCount(rows.length)
      })
  }, [planMeta.sablonId, gorevTipi])

  const hasChecklistPhoto = useMemo(
    () =>
      sablonSorular.some(
        (q) =>
          q?.soru_tipi === 'FOTOGRAF' ||
          !!q?.foto_zorunlu ||
          (Number(q?.min_foto_sayisi) || 0) > 0,
      ),
    [sablonSorular],
  )
  const hasChecklistVideo = useMemo(
    () => sablonSorular.some((q) => q?.soru_tipi === 'VIDEO'),
    [sablonSorular],
  )

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === String(planMeta.sablonId)),
    [templates, planMeta.sablonId],
  )

  const excludedParentIds = useMemo(() => {
    if (!editingTask?.id) return new Set()
    return collectDescendantTaskIds(editingTask.id, tasks)
  }, [editingTask?.id, tasks])

  const parentOptions = useMemo(
    () =>
      tasks.filter(
        (t) =>
          String(t.id) !== String(editingTask?.id) && !excludedParentIds.has(String(t.id)),
      ),
    [tasks, editingTask, excludedParentIds],
  )

  const handleGorevTipiChange = (nextType) => {
    setGorevTipi(nextType)
    setPlanMeta((prev) => defaultPlanMetaForType(nextType, prev))
  }

  const validateStep = () => {
    if (step === 0) return null
    if (step === 1) return validateProjectTaskForm(form, project)
    if (step === 2) return validateProjectTaskPlan(gorevTipi, planMeta)
    return null
  }

  const syncCokluFromAssignees = (assigneeIds, operasyonel) => {
    const coklu = operasyonel.coklu_atama || assigneeIds.length > 1
    return { ...operasyonel, coklu_atama: coklu }
  }

  const addAssignee = (id) => {
    setPlanMeta((m) => {
      const op = m.operasyonel || {}
      let ids
      if (!op.coklu_atama) {
        ids = [String(id)]
      } else if (m.assigneeIds.some((x) => String(x) === String(id))) {
        ids = m.assigneeIds
      } else {
        ids = [...m.assigneeIds, String(id)]
      }
      return { ...m, assigneeIds: ids, operasyonel: syncCokluFromAssignees(ids, op) }
    })
  }

  const removeAssignee = (id) => {
    setPlanMeta((m) => {
      const ids = m.assigneeIds.filter((x) => String(x) !== String(id))
      const op = { ...m.operasyonel, coklu_atama: ids.length > 1 && !!m.operasyonel?.coklu_atama }
      return { ...m, assigneeIds: ids, operasyonel: op }
    })
  }

  const supportsMultiAssignee = gorevTipi === 'normal' || gorevTipi === 'sablon_gorev'
  const cokluAtama = !!planMeta.operasyonel?.coklu_atama

  const handleCokluAtamaChange = (enabled) => {
    setPlanMeta((m) => {
      let assigneeIds = m.assigneeIds
      if (!enabled && assigneeIds.length > 1) {
        assigneeIds = assigneeIds.slice(0, 1)
      }
      return {
        ...m,
        assigneeIds,
        operasyonel: {
          ...m.operasyonel,
          coklu_atama: enabled,
          ...(enabled ? {} : { bireysel: true }),
        },
      }
    })
  }

  const cokluAtamaSwitch = supportsMultiAssignee ? (
    <SettingSwitch
      variant="toolbar"
      accent="emerald"
      id="proje-coklu-atama"
      label="Çoklu atama"
      checked={cokluAtama}
      onChange={handleCokluAtamaChange}
    />
  ) : null

  const buildDraftTask = () => {
    const meta = normalizePlanMeta(planMeta)
    return {
      id: editingTask?.id,
      gorev_tipi: gorevTipi,
      plan_meta: meta,
      baslik: form.baslik,
      aciklama: form.aciklama,
      baslangic_tarihi: form.baslangic_tarihi,
      bitis_tarihi: form.bitis_tarihi,
      sorumlu_personel_id: resolvePrimaryAssignee(gorevTipi, meta),
      bagli_is_id: editingTask?.bagli_is_id,
    }
  }

  const goNext = () => {
    const err = validateStep()
    if (err) {
      toast.error(err)
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const persistTask = async () => {
    const formErr = validateProjectTaskForm(form, project)
    const planErr = validateProjectTaskPlan(gorevTipi, planMeta)
    const err = formErr || planErr
    if (err) {
      toast.error(err)
      return null
    }

    const meta = normalizePlanMeta(planMeta)
    const primary = resolvePrimaryAssignee(gorevTipi, meta)
    const op = meta.operasyonel
    const syncedMeta = {
      ...meta,
      operasyonel: {
        ...op,
        coklu_atama: op.coklu_atama || meta.assigneeIds.length > 1,
      },
    }
    const payload = {
      ...form,
      baslik: form.baslik.trim(),
      parent_id: form.parent_id || null,
      gorev_tipi: gorevTipi,
      plan_meta: syncedMeta,
      sorumlu_personel_id: primary,
      durum: form.durum,
    }

    if (editingTask) {
      return updateProjectTask(editingTask.id, payload, { projeId: projectId })
    }
    return createProjectTask(projectId, { ...payload, sira: tasks.length })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await persistTask()
      if (!saved) return
      toast.success(editingTask ? 'Planlama görevi güncellendi' : 'Planlama görevi eklendi')
      onSaved?.()
      onClose?.()
    } catch (e) {
      toast.error(e?.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndLaunch = async () => {
    if (!onLaunchOperational) return
    setSaving(true)
    try {
      const saved = await persistTask()
      if (!saved) return
      toast.success('Kaydedildi — operasyonel atama açılıyor')
      onSaved?.()
      onClose?.()
      onLaunchOperational(saved)
    } catch (e) {
      toast.error(e?.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const renderAssignment = () => {
    switch (gorevTipi) {
      case 'normal':
        return (
          <TaskAssignPeopleChipPicker
            title="Sorumlu personel"
            countLabel={planMeta.assigneeIds.length ? `${planMeta.assigneeIds.length} kişi` : null}
            tone="emerald"
            options={teamOptions}
            selectedIds={planMeta.assigneeIds}
            onAdd={addAssignee}
            onRemove={removeAssignee}
            emptyText="Ekip üyesi eklemek için + kullanın"
            headerAction={cokluAtamaSwitch}
            compact
          />
        )
      case 'sablon_gorev':
        return (
          <div className="space-y-4">
            <div>
              <label className="label-upper">Görev şablonu *</label>
              <select
                className="input"
                value={planMeta.sablonId}
                onChange={(e) => setPlanMeta((m) => ({ ...m, sablonId: e.target.value }))}
              >
                <option value="">Şablon seçin</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.baslik}
                  </option>
                ))}
              </select>
            </div>
            <TaskAssignPeopleChipPicker
              title="Sorumlular"
              countLabel={planMeta.assigneeIds.length ? `${planMeta.assigneeIds.length} kişi` : null}
              tone="fuchsia"
              options={teamOptions}
              selectedIds={planMeta.assigneeIds}
              onAdd={addAssignee}
              onRemove={removeAssignee}
              headerAction={cokluAtamaSwitch}
              compact
            />
          </div>
        )
      case 'zincir_gorev':
        return (
          <TaskAssignOrderedPeoplePicker
            title="Zincir görev sırası"
            countLabel={`${planMeta.zincirGorevIds.length} kişi`}
            tone="sky"
            options={teamOptions}
            orderedIds={planMeta.zincirGorevIds}
            onAdd={(id) =>
              setPlanMeta((m) => ({
                ...m,
                zincirGorevIds: [...m.zincirGorevIds, String(id)],
              }))
            }
            onRemove={(id) =>
              setPlanMeta((m) => ({
                ...m,
                zincirGorevIds: m.zincirGorevIds.filter((x) => String(x) !== String(id)),
              }))
            }
            onMove={(idx, dir) =>
              setPlanMeta((m) => ({
                ...m,
                zincirGorevIds: moveListItem(m.zincirGorevIds, idx, dir),
              }))
            }
            compact
          />
        )
      case 'zincir_onay':
        return (
          <TaskAssignOrderedPeoplePicker
            title="Zincir onay sırası"
            countLabel={`${planMeta.zincirOnayIds.length} kişi`}
            tone="indigo"
            icon={GOREV_MODU_MODE_ICONS.zincir_onay}
            options={teamOptions}
            orderedIds={planMeta.zincirOnayIds}
            onAdd={(id) =>
              setPlanMeta((m) => ({
                ...m,
                zincirOnayIds: [...m.zincirOnayIds, String(id)],
              }))
            }
            onRemove={(id) =>
              setPlanMeta((m) => ({
                ...m,
                zincirOnayIds: m.zincirOnayIds.filter((x) => String(x) !== String(id)),
              }))
            }
            onMove={(idx, dir) =>
              setPlanMeta((m) => ({
                ...m,
                zincirOnayIds: moveListItem(m.zincirOnayIds, idx, dir),
              }))
            }
            compact
          />
        )
      case 'zincir_gorev_ve_onay':
        return (
          <div className="space-y-4">
            <TaskAssignOrderedPeoplePicker
              title="1 — Zincir görev"
              countLabel={`${planMeta.zincirGorevIds.length}`}
              tone="sky"
              options={teamOptions}
              orderedIds={planMeta.zincirGorevIds}
              onAdd={(id) =>
                setPlanMeta((m) => ({
                  ...m,
                  zincirGorevIds: [...m.zincirGorevIds, String(id)],
                }))
              }
              onRemove={(id) =>
                setPlanMeta((m) => ({
                  ...m,
                  zincirGorevIds: m.zincirGorevIds.filter((x) => String(x) !== String(id)),
                }))
              }
              onMove={(idx, dir) =>
                setPlanMeta((m) => ({
                  ...m,
                  zincirGorevIds: moveListItem(m.zincirGorevIds, idx, dir),
                }))
              }
              compact
            />
            <TaskAssignOrderedPeoplePicker
              title="2 — Zincir onay"
              countLabel={`${planMeta.zincirOnayIds.length}`}
              tone="indigo"
              options={teamOptions}
              orderedIds={planMeta.zincirOnayIds}
              onAdd={(id) =>
                setPlanMeta((m) => ({
                  ...m,
                  zincirOnayIds: [...m.zincirOnayIds, String(id)],
                }))
              }
              onRemove={(id) =>
                setPlanMeta((m) => ({
                  ...m,
                  zincirOnayIds: m.zincirOnayIds.filter((x) => String(x) !== String(id)),
                }))
              }
              onMove={(idx, dir) =>
                setPlanMeta((m) => ({
                  ...m,
                  zincirOnayIds: moveListItem(m.zincirOnayIds, idx, dir),
                }))
              }
              compact
            />
          </div>
        )
      case 'sirali_gorev':
        return (
          <SiraliAdimEditor
            adimlar={planMeta.siraliAdimlar}
            teamOptions={teamOptions}
            onChange={(siraliAdimlar) => setPlanMeta((m) => ({ ...m, siraliAdimlar }))}
          />
        )
      default:
        return null
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      className="!max-w-[920px] !p-0"
      title={null}
    >
      <div className="flex max-h-[min(88vh,820px)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              {editingTask ? 'Planlama görevini düzenle' : 'Projeye görev ekle'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Görev türünü seçin, bilgileri girin, proje ekibinden sorumlu atayın.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-6 py-3">
          {STEPS.map((s, idx) => (
            <div
              key={s.id}
              className={cn(
                'flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-bold',
                idx === step ? 'bg-blue-600 text-white' : idx < step ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-400',
              )}
            >
              {idx + 1}. {s.label}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-800">Görev türü</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {GOREV_MODU_OPTIONS.map((opt) => {
                  const active = gorevTipi === opt.value
                  const ModeIcon = GOREV_MODU_MODE_ICONS[opt.value] || Link2
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleGorevTipiChange(opt.value)}
                      className={cn(
                        'relative flex min-h-[5.25rem] flex-col rounded-xl border px-3 py-3 text-left transition',
                        active
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/20'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <FieldInfoTip text={opt.hint} stopPropagation className="absolute right-2 top-2" />
                      <span
                        className={cn(
                          'mb-2 flex h-8 w-8 items-center justify-center rounded-lg',
                          active ? 'text-blue-700' : 'bg-slate-100 text-slate-500',
                        )}
                        style={active ? { backgroundColor: `${opt.color}22`, color: opt.color } : undefined}
                      >
                        <ModeIcon size={16} strokeWidth={2} />
                      </span>
                      <span className="text-sm font-bold text-slate-900">{opt.label}</span>
                      <span className="mt-0.5 text-xs text-slate-500">{opt.sub}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 lg:col-span-2">
                <div>
                  <label className="label-upper">Görev adı *</label>
                  <Input
                    value={form.baslik}
                    onChange={(e) => setForm((f) => ({ ...f, baslik: e.target.value }))}
                    onBlur={(e) =>
                      setForm((f) => ({ ...f, baslik: formatTaskTitleCase(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="label-upper">Üst görev</label>
                  <select
                    className="input"
                    value={form.parent_id}
                    onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
                  >
                    <option value="">Kök görev</option>
                    {parentOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.baslik}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label-upper">Başlangıç *</label>
                <Input
                  type="date"
                  value={form.baslangic_tarihi}
                  onChange={(e) => setForm((f) => ({ ...f, baslangic_tarihi: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-upper">Bitiş *</label>
                <Input
                  type="date"
                  value={form.bitis_tarihi}
                  onChange={(e) => setForm((f) => ({ ...f, bitis_tarihi: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-upper">Durum</label>
                <select
                  className="input"
                  value={form.durum}
                  onChange={(e) => setForm((f) => ({ ...f, durum: e.target.value }))}
                >
                  {PROJECT_TASK_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="label-upper">Not</label>
                <textarea
                  className="input min-h-[72px]"
                  value={form.aciklama}
                  onChange={(e) => setForm((f) => ({ ...f, aciklama: e.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {!teamOptions.length ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Proje ekibinde henüz kimse yok. Önce proje düzenleme sayfasından ekip üyesi ekleyin.
                </p>
              ) : (
                <>
                  {renderAssignment()}
                  {gorevTipi === 'sablon_gorev' && planMeta.sablonId && sablonQuestionCount > 0 ? (
                    <p className="text-xs text-slate-500">
                      Şablonda {sablonQuestionCount} checklist sorusu var.
                    </p>
                  ) : null}
                  <TaskOperationalOptionsPanel
                    gorevTipi={gorevTipi}
                    value={planMeta.operasyonel}
                    onChange={(operasyonel) => {
                      setPlanMeta((m) => {
                        let assigneeIds = m.assigneeIds
                        if (!operasyonel.coklu_atama && assigneeIds.length > 1) {
                          assigneeIds = assigneeIds.slice(0, 1)
                        }
                        return { ...m, operasyonel, assigneeIds }
                      })
                    }}
                    mayMarkBirebirGorev={mayMarkBirebirGorev}
                    assigneeCount={planMeta.assigneeIds.length}
                    selectedTemplate={selectedTemplate}
                    hasChecklistPhoto={hasChecklistPhoto}
                    hasChecklistVideo={hasChecklistVideo}
                    hideCokluAssign={supportsMultiAssignee}
                  />
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              İptal
            </Button>
            {step > 0 ? (
              <Button variant="ghost" onClick={goBack}>
                <ChevronLeft size={16} /> Geri
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button onClick={goNext}>
                İleri <ChevronRight size={16} />
              </Button>
            ) : (
              <>
                {onLaunchOperational && !editingTask?.bagli_is_id ? (
                  <Button
                    variant="ghost"
                    onClick={handleSaveAndLaunch}
                    disabled={saving || !teamOptions.length}
                  >
                    <Rocket size={14} /> Kaydet ve başlat
                  </Button>
                ) : null}
                <Button onClick={handleSave} disabled={saving || !teamOptions.length}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
