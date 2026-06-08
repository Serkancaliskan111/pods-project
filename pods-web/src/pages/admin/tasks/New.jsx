import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import {
  AlignLeft,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  FileText,
  FolderOpen,
  LayoutGrid,
  Layers2,
  Link2,
  ListOrdered,
  SlidersHorizontal,
  Lock,
  Plus,
  Repeat,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  Video,
  X,
  Check,
} from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { filterTemplatesVisibleToUser } from '../../../lib/taskTemplateScope.js'
import { canAuditTaskStep, canMarkBirebirGorev, canAssignTask } from '../../../lib/permissions.js'
import {
  canSelectPersonelForAssignment,
  fetchRolePermissionsMap,
  filterAssignablePersonnel,
} from '../../../lib/taskAssignHierarchy.js'
import { GOREV_TURU } from '../../../lib/zincirTasks.js'
import { TASK_STATUS } from '../../../lib/taskStatus.js'
import { formatTaskTitleCase } from '../../../lib/formatTaskTitle.js'
import { deriveGorunurFromBaslamaIso } from '../../../lib/taskVisibility.js'
import {
  GOREV_MODU_OPTIONS,
  GOREV_MODU_MODE_ICONS,
  CHAIN_STEP_MODES,
} from '../../../lib/gorevModuOptions.js'
import { linkProjectTaskToOperational } from '../../../lib/projectApi.js'
import { normalizeOperasyonelOpts } from '../../../lib/projectTaskOperasyonel.js'
import { cubicle } from '../../../theme/cubicle.js'
import FieldInfoTip from '../../../ui/FieldInfoTip.jsx'
import {
  TaskAssignOrderedPeoplePicker,
  TaskAssignPeopleChipPicker,
  TaskAssignRolePairPicker,
  TaskAssignSinglePersonRow,
  TaskAssignUnitChipPicker,
  TaskAssignUnitSelect,
} from '../../../components/tasks/TaskAssignPersonPicker.jsx'

const supabase = getSupabase()

const EMBEDDED_SCROLL_STEPS = new Set(['adimlar', 'dosyalar', 'detaylar-atama'])

function LabelWithInfo({ htmlFor, children, info }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-600">
        {children}
      </label>
      {info ? <FieldInfoTip text={info} /> : null}
    </div>
  )
}

function toWeekdayNumber(date) {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

function parseClock(value, fallbackHour, fallbackMinute) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return [fallbackHour, fallbackMinute]
  const hh = Math.min(23, Math.max(0, Number(match[1]) || 0))
  const mm = Math.min(59, Math.max(0, Number(match[2]) || 0))
  return [hh, mm]
}

function buildRecurrenceWindows({
  repeatActive,
  repeatType,
  startAt,
  endAt,
  repeatDays,
  intervalHours,
  dailyStartClock,
  dailyEndClock,
  weeklyDays,
  weeklyWeeks,
}) {
  if (!repeatActive) {
    return [{ baslamaIso: startAt.toISOString(), sonIso: endAt.toISOString() }]
  }

  const windows = []
  if (repeatType === 'daily_hourly') {
    const stepMs = Math.max(1, Number(intervalHours) || 1) * 60 * 60 * 1000
    const dayCount = Math.max(1, Number(repeatDays) || 30)
    const durationMs = endAt.getTime() - startAt.getTime()
    const [startHour, startMinute] = parseClock(
      dailyStartClock,
      startAt.getHours(),
      startAt.getMinutes(),
    )
    const [endHour, endMinute] = parseClock(
      dailyEndClock,
      endAt.getHours(),
      endAt.getMinutes(),
    )
    for (let day = 0; day < dayCount; day++) {
      const dayStart = new Date(startAt)
      dayStart.setDate(dayStart.getDate() + day)
      dayStart.setHours(startHour, startMinute, 0, 0)
      const dayEndBound = new Date(startAt)
      dayEndBound.setDate(dayEndBound.getDate() + day)
      dayEndBound.setHours(endHour, endMinute, 0, 0)
      if (dayEndBound <= dayStart) continue
      for (let ts = dayStart.getTime(); ts <= dayEndBound.getTime(); ts += stepMs) {
        const baslama = new Date(ts)
        const son = new Date(ts + durationMs)
        windows.push({ baslamaIso: baslama.toISOString(), sonIso: son.toISOString() })
      }
    }
    return windows
  }

  const selectedDays = Array.isArray(weeklyDays)
    ? weeklyDays.map((v) => Number(v)).filter((v) => v >= 1 && v <= 7)
    : []
  const maxWeeks = Math.max(1, Number(weeklyWeeks) || 8)
  const rangeStart = new Date(startAt)
  const rangeEnd = new Date(startAt)
  rangeEnd.setDate(rangeEnd.getDate() + maxWeeks * 7 - 1)
  const durationMs = endAt.getTime() - startAt.getTime()
  for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
    if (!selectedDays.includes(toWeekdayNumber(cursor))) continue
    const baslama = new Date(cursor)
    baslama.setHours(startAt.getHours(), startAt.getMinutes(), startAt.getSeconds(), 0)
    if (baslama < startAt) continue
    const son = new Date(baslama.getTime() + durationMs)
    windows.push({ baslamaIso: baslama.toISOString(), sonIso: son.toISOString() })
  }
  return windows
}

function formatDateTimeLocalInput(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

function splitDateTimeParts(value) {
  const raw = String(value || '').trim()
  if (!raw) return { date: '', time: '' }
  const [date = '', time = ''] = raw.split('T')
  return { date, time: String(time || '').slice(0, 5) }
}

function mergeDateAndTime(datePart, timePart, fallbackTime = '09:00') {
  const date = String(datePart || '').trim()
  if (!date) return ''
  const time = String(timePart || '').trim() || fallbackTime
  return `${date}T${time}`
}

function parseDateOnlyPart(datePart) {
  const raw = String(datePart || '').trim()
  if (!raw) return null
  const [y, m, d] = raw.split('-').map((v) => Number(v))
  if (!y || !m || !d) return null
  const out = new Date(y, m - 1, d, 0, 0, 0, 0)
  return Number.isNaN(out.getTime()) ? null : out
}

function todayDatePart() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function personName(p) {
  if (!p) return ''
  const n = [p.ad, p.soyad].filter(Boolean).join(' ').trim()
  return n || p.email || String(p.id)
}

/** Görev atama personel listeleri — ad/soyad (Türkçe alfabe), yoksa e-posta / kod / id */
function sortPersonnelRowsAlphabeticalTr(rows) {
  const locale = 'tr'
  const sortKey = (p) => {
    const name = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim()
    if (name) return name.toLocaleLowerCase(locale)
    if (p?.email) return String(p.email).toLocaleLowerCase(locale)
    const kod = p?.personel_kodu != null ? String(p.personel_kodu).trim() : ''
    if (kod) return kod.toLocaleLowerCase(locale)
    return String(p?.id ?? '')
  }
  return [...(rows || [])].sort((a, b) => {
    const cmp = sortKey(a).localeCompare(sortKey(b), locale, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), locale, { numeric: true })
  })
}

