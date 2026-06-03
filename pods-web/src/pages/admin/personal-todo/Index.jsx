import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus,
  Send,
  CheckCircle2,
  ClipboardList,
  Trash2,
  FileStack,
  ExternalLink,
  CalendarClock,
  Search,
  ListChecks,
  AlignLeft,
  Camera,
  Film,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import CubiclePageShell from '../../../components/cubicle/CubiclePageShell.jsx'
import { Button, ConfirmDialog, EmptyState, Input, Sheet, Spinner } from '../../../ui'
import PersonalTodoTemplateSheet from './PersonalTodoTemplateSheet.jsx'
import PersonalTodoTemplatesSheet from './PersonalTodoTemplatesSheet.jsx'
import PersonalTodoItemRow from './PersonalTodoItemRow.jsx'
import PersonalTodoListFilter from './PersonalTodoListFilter.jsx'
import {
  countPendingMedia,
  TODO_MADDE_TIP,
} from '../../../lib/personalTodoItemTypes.js'
import {
  createPersonalTodoBlank,
  createPersonalTodoFromTemplate,
  deletePersonalTodo,
  deletePersonalTodoTemplate,
  fetchPersonalTodoTemplates,
  fetchPersonalTodos,
  formatPlanLabel,
  isPlannedOverdue,
  isPlannedToday,
  markPersonalTodoDone,
  parseTodoItems,
  submitPersonalTodoToAudit,
  todayDateInputValue,
  updatePersonalTodo,
  buildPlanPatch,
} from '../../../lib/personalTodoApi.js'

const DURUM_META = {
  yapilacak: { label: 'Devam ediyor', tone: 'text-primary-700 bg-primary-50' },
  yapildi: { label: 'Tamamlandı', tone: 'text-emerald-700 bg-emerald-50' },
  denetimde: { label: 'Onay bekliyor', tone: 'text-amber-800 bg-amber-50' },
}

function ProgressRing({ pct, size = 56 }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2563eb"
          strokeWidth={6}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
        {pct}%
      </span>
    </div>
  )
}

