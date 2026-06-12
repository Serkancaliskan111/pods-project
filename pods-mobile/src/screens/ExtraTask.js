import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  InteractionManager,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import DateTimePicker from '@react-native-community/datetimepicker'
import getSupabase from '../lib/supabaseClient'
import { formatTaskTitleCase } from '../lib/formatTaskTitle'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import {
  canAssignTasks,
  canCreateTasks,
  canMarkBirebirGorev,
  isTopCompanyScope as isTopCompanyScopeShared,
} from '../lib/managementScope'
import { formatFullName } from '../lib/nameFormat'
import { buildExtraTaskPrefillPatch } from '../lib/operationalAssignPrefill'
import EvidenceCaptureModal from '../components/EvidenceCaptureModal'
import { GOREV_TURU } from '../lib/zincirTasks'
import {
  GOREV_MODU_OPTIONS,
  GOREV_MODU_MODE_ICONS,
} from '../lib/gorevModuOptions'
import { useTaskAssignEmbeddedSteps } from '../hooks/useTaskAssignEmbeddedSteps.js'
import TaskAssignEmbeddedNav from '../components/tasks/TaskAssignEmbeddedNav'
import TaskFlowScreenShell, { TaskFlowSectionCard } from '../components/tasks/TaskFlowScreenShell'
import TaskFlowWizardFooter from '../components/tasks/TaskFlowWizardFooter'
import {
  TaskAssignPeopleChipPicker,
  TaskAssignOrderedPeoplePicker,
  TaskAssignRolePairPicker,
  CokluAtamaSwitch,
} from '../components/tasks/TaskAssignPersonPicker'
import TaskOperationalOptionsPanel from '../components/tasks/TaskOperationalOptionsPanel'
import {
  DEFAULT_OPERASYONEL_OPTS,
  normalizeOperasyonelOpts,
} from '../lib/projectTaskOperasyonel'
import { TASK_STATUS } from '../lib/taskStatus'
import { deriveGorunurFromBaslamaIso } from '../lib/taskVisibility'
import { canAuditTaskStep } from '../lib/taskPermissions'
import {
  ChevronRight,
  Check as CheckIcon,
  Link2,
} from 'lucide-react-native'
import {
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  Text as KitText,
  Icon,
} from '../ui'

const BUCKET = 'gorev_kanitlari'
const TASK_REFERENCE_BUCKET = 'task-reference-media'
const supabase = getSupabase()
const UPLOAD_RETRY_DELAYS_MS = [0, 500, 1200]
/** pickerRow + marginBottom — FlatList scroll için sabit satır yüksekliği */
const EXTRA_TASK_PICKER_ROW_HEIGHT = 58

const ThemeObj = Theme?.default ?? Theme
const { Colors, Layout, Typography } = ThemeObj
const CORPORATE_BLUE = Colors.text
const INDIGO_600 = Colors.primary
const MUTED = Colors.mutedText

function inferImageMeta(photo = {}) {
  const uri = String(photo?.uri || '').toLowerCase()
  if (uri.endsWith('.png')) return { ext: 'png', contentType: 'image/png' }
  if (uri.endsWith('.webp')) return { ext: 'webp', contentType: 'image/webp' }
  return { ext: 'jpg', contentType: 'image/jpeg' }
}

async function readPhotoArrayBuffer(photo) {
  if (photo?.base64) {
    const raw = String(photo.base64).replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
    return decodeBase64(raw)
  }

  const uri = String(photo?.uri || '').trim()
  if (!uri) throw new Error('Fotoğraf yolu bulunamadı')

  try {
    const response = await fetch(uri)
    if (!response.ok) throw new Error(`Fotoğraf okunamadı (${response.status})`)
    return await response.arrayBuffer()
  } catch {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
    const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
    return decodeBase64(raw)
  }
}