function FieldSwitch({ id, checked, onChange, disabled, label, description, compact = false }) {
  return (
    <div
      className={`flex border border-slate-200 bg-slate-50/90 transition ${
        compact ? 'items-center justify-between gap-2 rounded-lg px-2.5 py-2' : 'items-start justify-between gap-4 rounded-2xl px-4 py-3'
      } ${disabled ? 'opacity-55' : ''}`}
    >
      <div className="min-w-0">
        <div className={compact ? 'text-[11px] font-semibold text-slate-900' : 'text-sm font-semibold text-slate-900'}>
          {label}
        </div>
        {!compact && description ? (
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
          compact ? 'h-5 w-9' : 'h-7 w-12'
        } ${checked ? 'bg-indigo-600' : 'bg-slate-300'} ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block rounded-full bg-white shadow transition duration-200 ease-in-out ${
            compact
              ? `h-4 w-4 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`
              : `h-6 w-6 translate-x-0.5 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`
          }`}
        />
      </button>
    </div>
  )
}

function TekrarlayanConfig({ form, setForm, inp, compact = false }) {
  const lbl = compact ? 'mb-0.5 block text-[10px] font-medium text-slate-600' : 'mb-1 block text-xs font-medium text-slate-600'
  const wrap = compact ? 'rounded-lg border border-slate-200 bg-white px-2 py-2' : 'rounded-xl border border-slate-200 bg-white px-4 py-3'
  return (
    <div className={wrap}>
      <label className={lbl}>Tekrar tipi</label>
      <select
        value={form.tekrar_tipi}
        onChange={(e) => setForm((f) => ({ ...f, tekrar_tipi: e.target.value }))}
        className={`${inp} ${compact ? 'mb-2 max-w-full text-xs' : 'mb-3 max-w-[260px]'}`}
      >
        <option value="daily_hourly">Saatlik tekrar (gun bazli)</option>
        <option value="weekly">Haftalik tekrar</option>
      </select>
      {form.tekrar_tipi === 'daily_hourly' ? (
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'gap-3 sm:grid-cols-2'}`}>
          <div>
            <label className={lbl}>Kac gun tekrar etsin? (1-90)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={form.tekrar_gun}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tekrar_gun: Math.min(90, Math.max(1, Number(e.target.value) || 30)),
                }))
              }
              className={`${inp} ${compact ? 'max-w-full text-xs' : 'max-w-[140px]'}`}
            />
          </div>
          <div>
            <label className={lbl}>Gun ici saat araligi</label>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={form.tekrar_gun_ici_baslangic}
                onChange={(e) => setForm((f) => ({ ...f, tekrar_gun_ici_baslangic: e.target.value }))}
                className={`${inp} ${compact ? 'min-w-0 flex-1 text-xs' : 'max-w-[140px]'}`}
              />
              <span className="text-slate-500">-</span>
              <input
                type="time"
                value={form.tekrar_gun_ici_bitis}
                onChange={(e) => setForm((f) => ({ ...f, tekrar_gun_ici_bitis: e.target.value }))}
                className={`${inp} ${compact ? 'min-w-0 flex-1 text-xs' : 'max-w-[140px]'}`}
              />
            </div>
          </div>
          <div>
            <label className={lbl}>Saat araligi (1-24)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={form.tekrar_saat_araligi}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tekrar_saat_araligi: Math.min(24, Math.max(1, Number(e.target.value) || 2)),
                }))
              }
              className={`${inp} ${compact ? 'max-w-full text-xs' : 'max-w-[140px]'}`}
            />
          </div>
        </div>
      ) : (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          <div>
            <label className={lbl}>Haftada hangi gunler?</label>
            <div className="flex flex-wrap gap-1">
              {[
                { v: 1, l: 'Pzt' },
                { v: 2, l: 'Sal' },
                { v: 3, l: 'Car' },
                { v: 4, l: 'Per' },
                { v: 5, l: 'Cum' },
                { v: 6, l: 'Cmt' },
                { v: 7, l: 'Paz' },
              ].map((d) => {
                const active = (form.tekrar_hafta_gunleri || []).includes(d.v)
                return (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() =>
                      setForm((f) => {
                        const prev = Array.isArray(f.tekrar_hafta_gunleri) ? f.tekrar_hafta_gunleri : []
                        const next = prev.includes(d.v)
                          ? prev.filter((x) => x !== d.v)
                          : [...prev, d.v].sort((a, b) => a - b)
                        return { ...f, tekrar_hafta_gunleri: next }
                      })
                    }
                    className={`rounded-full border font-semibold ${
                      compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
                    } ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    {d.l}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className={lbl}>Kac hafta planlansin? (1-52)</label>
            <input
              type="number"
              min={1}
              max={52}
              value={form.tekrar_hafta_sayisi}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tekrar_hafta_sayisi: Math.min(52, Math.max(1, Number(e.target.value) || 8)),
                }))
              }
              className={`${inp} ${compact ? 'max-w-full text-xs' : 'max-w-[140px]'}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function InlineSwitch({ id, checked, onChange, label, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function sanitizeStorageFileName(name) {
  const raw = String(name || 'dosya').trim()
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_')
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'

const sectionCardClass =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]'
const embeddedInputClass = inputClass
const embeddedSectionClass = sectionCardClass
const buildDefaultSiraliAdim = () => ({
  adim_baslik: '',
  adim_aciklama: '',
  baslama_tarihi: '',
  bitis_tarihi: '',
  puan: 0,
  personel_id: '',
  denetimci_personel_id: '',
  acil: false,
  aciklama_zorunlu: false,
  foto_zorunlu: false,
  min_foto_sayisi: 1,
  video_zorunlu: false,
  min_video_sayisi: 1,
  max_video_suresi_sn: 60,
  belge_zorunlu: false,
  min_belge_sayisi: 1,
  referans_dosyalar: [],
})
const buildInitialTaskForm = () => ({
  sablon_id: '',
  baslik: '',
  ana_sirket_id: '',
  birim_id: '',
  personel_id: '',
  baslama_tarihi: mergeDateAndTime(todayDatePart(), '09:00'),
  bitis_tarihi: '',
  acil: false,
  foto_zorunlu: false,
  min_foto_sayisi: 0,
  video_zorunlu: false,
  min_video_sayisi: 0,
  max_video_suresi_sn: 60,
  belge_zorunlu: false,
  min_belge_sayisi: 0,
  aciklama_zorunlu: false,
  aciklama: '',
  ozel_gorev: false,
  puan: 0,
  bireysel: true,
  coklu_atama: false,
  tekrarlayan: false,
  tekrar_gun: 30,
  tekrar_tipi: 'daily_hourly',
  tekrar_saat_araligi: 2,
  tekrar_gun_ici_baslangic: '09:00',
  tekrar_gun_ici_bitis: '18:00',
  tekrar_hafta_gunleri: [1, 5],
  tekrar_hafta_sayisi: 8,
  baslama_zaman_sec: false,
})

const MIXED_UNITS_VALUE = '__mixed_units__'
const ASSIGNMENT_TARGETS = [
  { key: 'personeller', label: 'Birimden Personel' },
  { key: 'karma_personeller', label: 'Karma Birim Personel' },
  { key: 'birimler', label: 'Birim Bazlı' },
  { key: 'sirket', label: 'Tüm Şirket' },
]
const WIZARD_STEPS = [
  { id: 1, label: 'Temel Bilgi' },
  { id: 2, label: 'Atama' },
  { id: 3, label: 'Zamanlama' },
  { id: 4, label: 'Onay' },
]

const ASSIGN_TABS = [
  { id: 'detaylar', label: 'Detaylar', icon: FileText },
  { id: 'dosyalar', label: 'Dosyalar', icon: FolderOpen },
  { id: 'adimlar', label: 'Adımlar', icon: ListOrdered },
  { id: 'tekrarlama', label: 'Zamanlama', icon: Clock3 },
  { id: 'diger', label: 'Diğer', icon: LayoutGrid },
]

export function TaskAssignForm({ embedded = false, initialSearch = '', onClose } = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const mayMarkBirebirGorev = useMemo(
    () => canMarkBirebirGorev(permissions, isSystemAdmin),
    [permissions, isSystemAdmin],
  )
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const currentPersonelId = personel?.id ? String(personel.id) : ''
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const mayAssign = useMemo(
    () => canAssignTask(permissions, isSystemAdmin, personel),
    [permissions, isSystemAdmin, personel],
  )

  const [templates, setTemplates] = useState([])
  const [rolePermMap, setRolePermMap] = useState({})
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [persons, setPersons] = useState([])
  const [onayPersons, setOnayPersons] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState(buildInitialTaskForm)

  const [gorevModu, setGorevModu] = useState('')
  const templateAllowedInMode = gorevModu === 'sablon_gorev'
  const standardModeActive = gorevModu === 'normal' || gorevModu === 'sablon_gorev'
  const [zincirGorevSira, setZincirGorevSira] = useState([])
  const [zincirOnaySira, setZincirOnaySira] = useState([])
  const [siraliAdimlar, setSiraliAdimlar] = useState([buildDefaultSiraliAdim()])
  const [taskReferenceFiles, setTaskReferenceFiles] = useState([])
  const [currentStep, setCurrentStep] = useState(1)
  const [maxVisitedStep, setMaxVisitedStep] = useState(1)
  const [embeddedStepIndex, setEmbeddedStepIndex] = useState(0)
  const [stepHint, setStepHint] = useState('')
  const [selectedUrgentQuick, setSelectedUrgentQuick] = useState(30)
  const [assignmentTarget, setAssignmentTarget] = useState('personeller')
  const prevAssignmentTargetRef = useRef('personeller')
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([])
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  /** Şablon checklist soruları — foto tekrarını gizlemek için */
  const [sablonSorular, setSablonSorular] = useState([])
  const lastAppliedSablonId = useRef('')

  const accessibleUnitIdsKey = JSON.stringify(accessibleUnitIds || [])

  const selectedTemplate = useMemo(
    () =>
      templateAllowedInMode
        ? templates.find((t) => String(t.id) === String(form.sablon_id))
        : null,
    [templates, form.sablon_id, templateAllowedInMode],
  )

  /** Şablon checklist’inde foto maddesi var mı (ham veri; mod kontrolü ayrı) */
  const sablonChecklistFotoVar = useMemo(
    () =>
      (sablonSorular || []).some(
        (q) =>
          q?.soru_tipi === 'FOTOGRAF' ||
          !!q?.foto_zorunlu ||
          (Number(q?.min_foto_sayisi) || 0) > 0,
      ),
    [sablonSorular],
  )

  const sablonChecklistVideoVar = useMemo(
    () =>
      (sablonSorular || []).some(
        (q) => String(q?.soru_tipi || '').toUpperCase() === 'VIDEO',
      ),
    [sablonSorular],
  )

  /** Checklist yalnızca şablon görev modunda işlenir */
  const hasChecklistPhoto = gorevModu === 'sablon_gorev' && sablonChecklistFotoVar

  const hasChecklistVideo = gorevModu === 'sablon_gorev' && sablonChecklistVideoVar

  /** Şablon seçiliyken görev seviyesinde foto sorma (şablon satırı veya — standart modda — checklist) */
  const fotoSablondanGeliyor =
    !!form.sablon_id &&
    !!selectedTemplate &&
    (!!selectedTemplate.foto_zorunlu || hasChecklistPhoto)

  const videoSablondanGeliyor =
    !!form.sablon_id &&
    !!selectedTemplate &&
    (!!selectedTemplate.video_zorunlu || hasChecklistVideo)

  const checklistMaxMinFoto = useMemo(() => {
    if (gorevModu !== 'sablon_gorev') return 0
    const qs = sablonSorular || []
    let max = 0
    for (const q of qs) {
      if (q?.soru_tipi === 'FOTOGRAF' || q?.foto_zorunlu) {
        const n = Math.min(5, Math.max(1, Number(q.min_foto_sayisi) || 1))
        if (n > max) max = n
      }
    }
    return max
  }, [sablonSorular, gorevModu])

  const checklistMaxVideoSn = useMemo(() => {
    if (gorevModu !== 'sablon_gorev') return 60
    const qs = sablonSorular || []
    let maxSn = 60
    for (const q of qs) {
      if (String(q?.soru_tipi || '').toUpperCase() !== 'VIDEO') continue
      const sn = Math.min(60, Math.max(5, Number(q.max_video_suresi_sn) || 60))
      if (sn > maxSn) maxSn = sn
    }
    return maxSn
  }, [sablonSorular, gorevModu])

  const sablonPuan = useMemo(() => {
    if (!selectedTemplate) return null
    const v = Number(selectedTemplate.varsayilan_puan ?? selectedTemplate.puan ?? 0)
    return Number.isFinite(v) ? v : 0
  }, [selectedTemplate])

  useEffect(() => {
    const raw = embedded ? String(initialSearch || '').replace(/^\?/, '') : ''
    const sp = embedded
      ? new URLSearchParams(raw)
      : searchParams
    const pid = sp.get('personId')
    const cid = sp.get('company')
    const uid = sp.get('unitId')
    const mode = sp.get('mode')
    const baslik = sp.get('baslik')
    const baslangic = sp.get('baslangic')
    const bitis = sp.get('bitis')
    const sablonId = sp.get('sablonId')
    const aciklama = sp.get('aciklama')
    const assignees = sp.get('assignees')
    const cokluAtama = sp.get('cokluAtama')
    const zincirGorev = sp.get('zincirGorev')
    const zincirOnay = sp.get('zincirOnay')
    const siraliB64 = sp.get('sirali')
    if (pid) setForm((f) => ({ ...f, personel_id: String(pid) }))
    if (cid && isSystemAdmin) setForm((f) => ({ ...f, ana_sirket_id: String(cid) }))
    else if (cid) setForm((f) => ({ ...f, ana_sirket_id: String(cid) }))
    if (uid) setForm((f) => ({ ...f, birim_id: String(uid) }))
    if (mode && GOREV_MODU_OPTIONS.some((o) => o.value === mode)) {
      setGorevModu(mode)
      if (embedded) setEmbeddedStepIndex(1)
    }
    if (baslik) setForm((f) => ({ ...f, baslik }))
    if (sablonId) setForm((f) => ({ ...f, sablon_id: sablonId }))
    if (aciklama) setForm((f) => ({ ...f, aciklama }))
    if (baslangic) {
      const iso = baslangic.includes('T') ? baslangic : mergeDateAndTime(baslangic, '09:00')
      setForm((f) => ({ ...f, baslama_tarihi: iso }))
    }
    if (bitis) {
      const iso = bitis.includes('T') ? bitis : mergeDateAndTime(bitis, '18:00')
      setForm((f) => ({ ...f, bitis_tarihi: iso }))
    }
    if (assignees) {
      const ids = assignees.split(',').map((x) => x.trim()).filter(Boolean)
      if (ids.length) {
        setSelectedAssigneeIds(ids)
        setForm((f) => ({
          ...f,
          coklu_atama: cokluAtama === '1' || ids.length > 1,
          personel_id: ids[0] || f.personel_id,
        }))
        setAssignmentTarget('personeller')
      }
    }
    if (zincirGorev) {
      const ids = zincirGorev.split(',').map((x) => x.trim()).filter(Boolean)
      if (ids.length) setZincirGorevSira(ids)
    }
    if (zincirOnay) {
      const ids = zincirOnay.split(',').map((x) => x.trim()).filter(Boolean)
      if (ids.length) setZincirOnaySira(ids)
    }
    if (siraliB64) {
      try {
        const json = decodeURIComponent(escape(atob(siraliB64)))
        const steps = JSON.parse(json)
        if (Array.isArray(steps) && steps.length) setSiraliAdimlar(steps)
      } catch (e) {
        console.warn('sirali prefill parse failed', e)
      }
    }
    const operasyonelB64 = sp.get('operasyonel')
    if (operasyonelB64) {
      try {
        const op = normalizeOperasyonelOpts(
          JSON.parse(decodeURIComponent(escape(atob(operasyonelB64)))),
        )
        setForm((f) => ({
          ...f,
          acil: op.acil,
          aciklama_zorunlu: op.aciklama_zorunlu,
          foto_zorunlu: op.foto_zorunlu,
          min_foto_sayisi: op.min_foto_sayisi,
          video_zorunlu: op.video_zorunlu,
          min_video_sayisi: op.min_video_sayisi,
          max_video_suresi_sn: op.max_video_suresi_sn,
          ozel_gorev: op.ozel_gorev,
          bireysel: op.bireysel,
          coklu_atama: op.coklu_atama || f.coklu_atama,
          puan: op.puan || f.puan,
        }))
      } catch (e) {
        console.warn('operasyonel prefill failed', e)
      }
    } else {
      if (sp.get('acil') === '1') setForm((f) => ({ ...f, acil: true }))
      if (sp.get('aciklamaZorunlu') === '1') setForm((f) => ({ ...f, aciklama_zorunlu: true }))
      if (sp.get('fotoZorunlu') === '1') {
        setForm((f) => ({
          ...f,
          foto_zorunlu: true,
          min_foto_sayisi: Math.min(5, Math.max(1, Number(sp.get('minFoto')) || 1)),
        }))
      }
      if (sp.get('videoZorunlu') === '1') {
        setForm((f) => ({
          ...f,
          video_zorunlu: true,
          min_video_sayisi: Math.min(3, Math.max(1, Number(sp.get('minVideo')) || 1)),
          max_video_suresi_sn: Math.min(60, Math.max(5, Number(sp.get('maxVideoSn')) || 60)),
        }))
      }
      if (sp.get('ozelGorev') === '1') setForm((f) => ({ ...f, ozel_gorev: true }))
      if (sp.get('bireysel') === '0') setForm((f) => ({ ...f, bireysel: false }))
      const puan = sp.get('puan')
      if (puan) setForm((f) => ({ ...f, puan: Number(puan) || 0 }))
    }
  }, [embedded, initialSearch, searchParams, isSystemAdmin])

  const needsStepsTab = CHAIN_STEP_MODES.has(gorevModu)
  const needsFilesTab = gorevModu !== 'sirali_gorev'

  const embeddedTurTabIcon = useMemo(() => {
    if (gorevModu && GOREV_MODU_MODE_ICONS[gorevModu]) return GOREV_MODU_MODE_ICONS[gorevModu]
    return Layers2
  }, [gorevModu])

  const embeddedSteps = useMemo(() => {
    const list = [
      { id: 'tur', label: 'Tür', icon: embeddedTurTabIcon },
      { id: 'detaylar-temel', label: 'Bilgi', icon: FileText },
      { id: 'detaylar-atama', label: 'Atama', icon: Users },
    ]
    if (needsFilesTab) list.push({ id: 'dosyalar', label: 'Dosyalar', icon: FolderOpen })
    if (needsStepsTab) list.push({ id: 'adimlar', label: 'Adımlar', icon: ListOrdered })
    if (gorevModu !== 'sirali_gorev') {
      list.push({ id: 'zamanlama', label: 'Zamanlama', icon: Clock3 })
    }
    list.push({ id: 'tekrarlama', label: 'Tekrarlama', icon: Repeat })
    list.push({ id: 'diger', label: 'Diğer', icon: SlidersHorizontal })
    return list
  }, [needsFilesTab, needsStepsTab, gorevModu, embeddedTurTabIcon])

  useEffect(() => {
    if (!embedded) return
    setEmbeddedStepIndex(0)
  }, [embedded, gorevModu])

  const currentEmbeddedStep = embeddedSteps[embeddedStepIndex] || embeddedSteps[0]
  const embeddedStepId = currentEmbeddedStep?.id || 'tur'
  const isLastEmbeddedStep = embeddedStepIndex >= embeddedSteps.length - 1

  useEffect(() => {
    if (!embedded) return
    if (embeddedStepIndex >= embeddedSteps.length) {
      setEmbeddedStepIndex(Math.max(0, embeddedSteps.length - 1))
    }
  }, [embedded, embeddedSteps.length, embeddedStepIndex])

  useEffect(() => {
    const targetCompanyId = companyScoped ? currentCompanyId : form.ana_sirket_id
    if (!targetCompanyId) {
      setTemplates([])
      return
    }
    supabase
      .from('is_sablonlari')
      .select(
        'id,baslik,aciklama,ana_sirket_id,birim_id,kapsam,varsayilan_puan,puan,foto_zorunlu,min_foto_sayisi,video_zorunlu,min_video_sayisi,max_video_suresi_sn',
      )
      .is('silindi_at', null)
      .then(({ data, error }) => {
        if (error) {
          console.error('is_sablonlari load error', error)
          setTemplates([])
          return
        }
        const visible = filterTemplatesVisibleToUser(data || [], {
          isSystemAdmin,
          companyId: targetCompanyId,
          accessibleUnitIds: accessibleUnitIds || [],
        })
        setTemplates(visible)
      })

    let compQ = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
    if (companyScoped && currentCompanyId) compQ = compQ.eq('id', currentCompanyId)
    compQ.then(({ data, error }) => {
      if (error) {
        console.error('ana_sirketler load error', error)
        supabase
          .from('ana_sirketler')
          .select('*')
          .is('silindi_at', null)
          .then(({ data: d2, error: e2 }) => {
            if (e2) console.error('ana_sirketler fallback error', e2)
            let list = d2 || []
            if (companyScoped && currentCompanyId) {
              list = list.filter((c) => String(c.id) === String(currentCompanyId))
            }
            setCompanies(list)
          })
      } else {
        setCompanies(data || [])
      }
    })
  }, [companyScoped, currentCompanyId, form.ana_sirket_id])

  useEffect(() => {
    if (!form.sablon_id) return
    const exists = templates.some((t) => String(t.id) === String(form.sablon_id))
    if (!exists) {
      setForm((f) => ({ ...f, sablon_id: '' }))
    }
  }, [templates, form.sablon_id])

  useEffect(() => {
    if (companyScoped && currentCompanyId && companies.length === 1) {
      setForm((f) => (f.ana_sirket_id ? f : { ...f, ana_sirket_id: String(companies[0].id) }))
    }
  }, [companyScoped, currentCompanyId, companies])

  useEffect(() => {
    if (!form.ana_sirket_id) {
      setUnits([])
      return
    }
    let uq = supabase
      .from('birimler')
      .select('id,birim_adi')
      .eq('ana_sirket_id', form.ana_sirket_id)
      .is('silindi_at', null)
    if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
      uq = uq.in('id', accessibleUnitIds)
    }
    uq.then(({ data }) => setUnits(data || []))
  }, [form.ana_sirket_id, isSystemAdmin, accessibleUnitIdsKey])

  useEffect(() => {
    let q = supabase
      .from('personeller')
      .select('id,personel_kodu,ad,soyad,kullanici_id,ana_sirket_id,birim_id,rol_id,durum,email')
      .is('silindi_at', null)
    const karmaBirimPersonelSecimi =
      gorevModu === 'normal' && assignmentTarget === 'karma_personeller'
    const mixedUnitsSelected = form.birim_id === MIXED_UNITS_VALUE
    if (karmaBirimPersonelSecimi && (form.ana_sirket_id || currentCompanyId)) {
      q = q.eq('ana_sirket_id', form.ana_sirket_id || currentCompanyId)
      if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
        q = q.in('birim_id', accessibleUnitIds)
      }
    } else if (form.birim_id && !mixedUnitsSelected) {
      q = q.eq('birim_id', form.birim_id)
    } else if (mixedUnitsSelected && (form.ana_sirket_id || currentCompanyId)) {
      q = q.eq('ana_sirket_id', form.ana_sirket_id || currentCompanyId)
      if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
        q = q.in('birim_id', accessibleUnitIds)
      }
    } else if (!isSystemAdmin && currentCompanyId) {
      q = q.eq('ana_sirket_id', currentCompanyId)
      if (accessibleUnitIds && accessibleUnitIds.length) {
        q = q.in('birim_id', accessibleUnitIds)
      }
    }
    q.then(async ({ data, error }) => {
      if (error) {
        console.error('personeller load error', error)
        setPersons([])
        return
      }
      const rows = data || []
      const map = await fetchRolePermissionsMap(
        supabase,
        rows.map((r) => r.rol_id),
      )
      setRolePermMap((prev) => ({ ...prev, ...map }))
      const filtered = filterAssignablePersonnel(rows, {
        assigner: personel,
        assignerPermissions: permissions,
        accessibleUnitIds,
        isSystemAdmin,
        rolePermMap: map,
      })
      setPersons(sortPersonnelRowsAlphabeticalTr(filtered))
    })
  }, [
    form.birim_id,
    form.ana_sirket_id,
    gorevModu,
    assignmentTarget,
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIdsKey,
    personel,
    permissions,
  ])

  useEffect(() => {
    const onayModeActive =
      gorevModu === 'zincir_onay' ||
      gorevModu === 'zincir_gorev_ve_onay' ||
      gorevModu === 'sirali_gorev'
    const companyId = form.ana_sirket_id || currentCompanyId
    if (!onayModeActive || !companyId) {
      setOnayPersons([])
      return
    }
    ;(async () => {
      let q = supabase
        .from('personeller')
        .select('id,personel_kodu,ad,soyad,kullanici_id,ana_sirket_id,birim_id,rol_id,durum,email')
        .is('silindi_at', null)
        .eq('ana_sirket_id', companyId)
      if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
        q = q.in('birim_id', accessibleUnitIds)
      }
      const { data, error } = await q
      if (error) {
        console.error('onay personeller load error', error)
        setOnayPersons([])
        return
      }
      const rows = data || []
      const roleIds = [...new Set(rows.map((r) => r.rol_id).filter(Boolean))]
      const rolePermMap = {}
      if (roleIds.length) {
        const { data: roleRows } = await supabase
          .from('roller')
          .select('id,yetkiler')
          .in('id', roleIds)
        ;(roleRows || []).forEach((rr) => {
          rolePermMap[String(rr.id)] = rr?.yetkiler || {}
        })
      }
      const filtered = rows.filter((r) => canAuditTaskStep(rolePermMap[String(r.rol_id)] || {}))
      // Sıralı Görevde kullanıcı kendini denetimci olarak seçebilsin. Liste
      // hiyerarşi kapsamı + canAuditTaskStep filtresinden geçtiği için ana
      // sorguda mevcut kullanıcı düşmüş olabilir (örn. üst hiyerarşi rolleri).
      // Bu yüzden mobildeki `approverCandidates` ile aynı şekilde, listede
      // yoksa kullanıcıyı manuel ekliyoruz.
      //
      // NOT: AuthContext'teki `personel` objesi yalnızca `id, rol_id,
      // ana_sirket_id, birim_id` taşıyor (ad/soyad/email yok). Bu yüzden
      // listede yoksa kullanıcının tam satırını `personeller` tablosundan ID
      // üzerinden çekiyoruz — aksi halde `personName()` fallback'i devreye
      // girip ID gibi gösterirdi.
      const list = [...filtered]
      if (personel?.id) {
        const exists = list.some((p) => String(p.id) === String(personel.id))
        if (!exists) {
          const { data: meRow } = await supabase
            .from('personeller')
            .select('id,personel_kodu,ad,soyad,kullanici_id,ana_sirket_id,birim_id,rol_id,durum,email')
            .eq('id', personel.id)
            .is('silindi_at', null)
            .maybeSingle()
          if (meRow) list.push(meRow)
        }
      }
      setOnayPersons(sortPersonnelRowsAlphabeticalTr(list))
    })()
  }, [gorevModu, form.ana_sirket_id, currentCompanyId, isSystemAdmin, accessibleUnitIdsKey, personel?.id])

  useEffect(() => {
    if (gorevModu !== 'sirali_gorev') return
    setZincirGorevSira((prev) => (prev.length ? [] : prev))
    setZincirOnaySira((prev) => (prev.length ? [] : prev))
    setForm((f) => (f.personel_id ? { ...f, personel_id: '' } : f))
    setSiraliAdimlar((prev) => (prev.length ? prev : [buildDefaultSiraliAdim()]))
  }, [gorevModu])

  useEffect(() => {
    // Standart ve şablon görev modlarında çoklu atama geçerlidir; zincir modlarına geçince sıfırlanır.
    if (!standardModeActive) {
      setAssignmentTarget('personeller')
      setSelectedUnitIds((prev) => (prev.length ? [] : prev))
      setForm((f) => (f.coklu_atama ? { ...f, coklu_atama: false } : f))
      return
    }
    if (!form.coklu_atama) {
      setAssignmentTarget('personeller')
      setSelectedUnitIds((prev) => (prev.length ? [] : prev))
      setSelectedAssigneeIds((prev) => (prev.length ? [] : prev))
      return
    }
    if (assignmentTarget === 'birimler') {
      const allowed = new Set((selectedUnitIds || []).map((x) => String(x)))
      const ids = (persons || [])
        .filter((p) => p?.birim_id && allowed.has(String(p.birim_id)))
        .filter((p) => !currentPersonelId || String(p.id) !== String(currentPersonelId))
        .map((p) => p.id)
      setSelectedAssigneeIds((prev) => {
        if (prev.length === ids.length && prev.every((v, i) => String(v) === String(ids[i]))) return prev
        return ids
      })
      return
    }
    if (assignmentTarget === 'personeller' || assignmentTarget === 'karma_personeller') return
    if (assignmentTarget === 'sirket') return
  }, [assignmentTarget, selectedUnitIds, persons, gorevModu, standardModeActive, currentPersonelId, form.coklu_atama])

  useEffect(() => {
    if (!standardModeActive || !form.coklu_atama) return
    if (assignmentTarget !== 'personeller' && assignmentTarget !== 'karma_personeller') return
    const visibleIds = new Set((persons || []).map((p) => String(p.id)))
    setSelectedAssigneeIds((prev) => {
      const next = (prev || []).filter((id) => visibleIds.has(String(id)))
      return next.length === prev.length ? prev : next
    })
  }, [persons, assignmentTarget, gorevModu, standardModeActive, form.coklu_atama])

  useEffect(() => {
    if (!form.coklu_atama || !standardModeActive) {
      prevAssignmentTargetRef.current = assignmentTarget
      return
    }
    if (prevAssignmentTargetRef.current === assignmentTarget) return
    prevAssignmentTargetRef.current = assignmentTarget
    setSelectedAssigneeIds([])
    setSelectedUnitIds([])
  }, [assignmentTarget, form.coklu_atama, gorevModu])

  /** Şablon değişince şablon satırını yeniden uygulamaya izin ver */
  useEffect(() => {
    lastAppliedSablonId.current = ''
  }, [form.sablon_id])

  useEffect(() => {
    if (!form.sablon_id || gorevModu !== 'sablon_gorev') {
      setSablonSorular([])
      return
    }
    let cancelled = false
    supabase
      .from('is_sablon_sorulari')
      .select('soru_tipi, foto_zorunlu, min_foto_sayisi, soru_metni, max_video_suresi_sn')
      .eq('sablon_id', form.sablon_id)
      .order('sira', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('is_sablon_sorulari load error', error)
          setSablonSorular([])
          return
        }
        setSablonSorular(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [form.sablon_id, gorevModu])

  /** Şablon seçilince başlık/açıklama/puan/foto şablondan senkron (liste geç yüklenirse tekrar dener) */
  useEffect(() => {
    if (!form.sablon_id) return
    const t = templates.find((x) => String(x.id) === String(form.sablon_id))
    if (!t) return
    if (lastAppliedSablonId.current === String(form.sablon_id)) return
    lastAppliedSablonId.current = String(form.sablon_id)
    const puanTpl = Number(t.varsayilan_puan ?? t.puan ?? 0)
    const fz = !!t.foto_zorunlu
    const mf = fz ? Math.min(5, Math.max(1, Number(t.min_foto_sayisi) || 1)) : 0
    const vz = fz ? false : !!t.video_zorunlu
    const mv = vz ? Math.min(3, Math.max(1, Number(t.min_video_sayisi) || 1)) : 0
    const maxSn = Math.min(60, Math.max(5, Number(t.max_video_suresi_sn) || 60))
    setForm((f) => ({
      ...f,
      baslik: t.baslik != null ? String(t.baslik) : '',
      aciklama: t.aciklama != null ? String(t.aciklama) : '',
      puan: Number.isFinite(puanTpl) ? puanTpl : 0,
      foto_zorunlu: fz,
      min_foto_sayisi: mf,
      video_zorunlu: vz,
      min_video_sayisi: mv,
      max_video_suresi_sn: vz ? maxSn : f.max_video_suresi_sn,
      aciklama_zorunlu: false,
    }))
  }, [form.sablon_id, templates])

  const setFotoZorunlu = (on) => {
    setForm((f) => ({
      ...f,
      foto_zorunlu: on,
      min_foto_sayisi: on ? Math.max(1, Number(f.min_foto_sayisi) || 1) : 0,
      ...(on ? { video_zorunlu: false, min_video_sayisi: 0 } : {}),
    }))
  }

  const setVideoZorunlu = (on) => {
    setForm((f) => ({
      ...f,
      video_zorunlu: on,
      min_video_sayisi: on ? Math.max(1, Number(f.min_video_sayisi) || 1) : 0,
      max_video_suresi_sn: Math.min(60, Math.max(5, Number(f.max_video_suresi_sn) || 60)),
      ...(on ? { foto_zorunlu: false, min_foto_sayisi: 0 } : {}),
    }))
  }

  const setBelgeZorunlu = (on) => {
    setForm((f) => ({
      ...f,
      belge_zorunlu: on,
      min_belge_sayisi: on ? Math.max(1, Number(f.min_belge_sayisi) || 1) : 0,
    }))
  }

  const moveZincirGorev = (index, dir) => {
    setZincirGorevSira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const moveZincirOnay = (index, dir) => {
    setZincirOnaySira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const addSiraliAdim = () => {
    setSiraliAdimlar((prev) => [...prev, buildDefaultSiraliAdim()])
  }

  const removeSiraliAdim = (index) => {
    setSiraliAdimlar((prev) => prev.filter((_, i) => i !== index))
  }

  const moveSiraliAdim = (index, dir) => {
    setSiraliAdimlar((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const patchSiraliAdim = (index, key, value) => {
    setSiraliAdimlar((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    )
  }

  const addTaskReferenceFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return
    setTaskReferenceFiles((prev) => [...prev, ...files])
  }

  const addSiraliStepReferenceFiles = (index, fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return
    setSiraliAdimlar((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, referans_dosyalar: [...(row?.referans_dosyalar || []), ...files] }
          : row,
      ),
    )
  }

  const setSiraliAdimFotoZorunlu = (index, on) => {
    setSiraliAdimlar((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              foto_zorunlu: on,
              min_foto_sayisi: on ? Math.max(1, Number(row.min_foto_sayisi) || 1) : 1,
              ...(on ? { video_zorunlu: false, min_video_sayisi: 1 } : {}),
            }
          : row,
      ),
    )
  }

  const setSiraliAdimVideoZorunlu = (index, on) => {
    setSiraliAdimlar((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              video_zorunlu: on,
              min_video_sayisi: on ? Math.max(1, Number(row.min_video_sayisi) || 1) : 1,
              max_video_suresi_sn: Math.min(60, Math.max(5, Number(row.max_video_suresi_sn) || 60)),
              ...(on ? { foto_zorunlu: false, min_foto_sayisi: 1 } : {}),
            }
          : row,
      ),
    )
  }

  const setSiraliAdimBelgeZorunlu = (index, on) => {
    setSiraliAdimlar((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              belge_zorunlu: on,
              min_belge_sayisi: on ? Math.max(1, Number(row.min_belge_sayisi) || 1) : 1,
            }
          : row,
      ),
    )
  }

  const resolvedGorevTuru = () => {
    if (gorevModu === 'normal' || gorevModu === 'sablon_gorev') return GOREV_TURU.NORMAL
    if (gorevModu === 'zincir_gorev') return GOREV_TURU.ZINCIR_GOREV
    if (gorevModu === 'zincir_onay') return GOREV_TURU.ZINCIR_ONAY
    if (gorevModu === 'sirali_gorev') return GOREV_TURU.SIRALI_GOREV
    return GOREV_TURU.ZINCIR_GOREV_VE_ONAY
  }


  /** Zincir Görev / onay personel blokları: önce şirket ve birim */
  const zincirAtamaHazir = !!form.ana_sirket_id && !!form.birim_id

  /** Bu modlarda sorumlular yalnızca zincir görev sırasından gelir */
  const personelAlaniZincirGorevden =
    gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay' || gorevModu === 'sirali_gorev'
  const chainModeActive = !standardModeActive
  /** Şablonsuz / sıralı dışı görevlerde kullanıcının gireceği görev metni (şablon metni ayrı gösterilir) */
  const showEditableTaskDescription =
    gorevModu !== 'sirali_gorev' && gorevModu !== 'sablon_gorev'
  const showTopUnitSelect = chainModeActive || !form.coklu_atama

  const estimatedNormalAssigneeCount = useMemo(() => {
    // Standart (sablonsuz) ve sablon_gorev modlarının ikisi de "normal" tipte görev üretir;
    // çoklu atama açıksa hangi hedefte olursa olsun seçilen kişi sayısını döndür.
    if (!standardModeActive || !form.coklu_atama) {
      return form.personel_id ? 1 : 0
    }
    if (assignmentTarget === 'personeller' || assignmentTarget === 'karma_personeller') {
      return (selectedAssigneeIds || []).filter(Boolean).length
    }
    if (assignmentTarget === 'birimler') {
      return (selectedAssigneeIds || []).filter(Boolean).length
    }
    return (persons || []).filter((p) => !currentPersonelId || String(p.id) !== currentPersonelId).length
  }, [
    standardModeActive,
    form.coklu_atama,
    form.personel_id,
    assignmentTarget,
    selectedAssigneeIds,
    persons,
    currentPersonelId,
  ])

  /**
   * "Bireysel tamamlama" toggle'ı:
   *  - Zincir / sıralı modlarda anlamsız (sıra mantığı zaten kişi başı yürütür).
   *  - Standart (sablonsuz) ve şablon görevlerin ikisinde de çoklu atama varsa görünür.
   *  - Açık → her atanana ayrı görev (kişi başı tamamlama). Kapalı → grup_id ile havuz görev:
   *    biri tamamlayınca diğerlerinin görevi otomatik kapanır.
   */
  const showBireyselToggle =
    !chainModeActive &&
    standardModeActive &&
    estimatedNormalAssigneeCount > 1

  const applyQuickRange = (type) => {
    const now = new Date()
    if (type === 'today_shift') {
      const start = new Date(now)
      start.setHours(9, 0, 0, 0)
      const end = new Date(now)
      end.setHours(18, 0, 0, 0)
      setForm((f) => ({
        ...f,
        baslama_zaman_sec: true,
        baslama_tarihi: formatDateTimeLocalInput(start),
        bitis_tarihi: formatDateTimeLocalInput(end),
      }))
      return
    }
    if (type === 'next24') {
      const start = new Date(now)
      const end = new Date(now)
      end.setHours(end.getHours() + 24)
      setForm((f) => ({
        ...f,
        baslama_zaman_sec: true,
        baslama_tarihi: formatDateTimeLocalInput(start),
        bitis_tarihi: formatDateTimeLocalInput(end),
      }))
      return
    }
    if (type === 'tomorrow_shift') {
      const start = new Date(now)
      start.setDate(start.getDate() + 1)
      start.setHours(9, 0, 0, 0)
      const end = new Date(start)
      end.setHours(18, 0, 0, 0)
      setForm((f) => ({
        ...f,
        baslama_zaman_sec: true,
        baslama_tarihi: formatDateTimeLocalInput(start),
        bitis_tarihi: formatDateTimeLocalInput(end),
      }))
      return
    }
    const start = new Date(now)
    const end = new Date(now)
    end.setHours(end.getHours() + 24)
    setForm((f) => ({
      ...f,
      baslama_zaman_sec: true,
      baslama_tarihi: formatDateTimeLocalInput(start),
      bitis_tarihi: formatDateTimeLocalInput(end),
    }))
  }

  const applyTimeRange = (startHour, startMin, endHour, endMin) => {
    const start = form.baslama_tarihi ? new Date(form.baslama_tarihi) : new Date()
    const end = form.bitis_tarihi ? new Date(form.bitis_tarihi) : new Date(start)
    start.setHours(startHour, startMin, 0, 0)
    end.setHours(endHour, endMin, 0, 0)
    if (end <= start) end.setDate(end.getDate() + 1)
    setForm((f) => ({
      ...f,
      baslama_zaman_sec: true,
      baslama_tarihi: formatDateTimeLocalInput(start),
      bitis_tarihi: formatDateTimeLocalInput(end),
    }))
  }

  const applyUrgentQuickDuration = (minutes) => {
    const safeMinutes = Math.max(1, Number(minutes) || 30)
    const now = new Date()
    const end = new Date(now)
    end.setMinutes(end.getMinutes() + safeMinutes)
    setSelectedUrgentQuick(safeMinutes)
    setForm((f) => ({
      ...f,
      acil: true,
      baslama_zaman_sec: true,
      baslama_tarihi: formatDateTimeLocalInput(now),
      bitis_tarihi: formatDateTimeLocalInput(end),
    }))
  }

  const getNormalAssigneeIds = () => {
    if (!form.coklu_atama) return form.personel_id ? [form.personel_id] : []
    if (assignmentTarget === 'personeller' || assignmentTarget === 'karma_personeller') {
      return (selectedAssigneeIds || []).filter(Boolean)
    }
    if (assignmentTarget === 'birimler') return (selectedAssigneeIds || []).filter(Boolean)
    return (persons || [])
      .filter((p) => !currentPersonelId || String(p.id) !== currentPersonelId)
      .map((p) => p.id)
  }

  const validateStep = (step) => {
    setStepHint('')
    if (step === 1) {
      if (!gorevModu) {
        setStepHint('Devam için görev türünü seçin.')
        toast.error('Önce görev türünü seçin')
        return false
      }
      return true
    }
    if (step === 2) {
      if (!String(form.baslik || '').trim()) {
        setStepHint('Devam için görev başlığı zorunlu.')
        toast.error('Görev başlığı zorunlu')
        return false
      }
      if (standardModeActive && getNormalAssigneeIds().length === 0) {
        setStepHint('Devam için en az bir personel seçin.')
        toast.error('En az 1 personel seçin')
        return false
      }
      if (gorevModu === 'sablon_gorev' && !String(form.sablon_id || '').trim()) {
        setStepHint('Devam için şablon seçin.')
        toast.error('Şablon seçin')
        return false
      }
      if ((gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') && zincirGorevSira.length < 1) {
        setStepHint('Zincir Görevde en az 1 kişi ekleyin.')
        toast.error('Zincir Görev için en az 1 kişi ekleyin')
        return false
      }
      if ((gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') && zincirOnaySira.length < 1) {
        setStepHint('Zincir Onayda en az 1 onaylayıcı ekleyin.')
        toast.error('Zincir Onay için en az 1 onaylayıcı ekleyin')
        return false
      }
      if (gorevModu === 'sirali_gorev' && siraliAdimlar.length < 1) {
        setStepHint('Sıralı Görevde en az 1 adım ekleyin.')
        toast.error('Sıralı Görev için en az 1 adım ekleyin')
        return false
      }
      if (gorevModu === 'sirali_gorev') {
        for (let i = 0; i < siraliAdimlar.length; i += 1) {
          const adim = siraliAdimlar[i]
          if (!adim?.bitis_tarihi) continue
          const adimBaslama = adim?.baslama_tarihi ? new Date(adim.baslama_tarihi) : null
          const adimBitis = new Date(adim.bitis_tarihi)
          if (i === 0) {
            if (!adim?.baslama_tarihi || !adimBaslama) {
              setStepHint('1. adımda başlangıç tarihi zorunlu.')
              toast.error('1. adımda başlangıç tarihi zorunlu')
              return false
            }
            if (adimBitis <= adimBaslama) {
              setStepHint('1. adımda bitiş saati başlangıçtan önce/eşit olamaz.')
              toast.error('1. adımda bitiş saati başlangıçtan önce/eşit olamaz')
              return false
            }
          }
        }
      }
      return true
    }
    if (step === 3) {
      if (gorevModu !== 'sirali_gorev' && (form.tekrarlayan || form.baslama_zaman_sec) && !form.baslama_tarihi) {
        setStepHint('Devam için başlangıç tarihi seçin.')
        toast.error('Başlangıç tarihi seçin')
        return false
      }
      if (gorevModu !== 'sirali_gorev' && form.baslama_tarihi && form.bitis_tarihi) {
        const start = new Date(form.baslama_tarihi)
        const end = new Date(form.bitis_tarihi)
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
          setStepHint('Bitiş saati başlangıç saatinden önce/eşit olamaz.')
          toast.error('Bitiş saati başlangıç saatinden önce/eşit olamaz')
          return false
        }
      }
      return true
    }
    return true
  }

  const validateDetaylarTemel = () => {
    setStepHint('')
    if (!templateAllowedInMode && !String(form.baslik || '').trim()) {
      setStepHint('Devam için görev başlığı zorunlu.')
      toast.error('Görev başlığı zorunlu')
      return false
    }
    if (gorevModu === 'sablon_gorev' && !String(form.sablon_id || '').trim()) {
      setStepHint('Devam için şablon seçin.')
      toast.error('Şablon seçin')
      return false
    }
    return true
  }

  const validateDetaylarAtama = () => {
    if (standardModeActive && getNormalAssigneeIds().length === 0) {
      setStepHint('Devam için en az bir personel seçin.')
      toast.error('En az 1 personel seçin')
      return false
    }
    if (chainModeActive || gorevModu === 'sirali_gorev') return true
    return true
  }

  const validateEmbeddedCurrent = () => {
    if (embeddedStepId === 'tur') return validateStep(1)
    if (embeddedStepId === 'detaylar-temel') return validateDetaylarTemel()
    if (embeddedStepId === 'detaylar-atama') {
      if (!validateDetaylarTemel()) return false
      if (standardModeActive && !validateDetaylarAtama()) return false
      if (needsStepsTab) return true
      return validateStep(2)
    }
    if (embeddedStepId === 'adimlar') return validateStep(2)
    if (embeddedStepId === 'zamanlama') return validateStep(3)
    if (embeddedStepId === 'tekrarlama') return validateTekrarEmbedded()
    return true
  }

  const validateTekrarEmbedded = () => {
    setStepHint('')
    if (!form.tekrarlayan) return true
    if (gorevModu === 'sirali_gorev') return true
    if (!form.baslama_tarihi || !form.bitis_tarihi) {
      setStepHint('Tekrarlayan görev için Zamanlama adımında başlangıç ve bitiş tarihi girin.')
      toast.error('Tekrarlayan görev için başlangıç ve bitiş tarihi girin')
      return false
    }
    if (new Date(form.bitis_tarihi) <= new Date(form.baslama_tarihi)) {
      setStepHint('Bitiş tarihi başlangıçtan sonra olmalıdır.')
      toast.error('Bitiş tarihi başlangıçtan sonra olmalıdır')
      return false
    }
    if (form.tekrar_tipi === 'daily_hourly') {
      if ((Number(form.tekrar_saat_araligi) || 0) < 1) {
        setStepHint('Saat aralığı en az 1 olmalıdır.')
        toast.error('Saatlik tekrarda saat aralığı en az 1 olmalıdır')
        return false
      }
      const [h1, m1] = parseClock(form.tekrar_gun_ici_baslangic, 9, 0)
      const [h2, m2] = parseClock(form.tekrar_gun_ici_bitis, 18, 0)
      if (h2 * 60 + m2 <= h1 * 60 + m1) {
        setStepHint('Gün içi bitiş saati, başlangıçtan sonra olmalıdır.')
        toast.error('Gun ici bitis saati, baslangic saatinden sonra olmalidir')
        return false
      }
    } else if ((form.tekrar_hafta_gunleri || []).length === 0) {
      setStepHint('Haftalık tekrar için en az 1 gün seçin.')
      toast.error('Haftalık tekrar için en az 1 gün seçin')
      return false
    }
    return true
  }

  const goEmbeddedNext = () => {
    if (!validateEmbeddedCurrent()) return
    setEmbeddedStepIndex((i) => Math.min(embeddedSteps.length - 1, i + 1))
  }

  const goEmbeddedPrev = () => {
    setStepHint('')
    setEmbeddedStepIndex((i) => Math.max(0, i - 1))
  }

  const goNextStep = () => {
    if (!validateStep(currentStep)) return
    setCurrentStep((prev) => Math.min(4, prev + 1))
    setMaxVisitedStep((prev) => Math.max(prev, Math.min(4, currentStep + 1)))
  }

  const resetStep3Selections = () => {
    setForm((f) => ({
      ...f,
      baslama_tarihi: mergeDateAndTime(todayDatePart(), '09:00'),
      bitis_tarihi: '',
      acil: false,
      foto_zorunlu: false,
      min_foto_sayisi: 0,
      video_zorunlu: false,
      min_video_sayisi: 0,
      max_video_suresi_sn: 60,
      aciklama_zorunlu: false,
      aciklama: '',
      ozel_gorev: false,
      puan: 0,
      bireysel: true,
      tekrarlayan: false,
      tekrar_gun: 30,
      tekrar_tipi: 'daily_hourly',
      tekrar_saat_araligi: 2,
      tekrar_gun_ici_baslangic: '09:00',
      tekrar_gun_ici_bitis: '18:00',
      tekrar_hafta_gunleri: [1, 5],
      tekrar_hafta_sayisi: 8,
      baslama_zaman_sec: false,
    }))
  }

  const resetStep2AndAfterSelections = () => {
    setForm(() => ({
      ...buildInitialTaskForm(),
      ana_sirket_id: companyScoped && currentCompanyId ? String(currentCompanyId) : '',
    }))
    setZincirGorevSira([])
    setZincirOnaySira([])
    setSiraliAdimlar([buildDefaultSiraliAdim()])
    setAssignmentTarget('personeller')
    setSelectedAssigneeIds([])
    setSelectedUnitIds([])
    setTaskReferenceFiles([])
  }

  const goToStep = (targetStep) => {
    const next = Math.max(1, Math.min(4, Number(targetStep) || 1))
    if (next < currentStep) {
      if (next <= 1) {
        resetStep2AndAfterSelections()
      } else if (next <= 2) {
        resetStep3Selections()
      }
      setMaxVisitedStep(next)
    }
    setStepHint('')
    setCurrentStep(next)
  }

  const goPrevStep = () => {
    goToStep(currentStep - 1)
  }

  useEffect(() => {
    if (gorevModu !== 'zincir_gorev' && gorevModu !== 'zincir_gorev_ve_onay') return
    setForm((f) => (f.personel_id ? { ...f, personel_id: '' } : f))
  }, [gorevModu])

  useEffect(() => {
    if (embedded) return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep, embedded])

  useEffect(() => {
    if (!embedded) return
    setStepHint('')
  }, [embeddedStepId, embedded])

  useEffect(() => {
    if (gorevModu === 'normal') return
    setForm((f) => (f.ozel_gorev ? { ...f, ozel_gorev: false } : f))
  }, [gorevModu])

  useEffect(() => {
    if (mayMarkBirebirGorev) return
    setForm((f) => (f.ozel_gorev ? { ...f, ozel_gorev: false } : f))
  }, [mayMarkBirebirGorev])

  useEffect(() => {
    if (!currentPersonelId) return
    if (!form.personel_id) return
    if (String(form.personel_id) !== currentPersonelId) return
    setForm((f) => ({ ...f, personel_id: '' }))
  }, [form.personel_id, currentPersonelId])

  useEffect(() => {
    if (templateAllowedInMode) return
    setForm((f) =>
      f.sablon_id
        ? {
            ...f,
            sablon_id: '',
            foto_zorunlu: false,
            min_foto_sayisi: 0,
            video_zorunlu: false,
            min_video_sayisi: 0,
            max_video_suresi_sn: 60,
          }
        : f,
    )
  }, [templateAllowedInMode])

  const submit = async () => {
    if (submitting) return
    const effectiveSablonId = templateAllowedInMode ? form.sablon_id : ''
    const tplRow = templates.find((t) => String(t.id) === String(effectiveSablonId))
    const resolvedBaslik = formatTaskTitleCase(
      (tplRow?.baslik && String(tplRow.baslik).trim()) ||
        String(form.baslik || '').trim() ||
        '',
    )
    if (!effectiveSablonId && !resolvedBaslik) return toast.error('Şablon veya başlık gerekli')
    const normalAssigneeIds = !form.coklu_atama
      ? [form.personel_id].filter(Boolean)
      : assignmentTarget === 'personeller' || assignmentTarget === 'karma_personeller'
        ? (selectedAssigneeIds || []).filter(Boolean)
        : assignmentTarget === 'birimler'
          ? (selectedAssigneeIds || []).filter(Boolean)
          : (persons || [])
              .filter((p) => !currentPersonelId || String(p.id) !== currentPersonelId)
              .map((p) => p.id)
    if (standardModeActive && normalAssigneeIds.length === 0) {
      return toast.error('En az 1 personel seçin')
    }
    if (gorevModu === 'sablon_gorev' && !effectiveSablonId) {
      return toast.error('Şablon seçin')
    }
    const needsManualBaslama = gorevModu !== 'sirali_gorev' && !!(form.baslama_zaman_sec || form.tekrarlayan)
    if (needsManualBaslama && !form.baslama_tarihi) {
      return toast.error('Başlangıç tarihi ve saatini seçin')
    }
    const now = new Date()
    // datetime-local ve mobil girgörevler dakikaya yuvarlanır; acil/quick seçiminde başlangıç
    // "şimdi" ile aynı dakikada olunca gerçek zaman birkaç sn ileride kalır — yapay "geçmiş" uyarısını önlemek için tolerans.
    const SCHEDULE_START_TOLERANCE_MS = 120_000
    if (needsManualBaslama && form.baslama_tarihi) {
      const start = new Date(form.baslama_tarihi)
      if (
        !Number.isNaN(start.getTime()) &&
        start.getTime() < now.getTime() - SCHEDULE_START_TOLERANCE_MS
      ) {
        return toast.error('Gecmis tarih/saat için gorev atanamaz')
      }
    }
    if (form.bitis_tarihi) {
      const end = new Date(form.bitis_tarihi)
      if (
        !Number.isNaN(end.getTime()) &&
        end.getTime() < now.getTime() - SCHEDULE_START_TOLERANCE_MS
      ) {
        return toast.error('Gecmis bitis tarihi/saati kullanilamaz')
      }
    }
    if (gorevModu !== 'sirali_gorev' && form.baslama_tarihi && form.bitis_tarihi) {
      const start = new Date(form.baslama_tarihi)
      const end = new Date(form.bitis_tarihi)
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
        return toast.error('Bitiş saati başlangıç saatinden önce/eşit olamaz')
      }
    }
    if (form.tekrarlayan && gorevModu !== 'sirali_gorev') {
      if (!form.baslama_tarihi || !form.bitis_tarihi) {
        return toast.error('Tekrarlayan görev için başlangıç ve bitiş tarihi girin')
      }
      if (new Date(form.bitis_tarihi) <= new Date(form.baslama_tarihi)) {
        return toast.error('Bitiş tarihi başlangıçtan sonra olmalıdır')
      }
      if (form.tekrar_tipi === 'daily_hourly') {
        if ((Number(form.tekrar_saat_araligi) || 0) < 1) {
          return toast.error('Saatlik tekrarda saat aralığı en az 1 olmalıdır')
        }
        const [h1, m1] = parseClock(form.tekrar_gun_ici_baslangic, 9, 0)
        const [h2, m2] = parseClock(form.tekrar_gun_ici_bitis, 18, 0)
        if (h2 * 60 + m2 <= h1 * 60 + m1) {
          return toast.error('Gun ici bitis saati, baslangic saatinden sonra olmalidir')
        }
      } else if ((form.tekrar_hafta_gunleri || []).length === 0) {
        return toast.error('Haftalık tekrar için en az 1 gün seçin')
      }
    }
    if (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') {
      if (zincirGorevSira.length < 1) return toast.error('Zincir Görev için en az 1 kişi ekleyin')
      if (currentPersonelId && String(zincirGorevSira[0]) === currentPersonelId) {
        return toast.error('Kendinizi görevin ilk sorumlusu yapamazsınız')
      }
    }
    if (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') {
      if (zincirOnaySira.length < 1) return toast.error('Zincir Onay için en az 1 onaylayıcı ekleyin')
    }
    if (gorevModu === 'sirali_gorev') {
      if (siraliAdimlar.length < 1) return toast.error('Sıralı Görev için en az 1 adım ekleyin')
      for (let i = 0; i < siraliAdimlar.length; i += 1) {
        const adim = siraliAdimlar[i]
        if (!String(adim?.adim_baslik || '').trim()) {
          return toast.error(`${i + 1}. adım için başlık zorunlu`)
        }
        if (!adim?.personel_id || !adim?.denetimci_personel_id) {
          return toast.error(`${i + 1}. adımda yapan ve denetimci seçilmeli`)
        }
        if (!adim?.bitis_tarihi) {
          return toast.error(`${i + 1}. adımda bitiş tarihi zorunlu`)
        }
        const adimBaslama = adim?.baslama_tarihi ? new Date(adim.baslama_tarihi) : null
        const adimBitis = new Date(adim.bitis_tarihi)
        if (i === 0) {
          if (!adim?.baslama_tarihi || !adimBaslama) {
            return toast.error('1. adımda başlangıç tarihi zorunlu')
          }
          if (adimBitis <= adimBaslama) {
            return toast.error('1. adımda bitiş tarihi başlangıçtan sonra olmalı')
          }
        } else {
          const onceki = siraliAdimlar[i - 1]
          const oncekiBitis = onceki?.bitis_tarihi ? new Date(onceki.bitis_tarihi) : null
          if (oncekiBitis && adimBitis < oncekiBitis) {
            return toast.error(
              `${i + 1}. adım bitişi, ${i}. adım bitişinden önce olamaz`,
            )
          }
        }
        if (adim?.foto_zorunlu && adim?.video_zorunlu) {
          return toast.error(`${i + 1}. adımda foto ve video aynı anda zorunlu olamaz`)
        }
        if (adim?.foto_zorunlu && (Number(adim?.min_foto_sayisi) || 0) < 1) {
          return toast.error(`${i + 1}. adımda minimum fotoğraf en az 1 olmalı`)
        }
        if (adim?.video_zorunlu && (Number(adim?.min_video_sayisi) || 0) < 1) {
          return toast.error(`${i + 1}. adımda minimum video en az 1 olmalı`)
        }
        if (adim?.video_zorunlu) {
          const maxSn = Number(adim?.max_video_suresi_sn) || 0
          if (maxSn < 5 || maxSn > 60) {
            return toast.error(`${i + 1}. adımda video süresi 5-60 saniye arasında olmalı`)
          }
        }
        if (adim?.belge_zorunlu && (Number(adim?.min_belge_sayisi) || 0) < 1) {
          return toast.error(`${i + 1}. adımda minimum belge en az 1 olmalı`)
        }
      }
    }
    if (gorevModu === 'zincir_onay' && !form.personel_id) {
      return toast.error('Zincir Onayda görevi yapacak personeli seçin')
    }
    if (currentPersonelId && form.personel_id && String(form.personel_id) === currentPersonelId) {
      return toast.error('Kendinize görev atayamazsınız')
    }

    if (!mayAssign) {
      return toast.error('Görev oluşturma ve atama yetkiniz bulunmuyor.')
    }

    const findPersonRow = (pid) =>
      (persons || []).find((p) => String(p.id) === String(pid)) ||
      (onayPersons || []).find((p) => String(p.id) === String(pid))

    const assigneeAllowedInHierarchyScope = (pid, { allowUpward = false } = {}) => {
      if (!pid) return true
      if (isSystemAdmin) return true
      const row = findPersonRow(pid)
      if (!row) return false
      return canSelectPersonelForAssignment({
        assigner: personel,
        assignerPermissions: permissions,
        targetRow: row,
        rolePermMap,
        accessibleUnitIds,
        isSystemAdmin,
        allowUpward,
      })
    }

    if (!isSystemAdmin) {
      if (gorevModu === 'normal') {
        for (const id of normalAssigneeIds) {
          if (!assigneeAllowedInHierarchyScope(id)) {
            return toast.error(
              'Seçilen personel görev atama kapsamınızın dışında veya sizden üst düzeyde. Yalnızca kendi birim hiyerarşinizdeki eş veya alt düzey personele atayabilirsiniz.',
            )
          }
        }
      }
      if (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') {
        for (const id of zincirGorevSira) {
          if (!assigneeAllowedInHierarchyScope(id)) {
            return toast.error(
              'Zincir Görev sırasında kapsam dışı veya üst düzey bir personel seçilmiş.',
            )
          }
        }
      }
      if (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') {
        for (const id of zincirOnaySira) {
          if (!assigneeAllowedInHierarchyScope(id, { allowUpward: true })) {
            return toast.error('Zincir Onay sırasında seçilen onaylayıcı kapsam dışında.')
          }
        }
        if (form.personel_id && !assigneeAllowedInHierarchyScope(form.personel_id)) {
          return toast.error('Görev sorumlusu kapsam dışında veya sizden üst düzeyde.')
        }
      }
      if (gorevModu === 'sirali_gorev') {
        for (const adim of siraliAdimlar) {
          if (!assigneeAllowedInHierarchyScope(adim?.personel_id)) {
            return toast.error('Sıralı Görevde seçilen yapan kapsam dışında veya üst düzeyde.')
          }
          if (
            adim?.denetimci_personel_id &&
            !assigneeAllowedInHierarchyScope(adim.denetimci_personel_id, {
              allowUpward: true,
            })
          ) {
            return toast.error('Sıralı Görevde seçilen denetimci kapsam dışında.')
          }
        }
      }
    }

    const tplFoto = !!tplRow?.foto_zorunlu
    const chkFoto = !!effectiveSablonId && gorevModu === 'normal' && sablonChecklistFotoVar
    const effectiveFotoZorunlu = effectiveSablonId
      ? tplFoto || chkFoto
      : !!form.foto_zorunlu
    let effectiveMinFoto = 0
    if (effectiveFotoZorunlu) {
      if (tplFoto) {
        const m = Math.min(5, Math.max(1, Number(tplRow.min_foto_sayisi) || 1))
        effectiveMinFoto = Math.max(m, checklistMaxMinFoto)
      } else if (chkFoto) {
        effectiveMinFoto = Math.max(1, checklistMaxMinFoto)
      } else {
        effectiveMinFoto = Number(form.min_foto_sayisi) || 0
      }
    }
    if (effectiveFotoZorunlu && effectiveMinFoto <= 0) {
      return toast.error('Minimum fotoğraf sayısı en az 1 olmalıdır')
    }

    const tplVid = !!tplRow?.video_zorunlu
    const chkVid =
      !!effectiveSablonId &&
      gorevModu === 'sablon_gorev' &&
      sablonChecklistVideoVar
    const effectiveVideoZorunlu = effectiveSablonId
      ? tplVid || chkVid
      : !!form.video_zorunlu
    let effectiveMinVideo = 0
    let effectiveMaxVideoSn = 60
    if (effectiveVideoZorunlu) {
      if (tplVid) {
        const m = Math.min(3, Math.max(1, Number(tplRow.min_video_sayisi) || 1))
        effectiveMinVideo = chkVid ? Math.max(m, 1) : m
      } else if (chkVid) {
        effectiveMinVideo = 1
      } else {
        effectiveMinVideo = Math.min(3, Math.max(1, Number(form.min_video_sayisi) || 1))
      }
      const tplSn = Math.min(60, Math.max(5, Number(tplRow?.max_video_suresi_sn) || 60))
      if (tplVid) {
        effectiveMaxVideoSn = Math.max(tplSn, checklistMaxVideoSn)
      } else if (chkVid) {
        effectiveMaxVideoSn = checklistMaxVideoSn
      } else {
        effectiveMaxVideoSn = Math.min(
          60,
          Math.max(5, Number(form.max_video_suresi_sn) || 60),
        )
      }
    }
    if (effectiveVideoZorunlu && effectiveMinVideo <= 0) {
      return toast.error('Minimum video sayısı en az 1 olmalıdır')
    }

    const effectiveBelgeZorunlu = !!form.belge_zorunlu
    let effectiveMinBelge = 0
    if (effectiveBelgeZorunlu) {
      effectiveMinBelge = Math.min(5, Math.max(1, Number(form.min_belge_sayisi) || 1))
    }
    if (effectiveBelgeZorunlu && effectiveMinBelge <= 0) {
      return toast.error('Minimum belge sayısı en az 1 olmalıdır')
    }

    let payloadFotoZorunlu = effectiveFotoZorunlu
    let payloadVideoZorunlu = effectiveVideoZorunlu
    let payloadMinFoto = effectiveMinFoto
    let payloadMinVideo = effectiveVideoZorunlu ? effectiveMinVideo : 0
    let payloadMaxVideoSn = effectiveVideoZorunlu ? effectiveMaxVideoSn : 60
    let payloadBelgeZorunlu = tur === GOREV_TURU.SIRALI_GOREV ? false : effectiveBelgeZorunlu
    let payloadMinBelge = tur === GOREV_TURU.SIRALI_GOREV ? 0 : effectiveMinBelge

    const anaSirketId = companyScoped ? currentCompanyId : form.ana_sirket_id || null
    if (companyScoped && !anaSirketId) return toast.error('Şirket bilgisi bulunamadı')

    const resolveAssignerPersonelId = async () => {
      if (personel?.id) return personel.id
      if (!user?.id) return null
      let q = supabase
        .from('personeller')
        .select('id')
        .eq('kullanici_id', user.id)
        .is('silindi_at', null)
      if (anaSirketId) q = q.eq('ana_sirket_id', anaSirketId)
      const { data, error } = await q.maybeSingle()
      if (error) {
        console.error('assigner personel resolve error', error)
        return null
      }
      return data?.id || null
    }

    const firstZincirPerson = zincirGorevSira[0]
      ? persons.find((p) => String(p.id) === String(zincirGorevSira[0]))
      : null
    const firstSiraliPerson = siraliAdimlar[0]?.personel_id
      ? persons.find((p) => String(p.id) === String(siraliAdimlar[0].personel_id))
      : null
    const mixedUnitsSelected = form.birim_id === MIXED_UNITS_VALUE
    const resolvedBirimId =
      (mixedUnitsSelected ? '' : form.birim_id) ||
      (gorevModu === 'sirali_gorev'
        ? (firstSiraliPerson?.birim_id ? String(firstSiraliPerson.birim_id) : '')
        : (firstZincirPerson?.birim_id ? String(firstZincirPerson.birim_id) : ''))
    if (
      (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay' || gorevModu === 'sirali_gorev') &&
      !resolvedBirimId
    ) {
      if (gorevModu === 'sirali_gorev') {
        return toast.error('Sıralı Görev için birim seçin veya 1. adım personelinin birimi tanımlı olsun')
      }
      return toast.error('Zincir Görev için birim seçin veya ilk personelin birimi tanımlı olsun')
    }
    const birimForInsert = resolvedBirimId || form.birim_id || null
    if (
      companyScoped &&
      birimForInsert &&
      !mixedUnitsSelected &&
      accessibleUnitIds &&
      accessibleUnitIds.length &&
      !accessibleUnitIds.some((id) => String(id) === String(birimForInsert))
    ) {
      return toast.error('Seçilen birim için yetkiniz yok')
    }

    try {
      setSubmitting(true)
      const assignerPersonelId = await resolveAssignerPersonelId()
      if (!assignerPersonelId) {
        setSubmitting(false)
        return toast.error('Görev atayan personel bilgisi bulunamadı. Yeniden giriş yapın.')
      }
      const tur = resolvedGorevTuru()
      const firstWorker =
        tur === GOREV_TURU.SIRALI_GOREV
          ? siraliAdimlar[0]?.personel_id
          : tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
          ? zincirGorevSira[0]
          : normalAssigneeIds[0] || form.personel_id || null
      const siraliBaslamaIso =
        tur === GOREV_TURU.SIRALI_GOREV
          ? (siraliAdimlar?.[0]?.baslama_tarihi || null)
          : null
      const siraliBitisIso =
        tur === GOREV_TURU.SIRALI_GOREV
          ? (siraliAdimlar
              .map((a) => a?.bitis_tarihi)
              .filter(Boolean)
              .sort()
              .slice(-1)[0] || null)
          : null

      const repeatActive = !!form.tekrarlayan
      const uploadReferenceMediaFiles = async (files, scopeKey) => {
        const list = Array.from(files || []).filter(Boolean)
        if (!list.length) return []
        const bucket = 'task-reference-media'
        const out = []
        for (const f of list) {
          const safeName = sanitizeStorageFileName(f?.name || `ref_${Date.now()}`)
          const path = `${anaSirketId || 'common'}/${assignerPersonelId}/${scopeKey}_${Date.now()}_${crypto.randomUUID()}_${safeName}`
          const { error } = await supabase.storage.from(bucket).upload(path, f, {
            upsert: false,
            contentType: f?.type || undefined,
          })
          if (error) throw error
          out.push({
            yol: path,
            ad: String(f?.name || safeName),
            mime: String(f?.type || ''),
            boyut: Number(f?.size) || null,
            tip: String(f?.type || '').startsWith('video/')
              ? 'video'
              : String(f?.type || '').startsWith('image/')
                ? 'image'
                : 'file',
            yuklenen_at: new Date().toISOString(),
          })
        }
        return out
      }

      const taskReferenceMedia = await uploadReferenceMediaFiles(taskReferenceFiles, 'task_ref')
      const anchor = new Date()
      const manualBaslama =
        tur === GOREV_TURU.SIRALI_GOREV ? !!form.tekrarlayan : !!(form.baslama_zaman_sec || form.tekrarlayan)
      const recurrenceWindows = buildRecurrenceWindows({
        repeatActive,
        repeatType: form.tekrar_tipi,
        startAt:
          manualBaslama && (tur === GOREV_TURU.SIRALI_GOREV ? siraliBaslamaIso : form.baslama_tarihi)
            ? new Date(tur === GOREV_TURU.SIRALI_GOREV ? siraliBaslamaIso : form.baslama_tarihi)
            : anchor,
        endAt:
          tur === GOREV_TURU.SIRALI_GOREV
            ? (siraliBitisIso ? new Date(siraliBitisIso) : new Date())
            : (form.bitis_tarihi ? new Date(form.bitis_tarihi) : new Date()),
        repeatDays: Math.min(90, Math.max(1, Number(form.tekrar_gun) || 30)),
        intervalHours: Math.min(24, Math.max(1, Number(form.tekrar_saat_araligi) || 2)),
        dailyStartClock: form.tekrar_gun_ici_baslangic,
        dailyEndClock: form.tekrar_gun_ici_bitis,
        weeklyDays: form.tekrar_hafta_gunleri || [],
        weeklyWeeks: Math.min(52, Math.max(1, Number(form.tekrar_hafta_sayisi) || 8)),
      })
      const repeatCount = recurrenceWindows.length
      // Çoklu atamada havuz görev (`grup_id`) kararı: yalnız "Bireysel tamamlama" kapalıyken
      // grup oluştur. Şablon olup olmaması fark etmez; standart çoklu atamada da bireysel
      // açıkken her atanana ayrı görev açılır (havuz dışı).
      const usePoolGrupNormal =
        tur === GOREV_TURU.NORMAL &&
        normalAssigneeIds.length > 1 &&
        !form.bireysel
      const grupId =
        tur !== GOREV_TURU.NORMAL && !form.bireysel ? crypto.randomUUID() : null

      const resolvedPuan = tur === GOREV_TURU.SIRALI_GOREV
        ? 0
        : effectiveSablonId
        ? Number(tplRow?.varsayilan_puan ?? tplRow?.puan ?? form.puan)
        : Number(form.puan)
      const resolvedAciklama = tur === GOREV_TURU.SIRALI_GOREV
        ? null
        : effectiveSablonId
        ? tplRow?.aciklama != null
          ? String(tplRow.aciklama)
          : null
        : form.aciklama || null
      const projeIdParam = embedded
        ? new URLSearchParams(String(initialSearch || '').replace(/^\?/, '')).get('projeId')
        : searchParams.get('projeId')
      const basePayload = {
        is_sablon_id: effectiveSablonId || null,
        baslik: resolvedBaslik || 'Görev',
        ana_sirket_id: anaSirketId,
        birim_id: birimForInsert,
        sorumlu_personel_id: firstWorker,
        puan: Number.isFinite(resolvedPuan) ? resolvedPuan : null,
        atayan_personel_id: assignerPersonelId,
        durum:
          tur === GOREV_TURU.SIRALI_GOREV
            ? TASK_STATUS.ASSIGNED
            : form.acil
              ? 'ACIL'
              : TASK_STATUS.ASSIGNED,
        acil: tur === GOREV_TURU.SIRALI_GOREV ? false : !!form.acil,
        foto_zorunlu: tur === GOREV_TURU.SIRALI_GOREV ? false : payloadFotoZorunlu,
        min_foto_sayisi: tur === GOREV_TURU.SIRALI_GOREV ? 0 : payloadMinFoto,
        video_zorunlu: tur === GOREV_TURU.SIRALI_GOREV ? false : payloadVideoZorunlu,
        min_video_sayisi: tur === GOREV_TURU.SIRALI_GOREV ? 0 : payloadMinVideo,
        max_video_suresi_sn: tur === GOREV_TURU.SIRALI_GOREV ? 60 : payloadMaxVideoSn,
        belge_zorunlu: payloadBelgeZorunlu,
        min_belge_sayisi: payloadMinBelge,
        aciklama_zorunlu:
          tur === GOREV_TURU.SIRALI_GOREV ? false : effectiveSablonId ? false : !!form.aciklama_zorunlu,
        aciklama: resolvedAciklama,
        ozel_gorev:
          gorevModu === 'normal' && !!form.ozel_gorev && mayMarkBirebirGorev,
        gorev_turu: tur,
        zincir_aktif_adim: 1,
        zincir_onay_aktif_adim: 0,
        tekrar_tipi: repeatActive
          ? form.tekrar_tipi === 'weekly'
            ? 'weekly'
            : 'hourly_daily'
          : 'none',
        tekrar_saat_araligi_dakika: repeatActive && form.tekrar_tipi === 'daily_hourly'
          ? Math.min(24, Math.max(1, Number(form.tekrar_saat_araligi) || 2)) * 60
          : null,
        tekrar_hafta_gunleri: repeatActive && form.tekrar_tipi === 'weekly'
          ? (form.tekrar_hafta_gunleri || []).map((v) => Number(v))
          : null,
        referans_medya: taskReferenceMedia,
        ...(projeIdParam ? { proje_id: projeIdParam } : {}),
      }

      const payloads = []
      for (const win of recurrenceWindows) {
        const baslamaIso = deriveGorunurFromBaslamaIso(win.baslamaIso)
        const sonIso = win.sonIso || null
        if (tur === GOREV_TURU.NORMAL) {
          const targetAssignees = (persons || []).filter((x) =>
            normalAssigneeIds.some((id) => String(id) === String(x?.id)),
          )
          const dayGroupId = usePoolGrupNormal ? crypto.randomUUID() : null
          for (const assignee of targetAssignees) {
            payloads.push({
              ...basePayload,
              sorumlu_personel_id: assignee?.id || null,
              birim_id: assignee?.birim_id || birimForInsert,
              baslama_tarihi: baslamaIso,
              son_tarih: sonIso,
              gorunur_tarih: baslamaIso,
              grup_id: dayGroupId,
            })
          }
        } else {
          payloads.push({
            ...basePayload,
            baslama_tarihi: tur === GOREV_TURU.SIRALI_GOREV ? siraliBaslamaIso : baslamaIso,
            son_tarih: tur === GOREV_TURU.SIRALI_GOREV ? siraliBitisIso : sonIso,
            gorunur_tarih: tur === GOREV_TURU.SIRALI_GOREV ? siraliBaslamaIso : baslamaIso,
            grup_id: grupId,
          })
        }
      }

      let inserted = null
      const res = await supabase.from('isler').insert(payloads).select()
      if (res.error) {
        const msg = String(res.error?.message || '').toLowerCase()
        if (
          res.error?.code === '42703' &&
          (msg.includes('gorev_turu') ||
            msg.includes('zincir') ||
            msg.includes('acil') ||
            msg.includes('ozel_gorev') ||
            msg.includes('referans_medya') ||
            msg.includes('gorunur_tarih') ||
            msg.includes('proje_id'))
        ) {
          const fallbackPayloads = payloads.map((p) => {
            const next = { ...p }
            delete next.gorev_turu
            delete next.zincir_aktif_adim
            delete next.zincir_onay_aktif_adim
            delete next.acil
            delete next.ozel_gorev
            delete next.gorunur_tarih
            delete next.referans_medya
            delete next.proje_id
            return next
          })
          const res2 = await supabase.from('isler').insert(fallbackPayloads).select()
          if (res2.error) throw res2.error
          inserted = res2.data
        } else {
          throw res.error
        }
      } else {
        inserted = res.data
      }

      const rows = Array.isArray(inserted) ? inserted : inserted ? [inserted] : []
      const row = rows[0]
      const isId = row?.id

      if (
        rows.length > 0 &&
        (tur === GOREV_TURU.ZINCIR_GOREV ||
          tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY ||
          tur === GOREV_TURU.SIRALI_GOREV)
      ) {
        const gorevRows = rows.flatMap((taskRow) =>
          (tur === GOREV_TURU.SIRALI_GOREV ? siraliAdimlar : zincirGorevSira).map((row, i) => ({
            is_id: taskRow.id,
            adim_no: i + 1,
            personel_id: tur === GOREV_TURU.SIRALI_GOREV ? row?.personel_id : row,
            durum: i === 0 ? 'aktif' : 'sira_bekliyor',
            denetimci_personel_id:
              tur === GOREV_TURU.SIRALI_GOREV ? row?.denetimci_personel_id || null : null,
            adim_baslik:
              tur === GOREV_TURU.SIRALI_GOREV
                ? String(row?.adim_baslik || `${i + 1}. adım`)
                : null,
            adim_istenenler:
              tur === GOREV_TURU.SIRALI_GOREV
                ? {
                    aciklama: String(row?.adim_aciklama || '').trim() || null,
                    baslama_tarihi: i === 0 ? (row?.baslama_tarihi || null) : null,
                    bitis_tarihi: row?.bitis_tarihi || null,
                    puan: Number.isFinite(Number(row?.puan)) ? Number(row?.puan) : 0,
                    aciklama_zorunlu: !!row?.aciklama_zorunlu,
                    acil: !!row?.acil,
                    kanit: {
                      foto_zorunlu: !!row?.foto_zorunlu,
                      min_foto_sayisi: row?.foto_zorunlu
                        ? Math.min(5, Math.max(1, Number(row?.min_foto_sayisi) || 1))
                        : 0,
                      video_zorunlu: !!row?.video_zorunlu,
                      min_video_sayisi: row?.video_zorunlu
                        ? Math.min(3, Math.max(1, Number(row?.min_video_sayisi) || 1))
                        : 0,
                      max_video_suresi_sn: row?.video_zorunlu
                        ? Math.min(60, Math.max(5, Number(row?.max_video_suresi_sn) || 60))
                        : 60,
                      belge_zorunlu: !!row?.belge_zorunlu,
                      min_belge_sayisi: row?.belge_zorunlu
                        ? Math.min(5, Math.max(1, Number(row?.min_belge_sayisi) || 1))
                        : 0,
                    },
                    referans_medya: [],
                  }
                : [],
            adim_durum: i === 0 ? 'aktif' : 'sira_bekliyor',
          })),
        )
        if (tur === GOREV_TURU.SIRALI_GOREV) {
          for (let i = 0; i < gorevRows.length; i += 1) {
            const adimNo = Number(gorevRows[i]?.adim_no || 0)
            const adimSrc = siraliAdimlar[adimNo - 1]
            const refs = await uploadReferenceMediaFiles(adimSrc?.referans_dosyalar || [], `step_${adimNo}`)
            if (gorevRows[i]?.adim_istenenler && typeof gorevRows[i].adim_istenenler === 'object') {
              gorevRows[i].adim_istenenler = {
                ...gorevRows[i].adim_istenenler,
                referans_medya: refs,
              }
            }
          }
        }
        const { error: zgErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(gorevRows)
        if (zgErr) {
          console.error('zincir gorev adimlari', zgErr)
          toast.error('Bazi zincir gorev adimlari kaydedilemedi (migration 014 kontrol edin)')
        }
      }
      if (
        rows.length > 0 &&
        tur !== GOREV_TURU.SIRALI_GOREV &&
        (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)
      ) {
        const onayRows = rows.flatMap((taskRow) =>
          zincirOnaySira.map((pid, i) => ({
            is_id: taskRow.id,
            adim_no: i + 1,
            onaylayici_personel_id: pid,
            durum: TASK_STATUS.ASSIGNED,
          })),
        )
        const { error: zoErr } = await supabase.from('isler_zincir_onay_adimlari').insert(onayRows)
        if (zoErr) {
          console.error('zincir onay adimlari', zoErr)
          toast.error('Bazi zincir onay adimlari kaydedilemedi (migration 014 kontrol edin)')
        }
      }

      const projeGorevId = embedded
        ? new URLSearchParams(String(initialSearch || '').replace(/^\?/, '')).get('projeGorevId')
        : searchParams.get('projeGorevId')
      if (projeGorevId && isId) {
        try {
          await linkProjectTaskToOperational(projeGorevId, isId)
        } catch (linkErr) {
          console.error('proje görev bağlantısı', linkErr)
          toast.error('Görev oluşturuldu ancak proje planına bağlanamadı.')
        }
      }

      toast.success(
        repeatActive && repeatCount > 1
          ? `Tekrarlayan gorev planlandi (${repeatCount} kayit)`
          : projeGorevId
            ? 'Görev atandı ve proje planına bağlandı'
            : 'Görev atandı',
      )
      if (embedded && typeof onClose === 'function') {
        onClose({ refresh: true })
      } else {
        navigate('/admin/tasks', { replace: true, state: { refreshAt: Date.now() } })
      }
    } catch (e) {
      console.error('Görev oluşturma hata:', e)
      toast.error(e?.message || JSON.stringify(e) || 'Hata')
    } finally {
      setSubmitting(false)
    }
  }

  const sablonOzetFotoMetni = (() => {
    if (!selectedTemplate) return ''
    const parcalar = []
    if (selectedTemplate.foto_zorunlu) {
      parcalar.push(
        `Görev şablonu: en az ${Math.min(5, Math.max(1, Number(selectedTemplate.min_foto_sayisi) || 1))} fotoğraf`,
      )
    }
    if (hasChecklistPhoto) {
      parcalar.push(
        checklistMaxMinFoto > 0
          ? `Checklist: fotoğraf maddeleri (en az ${checklistMaxMinFoto})`
          : 'Checklist: fotoğraf maddeleri',
      )
    }
    return parcalar.join(' · ')
  })()

  const sablonOzetVideoMetni = (() => {
    if (!selectedTemplate) return ''
    const parcalar = []
    if (selectedTemplate.video_zorunlu) {
      const mx = Math.min(60, Math.max(5, Number(selectedTemplate.max_video_suresi_sn) || 60))
      parcalar.push(
        `Görev şablonu: en az ${Math.min(3, Math.max(1, Number(selectedTemplate.min_video_sayisi) || 1))} video (≤${mx}s)`,
      )
    }
    if (hasChecklistVideo) {
      parcalar.push(`Checklist: video maddeleri (≤${checklistMaxVideoSn}s)`)
    }
    return parcalar.join(' · ')
  })()

  const reviewAssigneeSummary =
    gorevModu === 'normal' || gorevModu === 'sablon_gorev'
      ? `${getNormalAssigneeIds().length} personel`
      : gorevModu === 'sirali_gorev'
        ? `${siraliAdimlar.length} adım`
        : gorevModu === 'zincir_onay'
          ? `${zincirOnaySira.length} onaylayıcı`
          : `${zincirGorevSira.length} görev sorumlusu${zincirOnaySira.length ? ` + ${zincirOnaySira.length} onaylayıcı` : ''}`
  const selectedModeMeta = GOREV_MODU_OPTIONS.find((m) => m.value === gorevModu) || null

  const inp = embedded ? embeddedInputClass : inputClass
  const sec = embedded ? embeddedSectionClass : sectionCardClass
  const sectionPad = embedded ? 'p-2' : 'p-5 sm:p-6'
  const sectionPadSm = embedded ? 'p-2' : 'p-4 sm:p-5'
  const embLabel = 'mb-0.5 block text-xs font-semibold text-slate-600'
  const embTitle = 'text-sm font-bold text-slate-800'
  const embStepWrap = embedded
    ? 'task-assign-step-panel space-y-2 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
    : ''
  const embeddedBodyScroll = embedded && EMBEDDED_SCROLL_STEPS.has(embeddedStepId)
  const embBtnSecondary =
    'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50'
  const embBtnGhost =
    'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100'
  const embBtnPrimary =
    'inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60'

  const showModePicker = embedded ? embeddedStepId === 'tur' : currentStep === 1
  const showAssignTemel = embedded ? embeddedStepId === 'detaylar-temel' : currentStep === 2
  const showAssignAtama = embedded ? embeddedStepId === 'detaylar-atama' : currentStep === 2
  const showAssignBase = showAssignTemel || showAssignAtama
  const showAssignSteps = embedded ? embeddedStepId === 'adimlar' : currentStep === 2
  const showFilesPanel = embedded ? embeddedStepId === 'dosyalar' : currentStep === 2
  const showZamanlamaPanel = embedded ? embeddedStepId === 'zamanlama' : currentStep === 3
  const showTekrarPanel = embedded && embeddedStepId === 'tekrarlama'
  const showDigerPanel = embedded ? embeddedStepId === 'diger' : currentStep === 3
  const showPuanInTemel = showAssignTemel && showEditableTaskDescription

  const handleEmbeddedSubmit = () => {
    if (!isLastEmbeddedStep) {
      goEmbeddedNext()
      return
    }
    if (!validateStep(1)) return
    if (!validateStep(2)) return
    if (gorevModu !== 'sirali_gorev' && !validateStep(3)) return
    if (!validateTekrarEmbedded()) return
    submit()
  }

  const handleCancel = () => {
    if (embedded && typeof onClose === 'function') {
      onClose()
      return
    }
    navigate('/admin/tasks')
  }

  const assignablePersonOptions = useMemo(
    () =>
      persons
        .filter((p) => !currentPersonelId || String(p.id) !== String(currentPersonelId))
        .map((p) => ({ id: p.id, name: personName(p) })),
    [persons, currentPersonelId],
  )

  const onayPersonOptions = useMemo(
    () => onayPersons.map((p) => ({ id: p.id, name: personName(p) })),
    [onayPersons],
  )

  const scrollContent = (
      <div className={embedded ? 'space-y-2' : 'space-y-5'}>
        {!embedded ? (
        <section className={`${sec} ${sectionPadSm}`}>
          <div className="grid gap-2 sm:grid-cols-4">
            {WIZARD_STEPS.map((step) => {
              const active = currentStep === step.id
              const done = step.id < currentStep
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={step.id > maxVisitedStep}
                  onClick={() => goToStep(step.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : done
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide">Adım {step.id}</div>
                  <div className="font-semibold">{step.label}</div>
                  {step.id === 1 && gorevModu ? (
                    <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
                      {GOREV_MODU_OPTIONS.find((m) => m.value === gorevModu)?.label || gorevModu}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
          {stepHint ? <p className="mt-3 text-xs font-medium text-rose-600">{stepHint}</p> : null}
        </section>
        ) : null}

        {/* Görev türü — segment */}
        {showModePicker ? (
        embedded ? (
          <div data-help="task-assign-mode" className={`${embStepWrap} task-assign-step-panel--tur`}>
            <div className="flex items-center gap-1.5">
              <p className={embTitle}>Görev türü</p>
              <FieldInfoTip text="Tür; atama, onay ve adım akışını belirler. Detaylar için kart üzerindeki bilgi simgesine bakın." />
            </div>
            <div className="grid grid-cols-2 gap-2.5 overflow-visible sm:grid-cols-3">
              {GOREV_MODU_OPTIONS.map((opt) => {
                const active = gorevModu === opt.value
                const ModeIcon = GOREV_MODU_MODE_ICONS[opt.value] || Link2
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-help={`task-assign-mode-${opt.value}`}
                    onClick={() => setGorevModu(opt.value)}
                    className={`relative flex min-h-[5.25rem] flex-col overflow-visible rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-[#2563EB] bg-[#EFF6FF] shadow-sm ring-2 ring-[#2563EB]/20'
                        : 'border-[#E2E8F0] bg-white hover:border-slate-300 hover:bg-slate-50/90'
                    }`}
                  >
                    <FieldInfoTip
                      text={opt.hint}
                      stopPropagation
                      className="absolute right-2 top-2"
                    />
                    <span
                      className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${
                        active ? 'bg-[#DBEAFE] text-[#1D4ED8]' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <ModeIcon size={16} strokeWidth={2} />
                    </span>
                    <span className={`text-sm font-bold leading-tight ${active ? 'text-[#1E3A8A]' : 'text-slate-800'}`}>
                      {opt.label}
                    </span>
                    <span className="mt-0.5 text-xs leading-snug text-slate-500">{opt.sub}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
        <section className={`${sec} ${sectionPad}`}>
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <Link2 className="h-5 w-5 text-indigo-600" aria-hidden />
            <h2 className="text-base font-bold">Görev türü</h2>
          </div>
          <p className="mb-4 text-xs text-slate-500">Bu adımda yalnızca görev türünü seçin.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GOREV_MODU_OPTIONS.map((opt) => {
              const active = gorevModu === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGorevModu(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-500/25'
                      : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-slate-500">{opt.sub}</div>
                </button>
              )
            })}
          </div>
        </section>
        )
        ) : null}

        {/* Ana form */}
        {showAssignBase ? (
        <section className={embedded ? 'contents' : `${sec} ${sectionPad}`}>
          <div className={embedded ? embStepWrap : undefined}>
          {!embedded ? (
          <>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Temel bilgiler ve atama</h2>
            {selectedModeMeta ? (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                {selectedModeMeta.label}
              </span>
            ) : null}
          </div>
          <p className="mb-4 text-xs text-slate-500">Önce temel bilgileri, sonra organizasyon ve atamayı tamamlayın.</p>
          </>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className={embTitle}>
                {showAssignTemel ? 'Temel bilgi' : 'Organizasyon ve atama'}
                {selectedModeMeta ? ` · ${selectedModeMeta.label}` : ''}
              </p>
              <FieldInfoTip
                text={
                  showAssignTemel
                    ? 'Başlık, şablon ve görev metni bu adımda tanımlanır.'
                    : 'Şirket, birim ve personel ataması bu adımda yapılır.'
                }
              />
            </div>
          )}
          <div className={embedded ? 'space-y-2' : 'space-y-5'}>
            {showAssignTemel ? (
            <div
              data-help={embedded ? 'task-assign-temel' : undefined}
              className={embedded ? 'space-y-2' : `rounded-2xl border border-slate-200 bg-slate-50/60 ${sectionPadSm}`}
            >
              {!embedded ? (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Temel bilgi</h3>
              </div>
              ) : null}
              <div className={embedded ? 'space-y-2' : 'space-y-4'}>
            {templateAllowedInMode ? (
              <div>
                <label className={embedded ? embLabel : 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'}>
                  Şablon *
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <select
                    value={form.sablon_id}
                    onChange={(e) => setForm({ ...form, sablon_id: e.target.value })}
                    className={inp}
                  >
                    <option value="">Şablon seçin</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.baslik}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/task-templates/new')}
                    className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 ${embedded ? 'px-3 py-2 text-sm font-semibold' : 'px-4 py-2.5 text-sm font-medium'}`}
                  >
                    <Plus size={16} />
                    Yeni şablon
                  </button>
                </div>
              </div>
            ) : null}

            {form.sablon_id && selectedTemplate && !embedded ? (
              <div className={`rounded-2xl border border-indigo-100 bg-indigo-50/40 ${sectionPadSm}`}>
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                    <FileText className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Seçilen şablon</p>
                    <p className="text-base font-bold text-slate-900">{selectedTemplate.baslik || '—'}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600/90">
                      Şablon açıklaması
                    </p>
                    {selectedTemplate.aciklama ? (
                      <p className="text-sm leading-relaxed text-slate-600">{String(selectedTemplate.aciklama)}</p>
                    ) : (
                      <p className="text-sm italic text-slate-400">Tanımlı değil</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                        Puan: {sablonPuan ?? 0}
                      </span>
                      {fotoSablondanGeliyor ? (
                        <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                          <Camera className="mr-1 h-3.5 w-3.5 text-slate-500" aria-hidden />
                          {sablonOzetFotoMetni || 'Fotoğraf checklist / şablonda'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
                          Fotoğraf zorunluluğu yok (aşağıdan ekleyebilirsiniz)
                        </span>
                      )}
                      {videoSablondanGeliyor ? (
                        <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                          <Video className="mr-1 h-3.5 w-3.5 text-slate-500" aria-hidden />
                          {sablonOzetVideoMetni || 'Video checklist / şablonda'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
                          Video zorunluluğu yok (aşağıdan ekleyebilirsiniz)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {form.sablon_id && selectedTemplate && embedded ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                <p className="text-sm font-bold text-slate-900">{selectedTemplate.baslik || '—'}</p>
                {selectedTemplate.aciklama ? (
                  <>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600/90">
                      Şablon açıklaması
                    </p>
                    <p className="line-clamp-2 text-xs leading-snug text-slate-600">
                      {String(selectedTemplate.aciklama)}
                    </p>
                  </>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-lg bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-indigo-100">
                    Puan {sablonPuan ?? 0}
                  </span>
                  {fotoSablondanGeliyor ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                      <Camera className="h-3.5 w-3.5" /> Foto
                    </span>
                  ) : null}
                  {videoSablondanGeliyor ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                      <Video className="h-3.5 w-3.5" /> Video
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!templateAllowedInMode ? (
              <div>
                <label className={embedded ? embLabel : 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'}>
                  Görev başlığı *
                </label>
                <input
                  type="text"
                  value={form.baslik}
                  onChange={(e) =>
                    setForm({ ...form, baslik: formatTaskTitleCase(e.target.value) })
                  }
                  className={inp}
                  placeholder="Örn: Stok sayımı"
                />
              </div>
            ) : null}

            {embedded && showEditableTaskDescription ? (
              <div
                className={
                  showPuanInTemel
                    ? 'space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5'
                    : undefined
                }
              >
                <div>
                  <label className={embLabel}>
                    {chainModeActive ? 'Görev notu (opsiyonel)' : 'Görev açıklaması'}
                  </label>
                  <textarea
                    value={form.aciklama}
                    onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                    rows={chainModeActive ? 2 : 3}
                    className={inp}
                    placeholder={
                      chainModeActive
                        ? 'Zincir süreci için ek talimat veya not'
                        : 'Görev detayı, talimat veya not (isteğe bağlı)'
                    }
                  />
                </div>
                {showPuanInTemel ? (
                  <div>
                    <label className={embLabel}>Puan (opsiyonel)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.puan}
                      onChange={(e) => setForm({ ...form, puan: Number(e.target.value) || 0 })}
                      className={`${inp} max-w-[8rem]`}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {!embedded && showEditableTaskDescription ? (
              <div className={showPuanInTemel ? 'space-y-4' : undefined}>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {chainModeActive ? 'Görev notu (opsiyonel)' : 'Görev açıklaması'}
                  </label>
                  <textarea
                    value={form.aciklama}
                    onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                    rows={chainModeActive ? 2 : 3}
                    className={inp}
                    placeholder={
                      chainModeActive
                        ? 'Zincir süreci için ek talimat veya not'
                        : 'Görev detayı, talimat veya not (isteğe bağlı)'
                    }
                  />
                </div>
                {showPuanInTemel ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Puan (opsiyonel)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.puan}
                      onChange={(e) => setForm({ ...form, puan: Number(e.target.value) || 0 })}
                      className={`${inp} max-w-[12rem]`}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {embedded && showAssignTemel && templateAllowedInMode ? (
              <div>
                <label className={embLabel}>Liste görünen ad (opsiyonel)</label>
                <input
                  type="text"
                  value={form.baslik}
                  onChange={(e) =>
                    setForm({ ...form, baslik: formatTaskTitleCase(e.target.value) })
                  }
                  className={inp}
                  placeholder={selectedTemplate?.baslik ? String(selectedTemplate.baslik) : 'Şablondan alınır'}
                />
              </div>
            ) : null}

            {form.sablon_id && !selectedTemplate ? (
              <p className={`rounded-xl border border-amber-200 bg-amber-50 text-amber-900 ${embedded ? 'px-3 py-2 text-xs' : 'px-3 py-2 text-sm'}`}>
                Şablon bilgisi yükleniyor veya bu şirket için uygun şablon bulunamadı. Listeden tekrar seçin.
              </p>
            ) : null}
            {!embedded && currentStep === 2 && gorevModu !== 'sirali_gorev' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Referans medya (opsiyonel)
              </label>
              <p className="mb-2 text-[11px] font-medium text-slate-500">
                Buraya eklenen fotoğraflar referans fotoğraf olarak işaretlenir.
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Medya ekle
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addTaskReferenceFiles(e.target.files)}
                  />
                </label>
              </div>
              {taskReferenceFiles.length ? (
                <div className="mt-2 space-y-1">
                  {taskReferenceFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      <span className="truncate">
                        {f.name} · {String(f?.type || '').startsWith('image/') ? 'Referans fotoğraf' : 'Referans medya'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTaskReferenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-2 rounded px-1 py-0.5 text-red-600 hover:bg-red-50"
                      >
                        Kaldır
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            ) : null}
              </div>
            </div>
            ) : null}

            {showAssignAtama ? (
            <div
              data-help="task-assign-atama"
              className={
                embedded
                  ? 'task-assign-atama-panel space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                  : `rounded-2xl border border-[#E2E8F0] bg-white shadow-sm ${sectionPadSm}`
              }
            >
              {!embedded ? (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Organizasyon ve atama</h3>
              </div>
              ) : null}
              <div
                className={
                  embedded
                    ? 'task-assign-org-card space-y-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3'
                    : 'grid gap-4 md:grid-cols-2'
                }
              >
                <div className={embedded ? undefined : 'md:col-span-2'}>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    Şirket
                  </label>
                  {companyScoped && companies.length === 1 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-sm font-semibold text-slate-800">
                      {companies[0].ana_sirket_adi}
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={form.ana_sirket_id}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            ana_sirket_id: e.target.value,
                            birim_id: '',
                          })
                        }
                        className={`${inp} appearance-none pr-9`}
                      >
                        <option value="">Şirket seçin</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.ana_sirket_adi}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  )}
                </div>

            {showTopUnitSelect ? (
              <div className={embedded ? undefined : 'md:col-span-2'}>
                <TaskAssignUnitSelect
                  compact={embedded}
                  label="Birim"
                  value={form.birim_id}
                  onChange={(v) => setForm({ ...form, birim_id: v })}
                  options={units.map((u) => ({ id: u.id, name: u.birim_adi }))}
                  mixedValue={chainModeActive ? MIXED_UNITS_VALUE : undefined}
                  mixedLabel="Karma birimler (şirket geneli)"
                  mixedHint="Zincir sırasına şirketteki tüm uygun personeller eklenebilir."
                />
              </div>
            ) : null}
              </div>

              <div className={embedded ? 'space-y-3' : 'mt-4 space-y-4'}>

            {!personelAlaniZincirGorevden ? (
            <div className="md:col-span-2">
              {!chainModeActive ? (
                <div className="mb-3 space-y-3">
                  <FieldSwitch
                    id="sw-coklu-atama"
                    checked={!!form.coklu_atama}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        coklu_atama: v,
                        birim_id: v ? '' : f.birim_id,
                      }))
                    }
                    label="Coklu gorev atama"
                    description="Acilinca personel, birim veya sirket tabanli toplu atama yapabilirsiniz."
                  />
                  {form.coklu_atama ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-500">Atama modeli</p>
                      <div className="flex flex-wrap gap-2">
                        {ASSIGNMENT_TARGETS.map((x) => {
                          const active = assignmentTarget === x.key
                          return (
                            <button
                              key={x.key}
                              type="button"
                              onClick={() => setAssignmentTarget(x.key)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                active
                                  ? 'border-indigo-500 bg-indigo-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              {x.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!chainModeActive && !form.coklu_atama ? (
                <TaskAssignSinglePersonRow
                  label={
                    gorevModu === 'zincir_onay' ? 'Sorumlu personel *' : 'Sorumlu personel'
                  }
                  emptyHint="Hiç kimse"
                  value={form.personel_id}
                  options={assignablePersonOptions}
                  onChange={(id) => setForm({ ...form, personel_id: id })}
                  tone="indigo"
                />
              ) : null}
              {!chainModeActive && form.coklu_atama && (assignmentTarget === 'personeller' || assignmentTarget === 'karma_personeller') ? (
                <TaskAssignPeopleChipPicker
                  compact={embedded}
                  title={
                    assignmentTarget === 'karma_personeller'
                      ? 'Karma birim personelleri'
                      : 'Sorumlu personeller'
                  }
                  countLabel={`${selectedAssigneeIds.length} seçili`}
                  tone="indigo"
                  options={assignablePersonOptions}
                  onAdd={(id) => {
                    if (!id) return
                    setSelectedAssigneeIds((prev) =>
                      prev.some((pid) => String(pid) === String(id)) ? prev : [...prev, id],
                    )
                  }}
                  selectedIds={selectedAssigneeIds}
                  onRemove={(pid) =>
                    setSelectedAssigneeIds((prev) => prev.filter((id) => String(id) !== String(pid)))
                  }
                />
              ) : null}
              {!chainModeActive && form.coklu_atama && assignmentTarget === 'birimler' ? (
                <TaskAssignUnitChipPicker
                  compact={embedded}
                  title="Atanacak birimler"
                  options={units.map((u) => ({ id: u.id, name: u.birim_adi }))}
                  selectedIds={selectedUnitIds}
                  onAdd={(id) => {
                    if (!id) return
                    setSelectedUnitIds((prev) =>
                      prev.some((uid) => String(uid) === String(id)) ? prev : [...prev, id],
                    )
                  }}
                  onRemove={(id) =>
                    setSelectedUnitIds((prev) => prev.filter((uid) => String(uid) !== String(id)))
                  }
                />
              ) : null}
              {!chainModeActive && form.coklu_atama && assignmentTarget === 'sirket' ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-600">
                  Şirket kapsamındaki tüm uygun personeller seçili kabul edilir.
                </p>
              ) : null}
              {chainModeActive && gorevModu !== 'zincir_onay' ? (
                <TaskAssignSinglePersonRow
                  label="İlk sorumlu (opsiyonel)"
                  emptyHint="Hiç kimse"
                  value={form.personel_id}
                  options={persons
                    .filter((p) => !currentPersonelId || String(p.id) !== String(currentPersonelId))
                    .map((p) => ({ id: p.id, name: personName(p) }))}
                  onChange={(id) => setForm({ ...form, personel_id: id })}
                  tone="sky"
                />
              ) : null}
            </div>
            ) : null}
              </div>
            </div>
            ) : null}
          </div>
          </div>
        </section>
        ) : null}

        {showFilesPanel && gorevModu !== 'sirali_gorev' ? (
          <div data-help="task-assign-dosyalar" className={embedded ? embStepWrap : `${sec} ${sectionPad}`}>
            <p className={embedded ? embTitle : 'mb-1 text-base font-bold text-slate-900'}>
              {embedded ? 'Referans medya (opsiyonel)' : 'Dosyalar'}
            </p>
            {!embedded ? (
              <p className="mb-4 text-xs text-slate-500">
                Göreve referans fotoğraf veya video ekleyin (opsiyonel).
              </p>
            ) : null}
            <div className={embedded ? 'space-y-2' : 'rounded-xl border border-slate-200 bg-white p-3'}>
              {!embedded ? (
              <label className={embLabel}>
                Referans medya
              </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Medya ekle
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addTaskReferenceFiles(e.target.files)}
                  />
                </label>
              </div>
              {taskReferenceFiles.length ? (
                <div className="mt-2 space-y-1">
                  {taskReferenceFiles.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600"
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setTaskReferenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-2 rounded px-1 py-0.5 text-red-600 hover:bg-red-50"
                      >
                        Kaldır
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Zincir Görev */}
        {showAssignSteps && (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') && (
          <div className={embedded ? embStepWrap : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]'}>
            {!zincirAtamaHazir ? (
              <div className={`flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 ${embedded ? 'py-4' : 'py-8'}`}>
                <Lock className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <p className="text-sm font-medium text-slate-600">Önce şirket ve birim seçin</p>
              </div>
            ) : (
              <TaskAssignOrderedPeoplePicker
                compact={embedded}
                title="Sorumlu personel sırası"
                countLabel={`${zincirGorevSira.length} kişi`}
                tone="sky"
                icon={Users}
                options={assignablePersonOptions}
                onAdd={(id) => {
                  if (!id) return
                  if (zincirGorevSira.some((pid) => String(pid) === String(id))) return
                  setZincirGorevSira((prev) => [...prev, id])
                }}
                orderedIds={zincirGorevSira}
                onRemove={(pid) => setZincirGorevSira((prev) => prev.filter((id) => String(id) !== String(pid)))}
                onMove={(idx, dir) => moveZincirGorev(idx, dir)}
                emptyText="Sıraya sorumlu personel ekleyin."
              />
            )}
          </div>
        )}

        {/* Zincir Onay */}
        {showAssignSteps && (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') && (
          <div className={embedded ? embStepWrap : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]'}>
            {!zincirAtamaHazir ? (
              <div className={`flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 ${embedded ? 'py-4' : 'py-8'}`}>
                <Lock className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <p className="text-sm font-medium text-slate-600">Önce şirket ve birim seçin</p>
              </div>
            ) : (
              <TaskAssignOrderedPeoplePicker
                compact={embedded}
                title="Denetimci / onaylayıcı sırası"
                countLabel={`${zincirOnaySira.length} kişi`}
                tone="indigo"
                icon={ShieldCheck}
                options={onayPersonOptions}
                onAdd={(id) => {
                  if (!id) return
                  if (zincirOnaySira.some((pid) => String(pid) === String(id))) return
                  setZincirOnaySira((prev) => [...prev, id])
                }}
                orderedIds={zincirOnaySira}
                onRemove={(pid) => setZincirOnaySira((prev) => prev.filter((id) => String(id) !== String(pid)))}
                onMove={(idx, dir) => moveZincirOnay(idx, dir)}
                emptyText="Sıraya denetimci ekleyin."
              />
            )}
          </div>
        )}

        {showAssignSteps && gorevModu === 'sirali_gorev' && (
          <div className={embedded ? embStepWrap : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]'}>
            <div className={embedded ? 'mb-1.5 flex items-center justify-between gap-2' : 'border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6'}>
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Users className={embedded ? 'h-4 w-4 text-fuchsia-600' : 'h-5 w-5 text-fuchsia-600'} />
                <span className={embedded ? 'text-sm' : ''}>Sıralı görev adımları</span>
              </div>
              <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-bold text-fuchsia-800">
                {siraliAdimlar.length} adım
              </span>
            </div>
            <div className={embedded ? 'space-y-2' : `space-y-3 ${sectionPad}`}>
              {siraliAdimlar.map((adim, idx) => (
                <div
                  key={`sirali-${idx}`}
                  className={embedded ? 'space-y-2' : 'rounded-xl border border-slate-200 bg-white p-4'}
                >
                  <TaskAssignRolePairPicker
                    compact={embedded}
                    stepIndex={idx + 1}
                    yapanValue={adim.personel_id}
                    yapanOptions={assignablePersonOptions}
                    onYapanChange={(v) => patchSiraliAdim(idx, 'personel_id', v)}
                    denetimciValue={adim.denetimci_personel_id}
                    denetimciOptions={onayPersonOptions}
                    onDenetimciChange={(v) => patchSiraliAdim(idx, 'denetimci_personel_id', v)}
                    onMoveUp={() => moveSiraliAdim(idx, -1)}
                    onMoveDown={() => moveSiraliAdim(idx, 1)}
                    onRemove={() => removeSiraliAdim(idx)}
                    canRemove={siraliAdimlar.length > 1}
                  />
                  <div className={`grid gap-2 sm:grid-cols-2 ${embedded ? '' : 'mt-1'}`}>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Adım başlığı</label>
                      <input
                        className={inp}
                        value={adim.adim_baslik}
                        onChange={(e) => patchSiraliAdim(idx, 'adim_baslik', e.target.value)}
                        placeholder="Örn: Sahada ilk kontrol ve foto kanıt"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label
                          className={
                            embedded
                              ? 'text-xs font-semibold text-slate-600'
                              : 'text-xs font-semibold uppercase tracking-wide text-slate-500'
                          }
                        >
                          Adım açıklaması
                        </label>
                        <label
                          htmlFor={`sirali-${idx}-aciklama-zorunlu`}
                          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5"
                        >
                          <span className="text-[11px] font-medium text-slate-500">Zorunlu</span>
                          <button
                            type="button"
                            id={`sirali-${idx}-aciklama-zorunlu`}
                            role="switch"
                            aria-checked={!!adim.aciklama_zorunlu}
                            onClick={() =>
                              patchSiraliAdim(idx, 'aciklama_zorunlu', !adim.aciklama_zorunlu)
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                              adim.aciklama_zorunlu ? 'bg-indigo-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition ${
                                adim.aciklama_zorunlu ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </label>
                      </div>
                      <textarea
                        className={`${inp} ${embedded ? 'min-h-[64px]' : 'min-h-[82px]'} resize-y`}
                        value={adim.adim_aciklama}
                        onChange={(e) => patchSiraliAdim(idx, 'adim_aciklama', e.target.value)}
                        placeholder={
                          adim.aciklama_zorunlu
                            ? 'Tamamlarken zorunlu açıklama için talimat'
                            : 'Bu adımda beklenen görev tanımı (isteğe bağlı)'
                        }
                      />
                    </div>
                    <div className="sm:col-span-2 mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Takvim
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {idx === 0 ? 'Adım başlangıç' : 'Adım başlangıç'}
                      </label>
                      {idx === 0 ? (
                        <input
                          type="datetime-local"
                          className={inp}
                          value={adim.baslama_tarihi || ''}
                          min={formatDateTimeLocalInput(new Date())}
                          onChange={(e) => patchSiraliAdim(idx, 'baslama_tarihi', e.target.value)}
                        />
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                          Başlangıç zamanı, {idx}. adım onaylandığında sistem tarafından otomatik atanır.
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Adım bitiş</label>
                      <input
                        type="datetime-local"
                        className={inp}
                        value={adim.bitis_tarihi || ''}
                        min={
                          idx === 0
                            ? (adim.baslama_tarihi || formatDateTimeLocalInput(new Date()))
                            : (siraliAdimlar[idx - 1]?.bitis_tarihi || formatDateTimeLocalInput(new Date()))
                        }
                        onChange={(e) => patchSiraliAdim(idx, 'bitis_tarihi', e.target.value)}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[3, 8, 12].map((h) => (
                          <button
                            key={`sirali-${idx}-h-${h}`}
                            type="button"
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => {
                              const baseRaw =
                                idx === 0
                                  ? (adim.baslama_tarihi || formatDateTimeLocalInput(new Date()))
                                  : (siraliAdimlar[idx - 1]?.bitis_tarihi || formatDateTimeLocalInput(new Date()))
                              const base = new Date(baseRaw)
                              const end = new Date(base.getTime() + h * 60 * 60 * 1000)
                              patchSiraliAdim(idx, 'bitis_tarihi', formatDateTimeLocalInput(end))
                            }}
                          >
                            +{h} saat
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Adım puanı</label>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        className={inp}
                        value={adim.puan}
                        onChange={(e) => patchSiraliAdim(idx, 'puan', Number(e.target.value))}
                      />
                    </div>
                    <div className="sm:col-span-2 mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Adım gereksinimleri
                    </div>
                    <div className="sm:col-span-2 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                      <InlineSwitch
                        id={`sirali-${idx}-acil`}
                        checked={!!adim.acil}
                        onChange={(v) => patchSiraliAdim(idx, 'acil', v)}
                        label="Acil adım"
                      />
                      <InlineSwitch
                        id={`sirali-${idx}-foto-zorunlu`}
                        checked={!!adim.foto_zorunlu}
                        onChange={(v) => setSiraliAdimFotoZorunlu(idx, v)}
                        label="Fotoğraf zorunlu"
                      />
                      <InlineSwitch
                        id={`sirali-${idx}-video-zorunlu`}
                        checked={!!adim.video_zorunlu}
                        onChange={(v) => setSiraliAdimVideoZorunlu(idx, v)}
                        label="Video zorunlu"
                      />
                      <InlineSwitch
                        id={`sirali-${idx}-belge-zorunlu`}
                        checked={!!adim.belge_zorunlu}
                        onChange={(v) => setSiraliAdimBelgeZorunlu(idx, v)}
                        label="Belge zorunlu"
                      />
                      {adim.foto_zorunlu ? (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Minimum fotoğraf (1-5)</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            className={inp}
                            value={adim.min_foto_sayisi}
                            onChange={(e) => patchSiraliAdim(idx, 'min_foto_sayisi', e.target.value)}
                          />
                        </div>
                      ) : null}
                      {adim.video_zorunlu ? (
                        <>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Minimum video (1-3)</label>
                            <input
                              type="number"
                              min={1}
                              max={3}
                              className={inp}
                              value={adim.min_video_sayisi}
                              onChange={(e) => patchSiraliAdim(idx, 'min_video_sayisi', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Maks. video süresi (5-60 sn)</label>
                            <input
                              type="number"
                              min={5}
                              max={60}
                              className={inp}
                              value={adim.max_video_suresi_sn}
                              onChange={(e) => patchSiraliAdim(idx, 'max_video_suresi_sn', e.target.value)}
                            />
                          </div>
                        </>
                      ) : null}
                      {adim.belge_zorunlu ? (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Minimum belge (1-5)</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            className={inp}
                            value={adim.min_belge_sayisi}
                            onChange={(e) => patchSiraliAdim(idx, 'min_belge_sayisi', e.target.value)}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Adım referans medya (opsiyonel)
                      </label>
                      <p className="mb-2 text-[11px] font-medium text-slate-500">
                        Eklenen görseller adım için referans fotoğraf olarak kaydedilir.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <label className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                          Medya ekle
                          <input
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            className="hidden"
                            onChange={(e) => addSiraliStepReferenceFiles(idx, e.target.files)}
                          />
                        </label>
                      </div>
                      {(adim?.referans_dosyalar || []).length ? (
                        <div className="mt-2 space-y-1">
                          {(adim?.referans_dosyalar || []).map((f, refIdx) => (
                            <div key={`${f?.name || 'ref'}-${refIdx}`} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                              <span className="truncate">
                                {f?.name || `Referans ${refIdx + 1}`} · {String(f?.type || '').startsWith('image/') ? 'Referans fotoğraf' : 'Referans medya'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  patchSiraliAdim(
                                    idx,
                                    'referans_dosyalar',
                                    (adim?.referans_dosyalar || []).filter((_, i) => i !== refIdx),
                                  )
                                }
                                className="ml-2 rounded px-1 py-0.5 text-red-600 hover:bg-red-50"
                              >
                                Kaldır
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addSiraliAdim}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 font-semibold text-white shadow-sm hover:bg-fuchsia-700 ${
                  embedded ? 'px-3 py-2 text-sm' : 'rounded-xl px-4 py-2.5 text-sm'
                }`}
              >
                <Plus className="h-4 w-4" />
                Adım ekle
              </button>
            </div>
          </div>
        )}

        {/* Tarih & puan */}
        {showZamanlamaPanel && gorevModu !== 'sirali_gorev' ? (
        <div
          data-help={embedded ? 'task-assign-zamanlama' : undefined}
          className={embedded ? embStepWrap : `${sec} ${sectionPad}`}
        >
          <div className={embedded ? 'mb-2 flex items-center gap-1.5' : 'mb-4'}>
            <p className={embedded ? embTitle : 'text-base font-bold text-slate-900'}>
              {embedded ? 'Zamanlama' : 'Süre ve puan'}
            </p>
            {embedded ? (
              <FieldInfoTip text="Başlangıç ve bitiş tarihleri, puan ve acil görev ayarları bu adımda yapılır." />
            ) : null}
          </div>
          <div className={embedded ? 'rounded-lg border border-rose-100 bg-rose-50/40 px-2 py-1.5' : 'mb-4 rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-rose-50/70 p-4 shadow-sm'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                {!embedded ? (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                  <Clock3 className="h-4 w-4" />
                </span>
                ) : null}
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-slate-900">Acil görev</p>
                    {embedded ? (
                      <FieldInfoTip text="Başlangıç şimdiye alınır; bitiş süresi hızlı seçeneklerle ayarlanır." />
                    ) : null}
                  </div>
                  {!embedded ? (
                  <p className="text-xs text-slate-500">Başlangıç şimdiye alınır, bitiş hızlı süre ile ayarlanır.</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.acil}
                onClick={() => {
                  if (form.acil) {
                    setSelectedUrgentQuick(30)
                    setForm((f) => ({ ...f, acil: false }))
                    return
                  }
                  applyUrgentQuickDuration(30)
                }}
                className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border border-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:ring-offset-2 ${
                  form.acil ? 'bg-rose-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    form.acil ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            {form.acil ? (
              <div className={`${embedded ? 'mt-2' : 'mt-4'} grid grid-cols-3 gap-1.5`}>
                <button
                  type="button"
                  onClick={() => applyUrgentQuickDuration(30)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition ${
                    selectedUrgentQuick === 30
                      ? 'border-rose-500 bg-rose-100 text-rose-800 ring-2 ring-rose-300/60'
                      : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50'
                  }`}
                >
                  +30dk
                </button>
                <button
                  type="button"
                  onClick={() => applyUrgentQuickDuration(60)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition ${
                    selectedUrgentQuick === 60
                      ? 'border-rose-500 bg-rose-100 text-rose-800 ring-2 ring-rose-300/60'
                      : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50'
                  }`}
                >
                  +1 saat
                </button>
                <button
                  type="button"
                  onClick={() => applyUrgentQuickDuration(180)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition ${
                    selectedUrgentQuick === 180
                      ? 'border-rose-500 bg-rose-100 text-rose-800 ring-2 ring-rose-300/60'
                      : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50'
                  }`}
                >
                  +3 saat
                </button>
              </div>
            ) : null}
          </div>
          {!form.acil ? (
            <div className={embedded ? 'space-y-2.5' : 'mb-4 space-y-4'}>
              <FieldSwitch
                compact={false}
                id="sw-baslama-zaman"
                checked={form.baslama_zaman_sec}
                onChange={(v) => {
                  setForm((f) => ({
                    ...f,
                    baslama_zaman_sec: v,
                    ...(v && !f.baslama_tarihi
                      ? { baslama_tarihi: formatDateTimeLocalInput(new Date()) }
                      : {}),
                    ...(!v && !f.tekrarlayan ? { baslama_tarihi: '' } : {}),
                  }))
                }}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className={embedded ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
                    Başlangıç tarihini seç
                  </span>
                }
                description={embedded ? '' : 'Açıkken görevin başlangıç tarih ve saatini belirlersiniz.'}
              />
              {(form.baslama_zaman_sec || form.tekrarlayan) ? (
                <div
                  className={
                    embedded
                      ? 'rounded-lg border border-indigo-100 bg-indigo-50/50 p-2'
                      : 'rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4'
                  }
                >
                  <p
                    className={
                      embedded
                        ? 'mb-1.5 text-[10px] font-semibold text-indigo-800'
                        : 'mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700'
                    }
                  >
                    Hızlı tarih ve saat
                  </p>
                  <div className={`flex flex-wrap gap-1.5 ${embedded ? 'mb-1.5' : 'mb-3'}`}>
                    <button
                      type="button"
                      onClick={() => applyQuickRange('today_shift')}
                      className={`rounded-lg border border-indigo-200 bg-white font-semibold text-indigo-700 hover:bg-indigo-50 ${
                        embedded ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
                      }`}
                    >
                      Bugün 09–18
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickRange('tomorrow_shift')}
                      className={`rounded-lg border border-indigo-200 bg-white font-semibold text-indigo-700 hover:bg-indigo-50 ${
                        embedded ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
                      }`}
                    >
                      Yarın 09–18
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickRange('next24')}
                      className={`rounded-lg border border-indigo-200 bg-white font-semibold text-indigo-700 hover:bg-indigo-50 ${
                        embedded ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
                      }`}
                    >
                      Şimdi +24s
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const s = form.baslama_tarihi ? new Date(form.baslama_tarihi) : new Date()
                        const e = new Date(s)
                        e.setHours(e.getHours() + 3)
                        setForm((f) => ({
                          ...f,
                          baslama_zaman_sec: true,
                          baslama_tarihi: formatDateTimeLocalInput(s),
                          bitis_tarihi: formatDateTimeLocalInput(e),
                        }))
                      }}
                      className={`rounded-lg border border-indigo-200/80 bg-white/90 font-medium text-indigo-700 hover:bg-indigo-50 ${
                        embedded ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
                      }`}
                    >
                      Bitiş +3s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const s = form.baslama_tarihi ? new Date(form.baslama_tarihi) : new Date()
                        const e = new Date(s)
                        e.setHours(e.getHours() + 8)
                        setForm((f) => ({
                          ...f,
                          baslama_zaman_sec: true,
                          baslama_tarihi: formatDateTimeLocalInput(s),
                          bitis_tarihi: formatDateTimeLocalInput(e),
                        }))
                      }}
                      className={`rounded-lg border border-indigo-200/80 bg-white/90 font-medium text-indigo-700 hover:bg-indigo-50 ${
                        embedded ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
                      }`}
                    >
                      Bitiş +8s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const s = form.baslama_tarihi ? new Date(form.baslama_tarihi) : new Date()
                        const e = new Date(s)
                        e.setHours(e.getHours() + 12)
                        setForm((f) => ({
                          ...f,
                          baslama_zaman_sec: true,
                          baslama_tarihi: formatDateTimeLocalInput(s),
                          bitis_tarihi: formatDateTimeLocalInput(e),
                        }))
                      }}
                      className={`rounded-lg border border-indigo-200/80 bg-white/90 font-medium text-indigo-700 hover:bg-indigo-50 ${
                        embedded ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
                      }`}
                    >
                      Bitiş +12s
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {!form.acil ? (
          <div className={`grid ${embedded ? 'grid-cols-1 gap-3' : 'gap-4 md:grid-cols-2'}`}>
            {form.tekrarlayan || form.baslama_zaman_sec ? (
              <div className={embedded ? 'rounded-lg border border-slate-200 bg-white p-2' : 'rounded-xl border border-slate-200 bg-white p-3'}>
                <label className={embedded ? embLabel : 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500'}>
                  Başlangıç
                </label>
                <div className="grid grid-cols-[minmax(0,170px)_112px] items-start gap-2">
                  <DatePicker
                    selected={parseDateOnlyPart(splitDateTimeParts(form.baslama_tarihi).date)}
                    minDate={parseDateOnlyPart(todayDatePart())}
                    onChange={(date) =>
                      setForm({
                        ...form,
                        baslama_tarihi: mergeDateAndTime(
                          date instanceof Date ? formatDateTimeLocalInput(date).slice(0, 10) : '',
                          splitDateTimeParts(form.baslama_tarihi).time,
                          '09:00',
                        ),
                      })
                    }
                    dateFormat="dd.MM.yyyy"
                    popperPlacement="bottom-start"
                    popperProps={{ strategy: 'fixed' }}
                    wrapperClassName="w-full"
                    showPopperArrow={false}
                    className={`${inp} text-sm`}
                  />
                  <input
                    type="time"
                    step="300"
                    className={`${inp} ml-1 text-sm`}
                    value={splitDateTimeParts(form.baslama_tarihi).time || '09:00'}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        baslama_tarihi: mergeDateAndTime(
                          splitDateTimeParts(form.baslama_tarihi).date || formatDateTimeLocalInput(new Date()).slice(0, 10),
                          e.target.value,
                          '09:00',
                        ),
                      })
                    }
                  />
                </div>
                {null}
              </div>
            ) : null}
            <div className={embedded ? 'rounded-lg border border-slate-200 bg-white p-2' : 'rounded-xl border border-slate-200 bg-white p-3'}>
              <label className={embedded ? embLabel : 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500'}>
                Bitiş
              </label>
              <div className="grid grid-cols-[minmax(0,170px)_112px] items-start gap-2">
                <DatePicker
                  selected={parseDateOnlyPart(splitDateTimeParts(form.bitis_tarihi).date)}
                  minDate={parseDateOnlyPart(todayDatePart())}
                  onChange={(date) =>
                    setForm({
                      ...form,
                      bitis_tarihi: mergeDateAndTime(
                        date instanceof Date ? formatDateTimeLocalInput(date).slice(0, 10) : '',
                        splitDateTimeParts(form.bitis_tarihi).time,
                        '18:00',
                      ),
                    })
                  }
                  dateFormat="dd.MM.yyyy"
                  popperPlacement="bottom-start"
                  popperProps={{ strategy: 'fixed' }}
                  wrapperClassName="w-full"
                  showPopperArrow={false}
                  className={`${inp} text-sm`}
                />
                <input
                  type="time"
                  step="300"
                  className={`${inp} ml-1 text-sm`}
                  value={splitDateTimeParts(form.bitis_tarihi).time || '18:00'}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bitis_tarihi: mergeDateAndTime(
                        splitDateTimeParts(form.bitis_tarihi).date || formatDateTimeLocalInput(new Date()).slice(0, 10),
                        e.target.value,
                        '18:00',
                      ),
                    })
                  }
                />
              </div>
            </div>
            {!embedded && form.sablon_id ? (
              <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                Puan şablondan gelir ({sablonPuan ?? 0}).
              </div>
            ) : null}
          </div>
          ) : null}
        </div>
        ) : null}

        {/* Tekrarlama (popup sihirbaz) */}
        {showTekrarPanel ? (
        <div className={embStepWrap}>
          <div className="flex items-center gap-1.5">
            <p className={embTitle}>Tekrarlama</p>
            <FieldInfoTip text="Kapalıysa görev tek seferlik oluşturulur. Açıkken günlük veya haftalık planlama yapılır." />
          </div>
          <div className="space-y-3">
            <FieldSwitch
              compact={false}
              id={gorevModu === 'sirali_gorev' ? 'sw-tekrar-sirali-emb' : 'sw-tekrar-emb'}
              checked={form.tekrarlayan}
              onChange={(v) => {
                if (gorevModu === 'sirali_gorev') {
                  setForm((f) => ({ ...f, tekrarlayan: v }))
                  return
                }
                setForm((f) => ({
                  ...f,
                  tekrarlayan: v,
                  baslama_zaman_sec: v ? true : f.baslama_zaman_sec,
                  ...(v && !f.baslama_tarihi
                    ? { baslama_tarihi: formatDateTimeLocalInput(new Date()) }
                    : {}),
                  ...(!v && !f.baslama_zaman_sec ? { baslama_tarihi: '' } : {}),
                }))
              }}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5" aria-hidden />
                  Tekrarlayan görev
                </span>
              }
            />
            {form.tekrarlayan ? (
              <>
                {gorevModu !== 'sirali_gorev' && (!form.baslama_tarihi || !form.bitis_tarihi) ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Tekrar planı için önce <span className="font-semibold">Zamanlama</span> adımında başlangıç ve bitiş tarihini girin.
                  </p>
                ) : null}
                <TekrarlayanConfig form={form} setForm={setForm} inp={inp} compact={false} />
              </>
            ) : null}
          </div>
        </div>
        ) : null}

        {/* Seçenekler */}
        {showDigerPanel ? (
        <div className={embedded ? embStepWrap : `${sec} bg-slate-50/40 ${sectionPad}`}>
          <div className={embedded ? 'flex items-center gap-1.5' : 'mb-3'}>
            <p className={embedded ? embTitle : 'text-base font-bold text-slate-900'}>Seçenekler</p>
            {embedded ? (
              <FieldInfoTip text="Bireysel görev, kanıt zorunlulukları ve tamamlarken açıklama isteği gibi ek seçenekler." />
            ) : null}
          </div>
          <div className="space-y-3">
            <div data-help="task-assign-diger-tamamlama" className="space-y-3">
            {showEditableTaskDescription ? (
              <FieldSwitch
                compact={embedded}
                id={embedded ? 'sw-aciklama-zorunlu-emb' : 'sw-aciklama-zorunlu'}
                checked={form.aciklama_zorunlu}
                onChange={(v) => setForm((f) => ({ ...f, aciklama_zorunlu: v }))}
                label={
                  <span className="inline-flex items-center gap-2">
                    <AlignLeft
                      className={embedded ? 'h-3.5 w-3.5' : 'h-4 w-4'}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Açıklama zorunlu
                  </span>
                }
                description={
                  embedded
                    ? ''
                    : 'Personel görevi tamamlarken açıklama yazmak zorundadır.'
                }
              />
            ) : null}
            {gorevModu !== 'sirali_gorev' ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {!chainModeActive && mayMarkBirebirGorev ? (
                    <FieldSwitch
                      id="sw-ozel-gorev"
                      checked={!!form.ozel_gorev}
                      onChange={(v) => setForm((f) => ({ ...f, ozel_gorev: v }))}
                      label={
                        <span className="inline-flex items-center gap-2">
                          <UserCheck className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                          Bire bir görev
                        </span>
                      }
                      description=""
                    />
                  ) : null}
                  {showBireyselToggle ? (
                    <FieldSwitch
                      id="sw-bireysel"
                      checked={form.bireysel}
                      onChange={(v) => setForm((f) => ({ ...f, bireysel: v }))}
                      label="Bireysel tamamlama"
                      description=""
                    />
                  ) : null}
                </div>
              </>
            ) : null}
            </div>
            {!embedded ? (
            <>
            <FieldSwitch
              id="sw-tekrar"
              checked={form.tekrarlayan}
              onChange={(v) => {
                setForm((f) => ({
                  ...f,
                  tekrarlayan: v,
                  baslama_zaman_sec: v ? true : f.baslama_zaman_sec,
                  ...(v && !f.baslama_tarihi
                    ? { baslama_tarihi: formatDateTimeLocalInput(new Date()) }
                    : {}),
                  ...(!v && !f.baslama_zaman_sec ? { baslama_tarihi: '' } : {}),
                }))
              }}
              label={
                <span className="inline-flex items-center gap-2">
                  <Repeat className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                  Tekrarlayan görev
                </span>
              }
              description=""
            />
            {form.tekrarlayan ? (
              <TekrarlayanConfig form={form} setForm={setForm} inp={inp} />
            ) : null}
            </>
            ) : null}
            <div data-help="task-assign-diger-kanit" className="space-y-3">
            {gorevModu !== 'sirali_gorev' && !fotoSablondanGeliyor ? (
              <>
                <FieldSwitch
                  compact={false}
                  id="sw-foto"
                  checked={form.foto_zorunlu}
                  onChange={setFotoZorunlu}
                  label={
                    <span className="inline-flex items-center gap-2">
                      <Camera className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                      Fotoğraf zorunlu
                    </span>
                  }
                  description="Şablonda veya checklistte foto tanımlıysa bu ayar gizlenir. Foto ve video kanıtı aynı anda zorunlu tutulamaz."
                />
                {form.foto_zorunlu ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Minimum fotoğraf (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={form.min_foto_sayisi}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          min_foto_sayisi: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                      className={`${inp} max-w-[140px]`}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            {gorevModu !== 'sirali_gorev' && !videoSablondanGeliyor ? (
              <>
                <FieldSwitch
                  compact={false}
                  id="sw-video"
                  checked={form.video_zorunlu}
                  onChange={setVideoZorunlu}
                  label={
                    <span className="inline-flex items-center gap-2">
                      <Video className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                      Video kanıtı zorunlu
                    </span>
                  }
                  description="Şablonda veya checklistte video tanımlıysa bu ayar gizlenir. Foto ve video kanıtı aynı anda zorunlu tutulamaz."
                />
                {form.video_zorunlu ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Minimum video (1–3)</label>
                      <input
                        type="number"
                        min={1}
                        max={3}
                        value={form.min_video_sayisi}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            min_video_sayisi: Math.min(3, Math.max(1, Number(e.target.value) || 1)),
                          }))
                        }
                        className={`${inp} max-w-[140px]`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Video başına üst süre (5–60 sn)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={60}
                        value={form.max_video_suresi_sn}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            max_video_suresi_sn: Math.min(
                              60,
                              Math.max(5, Number(e.target.value) || 60),
                            ),
                          }))
                        }
                        className={`${inp} max-w-[140px]`}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {gorevModu !== 'sirali_gorev' ? (
              <>
                <FieldSwitch
                  compact={false}
                  id="sw-belge"
                  checked={form.belge_zorunlu}
                  onChange={setBelgeZorunlu}
                  label={
                    <span className="inline-flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                      Belge zorunlu
                    </span>
                  }
                  description="Tamamlamada PDF veya Office belgesi (DOC, DOCX, XLS, XLSX, PPT, PPTX) gerekir. Foto/video ile birlikte kullanılabilir."
                />
                {form.belge_zorunlu ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Minimum belge (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={form.min_belge_sayisi}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          min_belge_sayisi: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                      className={`${inp} max-w-[140px]`}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            </div>
          </div>
        </div>
        ) : null}

        {!embedded && currentStep === 4 ? (
          <section className={`${sec} ${sectionPad}`}>
            <h2 className="mb-3 text-base font-bold text-slate-900">Gözden Geçir</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Görev Türü</div>
                <div className="font-semibold text-slate-900">{GOREV_MODU_OPTIONS.find((m) => m.value === gorevModu)?.label || gorevModu}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Başlık</div>
                <div className="font-semibold text-slate-900">{form.baslik || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Atama Özeti</div>
                <div className="font-semibold text-slate-900">{reviewAssigneeSummary}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Tekrar</div>
                <div className="font-semibold text-slate-900">{form.tekrarlayan ? 'Açık' : 'Kapalı'}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Türü Düzenle
              </button>
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Atamayı Düzenle
              </button>
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Zamanlamayı Düzenle
              </button>
            </div>
          </section>
        ) : null}

        {!embedded ? (
        <div
          className={`${sec} flex flex-col-reverse gap-3 p-4 sm:flex-row sm:items-center sm:justify-end sm:gap-4`}
        >
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={goPrevStep}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Geri
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            İptal
          </button>
          {currentStep < 4 ? (
            <button
              type="button"
              onClick={goNextStep}
              className="rounded-xl bg-[#0a1e42] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#0d2a5c] hover:shadow-lg"
            >
              Devam Et
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className={`rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition ${
                submitting
                  ? 'cursor-not-allowed bg-slate-400'
                  : 'bg-[#0a1e42] hover:bg-[#0d2a5c] hover:shadow-lg'
              }`}
            >
              {submitting ? 'Oluşturuluyor...' : 'Görev Ata'}
            </button>
          )}
        </div>
        ) : null}
      </div>
  )

  const embeddedProgressBar = (
    <div
      data-help="task-assign-tabs"
      className="task-assign-embedded__header shrink-0 border-b px-3 py-1.5"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {embeddedSteps.map((tab, idx) => {
          const Icon = tab.icon
          const active = idx === embeddedStepIndex
          const done = idx < embeddedStepIndex
          return (
            <button
              key={tab.id}
              type="button"
              disabled={!done}
              onClick={() => {
                if (done) setEmbeddedStepIndex(idx)
              }}
              className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-center transition ${
                active
                  ? 'bg-white text-[#1D4ED8] shadow-sm ring-1 ring-[#BFDBFE]'
                  : done
                    ? 'text-[#2563EB] hover:bg-white/80'
                    : 'cursor-default text-slate-400'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                  active ? 'bg-[#EFF6FF] text-[#2563EB]' : done ? 'bg-blue-50/80 text-[#2563EB]' : 'bg-slate-100'
                }`}
              >
                <Icon size={15} strokeWidth={2} />
              </span>
              <span className="text-[11px] font-bold leading-tight">{tab.label}</span>
            </button>
          )
        })}
      </div>
      {stepHint ? (
        <p className="mt-2 text-xs font-medium text-rose-600">{stepHint}</p>
      ) : null}
    </div>
  )

  if (!mayAssign) {
    if (embedded) {
      return (
        <p className="p-6 text-center text-sm text-slate-600">
          Görev oluşturma ve atama yetkiniz bulunmuyor.
        </p>
      )
    }
    return <Navigate to="/unauthorized" replace />
  }

  if (embedded) {
    return (
      <div
        data-help="task-assign-form"
        data-help-form-step={embeddedStepId}
        className="task-assign-embedded flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {embeddedProgressBar}
        <div
          className={`task-assign-embedded__body min-h-0 flex-1 px-3 py-2 ${
            embeddedBodyScroll ? 'task-assign-embedded__body--scroll overflow-y-auto overscroll-contain' : ''
          }`}
        >
          {scrollContent}
        </div>
        <div
          data-help="task-assign-submit"
          className="task-assign-embedded__footer flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]"
        >
          <button
            type="button"
            data-help="task-assign-cancel"
            onClick={handleCancel}
            className={embBtnGhost}
          >
            <X size={16} strokeWidth={2.2} />
            İptal
          </button>
          <div className="flex items-center gap-2">
            {embeddedStepIndex > 0 ? (
              <button type="button" onClick={goEmbeddedPrev} className={embBtnSecondary}>
                <ChevronLeft size={16} strokeWidth={2.2} />
                Geri
              </button>
            ) : null}
            <button
              type="button"
              data-help="task-assign-continue"
              onClick={handleEmbeddedSubmit}
              disabled={submitting}
              className={embBtnPrimary}
              style={{ backgroundColor: submitting ? undefined : cubicle.greenCta }}
            >
              {submitting ? 'Kaydediliyor…' : isLastEmbeddedStep ? 'Görevi oluştur' : 'Devam et'}
              {isLastEmbeddedStep ? <Check size={16} strokeWidth={2.5} /> : null}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-2 sm:px-6">
      <header className={`mb-5 ${sec} bg-gradient-to-br from-slate-50 via-white to-indigo-50/[0.35] px-4 py-4 sm:px-6 sm:py-5`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Görevler</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Yeni görev oluştur</h1>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
          {companyScoped
            ? 'Şablon, birim ve personel ile görev tanımlayın; isteğe bağlı zincir görev veya zincir onay ekleyin.'
            : 'Şirket ve personel seçerek görev oluşturun; zincir modları ile sıralı yürütme veya onay tanımlayın.'}
        </p>
      </header>
      {scrollContent}
    </div>
  )
}

export default function NewTask() {
  return <TaskAssignForm />
}