function progressOf(maddeler) {
  const items = parseTodoItems(maddeler)
  if (!items.length) return { done: 0, total: 0, pct: 0 }
  const done = items.filter((m) => m.tamamlandi).length
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

function timeInputFromDb(planlananSaat) {
  if (!planlananSaat) return ''
  return String(planlananSaat).slice(0, 5)
}

function matchesListFilter(todo, filterId) {
  if (filterId === 'yapilacak') return todo.durum === 'yapilacak'
  if (filterId === 'bugun')
    return todo.durum === 'yapilacak' && isPlannedToday(todo.planlanan_tarih)
  if (filterId === 'gecikmis') return isPlannedOverdue(todo.planlanan_tarih, todo.durum)
  if (filterId === 'tamamlanan') return todo.durum === 'yapildi'
  if (filterId === 'denetimde') return todo.durum === 'denetimde'
  return todo.durum === 'yapilacak'
}

export default function PersonalTodoIndex() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, personel } = useContext(AuthContext)
  const uid = user?.id

  const [todos, setTodos] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [listFilter, setListFilter] = useState('yapilacak')
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [newItemTip, setNewItemTip] = useState(TODO_MADDE_TIP.METIN)
  const [planDate, setPlanDate] = useState('')
  const [planTime, setPlanTime] = useState('')
  const [planEditing, setPlanEditing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const [newListOpen, setNewListOpen] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [newListDate, setNewListDate] = useState('')
  const [newListTime, setNewListTime] = useState('')
  const [newListTemplateId, setNewListTemplateId] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateEditorId, setTemplateEditorId] = useState(null)
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [listEditing, setListEditing] = useState(false)

  const selectList = useCallback(
    (id) => {
      setActiveId(id)
      setListEditing(false)
      if (id) {
        setSearchParams({ list: String(id) }, { replace: true })
      } else {
        setSearchParams({}, { replace: true })
      }
    },
    [setSearchParams],
  )

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    try {
      const [t, s] = await Promise.all([
        fetchPersonalTodos(uid),
        fetchPersonalTodoTemplates(uid),
      ])
      setTodos(t)
      setTemplates(s)
      setActiveId((prev) => {
        const deepLink = searchParams.get('list')
        if (deepLink && t.some((row) => String(row.id) === String(deepLink))) {
          return deepLink
        }
        if (prev && t.some((row) => String(row.id) === String(prev))) return prev
        const firstOpen = t.find((row) => row.durum === 'yapilacak')
        return firstOpen?.id ?? t[0]?.id ?? null
      })
    } catch (e) {
      toast.error(e?.message || 'Yüklenemedi')
      setTodos([])
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [uid, searchParams])

  useEffect(() => {
    const listId = searchParams.get('list')
    if (!listId || !todos.length) return
    if (todos.some((t) => String(t.id) === String(listId))) {
      setActiveId(listId)
      setListEditing(false)
      setListFilter('yapilacak')
    }
  }, [searchParams, todos])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const editId = searchParams.get('editTemplate')
    const isNew = searchParams.get('newTemplate') === '1'
    if (editId) {
      setTemplateEditorId(editId)
      setTemplateEditorOpen(true)
      setSearchParams({}, { replace: true })
    } else if (isNew) {
      setTemplateEditorId(null)
      setTemplateEditorOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const active = useMemo(
    () => todos.find((t) => String(t.id) === String(activeId)) || null,
    [todos, activeId],
  )

  useEffect(() => {
    if (!active) {
      setPlanDate('')
      setPlanTime('')
      setPlanEditing(false)
      return
    }
    setPlanDate(active.planlanan_tarih ? String(active.planlanan_tarih).slice(0, 10) : '')
    setPlanTime(timeInputFromDb(active.planlanan_saat))
    setPlanEditing(false)
  }, [active?.id, active?.planlanan_tarih, active?.planlanan_saat])

  const filteredTodos = useMemo(() => {
    const term = search.trim().toLowerCase()
    return todos.filter((t) => {
      if (!matchesListFilter(t, listFilter)) return false
      if (term && !(t.baslik || '').toLowerCase().includes(term)) return false
      return true
    })
  }, [todos, listFilter, search])

  const filterCounts = useMemo(() => {
    const term = search.trim().toLowerCase()
    const base = term
      ? todos.filter((t) => (t.baslik || '').toLowerCase().includes(term))
      : todos
    const count = (id) => base.filter((t) => matchesListFilter(t, id)).length
    return {
      yapilacak: count('yapilacak'),
      bugun: count('bugun'),
      gecikmis: count('gecikmis'),
      tamamlanan: count('tamamlanan'),
      denetimde: count('denetimde'),
    }
  }, [todos, search])


  const items = useMemo(() => parseTodoItems(active?.maddeler), [active])
  const progress = useMemo(() => progressOf(active?.maddeler), [active])
  const planLabel = useMemo(
    () => (active ? formatPlanLabel(active.planlanan_tarih, active.planlanan_saat) : null),
    [active],
  )
  const readOnly = active?.durum === 'denetimde'
  const canEditList = !readOnly && listEditing
  const pendingMediaCount = useMemo(() => countPendingMedia(items), [items])

  const persistItems = async (nextItems) => {
    if (!active || !uid) return
    await updatePersonalTodo({ userId: uid, id: active.id, patch: { maddeler: nextItems } })
    setTodos((rows) =>
      rows.map((r) => (r.id === active.id ? { ...r, maddeler: nextItems } : r)),
    )
  }

  const savePlan = async (dateVal, timeVal) => {
    if (!active || !uid || readOnly) return
    const patch = buildPlanPatch({ planDate: dateVal, planTime: timeVal })
    try {
      await updatePersonalTodo({ userId: uid, id: active.id, patch })
      setTodos((rows) => rows.map((r) => (r.id === active.id ? { ...r, ...patch } : r)))
      setPlanEditing(false)
      toast.success('Son tarih kaydedildi')
    } catch (e) {
      toast.error(e?.message || 'Son tarih kaydedilemedi')
    }
  }

  const handleCreateList = async () => {
    if (!uid) return
    const title = newListTitle.trim()
    if (!title) {
      toast.error('Liste adı girin')
      return
    }
    setCreatingList(true)
    try {
      let id
      if (newListTemplateId) {
        id = await createPersonalTodoFromTemplate({
          userId: uid,
          sablonId: newListTemplateId,
        })
        const patch = { baslik: title }
        if (newListDate) {
          Object.assign(patch, buildPlanPatch({ planDate: newListDate, planTime: newListTime || null }))
        }
        await updatePersonalTodo({ userId: uid, id, patch })
      } else {
        id = await createPersonalTodoBlank({
          userId: uid,
          baslik: title,
          maddeler: [],
          planDate: newListDate || null,
          planTime: newListTime || null,
        })
      }
      toast.success('Liste oluşturuldu')
      setNewListOpen(false)
      setNewListTitle('')
      setNewListDate('')
      setNewListTime('')
      setNewListTemplateId('')
      setListFilter('yapilacak')
      await load()
      selectList(id)
    } catch (e) {
      toast.error(e?.message || 'Oluşturulamadı')
    } finally {
      setCreatingList(false)
    }
  }

  const runConfirmedDelete = async () => {
    if (!deleteConfirm || !uid) return
    setDeleting(true)
    try {
      if (deleteConfirm.type === 'list') {
        if (!active || active.durum === 'denetimde') return
        await deletePersonalTodo(uid, active.id)
        toast.success('Liste silindi')
        setListEditing(false)
        setActiveId(null)
        setSearchParams({}, { replace: true })
      } else if (deleteConfirm.type === 'template') {
        await deletePersonalTodoTemplate(uid, deleteConfirm.sablonId)
        toast.success('Şablon silindi')
      }
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      toast.error(e?.message || 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  const handleFromTemplate = async (sablonId) => {
    if (!uid) return
    try {
      const id = await createPersonalTodoFromTemplate({ userId: uid, sablonId })
      setTemplatesOpen(false)
      toast.success('Liste oluşturuldu')
      setListFilter('yapilacak')
      await load()
      selectList(id)
    } catch (e) {
      toast.error(e?.message || 'Oluşturulamadı')
    }
  }

  const openTemplateEditor = (id) => {
    setTemplatesOpen(false)
    setTemplateEditorId(id)
    setTemplateEditorOpen(true)
  }

  return (
    <CubiclePageShell
      title="Kontrol listelerim"
      subtitle="Liste oluşturun, açılan listede maddeleri işaretleyin. Madde eklemek için «Liste düzenle»yi kullanın."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<FileStack size={16} />}
            onClick={() => setTemplatesOpen(true)}
          >
            Hazır şablonlar
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={16} />}
            onClick={() => setNewListOpen(true)}
          >
            Yeni liste
          </Button>
        </div>
      }
      contentClassName="pb-10"
    >
      <div className="grid min-h-[560px] gap-5 lg:grid-cols-[minmax(260px,300px)_1fr]">
        <aside className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Liste ara…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <PersonalTodoListFilter
              value={listFilter}
              onChange={setListFilter}
              counts={filterCounts}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : filteredTodos.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <ClipboardList size={22} className="text-slate-400" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">Henüz liste yok</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  İlk listenizi oluşturun; maddeleri tek tek işaretleyerek ilerleyin.
                </p>
                <Button
                  className="mt-4"
                  variant="primary"
                  size="sm"
                  iconLeft={<Plus size={14} />}
                  onClick={() => setNewListOpen(true)}
                >
                  Liste oluştur
                </Button>
              </div>
            ) : (
              filteredTodos.map((t) => {
                const p = progressOf(t.maddeler)
                const selected = String(activeId) === String(t.id)
                const overdue = isPlannedOverdue(t.planlanan_tarih, t.durum)
                const planText = formatPlanLabel(t.planlanan_tarih, t.planlanan_saat)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectList(t.id)}
                    className={`relative mb-1 w-full rounded-xl px-3 py-3 text-left transition ${
                      selected
                        ? 'bg-primary-50 shadow-sm ring-1 ring-primary-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {selected ? (
                      <span className="absolute bottom-2.5 left-0 top-2.5 w-1 rounded-full bg-primary-500" />
                    ) : null}
                    <p className="line-clamp-2 pl-0.5 text-sm font-semibold text-slate-900">{t.baslik}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-0.5 text-[11px] font-medium text-slate-500">
                      {planText ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                            overdue ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <CalendarClock size={11} />
                          {planText}
                        </span>
                      ) : null}
                      {p.total > 0 ? (
                        <span className="tabular-nums">
                          {p.done}/{p.total} madde
                        </span>
                      ) : (
                        <span>Boş liste</span>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          {!active ? (
            <EmptyState
              className="m-auto max-w-md py-16"
              title="Bir liste seçin"
              description="Soldan listenize dokunun veya hemen yeni bir kontrol listesi oluşturun."
              icon={<ClipboardList size={48} strokeWidth={1.25} className="mx-auto text-slate-300" />}
              actionLabel="Yeni liste oluştur"
              onAction={() => setNewListOpen(true)}
            />
          ) : (
            <>
              <header className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {canEditList ? (
                      <input
                        key={active.id}
                        type="text"
                        defaultValue={active.baslik}
                        onBlur={async (e) => {
                          if (!uid) return
                          const title = e.target.value.trim()
                          if (!title || title === active.baslik) return
                          try {
                            await updatePersonalTodo({
                              userId: uid,
                              id: active.id,
                              patch: { baslik: title },
                            })
                            setTodos((rows) =>
                              rows.map((r) => (r.id === active.id ? { ...r, baslik: title } : r)),
                            )
                          } catch {
                            toast.error('Başlık kaydedilemedi')
                          }
                        }}
                        className="w-full border-0 bg-transparent text-xl font-bold tracking-tight text-slate-900 outline-none placeholder:text-slate-400"
                        placeholder="Liste adı"
                      />
                    ) : (
                      <h2 className="text-xl font-bold tracking-tight text-slate-900">{active.baslik}</h2>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          (DURUM_META[active.durum] || DURUM_META.yapilacak).tone
                        }`}
                      >
                        {(DURUM_META[active.durum] || DURUM_META.yapilacak).label}
                      </span>
                      {active.is_id ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                          onClick={() => navigate(`/admin/tasks/${active.is_id}`)}
                        >
                          Bağlı görev
                          <ExternalLink size={12} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!readOnly ? (
                      canEditList ? (
                        <>
                          <Button variant="primary" size="sm" onClick={() => setListEditing(false)}>
                            Tamamlamaya dön
                          </Button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm({ type: 'list' })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                            Sil
                          </button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          iconLeft={<Pencil size={14} />}
                          onClick={() => setListEditing(true)}
                        >
                          Liste düzenle
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-br from-slate-50 to-primary-50/40 px-4 py-3">
                  <ProgressRing pct={progress.pct} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">
                      {progress.total === 0
                        ? 'Henüz madde eklenmedi'
                        : progress.done === progress.total
                          ? 'Tüm maddeler tamam!'
                          : `${progress.done} / ${progress.total} madde tamamlandı`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {progress.total === 0
                        ? canEditList
                          ? 'Aşağıdan madde ekleyin'
                          : 'Madde eklemek için «Liste düzenle»ye basın'
                        : progress.pct === 100
                          ? 'Listeyi kapatabilir veya denetime gönderebilirsiniz'
                          : 'Tamamladıkça daire dolacak'}
                    </p>
                  </div>
                </div>

                {canEditList ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                    <p className="mb-2 text-xs font-semibold text-slate-600">Son tarih</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <CalendarClock size={16} className="shrink-0 text-slate-400" />
                      {planEditing || !planLabel ? (
                        <>
                          <input
                            type="date"
                            value={planDate}
                            onChange={(e) => setPlanDate(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                          />
                          <input
                            type="time"
                            value={planTime}
                            onChange={(e) => setPlanTime(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                            title="Saat belirtmezseniz gün sonu (23:59) kullanılır"
                          />
                          <Button variant="secondary" size="sm" onClick={() => setPlanDate(todayDateInputValue())}>
                            Bugün
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => void savePlan(planDate, planTime)}>
                            Kaydet
                          </Button>
                          {planDate ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPlanDate('')
                                setPlanTime('')
                                void savePlan('', '')
                              }}
                            >
                              Kaldır
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-slate-700">{planLabel}</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                            onClick={() => setPlanEditing(true)}
                          >
                            <Pencil size={12} />
                            Düzenle
                          </button>
                        </>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      Son tarih günü ve bitişe 1 saat kala üst bardaki bildirim ziline uyarı gider.
                    </p>
                  </div>
                ) : planLabel ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
                    <CalendarClock size={16} className="text-slate-400" />
                    Son tarih: <span className="font-medium text-slate-800">{planLabel}</span>
                  </p>
                ) : null}
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {canEditList ? (
                  <form
                    className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/30 p-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const text = newItemText.trim()
                      if (!text) return
                      const next = [
                        ...items,
                        {
                          id: crypto.randomUUID(),
                          metin: text,
                          tamamlandi: false,
                          sira: items.length + 1,
                          tip: newItemTip,
                          medyaYol: null,
                        },
                      ]
                      void persistItems(next).then(() => {
                        setNewItemText('')
                        setNewItemTip(TODO_MADDE_TIP.METIN)
                      })
                    }}
                  >
                    <label className="mb-2 block text-xs font-semibold text-slate-600">
                      Yeni madde ekle
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        placeholder="Örn: Tezgahları temizle…"
                        className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                      />
                      <div className="flex shrink-0 gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
                        {[
                          { tip: TODO_MADDE_TIP.METIN, icon: AlignLeft, label: 'Madde' },
                          { tip: TODO_MADDE_TIP.FOTO, icon: Camera, label: 'Foto' },
                          { tip: TODO_MADDE_TIP.VIDEO, icon: Film, label: 'Video' },
                        ].map(({ tip, icon: Icon, label }) => (
                          <button
                            key={tip}
                            type="button"
                            title={label}
                            onClick={() => setNewItemTip(tip)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                              newItemTip === tip
                                ? 'bg-primary-600 text-white'
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <Icon size={14} />
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                      <Button type="submit" variant="primary" size="sm" disabled={!newItemText.trim()}>
                        Ekle
                      </Button>
                    </div>
                    {newItemTip !== TODO_MADDE_TIP.METIN ? (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Bu madde {newItemTip === TODO_MADDE_TIP.VIDEO ? 'video' : 'fotoğraf'} yüklenince
                        tamamlanabilir.
                      </p>
                    ) : null}
                  </form>
                ) : null}

                {items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                    <ListChecks size={36} className="mx-auto text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">Liste boş</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {readOnly
                        ? 'Bu listede madde yok.'
                        : canEditList
                          ? 'Yukarıdaki alana yazarak madde ekleyin.'
                          : 'Madde eklemek için «Liste düzenle»ye basın.'}
                    </p>
                    {!readOnly && !canEditList ? (
                      <Button
                        className="mt-4"
                        variant="secondary"
                        size="sm"
                        iconLeft={<Pencil size={14} />}
                        onClick={() => setListEditing(true)}
                      >
                        Liste düzenle
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {items.map((m) => (
                      <PersonalTodoItemRow
                        key={m.id}
                        item={m}
                        readOnly={readOnly}
                        editMode={canEditList}
                        todoId={active.id}
                        userId={uid}
                        onUpdate={(updated) => {
                          const next = items.map((row) =>
                            String(row.id) === String(updated.id) ? updated : row,
                          )
                          void persistItems(next)
                        }}
                        onRemove={() => {
                          const next = items.filter((row) => String(row.id) !== String(m.id))
                          void persistItems(next)
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {!readOnly && !canEditList ? (
                <footer className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
                  {pendingMediaCount > 0 ? (
                    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                      {pendingMediaCount} madde için henüz fotoğraf veya video yüklenmedi.
                    </p>
                  ) : null}
                  <p className="mb-3 text-xs leading-relaxed text-slate-500">
                    İşiniz bittiyse listeyi tamamlayın veya yöneticinizin onayına gönderin.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      iconLeft={<CheckCircle2 size={16} />}
                      onClick={async () => {
                        if (pendingMediaCount > 0) {
                          toast.error('Önce tüm fotoğraf/video maddelerini yükleyin')
                          return
                        }
                        try {
                          await markPersonalTodoDone({
                            userId: uid,
                            id: active.id,
                            maddeler: items.map((m) => ({ ...m, tamamlandi: true })),
                          })
                          toast.success('Liste tamamlandı')
                          await load()
                        } catch (e) {
                          toast.error(e?.message || 'Kaydedilemedi')
                        }
                      }}
                    >
                      Hepsini tamamla
                    </Button>
                    <Button
                      disabled={submitting || !items.length}
                      variant="primary"
                      iconLeft={<Send size={16} />}
                      onClick={async () => {
                        if (!personel) return
                        if (pendingMediaCount > 0) {
                          toast.error('Göndermeden önce medya maddelerini tamamlayın')
                          return
                        }
                        setSubmitting(true)
                        try {
                          const isId = await submitPersonalTodoToAudit({
                            userId: uid,
                            personel,
                            todo: active,
                          })
                          toast.success('Yöneticinize gönderildi')
                          await load()
                          if (isId) navigate(`/admin/tasks/${isId}`)
                        } catch (e) {
                          toast.error(e?.message || 'Gönderilemedi')
                        } finally {
                          setSubmitting(false)
                        }
                      }}
                    >
                      {submitting ? 'Gönderiliyor…' : 'Denetime gönder'}
                    </Button>
                  </div>
                </footer>
              ) : (
                <footer className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-950">
                  Bu liste onay sürecinde — düzenleme kapalı. Bağlı görev kaydından takip edebilirsiniz.
                </footer>
              )}
            </>
          )}
        </section>
      </div>

      <Sheet
        open={newListOpen}
        onClose={() => !creatingList && setNewListOpen(false)}
        side="bottom"
        title="Yeni kontrol listesi"
        className="px-5 pb-8"
      >
        <div className="mx-auto max-w-md space-y-4">
          <p className="text-sm text-slate-600">
            Listenize bir isim verin. Oluşturulunca liste otomatik açılır; maddeleri «Liste düzenle» ile ekleyebilirsiniz.
          </p>
          <Input
            label="Liste adı"
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            placeholder="Örn: Vardiya kapanış kontrolü"
            autoFocus
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Son tarih (isteğe bağlı)</span>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={newListDate}
                onChange={(e) => setNewListDate(e.target.value)}
                className="min-w-[140px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={newListTime}
                onChange={(e) => setNewListTime(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                title="Boş bırakılırsa gün sonu (23:59)"
              />
              <Button variant="secondary" size="sm" onClick={() => setNewListDate(todayDateInputValue())}>
                Bugün
              </Button>
            </div>
            <span className="text-[11px] text-slate-500">Saat belirtmezseniz bitiş gün sonu kabul edilir.</span>
          </label>
          {templates.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Hazır şablondan başla (isteğe bağlı)</span>
              <select
                value={newListTemplateId}
                onChange={(e) => setNewListTemplateId(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="">Boş liste</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.baslik}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setNewListOpen(false)} disabled={creatingList}>
              İptal
            </Button>
            <Button onClick={() => void handleCreateList()} disabled={creatingList}>
              {creatingList ? 'Oluşturuluyor…' : 'Oluştur'}
            </Button>
          </div>
        </div>
      </Sheet>

      <PersonalTodoTemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        templates={templates}
        onNew={() => openTemplateEditor(null)}
        onEdit={(id) => openTemplateEditor(id)}
        onUse={(id) => void handleFromTemplate(id)}
        onDelete={(t) =>
          setDeleteConfirm({ type: 'template', sablonId: t.id, baslik: t.baslik })
        }
      />

      <PersonalTodoTemplateSheet
        open={templateEditorOpen}
        templateId={templateEditorId}
        userId={uid}
        onClose={() => {
          setTemplateEditorOpen(false)
          setTemplateEditorId(null)
        }}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => !deleting && setDeleteConfirm(null)}
        title={deleteConfirm?.type === 'template' ? 'Şablonu sil' : 'Listeyi sil'}
        message={
          deleteConfirm?.type === 'template'
            ? `"${deleteConfirm.baslik}" şablonunu silmek istiyor musunuz?`
            : active
              ? `"${active.baslik}" listesini silmek istiyor musunuz?`
              : ''
        }
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        loading={deleting}
        onConfirm={() => void runConfirmedDelete()}
      />
    </CubiclePageShell>
  )
}
