import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { ChevronLeft, ChevronRight, Link2, Plus, Rocket } from 'lucide-react-native'
import { useAuth } from '../../../contexts/AuthContext'
import getSupabase from '../../../lib/supabaseClient'
import { filterTemplatesVisibleToUser } from '../../../lib/taskTemplateScope.js'
import {
  GOREV_MODU_OPTIONS,
  GOREV_MODU_MODE_ICONS,
} from '../../../lib/gorevModuOptions.js'
import {
  createProjectTask,
  fetchProjectById,
  fetchProjectMembers,
  fetchProjectTasks,
  personToPickerOption,
  updateProjectTask,
} from '../../../lib/projectApi.js'
import { canManageProjectRecord, splitProjectMembers } from '../../../lib/projectAccess.js'
import { canMarkBirebirGorev } from '../../../lib/permissions.js'
import { buildOperationalPrefillParams } from '../../../lib/projectTaskOperationalPrefill.js'
import { formatTaskTitleCase } from '../../../lib/formatTaskTitle.js'
import {
  collectDescendantTaskIds,
  defaultPlanMetaForType,
  EMPTY_PLAN_META,
  moveListItem,
  normalizePlanMeta,
  resolvePrimaryAssignee,
  validateProjectTaskForm,
  validateProjectTaskPlan,
} from '../../../lib/projectTaskPlan.js'
import { PROJECT_TASK_STATUS_OPTIONS } from '../../../lib/projectStatus.js'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import TaskOperationalOptionsPanel from '../../../components/tasks/TaskOperationalOptionsPanel'
import {
  TaskAssignOrderedPeoplePicker,
  TaskAssignPeopleChipPicker,
  TaskAssignRolePairPicker,
  CokluAtamaSwitch,
} from '../../../components/tasks/TaskAssignPersonPicker'
import { AdminTextField, adminStyles } from '../adminScreenUtils'
import { Text, Button, Sheet, palette, spacing, radii } from '../../../ui'

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
      bitis_tarihi:
        task?.bitis_tarihi?.slice?.(0, 10) ||
        endFromProject(project, todayFromProject(project)),
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
    <View style={{ gap: spacing.sm }}>
      {adimlar.map((adim, idx) => (
        <View key={idx} style={{ gap: spacing.xs }}>
          <AdminTextField
            label={`${idx + 1}. adım başlığı`}
            value={adim.baslik}
            onChangeText={(v) => update(idx, { baslik: v })}
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
            onMoveUp={() => onChange(moveListItem(adimlar, idx, -1))}
            onMoveDown={() => onChange(moveListItem(adimlar, idx, 1))}
            onRemove={() => onChange(adimlar.filter((_, i) => i !== idx))}
            canRemove={adimlar.length > 1}
          />
          <View style={styles.adimFlags}>
            <FlagToggle label="Acil" value={!!adim.acil} onChange={(v) => update(idx, { acil: v })} />
            <FlagToggle
              label="Foto"
              value={!!adim.foto_zorunlu}
              onChange={(v) =>
                update(idx, { foto_zorunlu: v, ...(v ? { video_zorunlu: false } : {}) })
              }
            />
            <FlagToggle
              label="Video"
              value={!!adim.video_zorunlu}
              onChange={(v) =>
                update(idx, { video_zorunlu: v, ...(v ? { foto_zorunlu: false } : {}) })
              }
            />
            <FlagToggle
              label="Açıklama"
              value={!!adim.aciklama_zorunlu}
              onChange={(v) => update(idx, { aciklama_zorunlu: v })}
            />
          </View>
        </View>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onPress={() =>
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
        iconLeft={<Plus size={14} color={palette.primary[600]} />}
      >
        Adım ekle
      </Button>
    </View>
  )
}

function FlagToggle({ label, value, onChange }) {
  return (
    <View style={styles.flagToggle}>
      <Text variant="caption" weight="SemiBold" color={palette.slate[600]}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: palette.slate[200], true: palette.primary[300] }}
        thumbColor="#fff"
      />
    </View>
  )
}