async function uploadPhotoWithRetry({ bucket, fileNamePrefix, photo }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const { ext, contentType } = inferImageMeta(photo)
  let lastError = null

  for (let attempt = 0; attempt < UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (UPLOAD_RETRY_DELAYS_MS[attempt] > 0) await sleep(UPLOAD_RETRY_DELAYS_MS[attempt])
      const arrayBuffer = await readPhotoArrayBuffer(photo)
      const fileName = `${fileNamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from(bucket).upload(fileName, arrayBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const path = data?.path ?? data
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      if (!urlData?.publicUrl) throw new Error('Public URL alınamadı')
      return urlData.publicUrl
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Fotoğraf yüklenemedi')
}

function sanitizeStorageFileName(name = '') {
  return String(name || 'dosya')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)
}

function inferReferenceTypeFromMime(mime = '') {
  const m = String(mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  return 'file'
}

async function uploadReferenceMediaAsset({ asset, fileNamePrefix }) {
  const uri = String(asset?.uri || '').trim()
  if (!uri) throw new Error('Referans medya yolu bulunamadı')
  const fileName = sanitizeStorageFileName(asset?.fileName || uri.split('/').pop() || 'ref')
  const mimeType = String(asset?.mimeType || '').trim() || 'application/octet-stream'
  const extFromMime = mimeType.includes('/') ? mimeType.split('/')[1] : ''
  const ext = (fileName.split('.').pop() || extFromMime || 'bin').toLowerCase()
  const storageName = `${fileNamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const response = await fetch(uri)
  if (!response.ok) throw new Error(`Referans medya okunamadı (${response.status})`)
  const arrayBuffer = await response.arrayBuffer()

  const { data, error } = await supabase.storage.from(TASK_REFERENCE_BUCKET).upload(storageName, arrayBuffer, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error

  return {
    path: data?.path ?? storageName,
    name: fileName,
    size: Number(asset?.fileSize || 0) || 0,
    mimeType,
    type: inferReferenceTypeFromMime(mimeType),
  }
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

function sortPersonnelRowsAlphabeticalTr(rows) {
  const locale = 'tr'
  const sortKey = (p) => {
    const name = formatFullName(p?.ad, p?.soyad, '').trim()
    if (name) return name.toLocaleLowerCase(locale)
    if (p?.email) return String(p.email).toLocaleLowerCase(locale)
    return String(p?.id ?? '')
  }
  return [...(rows || [])].sort((a, b) => {
    const cmp = sortKey(a).localeCompare(sortKey(b), locale, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), locale, { numeric: true })
  })
}

function buildRecurrenceWindows({
  repeatActive,
  repeatType,
  startAtIso,
  endAtIso,
  repeatDays,
  intervalHours,
  dailyStartClock,
  dailyEndClock,
  weeklyDays,
  weeklyWeeks,
}) {
  const startAt = startAtIso ? new Date(startAtIso) : new Date()
  const endAt = endAtIso ? new Date(endAtIso) : new Date(startAt.getTime() + 60 * 60 * 1000)
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
  const rangeEnd = new Date(startAt)
  rangeEnd.setDate(rangeEnd.getDate() + maxWeeks * 7 - 1)
  const durationMs = endAt.getTime() - startAt.getTime()
  for (let cursor = new Date(startAt); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
    if (!selectedDays.includes(toWeekdayNumber(cursor))) continue
    const baslama = new Date(cursor)
    baslama.setHours(startAt.getHours(), startAt.getMinutes(), startAt.getSeconds(), 0)
    if (baslama < startAt) continue
    const son = new Date(baslama.getTime() + durationMs)
    windows.push({ baslamaIso: baslama.toISOString(), sonIso: son.toISOString() })
  }
  return windows
}

export default function ExtraTask() {
  const navigation = useNavigation()
  const route = useRoute()
  const lockProjeId = route.params?.projeId || route.params?.projectId || null
  const { user, personel, permissions, profile } = useAuth()
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [puan, setPuan] = useState('')
  const [photo, setPhoto] = useState(null)
  const [evidenceCameraOpen, setEvidenceCameraOpen] = useState(false)
  const [fotoZorunlu, setFotoZorunlu] = useState(false)
  const [minFotoSayisi, setMinFotoSayisi] = useState('1')
  const [saving, setSaving] = useState(false)
  const [assignees, setAssignees] = useState([])
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([])
  const [manualSelectedAssigneeIds, setManualSelectedAssigneeIds] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [operasyonelOpts, setOperasyonelOpts] = useState(() =>
    normalizeOperasyonelOpts(DEFAULT_OPERASYONEL_OPTS),
  )
  const [acil, setAcil] = useState(false)
  const [ozelGorev, setOzelGorev] = useState(false)
  const [bireysel, setBireysel] = useState(true)
  const [cokluAtama, setCokluAtama] = useState(false)
  const [assignmentTarget, setAssignmentTarget] = useState('personeller') // personeller | birimler | sirket
  const [birimler, setBirimler] = useState([])
  const [selectedBirimIds, setSelectedBirimIds] = useState([])
  const [birimPickerOpen, setBirimPickerOpen] = useState(false)
  const [baslamaTarihiInput, setBaslamaTarihiInput] = useState('')
  const [sonTarihInput, setSonTarihInput] = useState('')
  const [baslamaZamanSec, setBaslamaZamanSec] = useState(false)
  const [datePickerVisible, setDatePickerVisible] = useState(false)
  const [datePickerField, setDatePickerField] = useState('start')
  const [datePickerStep, setDatePickerStep] = useState('date')
  const [pickerDate, setPickerDate] = useState(new Date())
  const [templates, setTemplates] = useState([])
  const [sablonSorular, setSablonSorular] = useState([])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [repeatDaily, setRepeatDaily] = useState(false)
  const [repeatDays, setRepeatDays] = useState('30')
  const [repeatType, setRepeatType] = useState('daily_hourly')
  const [repeatHourlyInterval, setRepeatHourlyInterval] = useState('2')
  const [repeatDayStartClock, setRepeatDayStartClock] = useState('09:00')
  const [repeatDayEndClock, setRepeatDayEndClock] = useState('18:00')
  const [repeatWeeklyDays, setRepeatWeeklyDays] = useState([1, 5])
  const [repeatWeeklyWeeks, setRepeatWeeklyWeeks] = useState('8')
  /** '' | 'normal' | 'sablon_gorev' | 'zincir_gorev' | 'zincir_onay' | 'zincir_gorev_ve_onay' | 'sirali_gorev' */
  const [gorevModu, setGorevModu] = useState('')
  const templateAllowedInMode = gorevModu === 'sablon_gorev'
  const [zincirGorevSira, setZincirGorevSira] = useState([])
  const [zincirOnaySira, setZincirOnaySira] = useState([])
  /**
   * Sıralı görev adımı varsayılan modeli. Web (NewTask) ile **aynı** alanları
   * tutar; her adımda fotoğraf/video/açıklama/acil ayrı ayrı belirlenir,
   * ortak bir "genel tarih" yoktur — başlangıç ve bitiş adım bazlı kaydedilir.
   */
  const buildDefaultSiraliAdim = useCallback(
    () => ({
      adim_baslik: '',
      adim_aciklama: '',
      personel_id: null,
      denetimci_personel_id: null,
      baslama_tarihi: '',
      bitis_tarihi: '',
      puan: '0',
      acil: false,
      aciklama_zorunlu: false,
      foto_zorunlu: false,
      min_foto_sayisi: '1',
      video_zorunlu: false,
      min_video_sayisi: '1',
      max_video_suresi_sn: '60',
      belge_zorunlu: false,
      min_belge_sayisi: '1',
    }),
    [],
  )
  const [siraliAdimlar, setSiraliAdimlar] = useState(() => [
    {
      adim_baslik: '',
      adim_aciklama: '',
      personel_id: null,
      denetimci_personel_id: null,
      baslama_tarihi: '',
      bitis_tarihi: '',
      puan: '0',
      acil: false,
      aciklama_zorunlu: false,
      foto_zorunlu: false,
      min_foto_sayisi: '1',
      video_zorunlu: false,
      min_video_sayisi: '1',
      max_video_suresi_sn: '60',
      belge_zorunlu: false,
      min_belge_sayisi: '1',
    },
    {
      adim_baslik: '',
      adim_aciklama: '',
      personel_id: null,
      denetimci_personel_id: null,
      baslama_tarihi: '',
      bitis_tarihi: '',
      puan: '0',
      acil: false,
      aciklama_zorunlu: false,
      foto_zorunlu: false,
      min_foto_sayisi: '1',
      video_zorunlu: false,
      min_video_sayisi: '1',
      max_video_suresi_sn: '60',
      belge_zorunlu: false,
      min_belge_sayisi: '1',
    },
  ])
  /** Sadece zincir onay modunda: görevi yapacak tek personel */
  const [zincirOnayWorkerId, setZincirOnayWorkerId] = useState(null)
  const [zincirGorevPickerOpen, setZincirGorevPickerOpen] = useState(false)
  const [zincirOnayPickerOpen, setZincirOnayPickerOpen] = useState(false)
  const [karmaBirimler, setKarmaBirimler] = useState(false)
  const [siraliBirimId, setSiraliBirimId] = useState('')
  const [siraliBirimPickerOpen, setSiraliBirimPickerOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [referenceMediaFiles, setReferenceMediaFiles] = useState([])
  const [activeUrgentQuick, setActiveUrgentQuick] = useState('')
  const [siraliPickerOpen, setSiraliPickerOpen] = useState(false)
  const [siraliPickerStepIdx, setSiraliPickerStepIdx] = useState(-1)
  const [siraliPickerField, setSiraliPickerField] = useState('personel_id')
  const [siraliDateStepIdx, setSiraliDateStepIdx] = useState(-1)
  const [siraliDateField, setSiraliDateField] = useState('baslama_tarihi')
  const [auditEligibleRoleIds, setAuditEligibleRoleIds] = useState([])
  const [activeSiraliStepIdx, setActiveSiraliStepIdx] = useState(0)
  const routePrefillAppliedRef = useRef(false)

  const isSystemAdmin = !!profile?.is_system_admin
  const mayMarkBirebirGorev = useMemo(
    () => canMarkBirebirGorev(permissions, isSystemAdmin),
    [permissions, isSystemAdmin],
  )

  const canAssignTask = useMemo(
    () => canAssignTasks(permissions, personel),
    [permissions, personel],
  )
  const canCreateTask = useMemo(
    () => canCreateTasks(permissions),
    [permissions],
  )
  const isSiraliMode = gorevModu === 'sirali_gorev'
  const chainModeActive =
    canAssignTask &&
    (gorevModu === 'zincir_gorev' ||
      gorevModu === 'zincir_onay' ||
      gorevModu === 'zincir_gorev_ve_onay')
  const assignScopeChainLike = chainModeActive || (canAssignTask && isSiraliMode)

  useEffect(() => {
    if (routePrefillAppliedRef.current) return
    const patch = buildExtraTaskPrefillPatch(route.params || {}, { isSystemAdmin })
    if (!patch) return
    routePrefillAppliedRef.current = true

    if (patch.baslik) setBaslik(patch.baslik)
    if (patch.aciklama) setAciklama(patch.aciklama)
    if (patch.puan != null) setPuan(patch.puan)
    if (patch.gorevModu) setGorevModu(patch.gorevModu)
    if (patch.currentStep) setCurrentStep(patch.currentStep)
    if (patch.baslamaTarihi) setBaslamaTarihiInput(patch.baslamaTarihi)
    if (patch.sonTarih) setSonTarihInput(patch.sonTarih)
    if (patch.selectedTemplateId || patch.sablonId) {
      setSelectedTemplateId(String(patch.selectedTemplateId || patch.sablonId))
    }
    if (patch.selectedAssigneeIds?.length) {
      setSelectedAssigneeIds(patch.selectedAssigneeIds)
      setManualSelectedAssigneeIds(patch.manualSelectedAssigneeIds || patch.selectedAssigneeIds)
    }
    if (patch.assignmentTarget) setAssignmentTarget(patch.assignmentTarget)
    if (patch.cokluAtama != null) {
      setCokluAtama(!!patch.cokluAtama)
      setBireysel(patch.cokluAtama ? patch.bireysel !== false : true)
    }
    if (patch.zincirGorevSira?.length) setZincirGorevSira(patch.zincirGorevSira)
    if (patch.zincirOnaySira?.length) setZincirOnaySira(patch.zincirOnaySira)
    if (patch.siraliAdimlar?.length) setSiraliAdimlar(patch.siraliAdimlar)
    if (patch.operasyonelOpts) {
      const op = patch.operasyonelOpts
      setOperasyonelOpts(op)
      setFotoZorunlu(op.foto_zorunlu)
      setMinFotoSayisi(String(op.min_foto_sayisi))
      setOzelGorev(op.ozel_gorev)
      if (op.acil) setAcil(true)
      if (op.coklu_atama) {
        setCokluAtama(true)
        setBireysel(op.bireysel !== false)
      } else if (op.bireysel === false) {
        setBireysel(false)
      }
      if (op.puan > 0) setPuan(String(op.puan))
    } else {
      if (patch.acil) setAcil(true)
      if (patch.fotoZorunlu) {
        setFotoZorunlu(true)
        if (patch.minFotoSayisi) setMinFotoSayisi(patch.minFotoSayisi)
      }
      if (patch.ozelGorev) setOzelGorev(true)
      if (patch.bireysel === false) setBireysel(false)
    }
  }, [route.params, isSystemAdmin])

  useEffect(() => {
    if (mayMarkBirebirGorev) return
    setOzelGorev(false)
  }, [mayMarkBirebirGorev])

  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )
  const accessibleUnitIds = useMemo(
    () => (Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []),
    [personel?.accessibleUnitIds],
  )

  const needsManualBaslama = baslamaZamanSec || repeatDaily

  const handleBack = useCallback(() => {
    navigation?.goBack?.()
  }, [navigation])

  const formatName = useCallback(
    (p) => {
      const full = formatFullName(p?.ad, p?.soyad, '')
      return full || p?.email || '-'
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    const loadAssignees = async () => {
      if (!canCreateTask) {
        if (cancelled) return
        setAssignees([])
        setSelectedAssigneeIds([])
        setManualSelectedAssigneeIds([])
        return
      }
      if (!personel?.ana_sirket_id) return

      // Personel modunda sadece kendine giriş yapabilir.
      if (!canAssignTask) {
        if (cancelled) return
        setAssignees([
          {
            id: personel?.id,
            ad: personel?.ad,
            soyad: personel?.soyad,
            email: personel?.email,
            birim_id: personel?.birim_id ?? null,
            rol_id: personel?.rol_id ?? null,
          },
        ])
        setManualSelectedAssigneeIds([personel?.id].filter(Boolean))
        setSelectedAssigneeIds([personel?.id].filter(Boolean))
        return
      }

      // Zincir / sıralı: "karma birimler" açıkken şirket genelinden seçime izin ver.
      if (assignScopeChainLike && karmaBirimler) {
        let pq = supabase
          .from('personeller')
          .select('id, ad, soyad, email, birim_id, rol_id')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .is('silindi_at', null)
        if (!isTopCompanyScope && accessibleUnitIds.length) {
          pq = pq.in('birim_id', accessibleUnitIds)
        }
        const result = await pq
        if (cancelled) return
        const list = sortPersonnelRowsAlphabeticalTr(
          (result?.data || []).filter((p) => String(p?.id) !== String(personel?.id)),
        )
        setAssignees(list)
        setManualSelectedAssigneeIds([])
        setSelectedAssigneeIds([])
        return
      }

      let query = supabase
        .from('personeller')
        .select('id, ad, soyad, email, birim_id, rol_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)
      if (isSiraliMode && siraliBirimId && !karmaBirimler) {
        query = query.eq('birim_id', siraliBirimId)
      } else if (!isTopCompanyScope && accessibleUnitIds.length) {
        query = query.in('birim_id', accessibleUnitIds)
      }

      const result = await query
      if (cancelled) return
      const resultData = result?.data
      const resultError = result?.error

      if (resultError) {
        if (__DEV__) console.warn('ExtraTask assignees load error', resultError)
        setAssignees([])
        setSelectedAssigneeIds([])
        setManualSelectedAssigneeIds([])
        return
      }

      const list = sortPersonnelRowsAlphabeticalTr(
        (resultData || []).filter((p) => String(p?.id) !== String(personel?.id)),
      )
      setAssignees(list)
      setManualSelectedAssigneeIds([])
      setSelectedAssigneeIds([])
    }

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) void loadAssignees()
    })
    return () => {
      cancelled = true
      interactionHandle.cancel?.()
    }
  }, [
    canCreateTask,
    canAssignTask,
    personel?.ana_sirket_id,
    personel?.birim_id,
    personel?.id,
    personel?.ad,
    personel?.soyad,
    personel?.email,
    isTopCompanyScope,
    accessibleUnitIds,
    assignScopeChainLike,
    isSiraliMode,
    siraliBirimId,
    karmaBirimler,
  ])

  useEffect(() => {
    const loadTemplates = async () => {
      if (!canCreateTask || !personel?.ana_sirket_id) {
        setTemplates([])
        setSelectedTemplateId(null)
        return
      }
      let q = supabase
        .from('is_sablonlari')
        .select('id, baslik, aciklama, varsayilan_puan, puan, foto_zorunlu, min_foto_sayisi, video_zorunlu, birim_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)
      if (!isTopCompanyScope && accessibleUnitIds.length) {
        q = q.or(`birim_id.in.(${accessibleUnitIds.join(',')}),birim_id.is.null`)
      }
      const { data, error } = await q.order('baslik', { ascending: true })
      if (error?.code === '42703') {
        const fallback = await supabase
          .from('is_sablonlari')
          .select('id, baslik, aciklama')
          .eq('ana_sirket_id', personel.ana_sirket_id)
        setTemplates(fallback?.data || [])
        return
      }
      if (error) {
        setTemplates([])
        return
      }
      setTemplates(data || [])
    }
    loadTemplates()
  }, [canCreateTask, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, accessibleUnitIds])

  useEffect(() => {
    if (!templateAllowedInMode || !selectedTemplateId) {
      setSablonSorular([])
      return
    }
    let cancelled = false
    supabase
      .from('is_sablon_sorulari')
      .select('soru_tipi, foto_zorunlu, min_foto_sayisi, max_video_suresi_sn')
      .eq('sablon_id', selectedTemplateId)
      .order('sira', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        setSablonSorular(error ? [] : data || [])
      })
    return () => {
      cancelled = true
    }
  }, [templateAllowedInMode, selectedTemplateId])

  useEffect(() => {
    let cancelled = false
    const loadBirimler = async () => {
      if (!canAssignTask || !personel?.ana_sirket_id) {
        if (cancelled) return
        setBirimler([])
        setSelectedBirimIds([])
        return
      }

      let q = supabase
        .from('birimler')
        .select('id, birim_adi')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)

      if (!isTopCompanyScope && accessibleUnitIds.length) {
        q = q.in('id', accessibleUnitIds)
      }

      const { data, error } = await q.order('birim_adi', { ascending: true })
      if (cancelled) return
      if (error) {
        if (__DEV__) console.warn('ExtraTask birimler load error', error)
        setBirimler([])
        setSelectedBirimIds([])
        return
      }

      const list = data || []
      setBirimler(list)
      setSelectedBirimIds([])
    }

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) void loadBirimler()
    })
    return () => {
      cancelled = true
      handle.cancel?.()
    }
  }, [canAssignTask, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, accessibleUnitIds])

  useEffect(() => {
    if (!canAssignTask) return
    if (assignmentTarget === 'personeller') return

    if (assignmentTarget === 'birimler') {
      const allowed = new Set((selectedBirimIds || []).map((x) => String(x)))
      const derivedIds = (assignees || [])
        .filter((p) => p?.birim_id && allowed.has(String(p.birim_id)))
        .map((p) => p.id)
      setSelectedAssigneeIds(derivedIds)
      return
    }

    if (assignmentTarget === 'sirket') {
      setSelectedAssigneeIds((assignees || []).map((p) => p.id))
    }
  }, [assignmentTarget, selectedBirimIds, assignees, canAssignTask])

  useEffect(() => {
    if (!canAssignTask) return
    if (assignmentTarget !== 'personeller') return
    const next = Array.isArray(manualSelectedAssigneeIds) ? manualSelectedAssigneeIds : []
    setSelectedAssigneeIds(next)
  }, [assignmentTarget, manualSelectedAssigneeIds, canAssignTask])

  useEffect(() => {
    if (!canAssignTask) return
    if (
      !gorevModu ||
      gorevModu === 'normal' ||
      gorevModu === 'sablon_gorev'
    ) {
      return
    }
    setAssignmentTarget('personeller')
    setRepeatDaily(false)
  }, [gorevModu, canAssignTask])

  useEffect(() => {
    if (!chainModeActive) setKarmaBirimler(false)
  }, [chainModeActive])

  useEffect(() => {
    let cancelled = false
    const loadAuditEligibleRoles = async () => {
      const roleIds = [...new Set([...(assignees || []).map((p) => p?.rol_id), personel?.rol_id].filter(Boolean).map((x) => String(x)))]
      if (!roleIds.length) {
        if (!cancelled) setAuditEligibleRoleIds([])
        return
      }
      const { data, error } = await supabase.from('roller').select('id,yetkiler').in('id', roleIds)
      if (cancelled) return
      if (error) {
        setAuditEligibleRoleIds([])
        return
      }
      const allowed = (data || [])
        .filter((r) => canAuditTaskStep(r?.yetkiler || {}))
        .map((r) => String(r?.id))
      setAuditEligibleRoleIds(allowed)
    }
    void loadAuditEligibleRoles()
    return () => {
      cancelled = true
    }
  }, [assignees, personel?.rol_id])

  useEffect(() => {
    if (!gorevModu || gorevModu === 'normal' || gorevModu === 'sablon_gorev') return
    setOzelGorev(false)
  }, [gorevModu])

  useEffect(() => {
    if (templateAllowedInMode) return
    setSelectedTemplateId(null)
    // Şablon yalnızca normal modda geçerli: zincire geçince şablon kaynaklı kanıt kısıtları temizlenir.
    setFotoZorunlu(false)
    setMinFotoSayisi('1')
    setTemplatePickerOpen(false)
  }, [templateAllowedInMode])

  const standardModeActive = gorevModu === 'normal' || gorevModu === 'sablon_gorev'
  const {
    embeddedSteps,
    embeddedStepIndex,
    embeddedStepId,
    isLastEmbeddedStep,
    goEmbeddedNext,
    goEmbeddedPrev,
    goEmbeddedTo,
  } = useTaskAssignEmbeddedSteps(gorevModu)

  const previewFilteredAssigneeCount = useMemo(() => {
    if (!canAssignTask || chainModeActive) return 0
    const targetAssigneeIds =
      assignmentTarget === 'personeller'
        ? (manualSelectedAssigneeIds || [])
        : (selectedAssigneeIds || [])
    return targetAssigneeIds.filter((id) => String(id) !== String(personel?.id)).length
  }, [
    canAssignTask,
    chainModeActive,
    assignmentTarget,
    manualSelectedAssigneeIds,
    selectedAssigneeIds,
    personel?.id,
  ])

  /**
   * "Bireysel tamamlama" toggle'ı:
   *  - Zincir/sıralı modlarda anlamsız → gizlenir.
   *  - Standart (sablonsuz) ve şablon görevlerin ikisinde de çoklu atama (>1 kişi) varsa görünür.
   *  - Açık → her atanan kendi başına ayrı görevi tamamlar (kişi başı).
   *    Kapalı → `grup_id` ile havuz görev üretilir; biri tamamlayınca diğerlerininki
   *    otomatik kapanır.
   */
  const showBireyselToggle =
    !chainModeActive && previewFilteredAssigneeCount > 1

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId],
  )
  const hasChecklistPhoto = useMemo(
    () =>
      templateAllowedInMode &&
      sablonSorular.some(
        (q) =>
          q?.soru_tipi === 'FOTOGRAF' ||
          !!q?.foto_zorunlu ||
          (Number(q?.min_foto_sayisi) || 0) > 0,
      ),
    [templateAllowedInMode, sablonSorular],
  )
  const hasChecklistVideo = useMemo(
    () => templateAllowedInMode && sablonSorular.some((q) => q?.soru_tipi === 'VIDEO'),
    [templateAllowedInMode, sablonSorular],
  )
  const templateDrivenFieldsHidden =
    !!(canAssignTask && templateAllowedInMode && selectedTemplateId && selectedTemplate)
  const approverCandidates = useMemo(() => {
    const list = [...(assignees || [])]
    if (!personel?.id) return sortPersonnelRowsAlphabeticalTr(list)
    const exists = list.some((p) => String(p?.id) === String(personel.id))
    if (!exists) {
      list.push({
        id: personel.id,
        ad: personel.ad,
        soyad: personel.soyad,
        email: personel.email,
        birim_id: personel.birim_id ?? null,
      })
    }
    const filtered = list.filter((p) => {
      // Sıralı görevde kişi kendini denetimci seçebilsin.
      if (personel?.id && String(p?.id) === String(personel.id)) return true
      if (!p?.rol_id) return false
      return auditEligibleRoleIds.includes(String(p.rol_id))
    })
    return sortPersonnelRowsAlphabeticalTr(filtered)
  }, [assignees, personel?.id, personel?.ad, personel?.soyad, personel?.email, personel?.birim_id, personel?.rol_id, auditEligibleRoleIds])

  const zincirGorevPickerData = useMemo(
    () =>
      (assignees || []).filter((p) => !zincirGorevSira.some((id) => String(id) === String(p?.id))),
    [assignees, zincirGorevSira],
  )

  const zincirOnayPickerData = useMemo(
    () =>
      (approverCandidates || []).filter((p) => !zincirOnaySira.some((id) => String(id) === String(p?.id))),
    [approverCandidates, zincirOnaySira],
  )

  const assignablePersonOptions = useMemo(
    () =>
      (assignees || [])
        .filter((p) => String(p?.id) !== String(personel?.id))
        .map((p) => ({ id: p.id, name: formatName(p) })),
    [assignees, personel?.id, formatName],
  )

  const onayPersonOptions = useMemo(
    () => (approverCandidates || []).map((p) => ({ id: p.id, name: formatName(p) })),
    [approverCandidates, formatName],
  )

  const assigneeCountInScope = useMemo(() => (assignees || []).filter((p) => p?.id).length, [assignees])

  const birimScopeAssigneeCount = useMemo(() => {
    const allowed = new Set((selectedBirimIds || []).map((id) => String(id)))
    if (!allowed.size) return 0
    return (assignees || []).filter((p) => p?.birim_id && allowed.has(String(p.birim_id))).length
  }, [selectedBirimIds, assignees])

  const resolvedGorevTuru = useCallback(() => {
    if (!gorevModu) return GOREV_TURU.NORMAL
    if (gorevModu === 'normal' || gorevModu === 'sablon_gorev') return GOREV_TURU.NORMAL
    if (gorevModu === 'sirali_gorev') return GOREV_TURU.SIRALI_GOREV
    if (gorevModu === 'zincir_gorev') return GOREV_TURU.ZINCIR_GOREV
    if (gorevModu === 'zincir_onay') return GOREV_TURU.ZINCIR_ONAY
    return GOREV_TURU.ZINCIR_GOREV_VE_ONAY
  }, [gorevModu])

  const addZincirGorevId = useCallback((pid) => {
    if (!pid) return
    setZincirGorevSira((prev) => {
      if (prev.some((id) => String(id) === String(pid))) return prev
      return [...prev, pid]
    })
    setZincirGorevPickerOpen(false)
  }, [])

  const addZincirOnayId = useCallback((pid) => {
    if (!pid) return
    setZincirOnaySira((prev) => {
      if (prev.some((id) => String(id) === String(pid))) return prev
      return [...prev, pid]
    })
    setZincirOnayPickerOpen(false)
  }, [])

  const moveZincirGorev = useCallback((index, dir) => {
    setZincirGorevSira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }, [])

  const moveZincirOnay = useCallback((index, dir) => {
    setZincirOnaySira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }, [])

  const removeZincirGorevAt = useCallback((index) => {
    setZincirGorevSira((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const removeZincirOnayAt = useCallback((index) => {
    setZincirOnaySira((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const patchSiraliAdim = useCallback((idx, key, value) => {
    setSiraliAdimlar((prev) => prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row)))
  }, [])

  const addSiraliAdim = useCallback(() => {
    setSiraliAdimlar((prev) => [...prev, buildDefaultSiraliAdim()])
  }, [buildDefaultSiraliAdim])

  const removeSiraliAdim = useCallback((idx) => {
    setSiraliAdimlar((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)))
  }, [])

  const moveSiraliAdim = useCallback((index, dir) => {
    setSiraliAdimlar((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }, [])

  useEffect(() => {
    setActiveSiraliStepIdx((prev) => {
      const max = Math.max(0, (siraliAdimlar?.length || 1) - 1)
      return Math.min(prev, max)
    })
  }, [siraliAdimlar])

  const manualAssigneeIdSet = useMemo(
    () => new Set((manualSelectedAssigneeIds || []).map((id) => String(id))),
    [manualSelectedAssigneeIds],
  )

  const toggleManualAssigneeId = useCallback((rawId) => {
    if (rawId == null || rawId === '') return
    setManualSelectedAssigneeIds((prev) => {
      const prevArr = Array.isArray(prev) ? prev : []
      const sid = String(rawId)
      const exists = prevArr.some((x) => String(x) === sid)
      return exists ? prevArr.filter((x) => String(x) !== sid) : [...prevArr, rawId]
    })
  }, [])

  const selectedBirimIdSet = useMemo(
    () => new Set((selectedBirimIds || []).map((id) => String(id))),
    [selectedBirimIds],
  )

  const toggleBirimId = useCallback((rawId) => {
    if (rawId == null || rawId === '') return
    setSelectedBirimIds((prev) => {
      const prevArr = Array.isArray(prev) ? prev : []
      const sid = String(rawId)
      const exists = prevArr.some((x) => String(x) === sid)
      return exists ? prevArr.filter((x) => String(x) !== sid) : [...prevArr, rawId]
    })
  }, [])

  const pickerRowGetItemLayout = useCallback(
    (_, index) => ({
      length: EXTRA_TASK_PICKER_ROW_HEIGHT,
      offset: EXTRA_TASK_PICKER_ROW_HEIGHT * index,
      index,
    }),
    [],
  )

  const renderPersonnelPickerItem = useCallback(
    ({ item: p }) => {
      const active = manualAssigneeIdSet.has(String(p?.id))
      return (
        <TouchableOpacity
          style={[styles.pickerRow, active && styles.pickerRowActive]}
          onPress={() => toggleManualAssigneeId(p?.id)}
          activeOpacity={0.85}
        >
          <Text style={styles.pickerRowText}>{formatName(p)}</Text>
          {active ? (
            <Icon.Delivered size={16} color={kitPalette.accent[600]} strokeWidth={3} />
          ) : null}
        </TouchableOpacity>
      )
    },
    [manualAssigneeIdSet, formatName, toggleManualAssigneeId],
  )

  const renderBirimPickerItem = useCallback(
    ({ item: b }) => {
      const active = selectedBirimIdSet.has(String(b?.id))
      return (
        <TouchableOpacity
          style={[styles.pickerRow, active && styles.pickerRowActive]}
          onPress={() => toggleBirimId(b?.id)}
          activeOpacity={0.85}
        >
          <Text style={styles.pickerRowText}>{b?.birim_adi || `Birim ${b?.id}`}</Text>
          {active ? (
            <Icon.Delivered size={16} color={kitPalette.accent[600]} strokeWidth={3} />
          ) : null}
        </TouchableOpacity>
      )
    },
    [selectedBirimIdSet, toggleBirimId],
  )

  const renderZincirGorevPickerItem = useCallback(
    ({ item: p }) => (
      <TouchableOpacity
        style={styles.pickerRow}
        onPress={() => addZincirGorevId(p?.id)}
        activeOpacity={0.85}
      >
        <Text style={styles.pickerRowText}>{formatName(p)}</Text>
      </TouchableOpacity>
    ),
    [addZincirGorevId, formatName],
  )

  const renderZincirOnayPickerItem = useCallback(
    ({ item: p }) => (
      <TouchableOpacity
        style={styles.pickerRow}
        onPress={() => addZincirOnayId(p?.id)}
        activeOpacity={0.85}
      >
        <Text style={styles.pickerRowText}>{formatName(p)}</Text>
      </TouchableOpacity>
    ),
    [addZincirOnayId, formatName],
  )

  const handleEvidencePhotoCaptured = useCallback((payload) => {
    setEvidenceCameraOpen(false)
    if (payload?.uri) {
      setPhoto({
        uri: payload.uri,
        base64: payload.base64 ?? null,
      })
    }
  }, [])

  const takePhoto = useCallback(async () => {
    if (Platform.OS === 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('İzin gerekli', 'Kamera izni verin.')
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      })
      if (!result.canceled && result.assets?.[0]) {
        setPhoto({
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 || null,
        })
      }
      return
    }
    setEvidenceCameraOpen(true)
  }, [])

  const removePhoto = useCallback(() => setPhoto(null), [])

  const addReferenceMediaFromLibrary = useCallback(async () => {
    try {
      // Expo SDK versions differ on enum shape; keep both forms compatible.
      const imageType = ImagePicker?.MediaType?.Images || ImagePicker?.MediaType?.Image || 'images'
      const videoType = ImagePicker?.MediaType?.Videos || ImagePicker?.MediaType?.Video || 'videos'
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [imageType, videoType],
        allowsEditing: false,
        allowsMultipleSelection: true,
        quality: 0.9,
        selectionLimit: 10,
      })
      if (result.canceled || !Array.isArray(result.assets) || result.assets.length === 0) return
      setReferenceMediaFiles((prev) => [...prev, ...result.assets])
    } catch (err) {
      Alert.alert('Medya seçilemedi', err?.message || 'Referans medya seçimi açılamadı.')
    }
  }, [])

  const formatDateTimeInput = useCallback((date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  }, [])

  const applyQuickRange = useCallback((type) => {
    const now = new Date()
    if (type === 'today_shift') {
      const start = new Date(now)
      start.setHours(9, 0, 0, 0)
      const end = new Date(now)
      end.setHours(18, 0, 0, 0)
      setBaslamaZamanSec(true)
      setBaslamaTarihiInput(formatDateTimeInput(start))
      setSonTarihInput(formatDateTimeInput(end))
      return
    }
    if (type === 'tomorrow_shift') {
      const start = new Date(now)
      start.setDate(start.getDate() + 1)
      start.setHours(9, 0, 0, 0)
      const end = new Date(start)
      end.setHours(18, 0, 0, 0)
      setBaslamaZamanSec(true)
      setBaslamaTarihiInput(formatDateTimeInput(start))
      setSonTarihInput(formatDateTimeInput(end))
      return
    }
    const start = new Date(now)
    const end = new Date(now)
    end.setHours(end.getHours() + 24)
    setBaslamaZamanSec(true)
    setBaslamaTarihiInput(formatDateTimeInput(start))
    setSonTarihInput(formatDateTimeInput(end))
  }, [formatDateTimeInput])

  const applyTimeRange = useCallback((startHour, startMin, endHour, endMin) => {
    const baseStart = parseInputToDate(baslamaTarihiInput)
    const baseEnd = parseInputToDate(sonTarihInput || baslamaTarihiInput)
    baseStart.setHours(startHour, startMin, 0, 0)
    baseEnd.setHours(endHour, endMin, 0, 0)
    if (baseEnd <= baseStart) {
      baseEnd.setDate(baseEnd.getDate() + 1)
    }
    setBaslamaZamanSec(true)
    setBaslamaTarihiInput(formatDateTimeInput(baseStart))
    setSonTarihInput(formatDateTimeInput(baseEnd))
  }, [parseInputToDate, baslamaTarihiInput, sonTarihInput, formatDateTimeInput])

  const applyUrgentQuickDuration = useCallback(
    (id) => {
      const now = new Date()
      const start = formatDateTimeInput(now)
      let minutes = 30
      if (id === '1h') minutes = 60
      if (id === '3h') minutes = 180
      const end = new Date(now.getTime() + minutes * 60 * 1000)
      setBaslamaZamanSec(true)
      setAcil(true)
      setBaslamaTarihiInput(start)
      setSonTarihInput(formatDateTimeInput(end))
      setActiveUrgentQuick(id)
    },
    [formatDateTimeInput],
  )

  const applyQuickDurationHours = useCallback(
    (hours) => {
      const now = new Date()
      const end = new Date(now.getTime() + Number(hours || 0) * 60 * 60 * 1000)
      setBaslamaZamanSec(true)
      setBaslamaTarihiInput(formatDateTimeInput(now))
      setSonTarihInput(formatDateTimeInput(end))
    },
    [formatDateTimeInput],
  )

  const parseDateTimeInput = useCallback((value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const normalized = raw.replace('T', ' ')
    const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    const day = Number(m[3])
    const hour = Number(m[4])
    const minute = Number(m[5])
    const date = new Date(year, month, day, hour, minute, 0, 0)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  }, [])

  const parseInputToDate = useCallback((value) => {
    const iso = parseDateTimeInput(value)
    if (!iso) return new Date()
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [parseDateTimeInput])

  const openDateTimePicker = useCallback(
    (field) => {
      if (field === 'start' && !needsManualBaslama) return
      setDatePickerField(field)
      setDatePickerStep('date')
      setPickerDate(parseInputToDate(field === 'start' ? baslamaTarihiInput : sonTarihInput))
      setDatePickerVisible(true)
    },
    [parseInputToDate, baslamaTarihiInput, sonTarihInput, needsManualBaslama],
  )

  const openSiraliDatePicker = useCallback(
    (stepIdx, field) => {
      const row = siraliAdimlar?.[stepIdx]
      setSiraliDateStepIdx(stepIdx)
      setSiraliDateField(field)
      setDatePickerField('sirali')
      setDatePickerStep('date')
      setPickerDate(parseInputToDate(row?.[field] || ''))
      setDatePickerVisible(true)
    },
    [siraliAdimlar, parseInputToDate],
  )

  const handleDateTimeChange = useCallback((event, selectedDate) => {
    if (event?.type === 'dismissed') {
      setDatePickerVisible(false)
      return
    }
    const next = selectedDate || pickerDate
    setPickerDate(next)
    if (Platform.OS === 'android' && datePickerStep === 'date') {
      setDatePickerStep('time')
      return
    }
    const formatted = formatDateTimeInput(next)
    if (datePickerField === 'start') setBaslamaTarihiInput(formatted)
    else if (datePickerField === 'end') setSonTarihInput(formatted)
    else if (datePickerField === 'sirali' && siraliDateStepIdx >= 0) {
      patchSiraliAdim(siraliDateStepIdx, siraliDateField, formatted)
    }
    setDatePickerVisible(false)
    setDatePickerStep('date')
  }, [datePickerField, datePickerStep, formatDateTimeInput, pickerDate, siraliDateStepIdx, siraliDateField, patchSiraliAdim])

  const handleOperasyonelChange = useCallback((next) => {
    const n = normalizeOperasyonelOpts(next)
    setOperasyonelOpts(n)
    setFotoZorunlu(n.foto_zorunlu)
    setMinFotoSayisi(String(n.min_foto_sayisi))
    setOzelGorev(n.ozel_gorev)
  }, [])

  const applyTemplate = useCallback((tpl) => {
    if (!tpl || !templateAllowedInMode) return
    setSelectedTemplateId(tpl.id || null)
    if (tpl.baslik) setBaslik(String(tpl.baslik))
    if (tpl.aciklama) setAciklama(String(tpl.aciklama))
    const templatePuan = Number(tpl.varsayilan_puan ?? tpl.puan)
    if (Number.isFinite(templatePuan) && templatePuan > 0 && canAssignTask) {
      setPuan(String(Math.round(templatePuan)))
    }
    const minFoto = Number(tpl.min_foto_sayisi)
    const nextOpts = normalizeOperasyonelOpts({
      ...operasyonelOpts,
      foto_zorunlu: typeof tpl.foto_zorunlu === 'boolean' ? tpl.foto_zorunlu : operasyonelOpts.foto_zorunlu,
      min_foto_sayisi:
        Number.isFinite(minFoto) && minFoto > 0
          ? Math.min(5, Math.max(1, minFoto))
          : operasyonelOpts.min_foto_sayisi,
      video_zorunlu:
        typeof tpl.video_zorunlu === 'boolean' ? tpl.video_zorunlu : operasyonelOpts.video_zorunlu,
      ...(typeof tpl.foto_zorunlu === 'boolean' && tpl.foto_zorunlu
        ? { video_zorunlu: false }
        : {}),
      ...(typeof tpl.video_zorunlu === 'boolean' && tpl.video_zorunlu
        ? { foto_zorunlu: false }
        : {}),
    })
    handleOperasyonelChange(nextOpts)
  }, [canAssignTask, templateAllowedInMode, operasyonelOpts, handleOperasyonelChange])

  const renderTemplatePickerItem = useCallback(
    ({ item: tpl }) => {
      const active = String(tpl?.id) === String(selectedTemplateId)
      return (
        <TouchableOpacity
          style={[styles.pickerRow, active && styles.pickerRowActive]}
          onPress={() => {
            applyTemplate(tpl)
            setTemplatePickerOpen(false)
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.pickerRowText}>{tpl?.baslik || 'Şablon'}</Text>
          {active ? (
            <Icon.Delivered size={16} color={kitPalette.accent[600]} strokeWidth={3} />
          ) : null}
        </TouchableOpacity>
      )
    },
    [selectedTemplateId, applyTemplate],
  )

  if (!canCreateTask) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.page}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>Geri</Text>
          </TouchableOpacity>
          <View style={styles.unauthorizedCard}>
            <Text style={styles.unauthorizedTitle}>Yetkiniz Yok</Text>
            <Text style={styles.unauthorizedText}>
              Bu hesapla görev atama ekranını kullanamazsınız.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const save = useCallback(async () => {
    if (!canCreateTask) {
      Alert.alert('Yetki yok', 'Yeni görev oluşturma yetkiniz bulunmuyor.')
      return
    }
    const titleTrim = formatTaskTitleCase((baslik || '').trim())
    if (!titleTrim) {
      Alert.alert('Başlık gerekli', 'Görev başlığını girin.')
      return
    }

    const resolveAssignerPersonelId = async () => {
      if (personel?.id) return personel.id
      if (!user?.id || !personel?.ana_sirket_id) return null
      const { data, error } = await supabase
        .from('personeller')
        .select('id')
        .eq('kullanici_id', user.id)
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)
        .maybeSingle()
      if (error) {
        console.error('assigner personel resolve error', error)
        return null
      }
      return data?.id || null
    }

    const atayanPersonelId = await resolveAssignerPersonelId()
    if (
      !atayanPersonelId ||
      !personel?.ana_sirket_id ||
      (!personel?.birim_id && !isTopCompanyScope)
    ) {
      Alert.alert('Hata', 'Personel bilgisi bulunamadı.')
      return
    }

    const parsedBaslama =
      canAssignTask && needsManualBaslama ? parseDateTimeInput(baslamaTarihiInput) : null
    const parsedSon = canAssignTask ? parseDateTimeInput(sonTarihInput) : null
    if (canAssignTask && needsManualBaslama) {
      if (!String(baslamaTarihiInput || '').trim()) {
        Alert.alert('Başlangıç gerekli', 'Başlangıç tarihi ve saati girin.')
        return
      }
      if (!parsedBaslama) {
        Alert.alert('Tarih formatı hatalı', 'Başlangıç için YYYY-MM-DD HH:mm formatını kullanın.')
        return
      }
    }
    if (canAssignTask && sonTarihInput && !parsedSon) {
      Alert.alert('Tarih formatı hatalı', 'Bitiş için YYYY-MM-DD HH:mm formatını kullanın.')
      return
    }
    if (canAssignTask && parsedBaslama && parsedSon && parsedSon <= parsedBaslama) {
      Alert.alert('Tarih hatası', 'Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.')
      return
    }
    if (canAssignTask) {
      const SCHEDULE_TOLERANCE_MS = 120_000
      const nowMs = Date.now()
      if (needsManualBaslama && parsedBaslama) {
        const startMs = new Date(parsedBaslama).getTime()
        if (
          !Number.isNaN(startMs) &&
          startMs < nowMs - SCHEDULE_TOLERANCE_MS
        ) {
          Alert.alert('Tarih hatası', 'Geçmiş tarih/saat için görev atanamaz.')
          return
        }
      }
      if (parsedSon) {
        const endMs = new Date(parsedSon).getTime()
        if (!Number.isNaN(endMs) && endMs < nowMs - SCHEDULE_TOLERANCE_MS) {
          Alert.alert('Tarih hatası', 'Bitiş tarihi/saati geçmişte olamaz.')
          return
        }
      }
    }

    const isSiraliTask = !!(canAssignTask && gorevModu === 'sirali_gorev')
    const isChainTask = !!(
      canAssignTask &&
      (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay')
    )

    let filteredAssigneeIds = []
    if (!isChainTask && !isSiraliTask) {
      if (canAssignTask && assignmentTarget === 'birimler' && !(selectedBirimIds || []).filter(Boolean).length) {
        Alert.alert('Eksik', 'Atanacak birim seçin.')
        return
      }
      const targetAssigneeIds = !canAssignTask
        ? [personel?.id]
        : assignmentTarget === 'personeller'
          ? (manualSelectedAssigneeIds || [])
          : (selectedAssigneeIds || [])
      filteredAssigneeIds = canAssignTask
        ? targetAssigneeIds.filter((id) => String(id) !== String(personel?.id))
        : targetAssigneeIds.filter(Boolean)

      if (!filteredAssigneeIds.length) {
        Alert.alert('Hata', 'Atanacak kişi seçilmedi.')
        return
      }
    } else if (isChainTask) {
      const tur = resolvedGorevTuru()
      if (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) {
        if (zincirGorevSira.length < 1) {
          Alert.alert('Zincir görev', 'En az 1 kişi sırayla ekleyin.')
          return
        }
      }
      if (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) {
        if (zincirOnaySira.length < 1) {
          Alert.alert('Zincir onay', 'En az 1 onaylayıcı sırayla ekleyin.')
          return
        }
      }
      if (tur === GOREV_TURU.ZINCIR_ONAY && !zincirOnayWorkerId) {
        Alert.alert('Zincir onay', 'Görevi yapacak personeli seçin.')
        return
      }
    } else if (isSiraliTask) {
      if (siraliAdimlar.length < 2) {
        Alert.alert('Sıralı görev', 'En az 2 adım ekleyin.')
        return
      }
      for (let i = 0; i < siraliAdimlar.length; i += 1) {
        const adim = siraliAdimlar[i]
        if (!adim?.personel_id || !adim?.denetimci_personel_id || !adim?.adim_baslik) {
          Alert.alert('Sıralı görev', `${i + 1}. adım için başlık, yapan ve denetimci zorunlu.`)
          return
        }
      }
    }

    const shouldRepeat = !!(canAssignTask && repeatDaily && parsedBaslama && parsedSon)
    if (shouldRepeat && repeatType === 'daily_hourly') {
      const [h1, m1] = parseClock(repeatDayStartClock, 9, 0)
      const [h2, m2] = parseClock(repeatDayEndClock, 18, 0)
      if (h2 * 60 + m2 <= h1 * 60 + m1) {
        Alert.alert('Tekrar ayari', 'Gun ici bitis saati baslangic saatinden sonra olmalidir.')
        return
      }
    }
    if (shouldRepeat && repeatType === 'weekly' && (!Array.isArray(repeatWeeklyDays) || repeatWeeklyDays.length === 0)) {
      Alert.alert('Tekrar ayari', 'Haftalik tekrar icin en az bir gun secin.')
      return
    }
    const recurrenceWindows = buildRecurrenceWindows({
      repeatActive: shouldRepeat,
      repeatType,
      startAtIso: parsedBaslama,
      endAtIso: parsedSon,
      repeatDays: Number.parseInt(String(repeatDays || '30').replace(/\D/g, ''), 10) || 30,
      intervalHours: Number.parseInt(String(repeatHourlyInterval || '2').replace(/\D/g, ''), 10) || 2,
      dailyStartClock: repeatDayStartClock,
      dailyEndClock: repeatDayEndClock,
      weeklyDays: repeatWeeklyDays,
      weeklyWeeks: Number.parseInt(String(repeatWeeklyWeeks || '8').replace(/\D/g, ''), 10) || 8,
    })
    const repeatCount = recurrenceWindows.length

    setSaving(true)
    try {
      let kanitResimler = []
      let referenceMediaPayload = []

      if (!canAssignTask && photo) {
        try {
          const uploadedUrl = await uploadPhotoWithRetry({
            bucket: BUCKET,
            fileNamePrefix: 'extra-task',
            photo,
          })
          kanitResimler = uploadedUrl ? [uploadedUrl] : []
        } catch (uploadErr) {
          Alert.alert('Yükleme hatası', uploadErr?.message || 'Fotoğraf yüklenemedi')
          setSaving(false)
          return
        }
      }

      if (canAssignTask && referenceMediaFiles.length > 0) {
        try {
          const uploadedRefs = []
          for (const asset of referenceMediaFiles) {
            // Upload once, then reuse metadata on all created task rows.
            // eslint-disable-next-line no-await-in-loop
            const uploaded = await uploadReferenceMediaAsset({
              asset,
              fileNamePrefix: `task_ref_${personel?.id || 'unknown'}`,
            })
            uploadedRefs.push(uploaded)
          }
          referenceMediaPayload = uploadedRefs
        } catch (uploadErr) {
          Alert.alert('Yükleme hatası', uploadErr?.message || 'Referans medya yüklenemedi')
          setSaving(false)
          return
        }
      }

      const op = normalizeOperasyonelOpts({
        ...operasyonelOpts,
        foto_zorunlu: fotoZorunlu,
        min_foto_sayisi: minFotoSayisi,
        ozel_gorev: ozelGorev,
      })
      const isSiraliTask = gorevModu === 'sirali_gorev'

      const normalizedPuan = Number.parseInt(String(puan || '0').replace(/\D/g, ''), 10)
      const safePuan = Number.isNaN(normalizedPuan) ? 0 : Math.max(0, normalizedPuan)

      const makeUuid = () => {
        // RFC4122 v4-ish uuid generator (client-side). DB column expects uuid format.
        // Good enough for grouping.
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return String(v.toString(16))
        })
      }

      const isPersonnelExtraEntry = !canAssignTask
      const payloadCommon = {
        atayan_personel_id: atayanPersonelId || personel?.id || null,
        ana_sirket_id: personel.ana_sirket_id,
        baslik: isPersonnelExtraEntry ? `Ekstra görev girişi - ${titleTrim}` : titleTrim,
        aciklama: (aciklama || '').trim() || null,
        is_sablon_id: canAssignTask && templateAllowedInMode && selectedTemplateId ? selectedTemplateId : null,
        puan: canAssignTask ? safePuan : 0,
        durum: canAssignTask && acil ? 'ACIL' : TASK_STATUS.ASSIGNED,
        acil: !!(canAssignTask && acil),
        ozel_gorev: !!(
          canAssignTask &&
          gorevModu === 'normal' &&
          op.ozel_gorev &&
          mayMarkBirebirGorev
        ),
        foto_zorunlu: !!op.foto_zorunlu,
        min_foto_sayisi: op.foto_zorunlu ? op.min_foto_sayisi : 0,
        video_zorunlu: !!op.video_zorunlu,
        min_video_sayisi: op.video_zorunlu ? op.min_video_sayisi : 0,
        max_video_suresi_sn: op.video_zorunlu ? op.max_video_suresi_sn : 60,
        belge_zorunlu: isSiraliTask ? false : !!op.belge_zorunlu,
        min_belge_sayisi: isSiraliTask ? 0 : op.belge_zorunlu ? op.min_belge_sayisi : 0,
        aciklama_zorunlu: !!op.aciklama_zorunlu,
        referans_medya: referenceMediaPayload,
        ...(lockProjeId ? { proje_id: lockProjeId } : {}),
      }

      const sendUrgentPush = async (recipientIds, taskTitle) => {
        if (!canAssignTask) return
        if (!acil) return
        const uniqueIds = [...new Set((recipientIds || []).map((x) => String(x || '').trim()).filter(Boolean))]
        if (!uniqueIds.length) return
        try {
          // Push token kolon isimleri ortama göre değişebilir.
          let tokenRows = []
          for (const tokenCol of ['expo_push_token', 'push_token', 'bildirim_tokeni']) {
            try {
              const { data } = await supabase
                .from('personeller')
                .select(`id, ${tokenCol}`)
                .in('id', uniqueIds)
              if (Array.isArray(data) && data.length) {
                tokenRows = data
                  .map((r) => ({ id: r?.id, token: r?.[tokenCol] }))
                  .filter((r) => typeof r.token === 'string' && r.token.startsWith('ExponentPushToken'))
                if (tokenRows.length) break
              }
            } catch {
              // continue
            }
          }

          if (!tokenRows.length) return

          const pushPayload = tokenRows.map((r) => ({
            to: r.token,
            sound: 'default',
            title: 'Acil Görev',
            body: taskTitle || titleTrim || 'Acil görev',
            data: { type: 'urgent_task', title: taskTitle || '' },
          }))

          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushPayload),
          })
        } catch {
          // best-effort
        }
      }

      if (isSiraliTask) {
        const firstWorkerId = siraliAdimlar[0]?.personel_id
        const firstRow = (assignees || []).find((p) => String(p?.id) === String(firstWorkerId))
        const birimForInsert =
          (!karmaBirimler && siraliBirimId) ||
          firstRow?.birim_id ||
          personel?.birim_id ||
          null
        if (!birimForInsert) {
          Alert.alert(
            'Birim gerekli',
            'Sıralı görev için birim seçin veya 1. adım personelinin birimi tanımlı olsun.',
          )
          setSaving(false)
          return
        }
        const startIso = parseDateTimeInput(siraliAdimlar[0]?.baslama_tarihi) || new Date().toISOString()
        const endIso =
          parseDateTimeInput(siraliAdimlar[siraliAdimlar.length - 1]?.bitis_tarihi) ||
          new Date(Date.now() + 60 * 60 * 1000).toISOString()

        // Sıralı görevde ana satırdaki acil/foto/zorunlu açıklama anlamsızdır;
        // bu parametreler adım kartlarında ayrı ayrı yaşar (web ile aynı kural).
        const siraliParentPayload = {
          ...payloadCommon,
          gorev_turu: GOREV_TURU.SIRALI_GOREV,
          sorumlu_personel_id: firstWorkerId,
          birim_id: birimForInsert,
          baslama_tarihi: startIso,
          son_tarih: endIso,
          gorunur_tarih: startIso,
          zincir_aktif_adim: 1,
          zincir_onay_aktif_adim: 0,
          acil: false,
          durum: TASK_STATUS.ASSIGNED,
          foto_zorunlu: false,
          min_foto_sayisi: 0,
        }

        let insertedSirali = null
        let { data: siraliIns, error: siraliErr } = await supabase
          .from('isler')
          .insert(siraliParentPayload)
          .select()
          .single()
        if (siraliErr?.code === '42703') {
          const fallback = { ...siraliParentPayload }
          delete fallback.gorunur_tarih
          delete fallback.referans_medya
          const res = await supabase.from('isler').insert(fallback).select().single()
          siraliIns = res.data
          siraliErr = res.error
        }
        if (siraliErr || !siraliIns?.id) {
          Alert.alert('Kayıt hatası', siraliErr?.message || 'Sıralı görev oluşturulamadı.')
          setSaving(false)
          return
        }
        insertedSirali = siraliIns

        // Webdeki `siraliAdimlar` ile aynı JSONB şemasını yaz. Tüm adıma özel
        // bilgiler (açıklama, başlangıç/bitiş, puan, kanıt kuralları) tek bir
        // `adim_istenenler` JSON kolonunda tutulur — `adim_aciklama` /
        // `adim_baslama_tarihi` / `adim_bitis_tarihi` gibi yan kolonlar
        // tabloda bulunmaz (PostgREST schema-cache hatası vermesin diye web
        // ile birebir aynı şekilde gönderiyoruz).
        const clampInt = (raw, min, max, fallback) => {
          const n = Number.parseInt(String(raw ?? '').trim(), 10)
          if (!Number.isFinite(n)) return fallback
          return Math.min(max, Math.max(min, n))
        }
        const siraliRows = siraliAdimlar.map((adim, i) => {
          const fotoZ = !!adim.foto_zorunlu
          const videoZ = !!adim.video_zorunlu
          const adimBaslamaIso =
            i === 0 ? parseDateTimeInput(adim.baslama_tarihi) : null
          const adimBitisIso = parseDateTimeInput(adim.bitis_tarihi)
          return {
            is_id: insertedSirali.id,
            adim_no: i + 1,
            personel_id: adim.personel_id,
            denetimci_personel_id: adim.denetimci_personel_id,
            adim_baslik: String(adim.adim_baslik || `${i + 1}. adım`).trim(),
            adim_istenenler: {
              aciklama: String(adim.adim_aciklama || '').trim() || null,
              baslama_tarihi: adimBaslamaIso,
              bitis_tarihi: adimBitisIso,
              puan: clampInt(adim.puan, 0, 1000, 0),
              aciklama_zorunlu: !!adim.aciklama_zorunlu,
              acil: !!adim.acil,
              kanit: {
                foto_zorunlu: fotoZ,
                min_foto_sayisi: fotoZ ? clampInt(adim.min_foto_sayisi, 1, 5, 1) : 0,
                video_zorunlu: videoZ,
                min_video_sayisi: videoZ ? clampInt(adim.min_video_sayisi, 1, 3, 1) : 0,
                max_video_suresi_sn: videoZ
                  ? clampInt(adim.max_video_suresi_sn, 5, 60, 60)
                  : 60,
                belge_zorunlu: !!adim.belge_zorunlu,
                min_belge_sayisi: adim.belge_zorunlu
                  ? clampInt(adim.min_belge_sayisi, 1, 5, 1)
                  : 0,
              },
              referans_medya: [],
            },
            durum: i === 0 ? 'aktif' : 'sira_bekliyor',
            adim_durum: i === 0 ? 'aktif' : 'sira_bekliyor',
          }
        })

        // Şemaca eksik kolonlar (örn. `adim_baslik`, `adim_istenenler`,
        // `adim_durum`, `denetimci_personel_id`) için PostgREST'in PGRST204
        // ve Postgres'in 42703 kodlarını ikisini birden yakalayıp güvenli
        // fallback ile sadece zorunlu alanları yazmayı dene.
        const isMissingColumnError = (err) => {
          if (!err) return false
          if (err.code === '42703' || err.code === 'PGRST204') return true
          return /Could not find the .* column|column .* does not exist/i.test(
            String(err.message || ''),
          )
        }
        let { error: siraliStepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .insert(siraliRows)
        if (isMissingColumnError(siraliStepErr)) {
          const fallbackRows = siraliRows.map((row) => ({
            is_id: row.is_id,
            adim_no: row.adim_no,
            personel_id: row.personel_id,
            durum: row.durum,
          }))
          const res = await supabase
            .from('isler_zincir_gorev_adimlari')
            .insert(fallbackRows)
          siraliStepErr = res.error
        }
        if (siraliStepErr) {
          Alert.alert('Sıralı görev', siraliStepErr.message || 'Adımlar kaydedilemedi.')
          setSaving(false)
          return
        }

        if (siraliAdimlar[0]?.acil) {
          await sendUrgentPush([firstWorkerId], titleTrim)
        }
        Alert.alert('Başarılı', 'Sıralı görev oluşturuldu.', [{ text: 'Tamam', onPress: handleBack }])
        setSaving(false)
        return
      }

      if (isChainTask) {
        const tur = resolvedGorevTuru()
        const firstWorkerId =
          tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
            ? zincirGorevSira[0]
            : zincirOnayWorkerId

        const firstRow = (assignees || []).find((p) => String(p?.id) === String(firstWorkerId))
        const birimForInsert = firstRow?.birim_id ?? personel?.birim_id ?? null
        if (
          (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) &&
          !birimForInsert
        ) {
          Alert.alert(
            'Birim gerekli',
            'Zincir görev için ilk personelin birimi tanımlı olmalı veya yönetici birim bilgisi bulunmalı.',
          )
          setSaving(false)
          return
        }

        const insertRows = recurrenceWindows.map((win) => {
          const startIso = deriveGorunurFromBaslamaIso(win.baslamaIso, parsedBaslama)
          return {
            ...payloadCommon,
            sorumlu_personel_id: firstWorkerId,
            birim_id: birimForInsert,
            baslama_tarihi: startIso,
            son_tarih: win.sonIso || parsedSon || null,
            gorunur_tarih: startIso,
            tekrar_tipi: shouldRepeat ? (repeatType === 'weekly' ? 'weekly' : 'hourly_daily') : 'none',
            tekrar_saat_araligi_dakika:
              shouldRepeat && repeatType === 'daily_hourly'
                ? (Math.min(24, Math.max(1, Number.parseInt(String(repeatHourlyInterval || '2').replace(/\D/g, ''), 10) || 2)) * 60)
                : null,
            tekrar_hafta_gunleri:
              shouldRepeat && repeatType === 'weekly'
                ? (repeatWeeklyDays || []).map((v) => Number(v))
                : null,
            ...(kanitResimler.length > 0 ? { kanit_resim_ler: kanitResimler } : {}),
            gorev_turu: tur,
            zincir_aktif_adim: 1,
            zincir_onay_aktif_adim: 0,
          }
        })

        const { data: inserted, error: insertErr } = await supabase.from('isler').insert(insertRows).select()
        if (insertErr) {
          const msg = String(insertErr?.message || '').toLowerCase()
          if (
            insertErr?.code === '42703' &&
            (msg.includes('gorev_turu') ||
              msg.includes('zincir') ||
              msg.includes('column') ||
              msg.includes('ozel_gorev') ||
              msg.includes('gorunur_tarih') ||
              msg.includes('referans_medya'))
          ) {
            const insertRowsFallback = insertRows.map((row) => {
              const next = { ...(row || {}) }
              delete next.ozel_gorev
              delete next.gorunur_tarih
              delete next.referans_medya
              return next
            })
            const { data: insertedFallback, error: insertErrFallback } = await supabase
              .from('isler')
              .insert(insertRowsFallback)
              .select()
            if (!insertErrFallback) {
              const insertedRows = Array.isArray(insertedFallback) ? insertedFallback : insertedFallback ? [insertedFallback] : []
              if (insertedRows.length > 0 && (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
                const gorevRows = insertedRows.flatMap((row) =>
                  zincirGorevSira.map((pid, i) => ({
                    is_id: row.id,
                    adim_no: i + 1,
                    personel_id: pid,
                    durum: i === 0 ? 'aktif' : 'sira_bekliyor',
                  })),
                )
                const { error: zgErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(gorevRows)
                if (zgErr) {
                  Alert.alert('Zincir görev', 'Görev adımları kaydedilemedi. Migration 014 uygulandı mı?')
                  setSaving(false)
                  return
                }
              }
              if (insertedRows.length > 0 && (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
                const onayRows = insertedRows.flatMap((row) =>
                  zincirOnaySira.map((pid, i) => ({
                    is_id: row.id,
                    adim_no: i + 1,
                    onaylayici_personel_id: pid,
                    durum: TASK_STATUS.ASSIGNED,
                  })),
                )
                const { error: zoErr } = await supabase.from('isler_zincir_onay_adimlari').insert(onayRows)
                if (zoErr) {
                  Alert.alert('Zincir onay', 'Onay adımları kaydedilemedi. Migration 014 uygulandı mı?')
                  setSaving(false)
                  return
                }
              }
              if (canAssignTask && acil) {
                await sendUrgentPush([firstWorkerId], titleTrim)
              }
              Alert.alert(
                'Başarılı',
                shouldRepeat ? `Zincir gorev tekrarli planlandi (${repeatCount} kayit).` : 'Zincir görev oluşturuldu.',
                [{ text: 'Tamam', onPress: handleBack }],
              )
              setSaving(false)
              return
            }
            Alert.alert(
              'Veritabanı güncellemesi',
              'Zincir/özel görev kolonları eksik. Migration dosyalarını uygulayın.',
            )
          } else {
            Alert.alert('Kayıt hatası', insertErr.message || 'Görev eklenemedi.')
          }
          setSaving(false)
          return
        }

        const insertedRows = Array.isArray(inserted) ? inserted : inserted ? [inserted] : []

        if (insertedRows.length > 0 && (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
          const gorevRows = insertedRows.flatMap((row) =>
            zincirGorevSira.map((pid, i) => ({
              is_id: row.id,
              adim_no: i + 1,
              personel_id: pid,
              durum: i === 0 ? 'aktif' : 'sira_bekliyor',
            })),
          )
          const { error: zgErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(gorevRows)
          if (zgErr) {
            Alert.alert(
              'Zincir görev',
              'Görev adımları kaydedilemedi. Migration 014 uygulandı mı?',
            )
            setSaving(false)
            return
          }
        }

        if (insertedRows.length > 0 && (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
          const onayRows = insertedRows.flatMap((row) =>
            zincirOnaySira.map((pid, i) => ({
              is_id: row.id,
              adim_no: i + 1,
              onaylayici_personel_id: pid,
              durum: TASK_STATUS.ASSIGNED,
            })),
          )
          const { error: zoErr } = await supabase.from('isler_zincir_onay_adimlari').insert(onayRows)
          if (zoErr) {
            Alert.alert(
              'Zincir onay',
              'Onay adımları kaydedilemedi. Migration 014 uygulandı mı?',
            )
            setSaving(false)
            return
          }
        }

        if (canAssignTask && acil) {
          await sendUrgentPush([firstWorkerId], titleTrim)
        }

        Alert.alert(
          'Başarılı',
          shouldRepeat ? `Zincir gorev tekrarli planlandi (${repeatCount} kayit).` : 'Zincir görev oluşturuldu.',
          [{ text: 'Tamam', onPress: handleBack }],
        )
        setSaving(false)
        return
      }

      const targetAssignees = (assignees || []).filter((x) =>
        filteredAssigneeIds.some((id) => String(id) === String(x?.id)),
      )

      const urgentRecipientIds = targetAssignees.map((x) => x?.id).filter(Boolean)

      const insertPayloads = []
      for (const win of recurrenceWindows) {
        const startIso = deriveGorunurFromBaslamaIso(win.baslamaIso, parsedBaslama)
        // Havuz görev (`grup_id`) yalnız "Bireysel tamamlama" kapalıyken oluşturulur;
        // şablon olup olmaması koşulu kaldırıldı, böylece standart çoklu atamada da
        // bireysel seçeneği etkili olur.
        const usePoolGrup =
          canAssignTask && targetAssignees.length > 1 && !bireysel
        const grupId = usePoolGrup ? makeUuid() : null
        for (const selectedAssignee of targetAssignees) {
          insertPayloads.push({
            ...payloadCommon,
            // Görevi atayan her zaman oluşturan yönetici/personel; asla atanan (sorumlu) ile karıştırma.
            sorumlu_personel_id: selectedAssignee?.id,
            birim_id: selectedAssignee?.birim_id ?? personel?.birim_id ?? null,
            baslama_tarihi: startIso,
            son_tarih: win.sonIso,
            gorunur_tarih: startIso,
            tekrar_tipi: shouldRepeat ? (repeatType === 'weekly' ? 'weekly' : 'hourly_daily') : 'none',
            tekrar_saat_araligi_dakika:
              shouldRepeat && repeatType === 'daily_hourly'
                ? (Math.min(24, Math.max(1, Number.parseInt(String(repeatHourlyInterval || '2').replace(/\D/g, ''), 10) || 2)) * 60)
                : null,
            tekrar_hafta_gunleri:
              shouldRepeat && repeatType === 'weekly'
                ? (repeatWeeklyDays || []).map((v) => Number(v))
                : null,
            ...(kanitResimler.length > 0 ? { kanit_resim_ler: kanitResimler } : {}),
            ...(grupId ? { grup_id: grupId } : {}),
          })
        }
      }

      const { error: insertError } = await supabase.from('isler').insert(insertPayloads)

      if (insertError) {
        const msg = String(insertError?.message || '').toLowerCase()
        if (insertError?.code === '42703' && msg.includes('referans_medya')) {
          const insertPayloadsNoRefs = insertPayloads.map((p) => {
            const { referans_medya, ...rest } = p || {}
            return rest
          })
          const { error: insertErrorRefs } = await supabase.from('isler').insert(insertPayloadsNoRefs)
          if (!insertErrorRefs) {
            await sendUrgentPush(urgentRecipientIds, titleTrim)
            Alert.alert('Başarılı', shouldRepeat ? `Tekrarlayan gorev planlandi (${repeatCount} kayit).` : 'Görev atandı.')
            setSaving(false)
            return
          }
          Alert.alert('Kayıt hatası', insertErrorRefs.message || 'Görev eklenemedi.')
          setSaving(false)
          return
        }
        if (insertError?.code === '42703' && msg.includes('grup_id')) {
          const insertPayloadsNoGroup = insertPayloads.map((p) => {
            const { grup_id, ...rest } = p || {}
            return rest
          })
          const { error: insertError2 } = await supabase.from('isler').insert(insertPayloadsNoGroup)
          if (!insertError2) {
            await sendUrgentPush(urgentRecipientIds, titleTrim)
            Alert.alert('Başarılı', shouldRepeat ? `Tekrarlayan gorev planlandi (${repeatCount} kayit).` : 'Görev atandı.')
            setSaving(false)
            return
          }
          Alert.alert('Kayıt hatası', insertError2.message || 'Görev eklenemedi.')
          setSaving(false)
          return
        }
        if (insertError?.code === '42703' && msg.includes('ozel_gorev')) {
          const insertPayloadsNoPrivate = insertPayloads.map((p) => {
            const { ozel_gorev, ...rest } = p || {}
            return rest
          })
          const { error: insertError3 } = await supabase.from('isler').insert(insertPayloadsNoPrivate)
          if (!insertError3) {
            await sendUrgentPush(urgentRecipientIds, titleTrim)
            Alert.alert('Başarılı', shouldRepeat ? `Tekrarlayan gorev planlandi (${repeatCount} kayit).` : 'Görev atandı.')
            setSaving(false)
            return
          }
          Alert.alert('Kayıt hatası', insertError3.message || 'Görev eklenemedi.')
          setSaving(false)
          return
        }
        if (insertError?.code === '42703' && msg.includes('gorunur_tarih')) {
          const insertPayloadsNoVisibleAt = insertPayloads.map((p) => {
            const { gorunur_tarih, ...rest } = p || {}
            return rest
          })
          const { error: insertError4 } = await supabase.from('isler').insert(insertPayloadsNoVisibleAt)
          if (!insertError4) {
            await sendUrgentPush(urgentRecipientIds, titleTrim)
            Alert.alert('Başarılı', shouldRepeat ? `Tekrarlayan gorev planlandi (${repeatCount} kayit).` : 'Görev atandı.')
            setSaving(false)
            return
          }
          Alert.alert('Kayıt hatası', insertError4.message || 'Görev eklenemedi.')
          setSaving(false)
          return
        }

        Alert.alert('Kayıt hatası', insertError.message || 'Görev eklenemedi.')
        setSaving(false)
        return
      }

      if (canAssignTask && acil) {
        await sendUrgentPush(urgentRecipientIds, titleTrim)
      }

      Alert.alert('Başarılı', shouldRepeat ? `Tekrarlayan gorev planlandi (${repeatCount} kayit).` : 'Görev atandı.', [
        { text: 'Tamam', onPress: handleBack },
      ])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }, [
    canCreateTask,
    canAssignTask,
    baslik,
    aciklama,
    puan,
    photo,
    referenceMediaFiles,
    fotoZorunlu,
    minFotoSayisi,
    operasyonelOpts,
    ozelGorev,
    baslamaTarihiInput,
    sonTarihInput,
    baslamaZamanSec,
    needsManualBaslama,
    selectedAssigneeIds,
    manualSelectedAssigneeIds,
    assignmentTarget,
    selectedBirimIds,
    assignees,
    acil,
    bireysel,
    personel?.id,
    personel?.ana_sirket_id,
    personel?.birim_id,
    user?.id,
    handleBack,
    parseDateTimeInput,
    canAssignTask,
    repeatDaily,
    repeatDays,
    repeatDayStartClock,
    repeatDayEndClock,
    gorevModu,
    repeatType,
    repeatHourlyInterval,
    repeatWeeklyDays,
    repeatWeeklyWeeks,
    zincirGorevSira,
    zincirOnaySira,
    zincirOnayWorkerId,
    siraliAdimlar,
    karmaBirimler,
    siraliBirimId,
    resolvedGorevTuru,
  ])

  // Sıralı görevde "Seçenekler" ekranı (genel acil/tarih/foto/açıklama)
  // mantıksızdır; tüm bu parametreler adım kartlarında ayrı ayrı belirlenir.
  // Bu yüzden sıralı modda Wizard 3 adıma indirilir: Görev → Atama → Onay.
  const skipDetailsStep = canAssignTask && isSiraliMode
  const detailsStep = canAssignTask
    ? skipDetailsStep
      ? -1
      : 3
    : 2
  const reviewStep = canAssignTask ? (skipDetailsStep ? 3 : 4) : 3
  const stepItems = canAssignTask
    ? skipDetailsStep
      ? ['Görev', 'Adımlar', 'Onay']
      : ['Görev', 'Atama', 'Seçenekler', 'Onay']
    : ['Görev', 'Seçenekler', 'Onay']

  const validateEmbeddedCurrent = useCallback(() => {
    if (embeddedStepId === 'tur') {
      if (!gorevModu) {
        Alert.alert('Eksik bilgi', 'Görev türü seçin.')
        return false
      }
      return true
    }

    if (embeddedStepId === 'detaylar-temel') {
      if (templateAllowedInMode && !selectedTemplateId) {
        Alert.alert('Eksik bilgi', 'Görev şablonu seçin.')
        return false
      }
      if (!templateDrivenFieldsHidden && !String(baslik || '').trim()) {
        Alert.alert('Eksik bilgi', 'Görev başlığı zorunlu.')
        return false
      }
      return true
    }

    if (embeddedStepId === 'detaylar-atama') {
      if (gorevModu === 'zincir_onay' && !zincirOnayWorkerId) {
        Alert.alert('Eksik atama', 'Görevi yapacak personeli seçin.')
        return false
      }
      if (isSiraliMode) {
        if (!karmaBirimler && !siraliBirimId) {
          const firstPerson = siraliAdimlar[0]?.personel_id
          const firstRow = (assignees || []).find((p) => String(p?.id) === String(firstPerson))
          if (!firstRow?.birim_id) {
            Alert.alert('Eksik atama', 'Birim seçin veya 1. adım personelinin birimi tanımlı olsun.')
            return false
          }
        }
        for (let i = 0; i < (siraliAdimlar || []).length; i += 1) {
          const adim = siraliAdimlar[i] || {}
          if (!adim.personel_id || !adim.denetimci_personel_id) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik atama', `${i + 1}. adım için yapan ve denetimci seçin.`)
            return false
          }
        }
        return true
      }
      if (chainModeActive) return true
      if (assignmentTarget === 'birimler') {
        if (!(selectedBirimIds || []).filter(Boolean).length) {
          Alert.alert('Eksik atama', 'Atanacak birim seçin.')
          return false
        }
      } else if ((selectedAssigneeIds || []).length === 0) {
        Alert.alert('Eksik atama', 'En az bir personel seçin.')
        return false
      }
      return true
    }

    if (embeddedStepId === 'adimlar') {
      if (isSiraliMode) {
        if ((siraliAdimlar || []).length < 2) {
          Alert.alert('Eksik adım', 'Sıralı görev için en az 2 adım ekleyin.')
          return false
        }
        let prevBitisIso = null
        for (let i = 0; i < siraliAdimlar.length; i += 1) {
          const adim = siraliAdimlar[i] || {}
          if (!String(adim.adim_baslik || '').trim()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adım başlığı zorunlu.`)
            return false
          }
          if (!adim.personel_id || !adim.denetimci_personel_id) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adım için yapan ve denetimci seçin.`)
            return false
          }
          if (i === 0 && !String(adim.baslama_tarihi || '').trim()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', '1. adım için başlangıç tarihi zorunlu.')
            return false
          }
          if (!String(adim.bitis_tarihi || '').trim()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adım için bitiş tarihi zorunlu.`)
            return false
          }
          const bitisIso = parseDateTimeInput(adim.bitis_tarihi)
          if (!bitisIso) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Geçersiz tarih', `${i + 1}. adım bitiş tarihi geçersiz.`)
            return false
          }
          if (i === 0) {
            const baslamaIso = parseDateTimeInput(adim.baslama_tarihi)
            if (!baslamaIso) {
              setActiveSiraliStepIdx(0)
              Alert.alert('Geçersiz tarih', '1. adım başlangıç tarihi geçersiz.')
              return false
            }
            if (new Date(bitisIso).getTime() <= new Date(baslamaIso).getTime()) {
              setActiveSiraliStepIdx(0)
              Alert.alert('Geçersiz aralık', '1. adım bitiş tarihi, başlangıçtan sonra olmalı.')
              return false
            }
          } else if (prevBitisIso && new Date(bitisIso).getTime() <= new Date(prevBitisIso).getTime()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Geçersiz sıra', `${i + 1}. adım bitişi, ${i}. adım bitişinden sonra olmalı.`)
            return false
          }
          prevBitisIso = bitisIso
        }
        return true
      }
      if (
        (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') &&
        zincirGorevSira.length < 1
      ) {
        Alert.alert('Eksik sıra', 'Zincir görev için en az 1 kişi ekleyin.')
        return false
      }
      if (
        (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') &&
        zincirOnaySira.length < 1
      ) {
        Alert.alert('Eksik sıra', 'Zincir onay için en az 1 onaylayıcı ekleyin.')
        return false
      }
      return true
    }

    if (embeddedStepId === 'zamanlama') {
      if (needsManualBaslama) {
        if (!String(baslamaTarihiInput || '').trim()) {
          Alert.alert('Başlangıç gerekli', 'Başlangıç tarihi ve saati girin.')
          return false
        }
        if (!parseDateTimeInput(baslamaTarihiInput)) {
          Alert.alert('Tarih formatı hatalı', 'Başlangıç için YYYY-MM-DD HH:mm formatını kullanın.')
          return false
        }
      }
      if (!String(sonTarihInput || '').trim()) {
        Alert.alert('Bitiş gerekli', 'Bitiş tarihi ve saati girin.')
        return false
      }
      const parsedSon = parseDateTimeInput(sonTarihInput)
      if (!parsedSon) {
        Alert.alert('Tarih formatı hatalı', 'Bitiş için YYYY-MM-DD HH:mm formatını kullanın.')
        return false
      }
      const parsedBaslama = needsManualBaslama ? parseDateTimeInput(baslamaTarihiInput) : null
      if (parsedBaslama && new Date(parsedSon).getTime() <= new Date(parsedBaslama).getTime()) {
        Alert.alert('Tarih hatası', 'Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.')
        return false
      }
      return true
    }

    if (embeddedStepId === 'tekrarlama') {
      if (repeatDaily) {
        if (repeatType === 'daily_hourly') {
          const [h1, m1] = parseClock(repeatDayStartClock, 9, 0)
          const [h2, m2] = parseClock(repeatDayEndClock, 18, 0)
          if (h2 * 60 + m2 <= h1 * 60 + m1) {
            Alert.alert('Tekrar ayarı', 'Gün içi bitiş saati başlangıç saatinden sonra olmalı.')
            return false
          }
        }
        if (repeatType === 'weekly' && (!Array.isArray(repeatWeeklyDays) || repeatWeeklyDays.length === 0)) {
          Alert.alert('Tekrar ayarı', 'Haftalık tekrar için en az bir gün seçin.')
          return false
        }
      }
      return true
    }

    if (embeddedStepId === 'diger') {
      const op = normalizeOperasyonelOpts({
        ...operasyonelOpts,
        foto_zorunlu: fotoZorunlu,
        min_foto_sayisi: minFotoSayisi,
      })
      if (op.foto_zorunlu && op.video_zorunlu) {
        Alert.alert('Eksik bilgi', 'Fotoğraf ve video kanıtı aynı anda zorunlu tutulamaz.')
        return false
      }
      if (op.foto_zorunlu && op.min_foto_sayisi < 1) {
        Alert.alert('Eksik bilgi', 'Minimum fotoğraf sayısı en az 1 olmalı.')
        return false
      }
      if (op.video_zorunlu && op.min_video_sayisi < 1) {
        Alert.alert('Eksik bilgi', 'Minimum video sayısı en az 1 olmalı.')
        return false
      }
      if (op.video_zorunlu && (op.max_video_suresi_sn < 5 || op.max_video_suresi_sn > 60)) {
        Alert.alert('Eksik bilgi', 'Video süresi 5-60 saniye arasında olmalı.')
        return false
      }
      if (op.belge_zorunlu && op.min_belge_sayisi < 1) {
        Alert.alert('Eksik bilgi', 'Minimum belge sayısı en az 1 olmalı.')
        return false
      }
      return true
    }

    return true
  }, [
    embeddedStepId,
    gorevModu,
    templateAllowedInMode,
    selectedTemplateId,
    templateDrivenFieldsHidden,
    baslik,
    isSiraliMode,
    chainModeActive,
    assignmentTarget,
    selectedBirimIds,
    selectedAssigneeIds,
    siraliAdimlar,
    zincirGorevSira.length,
    zincirOnaySira.length,
    zincirOnayWorkerId,
    karmaBirimler,
    siraliBirimId,
    assignees,
    needsManualBaslama,
    baslamaTarihiInput,
    sonTarihInput,
    parseDateTimeInput,
    repeatDaily,
    repeatType,
    repeatDayStartClock,
    repeatDayEndClock,
    repeatWeeklyDays,
    fotoZorunlu,
    minFotoSayisi,
    operasyonelOpts,
  ])

  const validateWizardStep = useCallback(() => {
    // -------- STEP 1: Görev türü / başlık --------
    if (currentStep === 1) {
      if (canAssignTask && !gorevModu) {
        Alert.alert('Eksik bilgi', 'Görev türü seçin.')
        return false
      }
      if (!canAssignTask && !templateDrivenFieldsHidden && !String(baslik || '').trim()) {
        Alert.alert('Eksik bilgi', 'Görev başlığı zorunlu.')
        return false
      }
      return true
    }

    // -------- STEP 2: Atama & zamanlama --------
    if (canAssignTask && currentStep === 2) {
      // Sıralı görev: adım kart bazlı bütün zorunlu alanlar kontrol edilir.
      if (isSiraliMode) {
        if ((siraliAdimlar || []).length < 2) {
          Alert.alert('Eksik adım', 'Sıralı görev için en az 2 adım ekleyin.')
          return false
        }
        let prevBitisIso = null
        for (let i = 0; i < siraliAdimlar.length; i += 1) {
          const adim = siraliAdimlar[i] || {}
          if (!String(adim.adim_baslik || '').trim()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adım başlığı zorunlu.`)
            return false
          }
          if (!adim.personel_id || !adim.denetimci_personel_id) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adım için yapan ve denetimci seçin.`)
            return false
          }
          // 1. adımda başlangıç manuel, sonraki adımlar otomatik atanır;
          // her adımda bitiş zorunludur.
          if (i === 0 && !String(adim.baslama_tarihi || '').trim()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', '1. adım için başlangıç tarihi zorunlu.')
            return false
          }
          if (!String(adim.bitis_tarihi || '').trim()) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adım için bitiş tarihi zorunlu.`)
            return false
          }
          const bitisIso = parseDateTimeInput(adim.bitis_tarihi)
          if (!bitisIso) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Geçersiz tarih', `${i + 1}. adım bitiş tarihi geçersiz.`)
            return false
          }
          if (i === 0) {
            const baslamaIso = parseDateTimeInput(adim.baslama_tarihi)
            if (!baslamaIso) {
              setActiveSiraliStepIdx(0)
              Alert.alert('Geçersiz tarih', '1. adım başlangıç tarihi geçersiz.')
              return false
            }
            if (new Date(bitisIso).getTime() <= new Date(baslamaIso).getTime()) {
              setActiveSiraliStepIdx(0)
              Alert.alert(
                'Geçersiz aralık',
                '1. adım bitiş tarihi, başlangıç tarihinden sonra olmalı.',
              )
              return false
            }
          } else if (prevBitisIso) {
            if (new Date(bitisIso).getTime() <= new Date(prevBitisIso).getTime()) {
              setActiveSiraliStepIdx(i)
              Alert.alert(
                'Geçersiz sıra',
                `${i + 1}. adım bitişi, ${i}. adım bitişinden sonra olmalı.`,
              )
              return false
            }
          }
          if (adim.foto_zorunlu && adim.video_zorunlu) {
            setActiveSiraliStepIdx(i)
            Alert.alert('Eksik adım', `${i + 1}. adımda fotoğraf ve video aynı anda zorunlu olamaz.`)
            return false
          }
          // Adım foto/video min/max sayı ve süre kontrolleri (web ile uyumlu)
          if (adim.foto_zorunlu) {
            const mf = Number.parseInt(String(adim.min_foto_sayisi || '1').replace(/\D/g, ''), 10)
            if (Number.isNaN(mf) || mf < 1) {
              setActiveSiraliStepIdx(i)
              Alert.alert('Eksik adım', `${i + 1}. adımda minimum fotoğraf en az 1 olmalı.`)
              return false
            }
          }
          if (adim.video_zorunlu) {
            const mv = Number.parseInt(String(adim.min_video_sayisi || '1').replace(/\D/g, ''), 10)
            if (Number.isNaN(mv) || mv < 1) {
              setActiveSiraliStepIdx(i)
              Alert.alert('Eksik adım', `${i + 1}. adımda minimum video en az 1 olmalı.`)
              return false
            }
            const ms = Number.parseInt(String(adim.max_video_suresi_sn || '60').replace(/\D/g, ''), 10)
            if (Number.isNaN(ms) || ms < 5 || ms > 60) {
              setActiveSiraliStepIdx(i)
              Alert.alert('Eksik adım', `${i + 1}. adımda video süresi 5-60 saniye arasında olmalı.`)
              return false
            }
          }
          if (adim.belge_zorunlu) {
            const mb = Number.parseInt(String(adim.min_belge_sayisi || '1').replace(/\D/g, ''), 10)
            if (Number.isNaN(mb) || mb < 1) {
              setActiveSiraliStepIdx(i)
              Alert.alert('Eksik adım', `${i + 1}. adımda minimum belge en az 1 olmalı.`)
              return false
            }
          }
          prevBitisIso = bitisIso
        }
        return true
      }

      // Görev başlığı (sıralı dışı tüm türler — şablondan beslenmediyse).
      if (!templateDrivenFieldsHidden && !String(baslik || '').trim()) {
        Alert.alert('Eksik bilgi', 'Görev başlığı zorunlu.')
        return false
      }

      // Zincir görev / onay sıraları.
      if (
        (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') &&
        zincirGorevSira.length < 1
      ) {
        Alert.alert('Eksik sıra', 'Zincir görev için en az 1 kişi ekleyin.')
        return false
      }
      if (
        (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') &&
        zincirOnaySira.length < 1
      ) {
        Alert.alert('Eksik sıra', 'Zincir onay için en az 1 onaylayıcı ekleyin.')
        return false
      }
      if (gorevModu === 'zincir_onay' && !zincirOnayWorkerId) {
        Alert.alert('Eksik atama', 'Zincir onay için görevi yapacak personeli seçin.')
        return false
      }

      // Normal/şablon görev: atama hedefi (birim ya da personel).
      if (!chainModeActive) {
        if (assignmentTarget === 'birimler') {
          if (!(selectedBirimIds || []).filter(Boolean).length) {
            Alert.alert('Eksik atama', 'Atanacak birim seçin.')
            return false
          }
        } else if ((selectedAssigneeIds || []).length === 0) {
          Alert.alert('Eksik atama', 'En az bir personel seçin.')
          return false
        }
      }

      // Tarih kontrolleri — tüm yöneticili görev türlerinde geçerli.
      if (needsManualBaslama) {
        if (!String(baslamaTarihiInput || '').trim()) {
          Alert.alert('Başlangıç gerekli', 'Başlangıç tarihi ve saati girin.')
          return false
        }
        if (!parseDateTimeInput(baslamaTarihiInput)) {
          Alert.alert('Tarih formatı hatalı', 'Başlangıç için YYYY-MM-DD HH:mm formatını kullanın.')
          return false
        }
      }
      if (!String(sonTarihInput || '').trim()) {
        Alert.alert('Bitiş gerekli', 'Bitiş tarihi ve saati girin.')
        return false
      }
      const parsedSon = parseDateTimeInput(sonTarihInput)
      if (!parsedSon) {
        Alert.alert('Tarih formatı hatalı', 'Bitiş için YYYY-MM-DD HH:mm formatını kullanın.')
        return false
      }
      const parsedBaslama = needsManualBaslama ? parseDateTimeInput(baslamaTarihiInput) : null
      if (parsedBaslama && new Date(parsedSon).getTime() <= new Date(parsedBaslama).getTime()) {
        Alert.alert('Tarih hatası', 'Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.')
        return false
      }

      return true
    }

    // -------- STEP 3: Görev seçenekleri (foto/video kuralları, tekrar) --------
    if (canAssignTask && currentStep === detailsStep) {
      const op = normalizeOperasyonelOpts({
        ...operasyonelOpts,
        foto_zorunlu: fotoZorunlu,
        min_foto_sayisi: minFotoSayisi,
      })
      if (op.foto_zorunlu && op.video_zorunlu) {
        Alert.alert('Eksik bilgi', 'Fotoğraf ve video kanıtı aynı anda zorunlu tutulamaz.')
        return false
      }
      if (op.foto_zorunlu && op.min_foto_sayisi < 1) {
        Alert.alert('Eksik bilgi', 'Minimum fotoğraf sayısı en az 1 olmalı.')
        return false
      }
      if (op.video_zorunlu && op.min_video_sayisi < 1) {
        Alert.alert('Eksik bilgi', 'Minimum video sayısı en az 1 olmalı.')
        return false
      }
      if (op.video_zorunlu && (op.max_video_suresi_sn < 5 || op.max_video_suresi_sn > 60)) {
        Alert.alert('Eksik bilgi', 'Video süresi 5-60 saniye arasında olmalı.')
        return false
      }
      if (op.belge_zorunlu && op.min_belge_sayisi < 1) {
        Alert.alert('Eksik bilgi', 'Minimum belge sayısı en az 1 olmalı.')
        return false
      }
      // Tekrar eden görev parametreleri
      if (repeatDaily) {
        if (repeatType === 'daily_hourly') {
          const [h1, m1] = parseClock(repeatDayStartClock, 9, 0)
          const [h2, m2] = parseClock(repeatDayEndClock, 18, 0)
          if (h2 * 60 + m2 <= h1 * 60 + m1) {
            Alert.alert('Tekrar ayarı', 'Gün içi bitiş saati başlangıç saatinden sonra olmalı.')
            return false
          }
        }
        if (repeatType === 'weekly' && (!Array.isArray(repeatWeeklyDays) || repeatWeeklyDays.length === 0)) {
          Alert.alert('Tekrar ayarı', 'Haftalık tekrar için en az bir gün seçin.')
          return false
        }
      }
      return true
    }

    return true
  }, [
    currentStep,
    gorevModu,
    templateDrivenFieldsHidden,
    baslik,
    canAssignTask,
    chainModeActive,
    isSiraliMode,
    siraliAdimlar,
    selectedAssigneeIds,
    selectedBirimIds,
    assignmentTarget,
    zincirGorevSira.length,
    zincirOnaySira.length,
    zincirOnayWorkerId,
    parseDateTimeInput,
    needsManualBaslama,
    baslamaTarihiInput,
    sonTarihInput,
    detailsStep,
    fotoZorunlu,
    minFotoSayisi,
    operasyonelOpts,
    repeatDaily,
    repeatType,
    repeatDayStartClock,
    repeatDayEndClock,
    repeatWeeklyDays,
  ])

  const goNextStep = useCallback(() => {
    if (canAssignTask) {
      if (!validateEmbeddedCurrent()) return
      if (isLastEmbeddedStep) {
        void save()
        return
      }
      goEmbeddedNext()
      return
    }
    if (!validateWizardStep()) return
    setCurrentStep((s) => Math.min(reviewStep, s + 1))
  }, [
    canAssignTask,
    validateEmbeddedCurrent,
    isLastEmbeddedStep,
    save,
    goEmbeddedNext,
    validateWizardStep,
    reviewStep,
  ])

  const goPrevStep = useCallback(() => {
    if (canAssignTask) {
      goEmbeddedPrev()
      return
    }
    setCurrentStep((s) => Math.max(1, s - 1))
  }, [canAssignTask, goEmbeddedPrev])

  return (
    <>
      <TaskFlowScreenShell
        onBack={handleBack}
        eyebrow={canAssignTask ? 'YÖNETİM' : 'GÖREV'}
        title={canAssignTask ? 'Görev Ata' : 'Ekstra Görev Girişi'}
        subtitle={
          canAssignTask
            ? 'Adım adım personele görev atayın'
            : 'Ekstra görevinizi başlık ve açıklama ile kaydedin'
        }
        footer={
          <TaskFlowWizardFooter
            showBack={canAssignTask ? embeddedStepIndex > 0 : currentStep > 1}
            onBack={goPrevStep}
            onNext={() => {
              if (canAssignTask || currentStep < reviewStep) goNextStep()
              else save()
            }}
            nextLabel={
              canAssignTask
                ? isLastEmbeddedStep
                  ? saving
                    ? 'Kaydediliyor…'
                    : 'Görev Ata'
                  : 'İleri'
                : currentStep < reviewStep
                  ? 'İleri'
                  : saving
                    ? 'Kaydediliyor…'
                    : 'Kaydet'
            }
            nextLoading={
              saving &&
              ((canAssignTask && isLastEmbeddedStep) || (!canAssignTask && currentStep >= reviewStep))
            }
            nextDisabled={saving}
            nextVariant={
              (canAssignTask && isLastEmbeddedStep) || (!canAssignTask && currentStep >= reviewStep)
                ? 'accent'
                : 'primary'
            }
          />
        }
      >
        <TaskFlowSectionCard noPadding={canAssignTask}>
          {canAssignTask ? (
            <TaskAssignEmbeddedNav
              steps={embeddedSteps}
              activeIndex={embeddedStepIndex}
              onSelect={goEmbeddedTo}
            />
          ) : (
            <View style={styles.mobileStepperRow}>
              {stepItems.map((label, idx) => {
                const stepNo = idx + 1
                const active = currentStep === stepNo
                const done = stepNo < currentStep
                return (
                  <View
                    key={`${label}-${stepNo}`}
                    style={[
                      styles.mobileStepPill,
                      active && styles.mobileStepPillActive,
                      done && styles.mobileStepPillDone,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mobileStepPillText,
                        active && styles.mobileStepPillTextActive,
                        done && styles.mobileStepPillTextDone,
                      ]}
                    >
                      {stepNo}. {label}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </TaskFlowSectionCard>

          {(canAssignTask && embeddedStepId === 'tur') || (!canAssignTask && currentStep === 1) ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Görev Türü</Text>
              {canAssignTask ? (
                <>
                  <Text style={styles.label}>Görev türünü seçin</Text>
                  <View style={styles.modeGrid}>
                    {GOREV_MODU_OPTIONS.map((opt) => {
                      const active = gorevModu === opt.value
                      const ModeIcon = GOREV_MODU_MODE_ICONS[opt.value] || Link2
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.modeGridCard, active && styles.modeGridCardActive]}
                          activeOpacity={0.88}
                          onPress={() => setGorevModu(opt.value)}
                        >
                          <View style={[styles.modeGridIcon, active && { backgroundColor: `${opt.color}22` }]}>
                            <ModeIcon size={16} color={active ? opt.color : MUTED} strokeWidth={2} />
                          </View>
                          <Text style={[styles.modeGridTitle, active && styles.modeGridTitleActive]}>{opt.label}</Text>
                          <Text style={styles.modeGridSub} numberOfLines={2}>{opt.sub}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Görev başlığı *</Text>
                  <TextInput
                    style={styles.input}
                    value={baslik}
                    onChangeText={setBaslik}
                    onBlur={() => setBaslik((prev) => formatTaskTitleCase(prev))}
                    placeholder="Örn: Ek müşteri ziyareti"
                    placeholderTextColor={MUTED}
                  />
                </>
              )}
            </View>
          ) : null}

          {canAssignTask && embeddedStepId === 'detaylar-temel' ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Temel bilgi</Text>
              {templateAllowedInMode ? (
                <>
                  <Text style={styles.label}>Görev Şablonu (isteğe bağlı)</Text>
                  <TouchableOpacity style={styles.pickerButton} onPress={() => setTemplatePickerOpen(true)} activeOpacity={0.8}>
                    <Text style={styles.pickerButtonText}>
                      {selectedTemplateId
                        ? (templates.find((t) => String(t.id) === String(selectedTemplateId))?.baslik || 'Şablon')
                        : 'Şablon seç'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {!templateDrivenFieldsHidden ? (
                <>
                  <Text style={styles.label}>Görev başlığı *</Text>
                  <TextInput
                    style={styles.input}
                    value={baslik}
                    onChangeText={setBaslik}
                    onBlur={() => setBaslik((prev) => formatTaskTitleCase(prev))}
                    placeholder="Örn: Ek müşteri ziyareti"
                    placeholderTextColor={MUTED}
                  />
                </>
              ) : null}
              {!templateDrivenFieldsHidden ? (
                <>
                  <Text style={styles.label}>Puan</Text>
                  <TextInput
                    style={styles.input}
                    value={puan}
                    onChangeText={(v) => setPuan(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    placeholder="Örn: 20"
                    placeholderTextColor={MUTED}
                  />
                </>
              ) : null}
              {!templateDrivenFieldsHidden && !isSiraliMode ? (
                <>
                  <Text style={styles.label}>Görev açıklaması</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={aciklama}
                    onChangeText={setAciklama}
                    placeholder="Yapılacak işi kısaca açıklayın"
                    placeholderTextColor={MUTED}
                    multiline
                    numberOfLines={4}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {canAssignTask &&
          (embeddedStepId === 'detaylar-atama' ||
            embeddedStepId === 'adimlar' ||
            embeddedStepId === 'zamanlama') ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {embeddedStepId === 'detaylar-atama'
                  ? 'Organizasyon ve atama'
                  : embeddedStepId === 'adimlar'
                    ? 'Görev adımları'
                    : 'Zamanlama'}
              </Text>
              {embeddedStepId === 'detaylar-atama' && assignScopeChainLike ? (
                <View style={[styles.switchRow, { marginBottom: 12 }]}>
                  <Text style={styles.switchLabel}>Karma birimler (şirket geneli personel)</Text>
                  <Switch value={karmaBirimler} onValueChange={setKarmaBirimler} />
                </View>
              ) : null}
              {embeddedStepId === 'detaylar-atama' && isSiraliMode && !karmaBirimler ? (
                <>
                  <Text style={styles.label}>Birim</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setSiraliBirimPickerOpen(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerButtonText}>
                      {siraliBirimId
                        ? birimler.find((b) => String(b?.id) === String(siraliBirimId))?.birim_adi ||
                          'Birim'
                        : 'Birim seçin'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {embeddedStepId === 'detaylar-atama' && isSiraliMode ? (
                <View style={{ gap: 12, marginTop: 4 }}>
                  <Text style={styles.label}>Adım atamaları</Text>
                  <Text style={styles.switchHint}>
                    Her adım için yapan personel ve denetimciyi seçin. Tarih ve kanıt kuralları Adımlar
                    sekmesinde tanımlanır.
                  </Text>
                  {siraliAdimlar.map((adim, idx) => (
                    <TaskAssignRolePairPicker
                      key={`sirali-atama-${idx}`}
                      stepIndex={idx + 1}
                      yapanValue={adim.personel_id}
                      yapanOptions={assignablePersonOptions}
                      onYapanChange={(id) => patchSiraliAdim(idx, 'personel_id', id)}
                      denetimciValue={adim.denetimci_personel_id}
                      denetimciOptions={onayPersonOptions}
                      onDenetimciChange={(id) => patchSiraliAdim(idx, 'denetimci_personel_id', id)}
                      onMoveUp={() => moveSiraliAdim(idx, -1)}
                      onMoveDown={() => moveSiraliAdim(idx, 1)}
                      onRemove={() => removeSiraliAdim(idx)}
                      canRemove={siraliAdimlar.length > 2}
                    />
                  ))}
                  <TouchableOpacity style={styles.chainAddBtn} onPress={addSiraliAdim} activeOpacity={0.85}>
                    <Text style={styles.chainAddBtnText}>+ Yeni adım ekle</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {embeddedStepId === 'detaylar-atama' && gorevModu === 'zincir_onay' ? (
                <TaskAssignPeopleChipPicker
                  title="Görevi yapacak personel"
                  tone="indigo"
                  options={assignablePersonOptions}
                  selectedIds={zincirOnayWorkerId ? [zincirOnayWorkerId] : []}
                  onAdd={(id) => setZincirOnayWorkerId(id)}
                  onRemove={() => setZincirOnayWorkerId(null)}
                  emptyText="Görevi yapacak personeli seçin."
                />
              ) : null}
              {embeddedStepId === 'adimlar' && isSiraliMode ? (
                <View style={{ marginBottom: 14, gap: 10 }}>
                  <Text style={styles.label}>Sıralı görev adımları</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.siraliTabsRow}>
                    {siraliAdimlar.map((adim, idx) => {
                      const active = idx === activeSiraliStepIdx
                      const doneish =
                        String(adim?.adim_baslik || '').trim() &&
                        adim?.personel_id &&
                        adim?.denetimci_personel_id &&
                        adim?.baslama_tarihi &&
                        adim?.bitis_tarihi
                      return (
                        <TouchableOpacity
                          key={`sirali-tab-${idx}`}
                          style={[styles.siraliTab, active && styles.siraliTabActive]}
                          onPress={() => setActiveSiraliStepIdx(idx)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.siraliTabInner}>
                            <Text style={[styles.siraliTabText, active && styles.siraliTabTextActive]}>
                              {idx + 1}. Adım
                            </Text>
                            {doneish ? (
                              <Icon.Delivered size={12} color={active ? kitPalette.surface : kitPalette.success[600]} strokeWidth={3} />
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>

                  {siraliAdimlar[activeSiraliStepIdx] ? (
                    <View style={styles.siraliCard}>
                      <View style={styles.siraliHeader}>
                        <View style={styles.siraliHeaderBadge}>
                          <Text style={styles.siraliHeaderBadgeText}>{activeSiraliStepIdx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.siraliHeaderTitle}>{activeSiraliStepIdx + 1}. adım</Text>
                          <Text style={styles.siraliHeaderHint} numberOfLines={1}>
                            Bu adıma özel kanıt, açıklama ve tarih kuralları tanımlayın.
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.siraliRemoveBtn}
                          onPress={() => removeSiraliAdim(activeSiraliStepIdx)}
                          disabled={siraliAdimlar.length <= 2}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.siraliRemoveBtnText,
                              siraliAdimlar.length <= 2 && { color: MUTED },
                            ]}
                          >
                            Adımı sil
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.siraliGroupLabel}>Kimlik</Text>
                      <Text style={styles.label}>Adım başlığı</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Örn: Sahada ilk kontrol ve foto kanıt"
                        placeholderTextColor={MUTED}
                        value={siraliAdimlar[activeSiraliStepIdx].adim_baslik}
                        onChangeText={(v) => patchSiraliAdim(activeSiraliStepIdx, 'adim_baslik', v)}
                      />
                      <Text style={styles.label}>Adım açıklaması</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Bu adımda beklenen görev tanımı"
                        placeholderTextColor={MUTED}
                        multiline
                        value={siraliAdimlar[activeSiraliStepIdx].adim_aciklama}
                        onChangeText={(v) => patchSiraliAdim(activeSiraliStepIdx, 'adim_aciklama', v)}
                      />

                      <Text style={styles.siraliGroupLabel}>Sorumlular</Text>
                      <Text style={styles.label}>Yapan personel</Text>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        activeOpacity={0.85}
                        onPress={() => {
                          setSiraliPickerStepIdx(activeSiraliStepIdx)
                          setSiraliPickerField('personel_id')
                          setSiraliPickerOpen(true)
                        }}
                      >
                        <Text style={styles.pickerButtonText}>
                          {siraliAdimlar[activeSiraliStepIdx].personel_id
                            ? formatName(
                                assignees.find(
                                  (p) => String(p.id) === String(siraliAdimlar[activeSiraliStepIdx].personel_id),
                                ),
                              )
                            : 'Yapan seçin'}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.label}>Denetimci</Text>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        activeOpacity={0.85}
                        onPress={() => {
                          setSiraliPickerStepIdx(activeSiraliStepIdx)
                          setSiraliPickerField('denetimci_personel_id')
                          setSiraliPickerOpen(true)
                        }}
                      >
                        <Text style={styles.pickerButtonText}>
                          {siraliAdimlar[activeSiraliStepIdx].denetimci_personel_id
                            ? formatName(
                                approverCandidates.find(
                                  (p) =>
                                    String(p.id) ===
                                    String(siraliAdimlar[activeSiraliStepIdx].denetimci_personel_id),
                                ),
                              )
                            : 'Denetimci seçin'}
                        </Text>
                      </TouchableOpacity>

                      <Text style={styles.siraliGroupLabel}>Takvim</Text>
                      {activeSiraliStepIdx === 0 ? (
                        <>
                          <Text style={styles.label}>Adım başlangıç</Text>
                          <TouchableOpacity
                            style={styles.dateBox}
                            activeOpacity={0.85}
                            onPress={() => openSiraliDatePicker(activeSiraliStepIdx, 'baslama_tarihi')}
                          >
                            <Text style={styles.dateBoxText}>
                              {siraliAdimlar[activeSiraliStepIdx].baslama_tarihi || 'Tarih ve saat seç'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <View style={styles.siraliAutoStartBox}>
                          <Text style={styles.siraliAutoStartText}>
                            Başlangıç zamanı, {activeSiraliStepIdx}. adım onaylandığında sistem
                            tarafından otomatik atanır.
                          </Text>
                        </View>
                      )}
                      <Text style={styles.label}>Adım bitiş</Text>
                      <TouchableOpacity
                        style={styles.dateBox}
                        activeOpacity={0.85}
                        onPress={() => openSiraliDatePicker(activeSiraliStepIdx, 'bitis_tarihi')}
                      >
                        <Text style={styles.dateBoxText}>
                          {siraliAdimlar[activeSiraliStepIdx].bitis_tarihi || 'Tarih ve saat seç'}
                        </Text>
                      </TouchableOpacity>
                      <View style={styles.quickRangeRow}>
                        {[3, 8, 12].map((h) => (
                          <TouchableOpacity
                            key={`sirali-quick-${activeSiraliStepIdx}-${h}`}
                            style={styles.quickRangeBtn}
                            onPress={() => {
                              const adim = siraliAdimlar[activeSiraliStepIdx] || {}
                              const baseRaw =
                                activeSiraliStepIdx === 0
                                  ? adim.baslama_tarihi
                                  : siraliAdimlar[activeSiraliStepIdx - 1]?.bitis_tarihi
                              const baseDate = parseInputToDate(baseRaw) || new Date()
                              const target = new Date(baseDate.getTime() + h * 60 * 60 * 1000)
                              patchSiraliAdim(
                                activeSiraliStepIdx,
                                'bitis_tarihi',
                                formatDateTimeInput(target),
                              )
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.quickRangeText}>+{h} saat</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={styles.label}>Adım puanı</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={MUTED}
                        value={String(siraliAdimlar[activeSiraliStepIdx].puan ?? '0')}
                        onChangeText={(v) =>
                          patchSiraliAdim(
                            activeSiraliStepIdx,
                            'puan',
                            String(v).replace(/[^0-9]/g, ''),
                          )
                        }
                      />

                      <Text style={styles.siraliGroupLabel}>Adım gereksinimleri</Text>
                      <View style={styles.switchRow}>
                        <Text style={styles.label}>Acil adım</Text>
                        <Switch
                          value={!!siraliAdimlar[activeSiraliStepIdx].acil}
                          onValueChange={(v) => patchSiraliAdim(activeSiraliStepIdx, 'acil', v)}
                          trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                          thumbColor={Colors.surface}
                        />
                      </View>
                      <View style={styles.switchRow}>
                        <Text style={styles.label}>Açıklama zorunlu</Text>
                        <Switch
                          value={!!siraliAdimlar[activeSiraliStepIdx].aciklama_zorunlu}
                          onValueChange={(v) =>
                            patchSiraliAdim(activeSiraliStepIdx, 'aciklama_zorunlu', v)
                          }
                          trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                          thumbColor={Colors.surface}
                        />
                      </View>
                      <View style={styles.switchRow}>
                        <Text style={styles.label}>Fotoğraf zorunlu</Text>
                        <Switch
                          value={!!siraliAdimlar[activeSiraliStepIdx].foto_zorunlu}
                          onValueChange={(v) => {
                            patchSiraliAdim(activeSiraliStepIdx, 'foto_zorunlu', v)
                            if (v) {
                              patchSiraliAdim(activeSiraliStepIdx, 'video_zorunlu', false)
                            }
                          }}
                          trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                          thumbColor={Colors.surface}
                        />
                      </View>
                      {siraliAdimlar[activeSiraliStepIdx].foto_zorunlu ? (
                        <>
                          <Text style={styles.label}>Minimum fotoğraf (1-5)</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={String(siraliAdimlar[activeSiraliStepIdx].min_foto_sayisi ?? '1')}
                            onChangeText={(v) => {
                              const next = String(v).replace(/[^0-9]/g, '')
                              patchSiraliAdim(activeSiraliStepIdx, 'min_foto_sayisi', next)
                            }}
                          />
                        </>
                      ) : null}
                      <View style={styles.switchRow}>
                        <Text style={styles.label}>Video zorunlu</Text>
                        <Switch
                          value={!!siraliAdimlar[activeSiraliStepIdx].video_zorunlu}
                          onValueChange={(v) => {
                            patchSiraliAdim(activeSiraliStepIdx, 'video_zorunlu', v)
                            if (v) {
                              patchSiraliAdim(activeSiraliStepIdx, 'foto_zorunlu', false)
                            }
                          }}
                          trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                          thumbColor={Colors.surface}
                        />
                      </View>
                      {siraliAdimlar[activeSiraliStepIdx].video_zorunlu ? (
                        <>
                          <Text style={styles.label}>Minimum video (1-3)</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={String(siraliAdimlar[activeSiraliStepIdx].min_video_sayisi ?? '1')}
                            onChangeText={(v) => {
                              const next = String(v).replace(/[^0-9]/g, '')
                              patchSiraliAdim(activeSiraliStepIdx, 'min_video_sayisi', next)
                            }}
                          />
                          <Text style={styles.label}>Maks. video süresi (5-60 sn)</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={String(
                              siraliAdimlar[activeSiraliStepIdx].max_video_suresi_sn ?? '60',
                            )}
                            onChangeText={(v) => {
                              const next = String(v).replace(/[^0-9]/g, '')
                              patchSiraliAdim(activeSiraliStepIdx, 'max_video_suresi_sn', next)
                            }}
                          />
                        </>
                      ) : null}
                      <View style={styles.switchRow}>
                        <Text style={styles.label}>Belge zorunlu</Text>
                        <Switch
                          value={!!siraliAdimlar[activeSiraliStepIdx].belge_zorunlu}
                          onValueChange={(v) =>
                            patchSiraliAdim(activeSiraliStepIdx, 'belge_zorunlu', v)
                          }
                          trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                          thumbColor={Colors.surface}
                        />
                      </View>
                      {siraliAdimlar[activeSiraliStepIdx].belge_zorunlu ? (
                        <>
                          <Text style={styles.label}>Minimum belge (1-5)</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={String(siraliAdimlar[activeSiraliStepIdx].min_belge_sayisi ?? '1')}
                            onChangeText={(v) => {
                              const next = String(v).replace(/[^0-9]/g, '')
                              patchSiraliAdim(activeSiraliStepIdx, 'min_belge_sayisi', next)
                            }}
                          />
                        </>
                      ) : null}
                    </View>
                  ) : null}
                  <TouchableOpacity style={styles.chainAddBtn} onPress={addSiraliAdim} activeOpacity={0.85}>
                    <Text style={styles.chainAddBtnText}>+ Yeni adım ekle</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {embeddedStepId === 'detaylar-atama' && !chainModeActive && !isSiraliMode ? (
                <View style={styles.targetChipsRow}>
                  {[
                    { key: 'personeller', label: 'Personeller' },
                    { key: 'birimler', label: 'Birimler' },
                    { key: 'sirket', label: 'Şirket' },
                  ].map((x) => {
                    const active = assignmentTarget === x.key
                    return (
                      <TouchableOpacity
                        key={x.key}
                        style={[styles.targetChip, active && styles.targetChipActive]}
                        activeOpacity={0.85}
                        onPress={() => {
                          const prevTarget = assignmentTarget
                          setAssignmentTarget(x.key)
                          if (x.key === 'sirket') {
                            const allIds = (assignees || []).map((p) => p?.id).filter(Boolean)
                            setSelectedBirimIds([])
                            setManualSelectedAssigneeIds(allIds)
                            setSelectedAssigneeIds(allIds)
                            return
                          }
                          if (prevTarget === 'sirket') {
                            setManualSelectedAssigneeIds([])
                          }
                        }}
                      >
                        <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>{x.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ) : null}

              {embeddedStepId === 'detaylar-atama' &&
              !chainModeActive &&
              !isSiraliMode &&
              assignmentTarget === 'personeller' &&
              standardModeActive ? (
                <TaskAssignPeopleChipPicker
                  title="Sorumlu personel"
                  countLabel={
                    manualSelectedAssigneeIds?.length
                      ? `${manualSelectedAssigneeIds.length} kişi`
                      : null
                  }
                  tone="emerald"
                  options={assignablePersonOptions}
                  selectedIds={manualSelectedAssigneeIds}
                  onAdd={(id) => {
                    const key = String(id)
                    if (!cokluAtama) {
                      setManualSelectedAssigneeIds([key])
                      setSelectedAssigneeIds([key])
                      return
                    }
                    if (manualSelectedAssigneeIds.some((x) => String(x) === key)) return
                    const next = [...manualSelectedAssigneeIds, key]
                    setManualSelectedAssigneeIds(next)
                    setSelectedAssigneeIds(next)
                  }}
                  onRemove={(id) => {
                    const next = manualSelectedAssigneeIds.filter((x) => String(x) !== String(id))
                    setManualSelectedAssigneeIds(next)
                    setSelectedAssigneeIds(next)
                  }}
                  headerAction={
                    standardModeActive ? (
                      <CokluAtamaSwitch
                        value={cokluAtama}
                        onChange={(v) => {
                          setCokluAtama(v)
                          if (!v && manualSelectedAssigneeIds.length > 1) {
                            const first = manualSelectedAssigneeIds.slice(0, 1)
                            setManualSelectedAssigneeIds(first)
                            setSelectedAssigneeIds(first)
                          }
                          if (!v) setBireysel(true)
                        }}
                      />
                    ) : null
                  }
                />
              ) : null}

              {embeddedStepId === 'detaylar-atama' &&
              !chainModeActive &&
              !isSiraliMode &&
              assignmentTarget === 'birimler' ? (
                <>
                  <Text style={styles.label}>Atanacak birimler</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setBirimPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pickerButtonText}>
                      {selectedBirimIds?.length
                        ? `${selectedBirimIds.length} birim · ${birimScopeAssigneeCount} kişi`
                        : 'Seçiniz'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {embeddedStepId === 'detaylar-atama' &&
              !chainModeActive &&
              !isSiraliMode &&
              assignmentTarget === 'sirket' ? (
                <>
                  <Text style={styles.label}>Tüm şirket</Text>
                  <Text style={styles.value}>Kapsam: {assigneeCountInScope} kişi</Text>
                </>
              ) : null}

              {embeddedStepId === 'adimlar' &&
              chainModeActive &&
              (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') ? (
                <TaskAssignOrderedPeoplePicker
                  title="Zincir görev sırası"
                  countLabel={`${zincirGorevSira.length} kişi`}
                  tone="sky"
                  options={assignablePersonOptions}
                  orderedIds={zincirGorevSira}
                  onAdd={addZincirGorevId}
                  onRemove={(id) =>
                    setZincirGorevSira((prev) => prev.filter((x) => String(x) !== String(id)))
                  }
                  onMove={(idx, dir) =>
                    setZincirGorevSira((prev) => {
                      const next = [...prev]
                      const j = idx + dir
                      if (j < 0 || j >= next.length) return prev
                      ;[next[idx], next[j]] = [next[j], next[idx]]
                      return next
                    })
                  }
                />
              ) : null}

              {embeddedStepId === 'adimlar' &&
              chainModeActive &&
              (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') ? (
                <TaskAssignOrderedPeoplePicker
                  title="Zincir onay sırası"
                  countLabel={`${zincirOnaySira.length} kişi`}
                  tone="indigo"
                  options={onayPersonOptions}
                  orderedIds={zincirOnaySira}
                  onAdd={addZincirOnayId}
                  onRemove={(id) =>
                    setZincirOnaySira((prev) => prev.filter((x) => String(x) !== String(id)))
                  }
                  onMove={(idx, dir) =>
                    setZincirOnaySira((prev) => {
                      const next = [...prev]
                      const j = idx + dir
                      if (j < 0 || j >= next.length) return prev
                      ;[next[idx], next[j]] = [next[j], next[idx]]
                      return next
                    })
                  }
                />
              ) : null}

              {embeddedStepId === 'detaylar-atama' && showBireyselToggle ? (
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.switchLabel}>Bireysel tamamlama</Text>
                    <Text style={styles.switchHint}>
                      {bireysel
                        ? 'Her atanan görevi kendi başına tamamlar.'
                        : 'Havuz görev: biri tamamlayınca diğerlerininki kapanır.'}
                    </Text>
                  </View>
                  <Switch
                    value={bireysel}
                    onValueChange={setBireysel}
                    trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                    thumbColor={Colors.surface}
                  />
                </View>
              ) : null}

              {embeddedStepId === 'zamanlama' && !isSiraliMode ? (
                <>
                  <View style={styles.switchRow}>
                    <Text style={styles.label}>Acil görev</Text>
                    <Switch
                      value={acil}
                      onValueChange={(v) => {
                        setAcil(v)
                        if (v) {
                          applyUrgentQuickDuration('30m')
                        } else {
                          setActiveUrgentQuick('')
                        }
                      }}
                      trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                      thumbColor={Colors.surface}
                    />
                  </View>

                  {acil ? (
                    <View style={styles.quickRangeRow}>
                      <TouchableOpacity
                        style={[styles.quickRangeBtn, activeUrgentQuick === '30m' && styles.quickRangeBtnActive]}
                        onPress={() => applyUrgentQuickDuration('30m')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.quickRangeText}>+30dk</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.quickRangeBtn, activeUrgentQuick === '1h' && styles.quickRangeBtnActive]}
                        onPress={() => applyUrgentQuickDuration('1h')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.quickRangeText}>+1 saat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.quickRangeBtn, activeUrgentQuick === '3h' && styles.quickRangeBtnActive]}
                        onPress={() => applyUrgentQuickDuration('3h')}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.quickRangeText}>+3 saat</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <View style={styles.switchRow}>
                        <Text style={styles.label}>Başlangıç saatini seç</Text>
                        <Switch
                          value={repeatDaily || baslamaZamanSec}
                          disabled={repeatDaily}
                          onValueChange={(v) => {
                            if (repeatDaily) return
                            setBaslamaZamanSec(v)
                            if (!v) setBaslamaTarihiInput('')
                            else if (!String(baslamaTarihiInput || '').trim()) {
                              setBaslamaTarihiInput(formatDateTimeInput(new Date()))
                            }
                          }}
                          trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                          thumbColor={Colors.surface}
                        />
                      </View>
                      <View style={styles.quickRangeRow}>
                        <TouchableOpacity style={styles.quickRangeBtn} onPress={() => applyQuickDurationHours(12)} activeOpacity={0.8}>
                          <Text style={styles.quickRangeText}>+12 saat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickRangeBtn} onPress={() => applyQuickDurationHours(8)} activeOpacity={0.8}>
                          <Text style={styles.quickRangeText}>+8 saat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickRangeBtn} onPress={() => applyQuickDurationHours(3)} activeOpacity={0.8}>
                          <Text style={styles.quickRangeText}>+3 saat</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.quickRangeRow}>
                        <TouchableOpacity style={styles.quickRangeBtn} onPress={() => applyQuickRange('next_24h')} activeOpacity={0.8}>
                          <Text style={styles.quickRangeText}>+24 saat</Text>
                        </TouchableOpacity>
                      </View>

                      {needsManualBaslama ? (
                        <>
                          <Text style={styles.label}>Başlangıç Tarih/Saat</Text>
                          <TouchableOpacity
                            style={styles.dateBox}
                            onPress={() => openDateTimePicker('start')}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.dateBoxText}>{baslamaTarihiInput || 'Tarih ve saat seç'}</Text>
                          </TouchableOpacity>
                        </>
                      ) : null}

                      <Text style={styles.label}>Bitiş Tarih/Saat</Text>
                      <TouchableOpacity style={styles.dateBox} onPress={() => openDateTimePicker('end')} activeOpacity={0.8}>
                        <Text style={styles.dateBoxText}>{sonTarihInput || 'Tarih ve saat seç'}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              ) : null}
            </View>
          ) : null}

          {canAssignTask && embeddedStepId === 'dosyalar' ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Referans medya (opsiyonel)</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={addReferenceMediaFromLibrary} activeOpacity={0.85}>
                <Text style={styles.pickerButtonText}>Referans medya ekle</Text>
              </TouchableOpacity>
              {referenceMediaFiles.length ? (
                <View style={{ gap: 8 }}>
                  {referenceMediaFiles.map((f, idx) => {
                    const tag = String(f?.mimeType || '').startsWith('image/') ? 'Referans fotoğraf' : 'Referans medya'
                    return (
                      <View
                        key={`${f?.uri || 'ref'}-${idx}`}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Text style={[styles.value, { flex: 1 }]} numberOfLines={1}>
                          {(f?.fileName || `Medya ${idx + 1}`) + ` · ${tag}`}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setReferenceMediaFiles((prev) => prev.filter((_, i) => i !== idx))}
                          style={styles.chainIconBtn}
                        >
                          <Icon.Close size={16} color={Colors.error} strokeWidth={2.4} />
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {canAssignTask && embeddedStepId === 'diger' ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Diğer kurallar</Text>
              {templateDrivenFieldsHidden &&
              (selectedTemplate?.foto_zorunlu ||
                selectedTemplate?.video_zorunlu ||
                hasChecklistPhoto ||
                hasChecklistVideo) ? (
                <Text style={styles.switchHint}>
                  Şablondan gelen fotoğraf/video kuralları uygulanır; belge ve açıklama kurallarını buradan
                  ayarlayabilirsiniz.
                </Text>
              ) : null}
              <TaskOperationalOptionsPanel
                gorevTipi={gorevModu || 'normal'}
                value={normalizeOperasyonelOpts({
                  ...operasyonelOpts,
                  foto_zorunlu: fotoZorunlu,
                  min_foto_sayisi: minFotoSayisi,
                  ozel_gorev: ozelGorev,
                })}
                onChange={handleOperasyonelChange}
                mayMarkBirebirGorev={mayMarkBirebirGorev && gorevModu === 'normal'}
                assigneeCount={(selectedAssigneeIds || []).length}
                selectedTemplate={selectedTemplate}
                hasChecklistPhoto={hasChecklistPhoto}
                hasChecklistVideo={hasChecklistVideo}
                hideCokluAssign
                hidePoolRules
                hideAcil
                hidePuan
              />
            </View>
          ) : null}

          {canAssignTask && embeddedStepId === 'tekrarlama' ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Tekrarlama</Text>
              <>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Tekrar eden görev</Text>
                  <Switch
                    value={repeatDaily}
                    onValueChange={(v) => {
                      setRepeatDaily(v)
                      if (v) setBaslamaZamanSec(true)
                    }}
                    trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                    thumbColor={Colors.surface}
                  />
                </View>
                {repeatDaily ? (
                  <>
                      <Text style={styles.label}>Tekrar tipi</Text>
                      <View style={styles.quickRangeRow}>
                        <TouchableOpacity
                          style={[
                            styles.quickRangeBtn,
                            repeatType === 'daily_hourly' && styles.quickRangeBtnActive,
                          ]}
                          onPress={() => setRepeatType('daily_hourly')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickRangeText}>Saatlik</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.quickRangeBtn,
                            repeatType === 'weekly' && styles.quickRangeBtnActive,
                          ]}
                          onPress={() => setRepeatType('weekly')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.quickRangeText}>Haftalık</Text>
                        </TouchableOpacity>
                      </View>

                      {repeatType === 'daily_hourly' ? (
                        <>
                          <Text style={styles.label}>Kaç gün tekrar etsin?</Text>
                          <TextInput
                            style={styles.input}
                            value={repeatDays}
                            onChangeText={(v) => setRepeatDays(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            placeholder="Örn: 30"
                            placeholderTextColor={MUTED}
                          />
                          <Text style={styles.label}>Saat aralığı (1-24)</Text>
                          <TextInput
                            style={styles.input}
                            value={repeatHourlyInterval}
                            onChangeText={(v) => setRepeatHourlyInterval(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            placeholder="Örn: 2"
                            placeholderTextColor={MUTED}
                          />
                          <Text style={styles.label}>Gün içi saat aralığı (HH:mm)</Text>
                          <View style={styles.quickRangeRow}>
                            <TextInput
                              style={[styles.input, { flex: 1, minWidth: 0 }]}
                              value={repeatDayStartClock}
                              onChangeText={setRepeatDayStartClock}
                              placeholder="09:00"
                              placeholderTextColor={MUTED}
                            />
                            <TextInput
                              style={[styles.input, { flex: 1, minWidth: 0 }]}
                              value={repeatDayEndClock}
                              onChangeText={setRepeatDayEndClock}
                              placeholder="18:00"
                              placeholderTextColor={MUTED}
                            />
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={styles.label}>Haftanın günleri</Text>
                          <View style={styles.quickRangeRow}>
                            {[
                              { v: 1, l: 'Pzt' },
                              { v: 2, l: 'Sal' },
                              { v: 3, l: 'Çar' },
                              { v: 4, l: 'Per' },
                              { v: 5, l: 'Cum' },
                              { v: 6, l: 'Cmt' },
                              { v: 7, l: 'Paz' },
                            ].map((d) => {
                              const active = (repeatWeeklyDays || []).includes(d.v)
                              return (
                                <TouchableOpacity
                                  key={d.v}
                                  style={[
                                    styles.quickRangeBtn,
                                    active && styles.quickRangeBtnActive,
                                  ]}
                                  onPress={() =>
                                    setRepeatWeeklyDays((prev) => {
                                      const p = Array.isArray(prev) ? prev : []
                                      return p.includes(d.v)
                                        ? p.filter((x) => x !== d.v)
                                        : [...p, d.v].sort((a, b) => a - b)
                                    })
                                  }
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.quickRangeText}>{d.l}</Text>
                                </TouchableOpacity>
                              )
                            })}
                          </View>
                          <Text style={styles.label}>Kaç hafta planlansın?</Text>
                          <TextInput
                            style={styles.input}
                            value={repeatWeeklyWeeks}
                            onChangeText={(v) => setRepeatWeeklyWeeks(v.replace(/\D/g, ''))}
                            keyboardType="number-pad"
                            placeholder="Örn: 8"
                            placeholderTextColor={MUTED}
                          />
                        </>
                      )}
                  </>
                ) : null}
              </>
            </View>
          ) : (!canAssignTask && currentStep === detailsStep) ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Referans fotoğraf</Text>
              <Text style={styles.label}>Referans fotoğraf (isteğe bağlı)</Text>
              {photo ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto}>
                    <Text style={styles.removePhotoText}>Kaldır</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoButtons}>
                  <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                    <Text style={styles.photoBtnText}>Kamera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null}

          <Modal
            visible={canAssignTask && pickerOpen && assignmentTarget === 'personeller'}
            transparent
            animationType="none"
            onRequestClose={() => setPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Atanacak personelleri seçin</Text>
                <FlatList
                  data={assignees}
                  extraData={manualSelectedAssigneeIds}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderPersonnelPickerItem}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.pickerEmpty}>Personel bulunamadı.</Text>}
                />
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && birimPickerOpen && assignmentTarget === 'birimler'}
            transparent
            animationType="none"
            onRequestClose={() => setBirimPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setBirimPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Birim seçin (çoklu)</Text>
                <FlatList
                  data={birimler}
                  extraData={selectedBirimIds}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderBirimPickerItem}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.pickerEmpty}>Birim bulunamadı.</Text>}
                />
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setBirimPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && isSiraliMode && siraliBirimPickerOpen}
            transparent
            animationType="none"
            onRequestClose={() => setSiraliBirimPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setSiraliBirimPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Birim seçin</Text>
                <FlatList
                  data={birimler}
                  extraData={siraliBirimId}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item: b }) => {
                    const active = String(b?.id) === String(siraliBirimId)
                    return (
                      <TouchableOpacity
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => {
                          setSiraliBirimId(String(b.id))
                          setSiraliBirimPickerOpen(false)
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.pickerRowText}>{b?.birim_adi || 'Birim'}</Text>
                        {active ? (
                          <Icon.Delivered size={16} color={kitPalette.accent[600]} strokeWidth={3} />
                        ) : null}
                      </TouchableOpacity>
                    )
                  }}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.pickerEmpty}>Birim bulunamadı.</Text>}
                />
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && templateAllowedInMode && templatePickerOpen}
            transparent
            animationType="none"
            onRequestClose={() => setTemplatePickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setTemplatePickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Görev şablonu seçin</Text>
                <FlatList
                  data={templates}
                  extraData={selectedTemplateId}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderTemplatePickerItem}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.pickerEmpty}>Şablon bulunamadı.</Text>}
                />
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && zincirGorevPickerOpen}
            transparent
            animationType="none"
            onRequestClose={() => setZincirGorevPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setZincirGorevPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Zincir göreve ekle</Text>
                <FlatList
                  data={zincirGorevPickerData}
                  extraData={zincirGorevSira}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderZincirGorevPickerItem}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    !assignees.length ? (
                      <Text style={styles.pickerEmpty}>Personel bulunamadı.</Text>
                    ) : (
                      <Text style={styles.pickerEmpty}>Tüm personel sıraya eklendi.</Text>
                    )
                  }
                />
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setZincirGorevPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && zincirOnayPickerOpen}
            transparent
            animationType="none"
            onRequestClose={() => setZincirOnayPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setZincirOnayPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Onay sırasına ekle</Text>
                <FlatList
                  data={zincirOnayPickerData}
                  extraData={zincirOnaySira}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderZincirOnayPickerItem}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    !approverCandidates.length ? (
                      <Text style={styles.pickerEmpty}>Personel bulunamadı.</Text>
                    ) : (
                      <Text style={styles.pickerEmpty}>Tüm personel sıraya eklendi.</Text>
                    )
                  }
                />
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setZincirOnayPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && isSiraliMode && siraliPickerOpen}
            transparent
            animationType="none"
            onRequestClose={() => setSiraliPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setSiraliPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>
                  {siraliPickerField === 'personel_id' ? 'Yapan personel seçin' : 'Denetimci seçin'}
                </Text>
                <FlatList
                  data={siraliPickerField === 'personel_id' ? assignees : approverCandidates}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => {
                    const selectedId =
                      siraliPickerField === 'personel_id'
                        ? siraliAdimlar?.[siraliPickerStepIdx]?.personel_id
                        : siraliAdimlar?.[siraliPickerStepIdx]?.denetimci_personel_id
                    const active = String(selectedId || '') === String(item?.id || '')
                    return (
                      <TouchableOpacity
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => {
                          if (siraliPickerStepIdx >= 0) patchSiraliAdim(siraliPickerStepIdx, siraliPickerField, item.id)
                          setSiraliPickerOpen(false)
                        }}
                      >
                        <Text style={styles.pickerRowText}>{formatName(item)}</Text>
                        {active ? (
                          <Icon.Delivered size={16} color={kitPalette.accent[600]} strokeWidth={3} />
                        ) : null}
                      </TouchableOpacity>
                    )
                  }}
                  getItemLayout={pickerRowGetItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={24}
                  windowSize={10}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={{ maxHeight: 420 }}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.pickerEmpty}>Denetim yetkisine sahip personel bulunamadı.</Text>}
                />
              </View>
            </Pressable>
          </Modal>

          {!canAssignTask && currentStep === reviewStep ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Özet ve Onay</Text>
              <View style={styles.infoHintBox}>
                <Text style={styles.infoHintText}>
                  Görev türü:{' '}
                  {!gorevModu
                    ? 'Seçilmedi'
                    : gorevModu === 'normal'
                    ? 'Standart görev'
                    : gorevModu === 'sablon_gorev'
                      ? 'Şablon görev'
                    : gorevModu === 'zincir_gorev'
                      ? 'Zincir görev'
                      : gorevModu === 'zincir_onay'
                        ? 'Zincir onay'
                        : gorevModu === 'sirali_gorev'
                          ? 'Sıralı görev'
                          : 'Zincir Görev + Zincir Onay'}
                </Text>
                <Text style={styles.infoHintText}>Başlık: {String(baslik || '').trim() || '—'}</Text>
                <Text style={styles.infoHintText}>
                  Atama:{' '}
                  {chainModeActive
                    ? `${zincirGorevSira.length} görev + ${zincirOnaySira.length} onay`
                    : isSiraliMode
                      ? `${siraliAdimlar.length} adım`
                    : `${(selectedAssigneeIds || []).length} kişi`}
                </Text>
              </View>

              {isSiraliMode ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {siraliAdimlar.map((adim, idx) => {
                    const yapan = assignees.find(
                      (p) => String(p?.id) === String(adim.personel_id),
                    )
                    const denetimci = approverCandidates.find(
                      (p) => String(p?.id) === String(adim.denetimci_personel_id),
                    )
                    const tags = []
                    if (adim.acil) tags.push('Acil')
                    if (adim.aciklama_zorunlu) tags.push('Açıklama zorunlu')
                    if (adim.foto_zorunlu) tags.push(`Foto ≥${adim.min_foto_sayisi || 1}`)
                    if (adim.video_zorunlu) {
                      tags.push(
                        `Video ≥${adim.min_video_sayisi || 1} · ≤${
                          adim.max_video_suresi_sn || 60
                        }sn`,
                      )
                    }
                    if (adim.belge_zorunlu) {
                      tags.push(`Belge ≥${adim.min_belge_sayisi || 1}`)
                    }
                    if (Number(adim.puan) > 0) tags.push(`${Number(adim.puan)} puan`)
                    return (
                      <View key={`review-sirali-${idx}`} style={styles.siraliReviewRow}>
                        <View style={styles.siraliReviewBadge}>
                          <Text style={styles.siraliReviewBadgeText}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.siraliReviewTitle} numberOfLines={1}>
                            {String(adim.adim_baslik || `${idx + 1}. adım`).trim()}
                          </Text>
                          <Text style={styles.siraliReviewMeta} numberOfLines={1}>
                            Yapan: {formatName(yapan)} · Denetimci: {formatName(denetimci)}
                          </Text>
                          <Text style={styles.siraliReviewMeta} numberOfLines={1}>
                            {idx === 0
                              ? `Başlangıç: ${adim.baslama_tarihi || '—'}`
                              : 'Başlangıç: (önceki adım onaylanınca otomatik)'}
                          </Text>
                          <Text style={styles.siraliReviewMeta} numberOfLines={1}>
                            Bitiş: {adim.bitis_tarihi || '—'}
                          </Text>
                          {tags.length ? (
                            <View style={styles.siraliReviewTagsRow}>
                              {tags.map((t, ti) => (
                                <View
                                  key={`review-sirali-${idx}-tag-${ti}`}
                                  style={styles.siraliReviewTag}
                                >
                                  <Text style={styles.siraliReviewTagText}>{t}</Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      </View>
                    )
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

      </TaskFlowScreenShell>

      {datePickerVisible ? (
          <Modal visible={datePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setDatePickerVisible(false)}>
              <View style={styles.datePickerSheet}>
                <Text style={styles.pickerTitle}>
                  {(datePickerField === 'start' || (datePickerField === 'sirali' && siraliDateField === 'baslama_tarihi'))
                    ? 'Başlangıç'
                    : 'Bitiş'}{' '}
                  - {datePickerStep === 'date' ? 'Tarih' : 'Saat'}
                </Text>
                <DateTimePicker
                  value={pickerDate}
                  mode={datePickerStep}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  minimumDate={
                    (() => {
                      const now = new Date()
                      if (datePickerField === 'sirali') {
                        const current = siraliAdimlar?.[siraliDateStepIdx] || {}
                        if (siraliDateField === 'bitis_tarihi') {
                          const start = parseInputToDate(current?.baslama_tarihi)
                          return start > now ? start : now
                        }
                        return now
                      }
                      if (datePickerField === 'end' && parseInputToDate(baslamaTarihiInput)) {
                        const start = parseInputToDate(baslamaTarihiInput)
                        if (!start) return now
                        return start > now ? start : now
                      }
                      return now
                    })()
                  }
                  onChange={handleDateTimeChange}
                />
                {Platform.OS === 'ios' && datePickerStep === 'date' ? (
                  <TouchableOpacity
                    style={styles.nextStepBtn}
                    onPress={() => setDatePickerStep('time')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextStepBtnText}>Saat Seçimine Geç</Text>
                  </TouchableOpacity>
                ) : null}
                {Platform.OS === 'ios' && datePickerStep === 'time' ? (
                  <TouchableOpacity
                    style={styles.nextStepBtn}
                    onPress={() => {
                      const formatted = formatDateTimeInput(pickerDate)
                      if (datePickerField === 'start') setBaslamaTarihiInput(formatted)
                      else if (datePickerField === 'end') setSonTarihInput(formatted)
                      else if (datePickerField === 'sirali' && siraliDateStepIdx >= 0) {
                        patchSiraliAdim(siraliDateStepIdx, siraliDateField, formatted)
                      }
                      setDatePickerVisible(false)
                      setDatePickerStep('date')
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextStepBtnText}>Tamam</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Pressable>
          </Modal>
        ) : null}

        <EvidenceCaptureModal
          visible={evidenceCameraOpen}
          mode="photo"
          maxVideoDurationSec={60}
          onClose={() => setEvidenceCameraOpen(false)}
          onPhotoComplete={handleEvidencePhotoCaptured}
          onVideoComplete={() => setEvidenceCameraOpen(false)}
        />
    </>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: kitPalette.background },
  page: { flex: 1, paddingHorizontal: kitSpacing.lg, paddingTop: kitSpacing.lg },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: kitSpacing.sm,
    marginBottom: kitSpacing.md,
    alignSelf: 'flex-start',
  },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  sectionCard: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    padding: kitSpacing.lg,
    marginBottom: kitSpacing.md,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    ...kitShadows.sm,
  },
  sectionTitle: {
    color: kitPalette.slate[800],
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    marginBottom: kitSpacing.md,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    color: kitPalette.slate[500],
    marginBottom: kitSpacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    backgroundColor: kitPalette.slate[50],
    borderRadius: kitRadii.lg,
    paddingHorizontal: kitSpacing.md,
    paddingVertical: kitSpacing.md,
    minHeight: 48,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    color: kitPalette.slate[800],
    marginBottom: kitSpacing.md,
  },
  infoHintBox: {
    backgroundColor: kitPalette.primary[50],
    borderRadius: kitRadii.lg,
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
    padding: kitSpacing.md,
  },
  infoHintText: {
    color: kitPalette.primary[800],
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  photoWrap: { marginBottom: 20 },
  photoPreview: { width: '100%', height: 200, borderRadius: Layout.borderRadius.lg, backgroundColor: Colors.surface },
  removePhotoBtn: { marginTop: 8 },
  removePhotoText: { fontSize: Typography.body.fontSize, color: Colors.error, fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  photoBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Layout.borderRadius.lg,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  photoBtnText: { fontSize: Typography.body.fontSize, fontWeight: '600', color: CORPORATE_BLUE },
  saveBtn: {
    backgroundColor: kitPalette.accent[500],
    paddingVertical: 16,
    borderRadius: kitRadii.pill,
    alignItems: 'center',
    marginTop: kitSpacing.sm,
    ...kitShadows.accent,
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: kitPalette.surface,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.2,
  },
  mobileStepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    padding: kitSpacing.lg,
  },
  mobileStepPill: {
    borderRadius: kitRadii.pill,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    backgroundColor: kitPalette.surface,
    paddingHorizontal: kitSpacing.md,
    paddingVertical: 7,
  },
  mobileStepPillActive: {
    backgroundColor: kitPalette.primary[700],
    borderColor: kitPalette.primary[700],
  },
  mobileStepPillDone: {
    backgroundColor: kitPalette.success[50],
    borderColor: kitPalette.success[500],
  },
  mobileStepPillText: {
    color: kitPalette.slate[500],
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  mobileStepPillTextActive: {
    color: kitPalette.surface,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  mobileStepPillTextDone: { color: kitPalette.success[700] },
  wizardNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: kitSpacing.md,
    gap: kitSpacing.md,
  },
  wizardBackBtn: {
    minWidth: 120,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii.pill,
    paddingVertical: 14,
  },
  wizardBackBtnText: {
    color: kitPalette.slate[800],
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  wizardNextBtn: {
    minWidth: 120,
    alignItems: 'center',
    backgroundColor: kitPalette.primary[700],
    borderRadius: kitRadii.pill,
    paddingVertical: 14,
    ...kitShadows.primary,
  },
  wizardNextBtnText: {
    color: kitPalette.surface,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  siraliCard: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: Layout.borderRadius.lg,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 4,
  },
  siraliHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  siraliHeaderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.alpha.indigo10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  siraliHeaderBadgeText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  siraliHeaderTitle: {
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  siraliHeaderHint: {
    color: MUTED,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  siraliRemoveBtn: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: Layout.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  siraliRemoveBtnText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: Typography.caption.fontSize,
  },
  siraliGroupLabel: {
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Layout.borderRadius.sm,
    backgroundColor: Colors.alpha.gray08 ?? '#f8fafc',
    color: CORPORATE_BLUE,
    fontWeight: '800',
    fontSize: Typography.caption.fontSize,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  siraliAutoStartBox: {
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    backgroundColor: Colors.alpha.gray08 ?? '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  siraliAutoStartText: {
    color: MUTED,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    lineHeight: 18,
  },
  siraliDateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  siraliTabsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  siraliTab: {
    borderRadius: Layout.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  siraliTabActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo10,
  },
  siraliTabText: {
    color: CORPORATE_BLUE,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  siraliTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  siraliTabTextActive: {
    color: Colors.primary,
  },
  siraliTitle: {
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
    marginBottom: 8,
  },
  siraliReviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.surface,
  },
  siraliReviewBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.alpha.indigo10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  siraliReviewBadgeText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.caption.fontSize,
  },
  siraliReviewTitle: {
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  siraliReviewMeta: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  siraliReviewTagsRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  siraliReviewTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Layout.borderRadius.full,
    backgroundColor: Colors.alpha.gray08 ?? '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
  },
  siraliReviewTagText: {
    color: CORPORATE_BLUE,
    fontSize: 10,
    fontWeight: '700',
  },

  pickerButton: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    marginBottom: 14,
  },
  quickRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickRangeBtn: {
    flex: 1,
    backgroundColor: Colors.alpha.indigo10,
    borderRadius: Layout.borderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.alpha.indigo15,
  },
  quickRangeBtnActive: {
    backgroundColor: Colors.alpha.indigo20,
    borderColor: Colors.primary,
  },
  quickRangeText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  dateBox: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  dateBoxText: {
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  datePickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  nextStepBtn: {
    marginTop: 10,
    backgroundColor: Colors.accent,
    borderRadius: Layout.borderRadius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  nextStepBtnText: {
    color: Colors.surface,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  pickerButtonText: { color: CORPORATE_BLUE, fontWeight: '600', fontSize: Typography.body.fontSize },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: Colors.alpha.black45,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  pickerTitle: { fontSize: Typography.body.fontSize, fontWeight: '900', color: CORPORATE_BLUE, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    marginBottom: 10,
  },
  pickerRowActive: { borderColor: INDIGO_600, backgroundColor: Colors.alpha.indigo10 },
  pickerRowText: { color: CORPORATE_BLUE, fontWeight: '700', fontSize: Typography.body.fontSize, flex: 1, marginRight: 10 },
  pickerRowCheck: { color: INDIGO_600, fontWeight: '900' },
  pickerEmpty: { color: MUTED, textAlign: 'center', paddingVertical: 16 },
  targetChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  targetChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Layout.borderRadius.full,
    paddingVertical: 8,
  },
  targetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  targetChipText: {
    color: Colors.mutedText,
    fontWeight: '700',
    fontSize: Typography.caption.fontSize,
  },
  targetChipTextActive: {
    color: Colors.surface,
  },
  targetChipDisabled: {
    opacity: 0.42,
  },
  modeChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginBottom: kitSpacing.md,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginBottom: kitSpacing.md,
  },
  modeGridCard: {
    width: '47%',
    minHeight: 96,
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    backgroundColor: kitPalette.surface,
    padding: kitSpacing.md,
    flexGrow: 1,
    ...kitShadows.sm,
  },
  modeGridCardActive: {
    borderColor: kitPalette.primary[300],
    backgroundColor: kitPalette.primary[50],
    ...kitShadows.sm,
  },
  modeGridIcon: {
    width: 32,
    height: 32,
    borderRadius: kitRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kitPalette.slate[100],
    marginBottom: 6,
  },
  modeGridTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: kitPalette.slate[800],
  },
  modeGridTitleActive: {
    color: kitPalette.primary[800],
  },
  modeGridSub: {
    fontSize: 11,
    color: kitPalette.slate[500],
    marginTop: 2,
  },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: kitSpacing.md,
    borderRadius: kitRadii.pill,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    backgroundColor: kitPalette.surface,
    minWidth: '47%',
    flexGrow: 1,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: kitPalette.primary[700],
    borderColor: kitPalette.primary[700],
    ...kitShadows.primary,
  },
  modeChipText: {
    color: kitPalette.slate[600],
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  modeChipTextActive: {
    color: kitPalette.surface,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  chainOrder: {
    fontWeight: '900',
    color: INDIGO_600,
    minWidth: 22,
    fontSize: Typography.caption.fontSize,
  },
  chainName: {
    flex: 1,
    fontWeight: '700',
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
  },
  chainIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  chainIconBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: CORPORATE_BLUE,
  },
  chainAddBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.indigo10,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo15,
    alignItems: 'center',
  },
  chainAddBtnText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  pickerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 10,
  },
  pickerDoneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pickerDoneText: {
    color: Colors.surface,
    fontWeight: '900',
    fontSize: Typography.body.fontSize,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: CORPORATE_BLUE,
  },
  switchHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted ?? '#64748B',
  },
  unauthorizedCard: {
    marginTop: 24,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  unauthorizedTitle: {
    color: Colors.text,
    fontSize: Typography.subheading.fontSize,
    fontWeight: '700',
    marginBottom: 8,
  },
  unauthorizedText: {
    color: Colors.mutedText,
    fontSize: Typography.body.fontSize,
  },
})
