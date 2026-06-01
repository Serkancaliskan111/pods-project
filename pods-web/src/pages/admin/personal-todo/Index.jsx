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
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import CubiclePageShell from '../../../components/cubicle/CubiclePageShell.jsx'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Sheet,
  Spinner,
  StatusBadge,
} from '../../../ui'
import PersonalTodoTemplateSheet from './PersonalTodoTemplateSheet.jsx'
import PersonalTodoTemplatesSheet from './PersonalTodoTemplatesSheet.jsx'
import PersonalTodoItemRow from './PersonalTodoItemRow.jsx'
import PersonalTodoListFilter from './PersonalTodoListFilter.jsx'
import {
  countPendingMedia,
  TODO_MADDE_TIP,
  TODO_MADDE_TIP_OPTIONS,
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
  yapilacak: { label: 'Devam ediyor', tone: 'info' },
  yapildi: { label: 'Tamamlandı', tone: 'success' },
  denetimde: { label: 'Denetimde', tone: 'warning' },
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
  const [newListTemplateId, setNewListTemplateId] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateEditorId, setTemplateEditorId] = useState(null)
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)

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
  }, [uid])

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
      toast.success('Plan kaydedildi')
    } catch (e) {
      toast.error(e?.message || 'Plan kaydedilemedi')
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
        if (newListDate) Object.assign(patch, buildPlanPatch({ planDate: newListDate, planTime: null }))
        await updatePersonalTodo({ userId: uid, id, patch })
      } else {
        id = await createPersonalTodoBlank({
          userId: uid,
          baslik: title,
          maddeler: [],
          planDate: newListDate || null,
        })
      }
      toast.success('Liste oluşturuldu')
      setNewListOpen(false)
      setNewListTitle('')
      setNewListDate('')
      setNewListTemplateId('')
      await load()
      setActiveId(id)
      setListFilter('yapilacak')
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
        setActiveId(null)
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
      await load()
      setActiveId(id)
      setListFilter('yapilacak')
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
      title="To-Do List"
      subtitle="Kişisel kontrol listeleriniz — planlayın, işaretleyin, isterseniz denetime gönderin."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<FileStack size={16} />}
            onClick={() => setTemplatesOpen(true)}
          >
            Şablonlar ({templates.length})
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
      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <aside className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
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
              <div className="px-3 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">Liste bulunamadı</p>
                <p className="mt-1 text-xs text-slate-500">
                  {listFilter === 'yapilacak'
                    ? 'Yeni liste oluşturarak başlayın.'
                    : 'Başka bir filtre seçin veya yeni liste ekleyin.'}
                </p>
                <Button
                  className="mt-4"
                  variant="secondary"
                  size="sm"
                  iconLeft={<Plus size={14} />}
                  onClick={() => setNewListOpen(true)}
                >
                  Yeni liste
                </Button>
              </div>
            ) : (
              filteredTodos.map((t) => {
                const p = progressOf(t.maddeler)
                const selected = String(activeId) === String(t.id)
                const overdue = isPlannedOverdue(t.planlanan_tarih, t.durum)
                const planText = formatPlanLabel(t.planlanan_tarih, t.planlanan_saat)
                const meta = DURUM_META[t.durum] || DURUM_META.yapilacak
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={`mb-1.5 w-full rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? 'border-primary-300 bg-primary-50 shadow-sm'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                    } ${overdue ? 'border-red-200' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-semibold text-slate-900">
                        {t.baslik}
                      </span>
                      <StatusBadge tone={meta.tone} size="sm">
                        {meta.label}
                      </StatusBadge>
                    </div>
                    {planText ? (
                      <p
                        className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                          overdue ? 'text-red-600' : 'text-sky-700'
                        }`}
                      >
                        <CalendarClock size={12} />
                        {planText}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-primary-500 transition-all"
                          style={{ width: `${p.pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">
                        {p.done}/{p.total || 0}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!active ? (
            <EmptyState
              className="m-auto max-w-sm py-16"
              title="Bir liste seçin"
              description="Soldan listenizi seçin veya yeni bir kontrol listesi oluşturun."
              icon={<ClipboardList size={48} strokeWidth={1.25} className="mx-auto text-slate-300" />}
              actionLabel="Yeni liste oluştur"
              onAction={() => setNewListOpen(true)}
            />
          ) : (
            <>
              <header className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
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
                      disabled={readOnly}
                      className="w-full border-0 bg-transparent text-xl font-bold text-slate-900 outline-none disabled:opacity-70"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge tone={(DURUM_META[active.durum] || DURUM_META.yapilacak).tone}>
                        {(DURUM_META[active.durum] || DURUM_META.yapilacak).label}
                      </StatusBadge>
                      <span className="text-sm text-slate-500">
                        {progress.done} / {progress.total} madde
                      </span>
                      {active.is_id ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
                          onClick={() => navigate(`/admin/tasks/${active.is_id}`)}
                        >
                          Görev kaydı
                          <ExternalLink size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {!readOnly ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Trash2 size={16} />}
                      onClick={() => setDeleteConfirm({ type: 'list' })}
                    >
                      Sil
                    </Button>
                  ) : null}
                </div>

                {!readOnly ? (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Plan
                      </span>
                      {!planEditing && planLabel ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary-600 hover:underline"
                          onClick={() => setPlanEditing(true)}
                        >
                          Düzenle
                        </button>
                      ) : null}
                    </div>
                    {planEditing || !planLabel ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="text-xs text-slate-600">
                          Tarih
                          <input
                            type="date"
                            value={planDate}
                            onChange={(e) => setPlanDate(e.target.value)}
                            className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Saat
                          <input
                            type="time"
                            value={planTime}
                            onChange={(e) => setPlanTime(e.target.value)}
                            className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                          />
                        </label>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPlanDate(todayDateInputValue())}
                        >
                          Bugün
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void savePlan(planDate, planTime)}
                        >
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
                      </div>
                    ) : (
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-sky-800">
                        <CalendarClock size={16} />
                        {planLabel}
                      </p>
                    )}
                  </div>
                ) : planLabel ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-amber-800">
                    <CalendarClock size={16} />
                    Plan: {planLabel}
                  </p>
                ) : null}
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                    <ListChecks size={32} className="mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-700">Henüz madde yok</p>
                    <p className="text-xs text-slate-500">Aşağıdan ilk maddenizi ekleyin.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {items.map((m) => (
                      <PersonalTodoItemRow
                        key={m.id}
                        item={m}
                        readOnly={readOnly}
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

                {!readOnly ? (
                  <form
                    className="mt-4 flex flex-wrap gap-2"
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
                    <select
                      value={newItemTip}
                      onChange={(e) => setNewItemTip(e.target.value)}
                      className="w-[108px] shrink-0 rounded-xl border border-slate-200 px-2 py-2.5 text-xs font-semibold"
                    >
                      {TODO_MADDE_TIP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      placeholder="Yeni madde…"
                      className="min-w-[180px] flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      Ekle
                    </Button>
                  </form>
                ) : null}
              </div>

              {!readOnly ? (
                <footer className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                  {pendingMediaCount > 0 ? (
                    <p className="mb-3 text-xs font-medium text-amber-800">
                      {pendingMediaCount} medya maddesi henüz yüklenmedi.
                    </p>
                  ) : null}
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
                      Tümünü tamamla
                    </Button>
                    <Button
                      disabled={submitting || !items.length}
                      iconLeft={<Send size={16} />}
                      onClick={async () => {
                        if (!personel) return
                        if (pendingMediaCount > 0) {
                          toast.error('Denetime göndermeden önce medya maddelerini tamamlayın')
                          return
                        }
                        setSubmitting(true)
                        try {
                          const isId = await submitPersonalTodoToAudit({
                            userId: uid,
                            personel,
                            todo: active,
                          })
                          toast.success('Denetim kuyruğuna gönderildi')
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
                <footer className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                  Bu liste denetimde — düzenleme kapalı. Görev kaydından takip edebilirsiniz.
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
        title="Yeni liste"
        className="px-5 pb-8"
      >
        <div className="mx-auto max-w-md space-y-4">
          <Input
            label="Liste adı"
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            placeholder="Örn: Vardiya kapanış"
            autoFocus
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
              Plan tarihi (isteğe bağlı)
            </span>
            <div className="flex gap-2">
              <input
                type="date"
                value={newListDate}
                onChange={(e) => setNewListDate(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <Button variant="secondary" size="sm" onClick={() => setNewListDate(todayDateInputValue())}>
                Bugün
              </Button>
            </div>
          </label>
          {templates.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                Şablondan doldur (isteğe bağlı)
              </span>
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