function SelectSheet({ visible, onClose, title, options, value, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} padding="none" maxHeight="70%">
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.lg }}>
        <Text variant="h3" weight="Bold" color={palette.slate[900]} style={{ marginBottom: spacing.sm }}>
          {title}
        </Text>
      <ScrollView style={{ maxHeight: 360 }}>
        {options.map((o) => {
          const active = String(o.value) === String(value)
          return (
            <TouchableOpacity
              key={String(o.value)}
              style={[styles.selectRow, active && styles.selectRowActive]}
              onPress={() => {
                onSelect(o.value)
                onClose()
              }}
            >
              <Text variant="bodySm" weight={active ? 'Bold' : 'Medium'} color={active ? palette.primary[700] : palette.slate[800]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      </View>
    </Sheet>
  )
}

export default function ProjectTaskAssignScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const projectId = route.params?.projectId
  const editingTaskId = route.params?.editingTaskId || null
  const defaultParentId = route.params?.defaultParentId || null
  const defaultAssigneeId = route.params?.defaultAssigneeId || null
  const mayLaunchOperational = route.params?.mayLaunchOperational !== false

  const { personel, profile, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const mayMarkBirebirGorev = canMarkBirebirGorev(permissions, isSystemAdmin)

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId: personel?.ana_sirket_id || null,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
    }),
    [isSystemAdmin, personel],
  )

  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [editingTask, setEditingTask] = useState(null)

  const [step, setStep] = useState(0)
  const [gorevTipi, setGorevTipi] = useState('normal')
  const [form, setForm] = useState(() => buildEmptyForm(null, defaultParentId))
  const [planMeta, setPlanMeta] = useState(() => ({ ...EMPTY_PLAN_META }))
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState([])
  const [sablonQuestionCount, setSablonQuestionCount] = useState(0)
  const [sablonSorular, setSablonSorular] = useState([])
  const [parentSheetOpen, setParentSheetOpen] = useState(false)
  const [statusSheetOpen, setStatusSheetOpen] = useState(false)
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false)

  const teamOptions = useMemo(
    () => teamMembers.map((m) => personToPickerOption(m)).filter(Boolean),
    [teamMembers],
  )

  const resetFormState = useCallback(
    (p, editTask, parentId, assigneeId, members) => {
      if (editTask) {
        const st = taskToState(editTask, p)
        setGorevTipi(st.gorevTipi)
        setForm(st.form)
        setPlanMeta(st.planMeta)
      } else {
        setGorevTipi('normal')
        const f = buildEmptyForm(p, parentId)
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
          assigneeId != null && String(assigneeId)
            ? String(assigneeId)
            : members?.length === 1
              ? String(members[0].personel_id)
              : null
        if (prefillId) initialMeta.assigneeIds = [prefillId]
        setPlanMeta(initialMeta)
      }
      setStep(0)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!projectId) return
      setLoading(true)
      try {
        const [p, t, members] = await Promise.all([
          fetchProjectById(projectId, scopeCtx, {
            personelId: personel?.id,
            userId: profile?.id,
          }),
          fetchProjectTasks(projectId),
          fetchProjectMembers(projectId),
        ])
        if (cancelled) return
        if (!p) {
          Alert.alert('Hata', 'Proje bulunamadı')
          navigation.goBack()
          return
        }
        const canManage = canManageProjectRecord({
          isSystemAdmin,
          permissions,
          personelId: personel?.id,
          userId: profile?.id,
          project: p,
          members,
        })
        if (!canManage) {
          Alert.alert('Yetki', 'Proje yönetimi yetkiniz yok.')
          navigation.goBack()
          return
        }
        const { team } = splitProjectMembers(members)
        const editTask = editingTaskId ? t.find((x) => String(x.id) === String(editingTaskId)) : null
        setProject(p)
        setTasks(t)
        setTeamMembers(team)
        setEditingTask(editTask || null)
        resetFormState(p, editTask, defaultParentId, defaultAssigneeId, team)
      } catch (e) {
        if (!cancelled) Alert.alert('Hata', e?.message || 'Yüklenemedi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    editingTaskId,
    defaultParentId,
    defaultAssigneeId,
    scopeCtx,
    personel?.id,
    profile?.id,
    permissions,
    isSystemAdmin,
    navigation,
    resetFormState,
  ])

  useEffect(() => {
    if (!project?.ana_sirket_id) {
      setTemplates([])
      return
    }
    supabase
      .from('is_sablonlari')
      .select('id,baslik,aciklama,ana_sirket_id,birim_id,kapsam,foto_zorunlu,video_zorunlu,varsayilan_puan,puan')
      .is('silindi_at', null)
      .then(({ data, error }) => {
        if (error) {
          setTemplates([])
          return
        }
        const unitIds = [...(scopeCtx?.accessibleUnitIds || []), project.birim_id].filter(Boolean)
        setTemplates(
          filterTemplatesVisibleToUser(data || [], {
            isSystemAdmin: scopeCtx?.isSystemAdmin,
            companyId: project.ana_sirket_id,
            accessibleUnitIds: unitIds,
          }),
        )
      })
  }, [project?.ana_sirket_id, project?.birim_id, scopeCtx])

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

  const parentLabel = form.parent_id
    ? parentOptions.find((t) => String(t.id) === String(form.parent_id))?.baslik || 'Üst görev'
    : 'Kök görev'

  const statusLabel =
    PROJECT_TASK_STATUS_OPTIONS.find((o) => o.value === form.durum)?.label || form.durum

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
    <CokluAtamaSwitch value={cokluAtama} onChange={handleCokluAtamaChange} />
  ) : null

  const persistTask = async () => {
    const formErr = validateProjectTaskForm(form, project)
    const planErr = validateProjectTaskPlan(gorevTipi, planMeta)
    const err = formErr || planErr
    if (err) {
      Alert.alert('Eksik bilgi', err)
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

  const goNext = () => {
    const err = validateStep()
    if (err) {
      Alert.alert('Eksik bilgi', err)
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await persistTask()
      if (!saved) return
      Alert.alert('Başarılı', editingTask ? 'Planlama görevi güncellendi' : 'Planlama görevi eklendi')
      navigation.goBack()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndLaunch = async () => {
    setSaving(true)
    try {
      const saved = await persistTask()
      if (!saved) return
      navigation.replace('ExtraTask', buildOperationalPrefillParams(saved, { project, projectId }))
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kayıt başarısız')
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
          />
        )
      case 'sablon_gorev':
        return (
          <View style={{ gap: spacing.md }}>
            <View>
              <Text style={adminStyles.label}>Görev şablonu *</Text>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setTemplateSheetOpen(true)}>
                <Text variant="bodySm" color={planMeta.sablonId ? palette.slate[800] : palette.slate[400]}>
                  {selectedTemplate?.baslik || 'Şablon seçin'}
                </Text>
              </TouchableOpacity>
            </View>
            <TaskAssignPeopleChipPicker
              title="Sorumlular"
              countLabel={planMeta.assigneeIds.length ? `${planMeta.assigneeIds.length} kişi` : null}
              tone="fuchsia"
              options={teamOptions}
              selectedIds={planMeta.assigneeIds}
              onAdd={addAssignee}
              onRemove={removeAssignee}
              headerAction={cokluAtamaSwitch}
            />
          </View>
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
              setPlanMeta((m) => ({ ...m, zincirGorevIds: [...m.zincirGorevIds, String(id)] }))
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
          />
        )
      case 'zincir_onay':
        return (
          <TaskAssignOrderedPeoplePicker
            title="Zincir onay sırası"
            countLabel={`${planMeta.zincirOnayIds.length} kişi`}
            tone="indigo"
            options={teamOptions}
            orderedIds={planMeta.zincirOnayIds}
            onAdd={(id) =>
              setPlanMeta((m) => ({ ...m, zincirOnayIds: [...m.zincirOnayIds, String(id)] }))
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
          />
        )
      case 'zincir_gorev_ve_onay':
        return (
          <View>
            <TaskAssignOrderedPeoplePicker
              title="1 — Zincir görev"
              countLabel={`${planMeta.zincirGorevIds.length}`}
              tone="sky"
              options={teamOptions}
              orderedIds={planMeta.zincirGorevIds}
              onAdd={(id) =>
                setPlanMeta((m) => ({ ...m, zincirGorevIds: [...m.zincirGorevIds, String(id)] }))
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
            />
            <TaskAssignOrderedPeoplePicker
              title="2 — Zincir onay"
              countLabel={`${planMeta.zincirOnayIds.length}`}
              tone="indigo"
              options={teamOptions}
              orderedIds={planMeta.zincirOnayIds}
              onAdd={(id) =>
                setPlanMeta((m) => ({ ...m, zincirOnayIds: [...m.zincirOnayIds, String(id)] }))
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
            />
          </View>
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

  if (loading) {
    return (
      <AdminScreenLayout title="Görev ata">
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout
      title={editingTask ? 'Planlama görevini düzenle' : 'Projeye görev ekle'}
      subtitle="Görev türünü seçin, bilgileri girin, proje ekibinden sorumlu atayın."
      scroll={false}
    >
      <View style={styles.stepBar}>
        {STEPS.map((s, idx) => (
          <View
            key={s.id}
            style={[
              styles.stepPill,
              idx === step && styles.stepPillActive,
              idx < step && styles.stepPillDone,
            ]}
          >
            <Text
              variant="caption"
              weight="Bold"
              color={idx === step ? '#fff' : idx < step ? palette.primary[700] : palette.slate[400]}
              numberOfLines={1}
            >
              {idx + 1}. {s.label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? (
          <View>
            <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} style={{ marginBottom: spacing.sm }}>
              Görev türü
            </Text>
            <View style={styles.typeGrid}>
              {GOREV_MODU_OPTIONS.map((opt) => {
                const active = gorevTipi === opt.value
                const ModeIcon = GOREV_MODU_MODE_ICONS[opt.value] || Link2
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                    onPress={() => handleGorevTipiChange(opt.value)}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.typeIcon, active && { backgroundColor: `${opt.color}22` }]}>
                      <ModeIcon size={16} color={active ? opt.color : palette.slate[500]} strokeWidth={2} />
                    </View>
                    <Text variant="bodySm" weight="Bold" color={palette.slate[900]}>
                      {opt.label}
                    </Text>
                    <Text variant="caption" color={palette.slate[500]} numberOfLines={2}>
                      {opt.sub}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ gap: spacing.xs }}>
            <AdminTextField
              label="Görev adı *"
              value={form.baslik}
              onChangeText={(v) => setForm((f) => ({ ...f, baslik: v }))}
              onBlur={() => setForm((f) => ({ ...f, baslik: formatTaskTitleCase(f.baslik) }))}
            />
            <View>
              <Text style={adminStyles.label}>Üst görev</Text>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setParentSheetOpen(true)}>
                <Text variant="bodySm" color={palette.slate[800]} numberOfLines={1}>
                  {parentLabel}
                </Text>
              </TouchableOpacity>
            </View>
            <AdminTextField
              label="Başlangıç * (YYYY-MM-DD)"
              value={form.baslangic_tarihi}
              onChangeText={(v) => setForm((f) => ({ ...f, baslangic_tarihi: v }))}
            />
            <AdminTextField
              label="Bitiş * (YYYY-MM-DD)"
              value={form.bitis_tarihi}
              onChangeText={(v) => setForm((f) => ({ ...f, bitis_tarihi: v }))}
            />
            <View>
              <Text style={adminStyles.label}>Durum</Text>
              <TouchableOpacity style={styles.selectBtn} onPress={() => setStatusSheetOpen(true)}>
                <Text variant="bodySm" color={palette.slate[800]}>
                  {statusLabel}
                </Text>
              </TouchableOpacity>
            </View>
            <AdminTextField
              label="Not"
              value={form.aciklama}
              onChangeText={(v) => setForm((f) => ({ ...f, aciklama: v }))}
              multiline
              numberOfLines={3}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: spacing.md }}>
            {!teamOptions.length ? (
              <View style={styles.warnBox}>
                <Text variant="bodySm" color={palette.warning?.[800] || '#92400E'}>
                  Proje ekibinde henüz kimse yok. Önce proje düzenleme sayfasından ekip üyesi ekleyin.
                </Text>
              </View>
            ) : (
              <>
                {renderAssignment()}
                {gorevTipi === 'sablon_gorev' && planMeta.sablonId && sablonQuestionCount > 0 ? (
                  <Text variant="caption" color={palette.slate[500]}>
                    Şablonda {sablonQuestionCount} checklist sorusu var.
                  </Text>
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
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button variant="ghost" size="md" onPress={goBack} iconLeft={<ChevronLeft size={16} color={palette.slate[700]} />}>
            Geri
          </Button>
        ) : (
          <Button variant="ghost" size="md" onPress={() => navigation.goBack()}>
            İptal
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button variant="primary" size="md" onPress={goNext} iconRight={<ChevronRight size={16} color="#fff" />}>
            İleri
          </Button>
        ) : (
          <View style={styles.saveRow}>
            {mayLaunchOperational && !editingTask?.bagli_is_id ? (
              <Button
                variant="ghost"
                size="md"
                onPress={handleSaveAndLaunch}
                disabled={saving || !teamOptions.length}
                iconLeft={<Rocket size={14} color={palette.primary[700]} />}
              >
                Kaydet ve başlat
              </Button>
            ) : null}
            <Button variant="primary" size="md" onPress={handleSave} disabled={saving || !teamOptions.length}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </View>
        )}
      </View>

      <SelectSheet
        visible={parentSheetOpen}
        onClose={() => setParentSheetOpen(false)}
        title="Üst görev"
        value={form.parent_id}
        onSelect={(v) => setForm((f) => ({ ...f, parent_id: v }))}
        options={[{ value: '', label: 'Kök görev' }, ...parentOptions.map((t) => ({ value: t.id, label: t.baslik }))]}
      />
      <SelectSheet
        visible={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        title="Durum"
        value={form.durum}
        onSelect={(v) => setForm((f) => ({ ...f, durum: v }))}
        options={PROJECT_TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />
      <SelectSheet
        visible={templateSheetOpen}
        onClose={() => setTemplateSheetOpen(false)}
        title="Görev şablonu"
        value={planMeta.sablonId}
        onSelect={(v) => setPlanMeta((m) => ({ ...m, sablonId: v }))}
        options={[{ value: '', label: 'Şablon seçin' }, ...templates.map((t) => ({ value: t.id, label: t.baslik }))]}
      />
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  stepBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  stepPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    paddingVertical: 8,
    backgroundColor: palette.slate[50],
  },
  stepPillActive: {
    backgroundColor: palette.primary[600],
  },
  stepPillDone: {
    backgroundColor: palette.primary[50],
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeCard: {
    width: '48%',
    minHeight: 96,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
    padding: spacing.sm,
    gap: 4,
  },
  typeCardActive: {
    borderColor: palette.primary[600],
    backgroundColor: palette.primary[50],
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.slate[100],
    marginBottom: 4,
  },
  selectBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  selectRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  selectRowActive: {
    backgroundColor: palette.primary[50],
  },
  warnBox: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    padding: spacing.md,
  },
  adimFlags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  flagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.lg,
    backgroundColor: palette.slate[50],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.slate[200],
    backgroundColor: palette.surface,
  },
  saveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
})
