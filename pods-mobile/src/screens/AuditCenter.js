import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Image,
  Alert,
} from 'react-native'
import EvidenceVideoPlayer from '../components/EvidenceVideoPlayer'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import PhotoViewerModal from '../components/PhotoViewerModal'
import VideoPreviewModal from '../components/VideoPreviewModal'
import { insertPointTransaction, normalizeTaskScore } from '../lib/pointsLedger'
import { isSiraliGorevTuru, isZincirGorevTuru, isZincirOnayTuru } from '../lib/zincirTasks'
import { TASK_STATUS, normalizeTaskStatus } from '../lib/taskStatus'
import { logTaskTimelineEvent } from '../lib/taskTimeline'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import {
  restrictBirimlerQueryByHierarchy,
  restrictQueryByPersonelBirimHierarchy,
} from '../lib/supabaseScope'
import { groupTasksByGrupId, collectAllAssigneeIds } from '../lib/groupTasks'
import {
  Screen,
  Heading,
  Text as KitText,
  Card as KitCard,
  StatusBadge,
  Button,
  IconBubble,
  EmptyState,
  SkeletonCard,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
} from '../ui'
import {
  ShieldCheck,
  CheckCircle2,
  Eye,
  Users as UsersIcon,
} from 'lucide-react-native'

const supabase = getSupabase()

const ThemeObj = Theme?.default ?? Theme
const { Colors, Radii, Typography, Spacing, Card, Shadows } = ThemeObj
const Layout = { borderRadius: Radii }
const SLATE_950 = Colors.background
const INDIGO_600 = Colors.accent
const EMERALD_500 = Colors.success
const ROSE_500 = Colors.error
const MUTED = Colors.gray

function isPermTruthy(permissions, key) {
  const v = permissions?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

function extractPhotoUrls(task) {
  if (!task) return []
  const raw =
    task.kanit_resim_ler ??
    task.fotograflar ??
    task.gorseller ??
    task.resimler ??
    task.fotograf_url ??
    task.foto_url ??
    task.photo_url ??
    task.images ??
    task.image_urls ??
    task.media

  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    try {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      }
    } catch {
      // ignore
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  return []
}

/** Kanıt dizisinde bazen string, bazen { url, uri } objesi gelir — Image / lightbox için tekilleştir. */
function normalizePhotoUrl(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') return entry.trim()
  if (typeof entry === 'object') {
    const u =
      entry.url ??
      entry.uri ??
      entry.src ??
      entry.path ??
      entry.signedUrl ??
      entry.signed_url ??
      null
    return u != null ? String(u).trim() : ''
  }
  return String(entry).trim()
}

function normalizePhotoUrlList(entries) {
  if (!Array.isArray(entries)) return []
  return entries.map(normalizePhotoUrl).filter(Boolean)
}

function normalizeKanitVideoEntry(v) {
  if (v == null) return null
  if (typeof v === 'string') {
    const u = v.trim()
    return u ? { url: u } : null
  }
  if (typeof v === 'object') {
    const u = v.url ?? v.uri ?? v.src ?? v.path ?? v.video_url ?? null
    const su = u != null ? String(u).trim() : ''
    if (!su) return null
    const ds = v.duration_sec ?? v.durationSec ?? v.duration
    return {
      url: su,
      duration_sec:
        ds != null && Number.isFinite(Number(ds))
          ? Number(ds)
          : null,
    }
  }
  return null
}

function extractKanitVideoRows(taskOrRow) {
  const raw =
    taskOrRow?.kanit_videolar ??
    taskOrRow?.videolar ??
    taskOrRow?.videos ??
    taskOrRow?.video_urls ??
    taskOrRow?.video_url ??
    null
  if (raw == null) return []
  let arr = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) arr = parsed
      else if (typeof parsed === 'string' || (typeof parsed === 'object' && parsed)) arr = [parsed]
    } catch {
      arr = [t]
    }
  } else if (typeof raw === 'object') {
    arr = [raw]
  }
  return arr.map(normalizeKanitVideoEntry).filter(Boolean)
}

function getStatusVisual(durum) {
  const status = normalizeTaskStatus(durum)
  const d = String(status || '').toLowerCase()
  if (status === TASK_STATUS.RESUBMITTED || d.includes('tekrar')) {
    return { label: TASK_STATUS.RESUBMITTED, bg: Colors.alpha.indigo10, text: Colors.accent }
  }
  if (status === TASK_STATUS.PENDING_APPROVAL || d.includes('onay bekliyor')) {
    return { label: TASK_STATUS.PENDING_APPROVAL, bg: Colors.alpha.gray20, text: Colors.primary }
  }
  if (status === TASK_STATUS.APPROVED || d.includes('tamam') || d === 'onaylandı') {
    return { label: TASK_STATUS.APPROVED, bg: Colors.alpha.emerald10, text: Colors.success }
  }
  if (status === TASK_STATUS.REJECTED || d.includes('onaylanmad') || d.includes('redd')) {
    return { label: TASK_STATUS.REJECTED, bg: Colors.alpha.rose10, text: Colors.error }
  }
  if (d.includes('gecik')) {
    return { label: 'Gecikmiş', bg: Colors.alpha.rose10, text: Colors.error }
  }
  return { label: String(status || durum || 'Durum'), bg: Colors.alpha.gray20, text: MUTED }
}

function cleanPersonelNote(note) {
  const s = String(note || '')
  // Eski kayıtlarda checklist notu "CHECKLIST:" ile prefixlenebiliyordu.
  return s.replace(/^CHECKLIST:\s*/i, '').trim()
}

function formatTaskTypeLabel(task) {
  if (!task) return 'Görev'
  if (task?.is_sablon_id) return 'Checklist'
  const t = String(task?.gorev_turu || '').trim()
  switch (t) {
    case 'sirali_gorev':
      return 'Sıralı Görev'
    case 'zincir_gorev':
      return 'Zincir Görev'
    case 'zincir_onay':
      return 'Zincir Onay'
    case 'zincir_gorev_ve_onay':
      return 'Zincir Görev + Zincir Onay'
    default:
      return 'Standart Görev'
  }
}

function formatDateShort(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return null
  }
}

function formatDateTimeShort(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

function getStepStatusPill(status) {
  const s = String(status || '').toLowerCase().trim()
  if (!s) return { label: '—', bg: Colors.alpha.gray20, fg: MUTED }
  if (s === 'onaylandi' || s === 'tamamlandi' || s.includes('tamam')) {
    return { label: 'Onaylandı', bg: Colors.alpha.emerald10, fg: Colors.success }
  }
  if (s === 'reddedildi' || s.includes('redd')) {
    return { label: 'Reddedildi', bg: Colors.alpha.rose10, fg: Colors.error }
  }
  if (s === 'onay_bekliyor' || s.includes('onay')) {
    return { label: 'Onay bekliyor', bg: Colors.alpha.amber10, fg: kitPalette.warning[700] }
  }
  if (s === 'aktif' || s.includes('aktif')) {
    return { label: 'Aktif', bg: Colors.alpha.indigo10, fg: Colors.primary }
  }
  if (s === 'sira_bekliyor' || s.includes('sıra') || s.includes('sira')) {
    return { label: 'Sırada', bg: Colors.alpha.gray20, fg: MUTED }
  }
  return { label: status, bg: Colors.alpha.gray20, fg: MUTED }
}

export default function AuditCenter() {
  const navigation = useNavigation()
  const route = useRoute()
  const insets = useSafeAreaInsets()
  const { personel, permissions, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const PAGE_SIZE = 20
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [items, setItems] = React.useState([])
  const [hasMore, setHasMore] = React.useState(true)
  const [pageOffset, setPageOffset] = React.useState(0)
  const [personNameMap, setPersonNameMap] = React.useState({})
  const [unitNameMap, setUnitNameMap] = React.useState({})

  const [activeTask, setActiveTask] = React.useState(null)
  const [activeSiraliAuditStep, setActiveSiraliAuditStep] = React.useState(null)
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  // Tıklanan fotoğrafa göre dinamik lightbox: {images, index, title}.
  // Eski tek dizi `evidencePhotos` zincir adımlarının fotolarını içermediği için indeks -1 dönerek boş lightbox açıyordu.
  const [lightbox, setLightbox] = React.useState(null)
  /** Kanıt modalı açıkken tam ekran video: { uri, title?, durationSec? } */
  const [videoPreview, setVideoPreview] = React.useState(null)
  const [chainGorevSteps, setChainGorevSteps] = React.useState([])
  const [rejectReason, setRejectReason] = React.useState('')
  const [approvePointInput, setApprovePointInput] = React.useState('')
  const [checkDecisions, setCheckDecisions] = React.useState({})
  // Madde-bazlı red notu: { [questionId]: 'kısa not' }. 'Reddet' seçilen her madde
  // için zorunlu doldurulur; rejectTask sırasında özet `red_nedeni` alanına da yazılır.
  const [checkRejectNotes, setCheckRejectNotes] = React.useState({})
  const initialTaskId = route?.params?.taskId

  const canApprove =
    isPermTruthy(permissions, 'gorev_onayla') ||
    isPermTruthy(permissions, 'denetim.onayla') ||
    isPermTruthy(permissions, 'is_admin') ||
    isPermTruthy(permissions, 'is_manager')
  const isSiraliActiveTask = isSiraliGorevTuru(activeTask?.gorev_turu)
  const isSelfAssignedActiveTask =
    String(activeTask?.sorumlu_personel_id || '') === String(personel?.id || '')
  // Sıralı görevde self-check ana görev sorumlusuna göre değil, aktif adıma göre yapılır.
  const canApproveActiveTask = canApprove && (isSiraliActiveTask ? true : !isSelfAssignedActiveTask)
  const canReject =
    isPermTruthy(permissions, 'denetim.reddet') ||
    isPermTruthy(permissions, 'gorev_onayla') ||
    isPermTruthy(permissions, 'denetim.onayla') ||
    isPermTruthy(permissions, 'is_admin') ||
    isPermTruthy(permissions, 'is_manager')
  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )

  const birimHierarchyCtx = useMemo(
    () => ({
      isSystemAdmin,
      isTopCompanyScope,
      accessibleUnitIds: Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : [],
      fallbackBirimId: personel?.birim_id ?? null,
    }),
    [isSystemAdmin, isTopCompanyScope, personel?.accessibleUnitIds, personel?.birim_id],
  )

  const load = useCallback(
    async (nextOffset = 0, reset = false) => {
    if (!personel?.ana_sirket_id) {
      setItems([])
      setLoading(false)
      return
    }
    const hasHierarchyScope =
      isSystemAdmin ||
      isTopCompanyScope ||
      (Array.isArray(personel?.accessibleUnitIds) && personel.accessibleUnitIds.length > 0) ||
      (personel?.birim_id != null && String(personel.birim_id).trim() !== '')
    if (!hasHierarchyScope) {
      setItems([])
      setLoading(false)
      return
    }
    if (reset) {
      setLoading(true)
      setRefreshing(true)
      setItems([])
      setHasMore(true)
      setPageOffset(0)
    } else {
      setLoadingMore(true)
    }
    try {
      const filterByOnaySirasi = async (rows) => {
        const list = Array.isArray(rows) ? rows : []
        const zincirOnayIds = list.filter((r) => isZincirOnayTuru(r?.gorev_turu)).map((r) => r?.id).filter(Boolean)
        const zincirGorevIds = list.filter((r) => isZincirGorevTuru(r?.gorev_turu)).map((r) => r?.id).filter(Boolean)
        const siraliIds = list.filter((r) => isSiraliGorevTuru(r?.gorev_turu)).map((r) => r?.id).filter(Boolean)

        const [onayRes, gorevRes, siraliRes] = await Promise.all([
          zincirOnayIds.length
            ? supabase
                .from('isler_zincir_onay_adimlari')
                .select('is_id, adim_no, onaylayici_personel_id')
                .in('is_id', zincirOnayIds)
            : Promise.resolve({ data: [] }),
          zincirGorevIds.length
            ? supabase
                .from('isler_zincir_gorev_adimlari')
                .select('is_id, adim_no, personel_id')
                .in('is_id', zincirGorevIds)
            : Promise.resolve({ data: [] }),
          siraliIds.length
            ? supabase
                .from('isler_zincir_gorev_adimlari')
                .select('is_id, adim_no, denetimci_personel_id, adim_durum')
                .in('is_id', siraliIds)
            : Promise.resolve({ data: [] }),
        ])

        const onayByTask = {}
        for (const s of onayRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!onayByTask[key]) onayByTask[key] = []
          onayByTask[key].push(s)
        }
        const gorevByTask = {}
        for (const s of gorevRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!gorevByTask[key]) gorevByTask[key] = []
          gorevByTask[key].push(s)
        }
        const siraliByTask = {}
        for (const s of siraliRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!siraliByTask[key]) siraliByTask[key] = []
          siraliByTask[key].push(s)
        }

        return list.filter((task) => {
          const taskType = task?.gorev_turu
          const taskId = String(task?.id || '')
          const durumLower = String(normalizeTaskStatus(task?.durum) || '').toLowerCase()
          const inAuditQueue =
            durumLower.includes('onay bekliyor') ||
            durumLower.includes('onay_bekliyor') ||
            durumLower.includes('tekrar gönderildi') ||
            durumLower.includes('tekrar gonderildi')
          if (isZincirGorevTuru(taskType)) {
            if (inAuditQueue) return true
            const activeGorevAdim = Number(task?.zincir_aktif_adim) || 1
            const gorevStep = (gorevByTask[taskId] || []).find((s) => Number(s?.adim_no) === activeGorevAdim)
            if (gorevStep && String(gorevStep.personel_id || '') !== String(personel?.id || '')) return false
          }
          if (isZincirOnayTuru(taskType)) {
            const activeOnayAdim = Number(task?.zincir_onay_aktif_adim) || 1
            const onayStep = (onayByTask[taskId] || []).find((s) => Number(s?.adim_no) === activeOnayAdim)
            if (onayStep && String(onayStep.onaylayici_personel_id || '') !== String(personel?.id || '')) return false
          }
          if (isSiraliGorevTuru(taskType)) {
            const activeAdim = Number(task?.zincir_aktif_adim) || 1
            const step = (siraliByTask[taskId] || []).find((s) => Number(s?.adim_no) === activeAdim)
            if (!step) return false
            const status = String(step?.adim_durum || '').toLowerCase()
            if (status !== 'onay_bekliyor') return false
            if (String(step?.denetimci_personel_id || '') !== String(personel?.id || '')) return false
          }
          return true
        })
      }

      const selectWithGroup =
        'id, baslik, is_sablon_id, durum, aciklama, personel_tamamlama_notu, puan, grup_id, sorumlu_personel_id, ana_sirket_id, birim_id, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_resim_ler, kanit_videolar, checklist_cevaplari, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim'
      const selectNoGroup =
        'id, baslik, is_sablon_id, durum, aciklama, personel_tamamlama_notu, puan, sorumlu_personel_id, ana_sirket_id, birim_id, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_resim_ler, kanit_videolar, checklist_cevaplari, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim'

      let q = supabase
        .from('isler')
        .select(selectWithGroup)
        .in('durum', [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED, 'onay_bekliyor', 'tekrar_gonderildi'])
        .order('created_at', { ascending: false })

      q = q.eq('ana_sirket_id', personel.ana_sirket_id)
      q = restrictQueryByPersonelBirimHierarchy(q, birimHierarchyCtx)

      q = q.range(nextOffset, nextOffset + PAGE_SIZE - 1)
      const { data, error } = await q
      if (error) {
        if (error?.code === '42703') {
          const fallbacks = [
            selectNoGroup,
            selectNoGroup.replace(', personel_tamamlama_notu', ''),
          ]
          for (const sel of fallbacks) {
            let q2 = supabase
              .from('isler')
              .select(sel)
              .in('durum', [TASK_STATUS.PENDING_APPROVAL, TASK_STATUS.RESUBMITTED, 'onay_bekliyor', 'tekrar_gonderildi'])
              .eq('ana_sirket_id', personel.ana_sirket_id)
            q2 = restrictQueryByPersonelBirimHierarchy(q2, birimHierarchyCtx)
            q2 = q2.range(nextOffset, nextOffset + PAGE_SIZE - 1)
            const { data: data2, error: error2 } = await q2
            if (!error2) {
              const filtered2 = await filterByOnaySirasi(data2 || [])
              const { items: list } = groupTasksByGrupId(filtered2)
              setHasMore((data2 || []).length === PAGE_SIZE)
              setItems((prev) => (reset ? list : [...prev, ...list]))
              setPageOffset(nextOffset + (data2 || []).length)
              return
            }
          }
        }

        if (__DEV__) console.warn('AuditCenter load error', error)
        setItems([])
        return
      }
      const filtered = await filterByOnaySirasi(data || [])
      // Havuz görev (grup_id): denetim listesi yalnız PENDING_APPROVAL/RESUBMITTED satırları
      // getirdiğinden, aynı grup_id'deki ASSIGNED diğer üye satırları eksik kalıyor. Eksik üyeleri
      // ek bir sorguyla çekip listeye ekliyoruz; ardından `groupTasksByGrupId` hepsini tek karta
      // sıkıştırıyor (temsilci yine pending satır olur, diğerleri sadece "sorumlular" rozetinde
      // görünür).
      const grupIdsForEnrichment = [
        ...new Set((filtered || []).map((r) => r?.grup_id).filter(Boolean)),
      ]
      let enriched = filtered
      if (grupIdsForEnrichment.length) {
        const { data: groupMates } = await supabase
          .from('isler')
          .select(
            'id, baslik, is_sablon_id, durum, aciklama, personel_tamamlama_notu, puan, grup_id, sorumlu_personel_id, ana_sirket_id, birim_id, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_resim_ler, kanit_videolar, checklist_cevaplari, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim',
          )
          .in('grup_id', grupIdsForEnrichment)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        if (Array.isArray(groupMates) && groupMates.length) {
          const seen = new Set(filtered.map((r) => String(r?.id)))
          for (const r of groupMates) {
            if (!seen.has(String(r?.id))) {
              enriched = [...enriched, r]
              seen.add(String(r?.id))
            }
          }
        }
      }
      const { items: list } = groupTasksByGrupId(enriched)
      // Personel adlarını çekerken grup üyelerinin tümünü dahil et (kart üzerinde "Sorumlular" rozeti için).
      const ids = collectAllAssigneeIds(list)
      const unitIds = [
        ...new Set(
          list.flatMap((x) => {
            const own = x?.birim_id ? [x.birim_id] : []
            const grouped = (x?._groupRows || [])
              .map((r) => r?.birim_id)
              .filter(Boolean)
            return [...own, ...grouped]
          }),
        ),
      ]
      let map = {}
      let unitsMap = {}
      if (ids.length) {
        let peopleQuery = supabase
          .from('personeller')
          .select('id, ad, soyad')
          .in('id', ids)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        peopleQuery = restrictQueryByPersonelBirimHierarchy(peopleQuery, birimHierarchyCtx)
        const { data: peopleData } = await peopleQuery
        ;(peopleData || []).forEach((p) => {
          map[String(p.id)] = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim() || 'Personel'
        })
      }
      if (unitIds.length) {
        let birimQuery = supabase
          .from('birimler')
          .select('id, birim_adi')
          .in('id', unitIds)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        birimQuery = restrictBirimlerQueryByHierarchy(birimQuery, birimHierarchyCtx)
        const { data: unitData } = await birimQuery
        ;(unitData || []).forEach((u) => {
          unitsMap[String(u.id)] = u?.birim_adi || 'Birim'
        })
      }
      setPersonNameMap((prev) => ({ ...prev, ...map }))
      setUnitNameMap((prev) => ({ ...prev, ...unitsMap }))
      setHasMore(list.length === PAGE_SIZE)
      setItems((prev) => (reset ? list : [...prev, ...list]))
      setPageOffset(nextOffset + list.length)
    } catch (e) {
      if (__DEV__) console.warn('AuditCenter load exception', e)
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
    },
    [personel?.ana_sirket_id, personel?.accessibleUnitIds, birimHierarchyCtx, PAGE_SIZE, isSystemAdmin, isTopCompanyScope],
  )

  const onRefresh = useCallback(() => {
    load(0, true)
  }, [load])

  useEffect(() => {
    load(0, true)
  }, [load])

  useEffect(() => {
    if (!initialTaskId) return
    const match = items.find((x) => String(x?.id) === String(initialTaskId))
    if (match) {
      openEvidence(match)
      navigation?.setParams?.({ taskId: undefined, openEvidence: undefined })
      return
    }
    if (!items?.length) return
    const loadDirect = async () => {
      if (!personel?.ana_sirket_id) return
      let directQ = supabase
        .from('isler')
        .select('id, baslik, is_sablon_id, durum, aciklama, personel_tamamlama_notu, puan, grup_id, sorumlu_personel_id, ana_sirket_id, birim_id, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_resim_ler, kanit_videolar, checklist_cevaplari, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim')
        .eq('id', initialTaskId)
        .eq('ana_sirket_id', personel.ana_sirket_id)
      directQ = restrictQueryByPersonelBirimHierarchy(directQ, birimHierarchyCtx)
      const { data } = await directQ.maybeSingle()
      if (data) {
        openEvidence(data)
        navigation?.setParams?.({ taskId: undefined, openEvidence: undefined })
      }
    }
    loadDirect()
  }, [initialTaskId, items, openEvidence, navigation, personel?.ana_sirket_id, birimHierarchyCtx])

  const openEvidence = useCallback((task) => {
    setActiveTask(task)
    setRejectReason('')
    const checklistRows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const nextDecisions = {}
    const nextNotes = {}
    for (let i = 0; i < checklistRows.length; i++) {
      const row = checklistRows[i] || {}
      const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
      const raw = String(row?.denetim_karari || 'accept').toLowerCase()
      nextDecisions[qid] = raw.includes('reject') ? 'reject' : 'accept'
      const prevNote = String(row?.denetim_red_notu || '').trim()
      if (prevNote) nextNotes[qid] = prevNote
    }
    setCheckDecisions(nextDecisions)
    setCheckRejectNotes(nextNotes)
    const initialPoint = Number(task?.puan)
    setApprovePointInput(Number.isFinite(initialPoint) && initialPoint > 0 ? String(initialPoint) : '')
    setLightbox(null)
    setVideoPreview(null)
    setEvidenceOpen(true)
  }, [])

  useEffect(() => {
    const loadActiveSiraliStep = async () => {
      if (!activeTask?.id || !isSiraliGorevTuru(activeTask?.gorev_turu)) {
        setActiveSiraliAuditStep(null)
        return
      }
      const activeAdimNo = Number(activeTask?.zincir_aktif_adim) || 1
      const { data } = await supabase
        .from('isler_zincir_gorev_adimlari')
        .select('id, is_id, adim_no, personel_id, denetimci_personel_id, adim_durum, aciklama, kanit_resim_ler, kanit_videolar')
        .eq('is_id', activeTask.id)
        .eq('adim_no', activeAdimNo)
        .maybeSingle()
      setActiveSiraliAuditStep(data || null)
      const stepPersonId = data?.personel_id
      if (stepPersonId) {
        const key = String(stepPersonId)
        if (!personNameMap[key]) {
          const { data: p } = await supabase
            .from('personeller')
            .select('id, ad, soyad')
            .eq('id', stepPersonId)
            .maybeSingle()
          if (p?.id) {
            const full = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim() || 'Personel'
            setPersonNameMap((prev) => ({ ...prev, [key]: full }))
          }
        }
      }
    }
    loadActiveSiraliStep()
  }, [activeTask?.id, activeTask?.gorev_turu, activeTask?.zincir_aktif_adim, personNameMap])

  useEffect(() => {
    const loadChainGorevSteps = async () => {
      if (!activeTask?.id || !(isZincirGorevTuru(activeTask?.gorev_turu) || isSiraliGorevTuru(activeTask?.gorev_turu))) {
        setChainGorevSteps([])
        return
      }
      const { data } = await supabase
        .from('isler_zincir_gorev_adimlari')
        .select('id, is_id, adim_no, personel_id, denetimci_personel_id, durum, adim_durum, kanit_resim_ler, kanit_videolar, aciklama')
        .eq('is_id', activeTask.id)
        .order('adim_no', { ascending: true })
      const steps = data || []
      setChainGorevSteps(steps)

      const stepPersonIds = Array.from(
        new Set(
          steps
            .map((s) => s?.personel_id)
            .filter(Boolean)
            .map((x) => String(x)),
        ),
      )
      if (stepPersonIds.length) {
        const { data: peopleData } = await supabase
          .from('personeller')
          .select('id, ad, soyad')
          .in('id', stepPersonIds)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        const map = {}
        ;(peopleData || []).forEach((p) => {
          map[String(p.id)] = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim() || 'Personel'
        })
        if (Object.keys(map).length) {
          setPersonNameMap((prev) => ({ ...prev, ...map }))
        }
      }
    }
    loadChainGorevSteps()
  }, [activeTask?.id, activeTask?.gorev_turu, personel?.ana_sirket_id])

  const closeEvidence = useCallback(() => {
    setEvidenceOpen(false)
    setActiveTask(null)
    setActiveSiraliAuditStep(null)
    setRejectReason('')
    setApprovePointInput('')
    setChainGorevSteps([])
    setLightbox(null)
    setVideoPreview(null)
    setCheckDecisions({})
    setCheckRejectNotes({})
  }, [])

  /** Foto lightbox açılmadan önce video önizlemesini kapat (iç içe Modal / dokunma). */
  const openEvidencePhotoGallery = useCallback((payload) => {
    setVideoPreview(null)
    setLightbox(payload)
  }, [])

  const rejectChainStep = useCallback(async (step) => {
    if (!activeTask || !step?.id) return
    if (!canReject) return
    const reason = (rejectReason || '').trim()
    if (!reason) {
      Alert.alert('Red nedeni gerekli', 'Lütfen adım reddi için bir neden yazın.')
      return
    }
    try {
      const { error: stepErr } = await supabase
        .from('isler_zincir_gorev_adimlari')
        .update({
          durum: 'reddedildi',
          aciklama: reason,
        })
        .eq('id', step.id)
      if (stepErr) throw stepErr

      let taskUpd = supabase
        .from('isler')
        .update({
          durum: TASK_STATUS.REJECTED,
          red_nedeni: reason,
          sorumlu_personel_id: step.personel_id || activeTask?.sorumlu_personel_id || null,
          zincir_aktif_adim: Number(step.adim_no) || 1,
        })
        .eq('id', activeTask.id)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      taskUpd = restrictQueryByPersonelBirimHierarchy(taskUpd, birimHierarchyCtx)
      const { error: taskErr } = await taskUpd
      if (taskErr) throw taskErr
      await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, `chain-step-reject:${reason}`)

      Alert.alert('Başarılı', 'Zincir görev adımı reddedildi ve görev personele geri düştü.')
      closeEvidence()
      await load(0, true)
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Adım reddedilemedi.')
    }
  }, [activeTask, canReject, rejectReason, personel?.ana_sirket_id, birimHierarchyCtx, closeEvidence, load])

  const approveTask = useCallback(async () => {
    if (!activeTask) return
    if (!canApproveActiveTask) {
      Alert.alert('Yetki yok', 'Görevi yapan kişi kendi görevini onaylayamaz.')
      return
    }

    try {
      if (isSiraliGorevTuru(activeTask?.gorev_turu) && !activeTask?.is_sablon_id) {
        const activeAdimNo = Number(activeTask?.zincir_aktif_adim) || 1
        const { data: activeSiraliStep, error: activeSiraliStepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('id, adim_no, personel_id, denetimci_personel_id, adim_durum')
          .eq('is_id', activeTask.id)
          .eq('adim_no', activeAdimNo)
          .maybeSingle()
        if (activeSiraliStepErr) {
          Alert.alert('Hata', activeSiraliStepErr.message || 'Aktif sıralı adım okunamadı.')
          return
        }
        if (!activeSiraliStep) {
          Alert.alert('Hata', 'Aktif sıralı adım bulunamadı.')
          return
        }
        if (String(activeSiraliStep?.denetimci_personel_id || '') !== String(personel?.id || '')) {
          Alert.alert('Sıra başka denetimcide', 'Bu adımın denetimi şu an sizde değil.')
          return
        }
        if (String(activeSiraliStep?.adim_durum || '').toLowerCase() !== 'onay_bekliyor') {
          Alert.alert('Adım uygun değil', 'Bu adım henüz onay beklemiyor.')
          return
        }
        if (String(activeSiraliStep?.personel_id || '') === String(personel?.id || '')) {
          Alert.alert('Yetki yok', 'Aynı adımı yapan kişi o adımı onaylayamaz.')
          return
        }
        const { error: rpcSiraliErr } = await supabase.rpc('rpc_sirali_adim_onayla_reddet', {
          p_is_id: activeTask.id,
          p_adim_no: activeAdimNo,
          p_karar: 'onayla',
          p_yorum: null,
        })
        if (rpcSiraliErr) {
          Alert.alert('Hata', rpcSiraliErr.message || 'Sıralı adım onaylanamadı.')
          return
        }
        await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, `sirali-step-approve:${activeAdimNo}`)
        closeEvidence()
        await load(0, true)
        Alert.alert('Başarılı', 'Sıralı görev adımı onaylandı.')
        return
      }

      const entered = Number.parseFloat(String(approvePointInput || '').replace(',', '.'))
      const puan = Math.round(normalizeTaskScore(Number.isFinite(entered) ? entered : activeTask.puan))
      if (!Number.isFinite(puan) || puan <= 0) {
        Alert.alert('Puan gerekli', 'Onaylamak için geçerli bir puan girin.')
        return
      }

      let chainOnayRows = []
      if (activeTask?.gorev_turu && isZincirOnayTuru(activeTask.gorev_turu)) {
        const { data: orows } = await supabase
          .from('isler_zincir_onay_adimlari')
          .select('id, adim_no, onaylayici_personel_id, durum')
          .eq('is_id', activeTask.id)
          .order('adim_no', { ascending: true })
        chainOnayRows = orows || []
      }
      const activeOnayAdim = Number(activeTask?.zincir_onay_aktif_adim) || 1
      const currentOnayStep = chainOnayRows.find((r) => Number(r.adim_no) === activeOnayAdim)
      if (chainOnayRows.length && currentOnayStep) {
        if (String(currentOnayStep.onaylayici_personel_id) !== String(personel?.id)) {
          Alert.alert('Sıra başka onaylayıcıda', 'Bu görevde sıradaki onay sizde değil.')
          return
        }
      }

      const isChecklist = !!activeTask?.is_sablon_id
      let checklistUpdate = null
      if (isChecklist) {
        const rows = Array.isArray(activeTask?.checklist_cevaplari) ? activeTask.checklist_cevaplari : []
        const anyRejected = rows.some((row, i) => {
          const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
          return checkDecisions?.[qid] === 'reject'
        })
        if (anyRejected) {
          Alert.alert(
            'Reddedilen maddeler var',
            'Reddedilen madde varken görev onaylanamaz. Görevi geri göndermek için altta "Görevi Geri Gönder" düğmesine basın.',
          )
          return
        }
        const reviewedAt = new Date().toISOString()
        const reviewerId = personel?.id || null
        // Tüm maddelere kabul kararı + denetim damgası: personele döndüğünde her madde "Onaylandı"
        // olarak kilitli görünür ve yeniden cevaplanamaz.
        checklistUpdate = rows.map((row, i) => {
          const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
          return {
            ...row,
            denetim_karari: 'accept',
            denetim_red_notu: '',
            denetim_karari_at: reviewedAt,
            denetim_karari_by: reviewerId,
          }
        })
      }

      if (chainOnayRows.length && currentOnayStep) {
        const isLastOnay = activeOnayAdim >= chainOnayRows.length
        const { error: oErr } = await supabase
          .from('isler_zincir_onay_adimlari')
          .update({
            durum: 'onaylandi',
            onaylandi_at: new Date().toISOString(),
          })
          .eq('id', currentOnayStep.id)
        if (oErr) {
          Alert.alert('Onay hatası', oErr.message || 'Zincir onay kaydedilemedi')
          return
        }
        await insertPointTransaction({
          personelId: currentOnayStep.onaylayici_personel_id,
          delta: puan,
          gorevId: activeTask.id,
          gorevBaslik: activeTask?.baslik || 'Görev',
          islemTipi: 'TASK_APPROVED',
          aciklama: `Zincir onay adimi onayi: ${activeTask?.baslik || 'Görev'}`,
        })
        if (!isLastOnay) {
          const nextOnayStep = chainOnayRows.find((r) => Number(r.adim_no) === activeOnayAdim + 1)
          const nextOnayPersonId = nextOnayStep?.onaylayici_personel_id
          let nextOnayBirimId = null
          if (nextOnayPersonId) {
            const { data: nextOnayPerson } = await supabase
              .from('personeller')
              .select('id, birim_id')
              .eq('id', nextOnayPersonId)
              .maybeSingle()
            nextOnayBirimId = nextOnayPerson?.birim_id || null
          }
          const { error: advErr } = await supabase
            .from('isler')
            .update({
              zincir_onay_aktif_adim: activeOnayAdim + 1,
              sorumlu_personel_id: nextOnayPersonId || activeTask?.sorumlu_personel_id || null,
              birim_id: nextOnayBirimId,
            })
            .eq('id', activeTask.id)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          if (advErr) {
            Alert.alert('Hata', advErr.message || 'Sıra güncellenemedi')
            return
          }
          Alert.alert('Tamam', 'Onayınız kaydedildi; sıra bir sonraki onaylayıcıda.')
          await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, 'chain-approve-step')
          closeEvidence()
          await load(0, true)
          return
        }
      }

      // Grup modunda: bir görev onaylanınca aynı grup içindeki herkese puan ver ve hepsini tamamla.
      if (activeTask?.grup_id) {
        const { data: groupTasks } = await supabase
          .from('isler')
          .select('id, sorumlu_personel_id, baslik')
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          .eq('grup_id', activeTask.grup_id)
        const groupList = (groupTasks || []).filter((t) => t?.sorumlu_personel_id)

        for (const t of groupList) {
          await insertPointTransaction({
            personelId: t.sorumlu_personel_id,
            delta: puan,
            gorevId: t.id,
            gorevBaslik: t?.baslik || activeTask?.baslik || 'Görev',
            islemTipi: 'TASK_APPROVED',
            aciklama: `Grup onayı: ${activeTask?.baslik || 'Görev'}`,
          })
        }

        let approveGroupQuery = supabase
          .from('isler')
          .update({ durum: TASK_STATUS.APPROVED, puan })
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          .eq('grup_id', activeTask.grup_id)
        if (checklistUpdate) {
          let checklistUpd = supabase
            .from('isler')
            .update({ checklist_cevaplari: checklistUpdate })
            .eq('id', activeTask.id)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          checklistUpd = restrictQueryByPersonelBirimHierarchy(checklistUpd, birimHierarchyCtx)
          await checklistUpd
        }
        await approveGroupQuery
        await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, 'approve-group')
      } else {
        if (chainOnayRows.length) {
          let finishChainQuery = supabase
            .from('isler')
            .update({
              durum: TASK_STATUS.APPROVED,
              puan,
              ...(checklistUpdate ? { checklist_cevaplari: checklistUpdate } : {}),
            })
            .eq('id', activeTask.id)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          finishChainQuery = restrictQueryByPersonelBirimHierarchy(finishChainQuery, birimHierarchyCtx)
          await finishChainQuery
          closeEvidence()
          await load(0, true)
          return
        }
        const personelId = activeTask.sorumlu_personel_id
        const tx = await insertPointTransaction({
          personelId,
          delta: puan,
          gorevId: activeTask.id,
          gorevBaslik: activeTask?.baslik || 'Görev',
          islemTipi: 'TASK_APPROVED',
          aciklama: `Görev onayı: ${activeTask?.baslik || 'Görev'}`,
        })
        if (!tx.ok && __DEV__) {
          console.warn('Puan hareketi eklenemedi', tx.error)
        }

        let approveQuery = supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.APPROVED,
            puan,
            ...(checklistUpdate ? { checklist_cevaplari: checklistUpdate } : {}),
          })
          .eq('id', activeTask.id)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        approveQuery = restrictQueryByPersonelBirimHierarchy(approveQuery, birimHierarchyCtx)
        await approveQuery
        await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, 'approve')
      }

      closeEvidence()
      await load(0, true)
    } catch (e) {
      if (__DEV__) console.warn('AuditCenter approve error', e)
    }
  }, [activeTask, canApproveActiveTask, closeEvidence, load, personel?.ana_sirket_id, personel?.id, birimHierarchyCtx, approvePointInput, checkDecisions])

  const rejectTask = useCallback(async () => {
    if (!activeTask) return
    if (!canReject) {
      Alert.alert('Yetki yok', 'Bu işlemi yapma yetkiniz bulunmuyor.')
      return
    }

    const isChecklist = !!activeTask?.is_sablon_id
    const isSiraliAdhoc =
      isSiraliGorevTuru(activeTask?.gorev_turu) && !activeTask?.is_sablon_id

    let reason = (rejectReason || '').trim()
    /**
     * Checklist görevlerinde "genel red nedeni" alanı kapalıdır; denetimci her reddedilen
     * madde için ayrı not girer. Toplu `red_nedeni` kolonuna bu notların özet listesi yazılır.
     * En az bir madde reddedilmiş olmalı; her reddedilen maddenin notu boş bırakılamaz.
     */
    let perItemRejectNotes = null
    if (isChecklist) {
      const rows = Array.isArray(activeTask?.checklist_cevaplari)
        ? activeTask.checklist_cevaplari
        : []
      const rejectedEntries = []
      rows.forEach((row, i) => {
        const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
        const dec = String(checkDecisions?.[qid] || 'accept').toLowerCase()
        if (dec === 'reject') {
          const note = String(checkRejectNotes?.[qid] || '').trim()
          rejectedEntries.push({ qid, sira: i + 1, note })
        }
      })
      if (!rejectedEntries.length) {
        Alert.alert(
          'Reddedilen madde yok',
          'En az bir maddeyi reddetmeden görevi geri gönderemezsiniz.',
        )
        return
      }
      const missing = rejectedEntries.filter((e) => !e.note)
      if (missing.length) {
        Alert.alert(
          'Red nedeni eksik',
          `Reddedilen maddelerin tamamı için kısa bir red nedeni yazın (${missing.length} madde eksik).`,
        )
        return
      }
      perItemRejectNotes = rejectedEntries
      reason =
        rejectedEntries
          .map((e) => `${e.sira}. madde: ${e.note}`)
          .join('\n') || 'Checklist maddeleri için red nedenleri ekli.'
    } else if (!reason) {
      Alert.alert('Red nedeni gerekli', 'Lütfen görevi neden reddettiğinizi yazın.')
      return
    }

    try {
      if (isSiraliAdhoc) {
        const activeAdimNo = Number(activeTask?.zincir_aktif_adim) || 1
        const { error: rpcSiraliErr } = await supabase.rpc('rpc_sirali_adim_onayla_reddet', {
          p_is_id: activeTask.id,
          p_adim_no: activeAdimNo,
          p_karar: 'reddet',
          p_yorum: reason,
        })
        if (rpcSiraliErr) {
          Alert.alert('Hata', rpcSiraliErr.message || 'Sıralı adım reddedilemedi.')
          return
        }
        await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, `sirali-step-reject:${activeAdimNo}`)
        closeEvidence()
        await load(0, true)
        Alert.alert('Başarılı', 'Sıralı görev adımı reddedildi.')
        return
      }

      const currentScore = Math.round(normalizeTaskScore(activeTask?.puan))
      const reducedScore = Math.max(0, Math.round(currentScore / 2))
      let checklistUpdate = null
      if (isChecklist) {
        const rows = Array.isArray(activeTask?.checklist_cevaplari) ? activeTask.checklist_cevaplari : []
        const reviewedAt = new Date().toISOString()
        const reviewerId = personel?.id || null
        checklistUpdate = rows.map((row, i) => {
          const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
          const decision = String(checkDecisions?.[qid] || 'accept').toLowerCase() === 'reject'
            ? 'reject'
            : 'accept'
          const note =
            decision === 'reject'
              ? String(checkRejectNotes?.[qid] || '').trim()
              : ''
          return {
            ...row,
            denetim_karari: decision,
            // Red kararı ise madde-bazlı not + denetim zaman damgası saklansın; kabul edilenlerde temiz tut.
            denetim_red_notu: note,
            denetim_karari_at: reviewedAt,
            denetim_karari_by: reviewerId,
          }
        })
      }
      let rejectQuery = supabase
        .from('isler')
        .update({
          durum: TASK_STATUS.REJECTED,
          red_nedeni: reason,
          puan: reducedScore,
          ...(checklistUpdate ? { checklist_cevaplari: checklistUpdate } : {}),
        })
        .eq('id', activeTask.id)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      rejectQuery = restrictQueryByPersonelBirimHierarchy(rejectQuery, birimHierarchyCtx)
      const { error: rejectErr } = await rejectQuery
      if (rejectErr?.code === '42703') {
        // Kolon yoksa manager notunu mevcut aciklama alanına yaz.
        let fallbackRejectQuery = supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.REJECTED,
            aciklama: reason,
            puan: reducedScore,
          })
          .eq('id', activeTask.id)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        fallbackRejectQuery = restrictQueryByPersonelBirimHierarchy(fallbackRejectQuery, birimHierarchyCtx)
        const { error: fallbackErr } = await fallbackRejectQuery
        if (fallbackErr) {
          Alert.alert('Red hatası', fallbackErr.message || 'Görev reddedilemedi.')
          return
        }
      } else if (rejectErr) {
        Alert.alert('Red hatası', rejectErr.message || 'Görev reddedilemedi.')
        return
      }
      await logTaskTimelineEvent(activeTask.id, 'review', personel?.id, `reject:${reason}`)

      // Grup modunda: aynı grup içindeki diğer kişilerin görevini tekrar atama durumuna geri al.
      if (activeTask?.grup_id) {
        await supabase
          .from('isler')
          .update({ durum: TASK_STATUS.ASSIGNED, puan: 0 })
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          .eq('grup_id', activeTask.grup_id)
          .neq('id', activeTask.id)
      }

      closeEvidence()
      await load(0, true)
      Alert.alert('Başarılı', 'Görev reddedildi ve personele geri gönderildi.')
    } catch (e) {
      if (__DEV__) console.warn('AuditCenter reject error', e)
      Alert.alert('Hata', e?.message || 'Reddetme işlemi sırasında hata oluştu.')
    }
  }, [activeTask, canReject, closeEvidence, load, rejectReason, personel?.ana_sirket_id, personel?.id, birimHierarchyCtx, checkDecisions, checkRejectNotes])

  const renderItem = useCallback(({ item }) => {
    const birimText = item?.birim_id
      ? unitNameMap[String(item.birim_id)] || 'Birim'
      : 'Şirket Geneli'
    const statusVisual = getStatusVisual(item?.durum)
    /**
     * Havuz görev kartı: aynı `grup_id`'ye sahip tüm satırlar tek karta sıkıştırıldı.
     *  - "Havuz görev" rozeti + sorumluların ad listesi (en fazla 3, kalanı +N).
     *  - Kanıtı yükleyen / tamamlayan kişi belirgin "Tamamlayan" rozeti ile gösterilir.
     *  - "Kanıtları Gör" butonu temsilci satırı (kanıt sahibi) açar; alttaki onay/red yönetici akışı
     *    `grup_id` üzerinden hâlâ tüm üyelere otomatik uygulanır.
     */
    const isPool = !!item?._isGrouped
    const groupAssigneeIds = isPool ? item?._groupAssigneeIds || [] : []
    const completedAssigneeId = isPool ? item?._groupCompletedAssigneeId : null
    const assigneeNames = groupAssigneeIds
      .map((id) => personNameMap[String(id)] || 'Personel')
      .filter(Boolean)
    const visibleNames = assigneeNames.slice(0, 3)
    const moreCount = Math.max(0, assigneeNames.length - visibleNames.length)
    const completedName = completedAssigneeId
      ? personNameMap[String(completedAssigneeId)] || 'Personel'
      : null
    const statusToneMap = {
      [TASK_STATUS.APPROVED]: 'success',
      [TASK_STATUS.PENDING_APPROVAL]: 'warning',
      [TASK_STATUS.RESUBMITTED]: 'warning',
      [TASK_STATUS.REJECTED]: 'danger',
      [TASK_STATUS.ASSIGNED]: 'info',
    }
    const statusTone = statusToneMap[normalizeTaskStatus(item?.durum)] || 'primary'

    return (
      <KitCard tone="surface" elevated style={{ marginBottom: kitSpacing.md }}>
        <View style={styles.cardHead}>
          <IconBubble tone={isPool ? 'blurple' : 'warning'} size="md">
            {isPool ? (
              <UsersIcon size={18} color={kitPalette.blurple[600]} strokeWidth={2.4} />
            ) : (
              <ShieldCheck size={18} color={kitPalette.warning[600]} strokeWidth={2.4} />
            )}
          </IconBubble>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.cardBadgeRow}>
              <StatusBadge tone="soft" size="sm">
                {birimText}
              </StatusBadge>
              {isPool ? (
                <StatusBadge tone="blurple" size="sm">
                  Havuz · {item._groupSize} kişi
                </StatusBadge>
              ) : null}
              <StatusBadge tone={statusTone} size="sm">
                {statusVisual.label}
              </StatusBadge>
            </View>
            <KitText
              variant="bodyLg"
              weight="Bold"
              color={kitPalette.slate[800]}
              style={{ marginTop: kitSpacing.sm }}
              numberOfLines={2}
            >
              {item?.baslik || 'Görev'}
            </KitText>
            {isPool ? (
              <View style={styles.poolMetaWrap}>
                <KitText variant="overline" color={kitPalette.slate[500]}>
                  Sorumlular
                </KitText>
                <KitText
                  variant="bodySm"
                  weight="SemiBold"
                  color={kitPalette.slate[800]}
                  numberOfLines={2}
                  style={{ marginTop: 2 }}
                >
                  {visibleNames.join(', ')}
                  {moreCount > 0 ? ` +${moreCount}` : ''}
                </KitText>
                {completedName ? (
                  <View style={styles.poolCompletedRow}>
                    <View style={styles.poolCompletedDot} />
                    <KitText variant="caption" color={kitPalette.success[700]} numberOfLines={1}>
                      Tamamlayan:{' '}
                      <KitText weight="Bold" color={kitPalette.success[700]}>
                        {completedName}
                      </KitText>
                    </KitText>
                  </View>
                ) : null}
              </View>
            ) : null}
            <KitText
              variant="caption"
              color={kitPalette.slate[400]}
              style={{ marginTop: kitSpacing.sm }}
            >
              {item?.created_at ? new Date(item.created_at).toLocaleDateString('tr-TR') : '-'}
            </KitText>
          </View>
        </View>
        <Button
          variant="primary"
          size="sm"
          fullWidth
          iconLeft={<Eye size={14} color={kitPalette.surface} strokeWidth={2.4} />}
          onPress={() => openEvidence(item)}
          style={{ marginTop: kitSpacing.md }}
        >
          Kanıtları Gör
        </Button>
      </KitCard>
    )
  }, [openEvidence, unitNameMap, personNameMap])

  const isChecklistEvidence = !!activeTask?.is_sablon_id
  const checklistRows = useMemo(() => (Array.isArray(activeTask?.checklist_cevaplari) ? activeTask.checklist_cevaplari : []), [activeTask])
  const checklistFlatPhotos = useMemo(() => {
    if (!isChecklistEvidence) return []
    const out = []
    for (const row of checklistRows) {
      const urls = Array.isArray(row?.fotograflar) ? row.fotograflar.filter(Boolean) : []
      for (const u of urls) {
        const nu = normalizePhotoUrl(u)
        if (nu) out.push(nu)
      }
    }
    return out
  }, [isChecklistEvidence, checklistRows])
  const evidencePhotos = useMemo(() => {
    let raw = []
    if (isChecklistEvidence) raw = checklistFlatPhotos
    else if (isSiraliActiveTask && activeSiraliAuditStep) raw = extractPhotoUrls(activeSiraliAuditStep)
    else raw = extractPhotoUrls(activeTask)
    return normalizePhotoUrlList(raw)
  }, [activeTask, isChecklistEvidence, checklistFlatPhotos, isSiraliActiveTask, activeSiraliAuditStep])

  const evidenceTaskVideos = useMemo(() => {
    const fromTask = extractKanitVideoRows(activeTask)
    if (!isSiraliActiveTask) return fromTask
    const fromStep = activeSiraliAuditStep ? extractKanitVideoRows(activeSiraliAuditStep) : []
    const merged = [...fromStep, ...fromTask]
    const seen = new Set()
    return merged.filter((vr) => {
      const u = vr?.url
      if (!u || seen.has(u)) return false
      seen.add(u)
      return true
    })
  }, [activeTask, isSiraliActiveTask, activeSiraliAuditStep])

  const approveLabel = canApproveActiveTask
    ? 'Onayla'
    : isSelfAssignedActiveTask && !isSiraliActiveTask
      ? 'Kendi görevini onaylayamaz'
      : 'Onay yetkisi yok'
  const rejectLabel = canReject ? 'Reddet' : 'Red yetkisi yok'

  /**
   * Checklist denetiminde herhangi bir madde reddedildi mi?
   * - Sadece checklist görevlerinde (is_sablon_id) anlamlıdır; aksi halde false döner ve eski
   *   ikili buton (Reddet + Onayla) davranışı korunur.
   * - true ise footer tek buton ("Görevi Geri Gönder") gösterir; false ise tek buton ("Onayla").
   */
  const isChecklistAuditTask = !!activeTask?.is_sablon_id && !isSiraliActiveTask
  const hasAnyRejectedItem = useMemo(() => {
    if (!isChecklistAuditTask) return false
    return Object.values(checkDecisions || {}).some((d) => String(d).toLowerCase() === 'reject')
  }, [isChecklistAuditTask, checkDecisions])
  /** Reddedilen her madde için not zorunludur — eksik not varsa Geri Gönder devre dışı. */
  const allRejectNotesFilled = useMemo(() => {
    if (!hasAnyRejectedItem) return true
    return Object.entries(checkDecisions || {})
      .filter(([, v]) => String(v).toLowerCase() === 'reject')
      .every(([qid]) => String(checkRejectNotes?.[qid] || '').trim().length > 0)
  }, [hasAnyRejectedItem, checkDecisions, checkRejectNotes])

  return (
    <Screen padded background={kitPalette.background}>
      {loading && items.length === 0 ? (
        <View>
          <View style={styles.header}>
            <KitText variant="overline" color={kitPalette.slate[500]}>
              YÖNETİM
            </KitText>
            <Heading variant="displayMd" color={kitPalette.slate[800]} style={{ marginTop: 2 }}>
              Denetim Merkezi
            </Heading>
            <KitText
              variant="bodySm"
              color={kitPalette.slate[500]}
              style={{ marginTop: 2 }}
            >
              Onay bekleyen işleri kontrol edin
            </KitText>
          </View>
          <SkeletonCard lines={4} style={{ marginBottom: kitSpacing.sm }} />
          <SkeletonCard lines={4} style={{ marginBottom: kitSpacing.sm }} />
          <SkeletonCard lines={4} style={{ marginBottom: kitSpacing.sm }} />
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <KitText variant="overline" color={kitPalette.slate[500]}>
              YÖNETİM
            </KitText>
            <Heading variant="displayMd" color={kitPalette.slate[800]} style={{ marginTop: 2 }}>
              Denetim Merkezi
            </Heading>
            <KitText
              variant="bodySm"
              color={kitPalette.slate[500]}
              style={{ marginTop: 2 }}
            >
              {items.length} görev onay bekliyor
            </KitText>
          </View>

          <FlatList
            data={items}
            keyExtractor={(item) => String(item?.id ?? '')}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.2}
            onEndReached={() => {
              if (!hasMore) return
              if (loadingMore || loading) return
              load(pageOffset, false)
            }}
            ListEmptyComponent={
              <EmptyState
                title="Onay bekleyen iş yok"
                description="Tüm görevler kontrol edildi. Yeni gönderim olduğunda burada görüneceksiniz."
                icon={
                  <CheckCircle2
                    size={28}
                    color={kitPalette.success[600]}
                    strokeWidth={2}
                  />
                }
                tone="success"
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: kitSpacing.lg }}>
                  <ActivityIndicator size={22} color={kitPalette.primary[700]} />
                </View>
              ) : null
            }
          />
        </>
      )}

      <Modal visible={evidenceOpen} transparent animationType="fade" onRequestClose={closeEvidence}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {(() => {
              const taskTypeLabel = formatTaskTypeLabel(activeTask)
              const statusVisual = getStatusVisual(activeTask?.durum)
              const isZincirGorev = isZincirGorevTuru(activeTask?.gorev_turu)
              const focusedPersonId = isSiraliActiveTask
                ? activeSiraliAuditStep?.personel_id
                : activeTask?.sorumlu_personel_id
              const focusedPersonName = focusedPersonId
                ? personNameMap[String(focusedPersonId)] || 'Personel'
                : 'Personel atanmadı'
              const personRoleLabel = isSiraliActiveTask
                ? `Aktif adım sorumlusu • ${Number(activeTask?.zincir_aktif_adim) || 1}. adım`
                : isZincirGorev
                  ? 'Zincir görev sorumlusu'
                  : isChecklistEvidence
                    ? 'Checklist sorumlusu'
                    : 'Görev sorumlusu'
              const createdLabel = formatDateTimeShort(activeTask?.created_at)
              const dueLabel = formatDateShort(activeTask?.son_tarih)
              const personelNote = isChecklistEvidence
                ? activeTask?.aciklama
                  ? cleanPersonelNote(activeTask?.aciklama)
                  : activeTask?.personel_tamamlama_notu
                    ? String(activeTask.personel_tamamlama_notu).trim()
                    : ''
                : activeTask?.personel_tamamlama_notu
                  ? String(activeTask.personel_tamamlama_notu).trim()
                  : ''
              /** Zincir görev: kanıtlar adım kartlarında; kök görevdeki genel foto/video tekrarını gösterme. */
              const hideRootEvidenceForChainGorev = isZincirGorev
              /**
               * Zincir görevlerde personel notu yalnız adım kartlarında gösterilir; "Genel personel notu"
               * gibi tekrarlı bir kutuya gerek yok. Sıralı görevde de adım odaklı kart içinde gösterildiği
               * için bu bölüm yalnız standart/checklist görevlerde görünür.
               */
              const showPersonelNoteSection = !isSiraliActiveTask && !isZincirGorev
              const siraliStepNote = isSiraliActiveTask
                ? String(activeSiraliAuditStep?.aciklama || '').trim()
                : ''
              const checklistAccepted = isChecklistEvidence
                ? checklistRows.filter((row, i) => {
                    const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
                    return (checkDecisions?.[qid] || 'accept') === 'accept'
                  }).length
                : 0
              const checklistRejected = isChecklistEvidence
                ? checklistRows.length - checklistAccepted
                : 0
              return (
                <>
                  <View style={styles.evHeader}>
                    <View style={styles.evHeaderTopRow}>
                      <View style={styles.evChipRow}>
                        <View style={styles.evTypeChip}>
                          <Text style={styles.evTypeChipText}>{taskTypeLabel}</Text>
                        </View>
                        <View
                          style={[styles.evStatusChip, { backgroundColor: statusVisual.bg }]}
                        >
                          <Text style={[styles.evStatusChipText, { color: statusVisual.text }]}>
                            {statusVisual.label}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.evCloseBtn}
                        onPress={closeEvidence}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.evCloseBtnText}>×</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.evTitle} numberOfLines={2}>
                      {activeTask?.baslik || 'Görev'}
                    </Text>
                  </View>

                  <ScrollView
                    style={styles.evBody}
                    contentContainerStyle={styles.evBodyContent}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    <View style={styles.evPersonCard}>
                      <View style={styles.evPersonAvatar}>
                        <Text style={styles.evPersonAvatarText}>
                          {getInitials(focusedPersonName)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.evPersonName} numberOfLines={1}>
                          {focusedPersonName}
                        </Text>
                        <Text style={styles.evPersonRole} numberOfLines={1}>
                          {personRoleLabel}
                        </Text>
                      </View>
                    </View>

                    {(createdLabel || dueLabel) ? (
                      <View style={styles.evMetaTiles}>
                        {createdLabel ? (
                          <View style={styles.evMetaTile}>
                            <Text style={styles.evMetaTileLabel}>Oluşturulma</Text>
                            <Text style={styles.evMetaTileValue} numberOfLines={1}>
                              {createdLabel}
                            </Text>
                          </View>
                        ) : null}
                        {dueLabel ? (
                          <View style={styles.evMetaTile}>
                            <Text style={styles.evMetaTileLabel}>Son tarih</Text>
                            <Text style={styles.evMetaTileValue} numberOfLines={1}>
                              {dueLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {isSiraliActiveTask && !isChecklistEvidence ? (
                      <View style={styles.evFocusCard}>
                        <View style={styles.evFocusHeader}>
                          <View style={styles.evStepBadge}>
                            <Text style={styles.evStepBadgeText}>
                              {Number(activeTask?.zincir_aktif_adim) || 1}. Adım
                            </Text>
                          </View>
                          <Text style={styles.evFocusHint}>İncelenen sıralı adım</Text>
                        </View>
                        {activeTask?.aciklama ? (
                          <>
                            <Text style={styles.evFieldLabel}>Adım tanımı</Text>
                            <Text style={styles.evFieldValue}>
                              {String(activeTask.aciklama)}
                            </Text>
                          </>
                        ) : null}
                        {siraliStepNote ? (
                          <>
                            <Text style={[styles.evFieldLabel, { marginTop: 10 }]}>
                              Adımı tamamlayan notu
                            </Text>
                            <Text style={styles.evFieldValue}>{siraliStepNote}</Text>
                          </>
                        ) : null}
                      </View>
                    ) : null}

                    {isChecklistEvidence ? (
                      <View style={styles.evChecklistSummary}>
                        <View style={styles.evChecklistSummaryRow}>
                          <Text style={styles.evChecklistSummaryTitle}>
                            Checklist denetimi
                          </Text>
                          <Text style={styles.evChecklistSummaryCount}>
                            {checklistRows.length} soru
                          </Text>
                        </View>
                        <View style={styles.evChecklistStatRow}>
                          <View style={[styles.evChecklistStat, styles.evChecklistStatAccept]}>
                            <Text style={styles.evChecklistStatLabel}>Kabul</Text>
                            <Text style={styles.evChecklistStatValue}>{checklistAccepted}</Text>
                          </View>
                          <View style={[styles.evChecklistStat, styles.evChecklistStatReject]}>
                            <Text style={styles.evChecklistStatLabel}>Reddedilen</Text>
                            <Text style={styles.evChecklistStatValue}>{checklistRejected}</Text>
                          </View>
                        </View>
                      </View>
                    ) : null}

                    {!isChecklistEvidence && !hideRootEvidenceForChainGorev ? (
                      <View style={styles.evSection}>
                        <View style={styles.evSectionHeader}>
                          <Text style={styles.evSectionTitle}>Kanıtlar</Text>
                          <View style={styles.evSectionCountChip}>
                            <Text style={styles.evSectionCountChipText}>
                              {evidencePhotos.length} foto · {evidenceTaskVideos.length} video
                            </Text>
                          </View>
                        </View>
                        {evidencePhotos.length ? (
                          <View style={styles.evPhotoGrid}>
                            {evidencePhotos.map((url, idx) => (
                              <TouchableOpacity
                                key={`${url}-${idx}`}
                                onPress={() =>
                                  openEvidencePhotoGallery({
                                    images: evidencePhotos,
                                    index: idx,
                                    title: 'Görev Kanıtları',
                                  })
                                }
                                activeOpacity={0.85}
                                style={styles.evPhotoTile}
                              >
                                <Image
                                  pointerEvents="none"
                                  source={{ uri: url }}
                                  style={styles.evPhotoTileImg}
                                  resizeMode="cover"
                                />
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                        {evidenceTaskVideos.length ? (
                          <View
                            style={[
                              styles.videoEvidenceCol,
                              { marginTop: evidencePhotos.length ? 12 : 0 },
                            ]}
                          >
                            {evidenceTaskVideos.map((vr, idx) => (
                              <View key={`task-vid-${vr.url}-${idx}`} style={styles.auditVideoWrap}>
                                <EvidenceVideoPlayer uri={vr.url} style={styles.auditVideo} />
                                <TouchableOpacity
                                  style={styles.auditVideoFsBtn}
                                  onPress={() => {
                                    setLightbox(null)
                                    setVideoPreview({
                                      uri: vr.url,
                                      title: 'Görev Videosu',
                                      durationSec:
                                        vr?.duration_sec != null &&
                                        Number.isFinite(Number(vr.duration_sec))
                                          ? Number(vr.duration_sec)
                                          : null,
                                    })
                                  }}
                                  activeOpacity={0.85}
                                  accessibilityRole="button"
                                  accessibilityLabel="Videoyu tam ekran aç"
                                >
                                  <Text style={styles.auditVideoFsBtnText}>Tam ekran</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {evidencePhotos.length === 0 && evidenceTaskVideos.length === 0 ? (
                          <View style={styles.evEmptyBox}>
                            <Text style={styles.evEmptyText}>Bu görev için kanıt eklenmemiş.</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {!isChecklistEvidence && isZincirGorev ? (
                      <View style={styles.evSection}>
                        <View style={styles.evSectionHeader}>
                          <Text style={styles.evSectionTitle}>Zincir Görev Adımları</Text>
                          <View style={styles.evSectionCountChip}>
                            <Text style={styles.evSectionCountChipText}>
                              {chainGorevSteps.length} adım
                            </Text>
                          </View>
                        </View>
                        {chainGorevSteps.length === 0 ? (
                          <View style={styles.evEmptyBox}>
                            <Text style={styles.evEmptyText}>Zincir adım kaydı yok.</Text>
                          </View>
                        ) : (
                          chainGorevSteps.map((step) => {
                            const photos = normalizePhotoUrlList(
                              Array.isArray(step?.kanit_resim_ler) ? step.kanit_resim_ler : [],
                            )
                            const stepVids = extractKanitVideoRows(step)
                            const personName =
                              personNameMap[String(step?.personel_id)] || 'Personel'
                            const stepStatus = step?.adim_durum || step?.durum || ''
                            const sp = getStepStatusPill(stepStatus)
                            return (
                              <View key={String(step?.id)} style={styles.evStepCard}>
                                <View style={styles.evStepCardHeader}>
                                  <View style={styles.evStepBadgeSm}>
                                    <Text style={styles.evStepBadgeSmText}>
                                      {Number(step?.adim_no) || '-'}. Adım
                                    </Text>
                                  </View>
                                  <View style={[styles.evStepStatusPill, { backgroundColor: sp.bg }]}>
                                    <Text style={[styles.evStepStatusPillText, { color: sp.fg }]}>
                                      {sp.label}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.evStepPersonRow}>
                                  <View style={styles.evStepAvatar}>
                                    <Text style={styles.evStepAvatarText}>
                                      {getInitials(personName)}
                                    </Text>
                                  </View>
                                  <Text style={styles.evStepPersonText} numberOfLines={1}>
                                    {personName}
                                  </Text>
                                </View>
                                {String(step?.aciklama || '').trim() ? (
                                  <View style={{ marginTop: 8 }}>
                                    <Text style={styles.evFieldLabel}>Personel notu</Text>
                                    <Text style={styles.evFieldValue}>
                                      {String(step.aciklama).trim()}
                                    </Text>
                                  </View>
                                ) : null}
                                {photos.length ? (
                                  <View style={styles.evStepPhotoGrid}>
                                    {photos.map((url, pIdx) => (
                                      <TouchableOpacity
                                        key={`${step.id}-${pIdx}`}
                                        onPress={() =>
                                          openEvidencePhotoGallery({
                                            images: photos,
                                            index: pIdx,
                                            title: `${Number(step?.adim_no) || '-'}. Adım Kanıtları`,
                                          })
                                        }
                                        activeOpacity={0.85}
                                        style={styles.evStepPhotoTile}
                                      >
                                        <Image
                                          pointerEvents="none"
                                          source={{ uri: url }}
                                          style={styles.evPhotoTileImg}
                                          resizeMode="cover"
                                        />
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                ) : null}
                                {stepVids.length ? (
                                  <View style={[styles.videoEvidenceCol, { marginTop: 10 }]}>
                                    {stepVids.map((vr, vi) => (
                                      <View key={`${step.id}-v-${vi}-${vr.url}`} style={styles.auditVideoWrap}>
                                        <EvidenceVideoPlayer uri={vr.url} style={styles.auditVideo} />
                                        <TouchableOpacity
                                          style={styles.auditVideoFsBtn}
                                          onPress={() => {
                                            setLightbox(null)
                                            setVideoPreview({
                                              uri: vr.url,
                                              title: `${Number(step?.adim_no) || '-'}. Adım Videosu`,
                                              durationSec:
                                                vr?.duration_sec != null &&
                                                Number.isFinite(Number(vr.duration_sec))
                                                  ? Number(vr.duration_sec)
                                                  : null,
                                            })
                                          }}
                                          activeOpacity={0.85}
                                          accessibilityRole="button"
                                          accessibilityLabel="Videoyu tam ekran aç"
                                        >
                                          <Text style={styles.auditVideoFsBtnText}>Tam ekran</Text>
                                        </TouchableOpacity>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                                {photos.length === 0 && stepVids.length === 0 ? (
                                  <Text style={styles.evStepEmptyText}>
                                    Bu adımda kanıt eklenmemiş.
                                  </Text>
                                ) : null}
                                {canReject ? (
                                  <TouchableOpacity
                                    style={styles.evStepRejectBtn}
                                    onPress={() => rejectChainStep(step)}
                                    activeOpacity={0.85}
                                  >
                                    <Text style={styles.evStepRejectBtnText}>Bu adımı reddet</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            )
                          })
                        )}
                      </View>
                    ) : null}

                    {isChecklistEvidence ? (
                      <View style={styles.evSection}>
                        <View style={styles.evSectionHeader}>
                          <Text style={styles.evSectionTitle}>Sorular ve Cevaplar</Text>
                        </View>
                        {checklistRows.length === 0 ? (
                          <View style={styles.evEmptyBox}>
                            <Text style={styles.evEmptyText}>
                              Bu checklist için cevap kaydı bulunamadı.
                            </Text>
                          </View>
                        ) : (
                          checklistRows.map((row, i) => {
                            const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
                            const tip = String(row?.soru_tipi || '').toUpperCase()
                            const decision = checkDecisions?.[qid] || 'accept'
                            const rowPhotos = normalizePhotoUrlList(
                              Array.isArray(row?.fotograflar) ? row.fotograflar : [],
                            )
                            const rowVideos = extractKanitVideoRows(row)
                            const answerText =
                              tip === 'FOTOGRAF'
                                ? `${rowPhotos.length || 0} fotoğraf`
                                : tip === 'VIDEO'
                                  ? `${rowVideos.length || 0} video`
                                  : String(row?.cevap || '-')

                            return (
                              <View key={qid} style={styles.evChecklistCard}>
                                <View style={styles.evChecklistCardHeader}>
                                  <View style={styles.evChecklistQNum}>
                                    <Text style={styles.evChecklistQNumText}>
                                      {row?.sira || i + 1}
                                    </Text>
                                  </View>
                                  <Text style={styles.evChecklistQText}>
                                    {row?.soru_metni || 'Soru'}
                                  </Text>
                                </View>
                                <Text style={styles.evChecklistAnswer}>Cevap: {answerText}</Text>

                                {tip === 'FOTOGRAF' && rowPhotos.length ? (
                                  <View style={styles.evStepPhotoGrid}>
                                    {rowPhotos.map((url, pIdx) => (
                                      <TouchableOpacity
                                        key={`${qid}-p-${pIdx}`}
                                        onPress={() =>
                                          openEvidencePhotoGallery({
                                            images: rowPhotos,
                                            index: pIdx,
                                            title: `${row?.sira || i + 1}. Soru Kanıtları`,
                                          })
                                        }
                                        activeOpacity={0.85}
                                        style={styles.evStepPhotoTile}
                                      >
                                        <Image
                                          pointerEvents="none"
                                          source={{ uri: url }}
                                          style={styles.evPhotoTileImg}
                                          resizeMode="cover"
                                        />
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                ) : null}
                                {tip === 'VIDEO' && rowVideos.length ? (
                                  <View style={[styles.videoEvidenceCol, { marginTop: 8 }]}>
                                    {rowVideos.map((vr, vi) => (
                                      <View key={`${qid}-v-${vi}-${vr.url}`} style={styles.auditVideoWrap}>
                                        <EvidenceVideoPlayer uri={vr.url} style={styles.auditVideo} />
                                        <TouchableOpacity
                                          style={styles.auditVideoFsBtn}
                                          onPress={() => {
                                            setLightbox(null)
                                            setVideoPreview({
                                              uri: vr.url,
                                              title: `${row?.sira || i + 1}. Soru Videosu`,
                                              durationSec:
                                                vr?.duration_sec != null &&
                                                Number.isFinite(Number(vr.duration_sec))
                                                  ? Number(vr.duration_sec)
                                                  : null,
                                            })
                                          }}
                                          activeOpacity={0.85}
                                          accessibilityRole="button"
                                          accessibilityLabel="Videoyu tam ekran aç"
                                        >
                                          <Text style={styles.auditVideoFsBtnText}>Tam ekran</Text>
                                        </TouchableOpacity>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}

                                <View style={styles.evChecklistDecisionRow}>
                                  <TouchableOpacity
                                    style={[
                                      styles.decideBtn,
                                      decision === 'accept' && styles.decideBtnAcceptActive,
                                    ]}
                                    onPress={() => {
                                      setCheckDecisions((prev) => ({ ...prev, [qid]: 'accept' }))
                                      // Kabul'e dönerken bu maddenin red notunu temizle.
                                      setCheckRejectNotes((prev) => {
                                        if (!prev?.[qid]) return prev
                                        const { [qid]: _omit, ...rest } = prev
                                        return rest
                                      })
                                    }}
                                    activeOpacity={0.85}
                                  >
                                    <Text
                                      style={[
                                        styles.decideBtnText,
                                        decision === 'accept' && styles.decideBtnTextActive,
                                      ]}
                                    >
                                      Kabul
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.decideBtn,
                                      decision === 'reject' && styles.decideBtnRejectActive,
                                    ]}
                                    onPress={() =>
                                      setCheckDecisions((prev) => ({ ...prev, [qid]: 'reject' }))
                                    }
                                    activeOpacity={0.85}
                                  >
                                    <Text
                                      style={[
                                        styles.decideBtnText,
                                        decision === 'reject' && styles.decideBtnTextActive,
                                      ]}
                                    >
                                      Reddet
                                    </Text>
                                  </TouchableOpacity>
                                </View>

                                {decision === 'reject' ? (
                                  <View style={styles.evRejectNoteWrap}>
                                    <Text style={styles.evRejectNoteLabel}>
                                      Bu madde için red nedeni{' '}
                                      <Text style={styles.evRejectNoteRequired}>(zorunlu)</Text>
                                    </Text>
                                    <TextInput
                                      value={checkRejectNotes?.[qid] || ''}
                                      onChangeText={(v) =>
                                        setCheckRejectNotes((prev) => ({ ...prev, [qid]: v }))
                                      }
                                      placeholder="Örn: Fotoğraf net değil, video eksik..."
                                      placeholderTextColor={MUTED}
                                      style={styles.evRejectNoteInput}
                                      multiline
                                    />
                                  </View>
                                ) : null}
                              </View>
                            )
                          })
                        )}
                      </View>
                    ) : null}

                    {showPersonelNoteSection ? (
                      <View style={styles.evSection}>
                        <Text style={styles.evSectionTitle}>Personel notu</Text>
                        <View
                          style={[
                            styles.evNoteCard,
                            !personelNote && styles.evNoteCardEmpty,
                          ]}
                        >
                          <Text
                            style={[
                              styles.evNoteText,
                              !personelNote && styles.evNoteTextEmpty,
                            ]}
                          >
                            {personelNote || 'Personel not eklemedi.'}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/*
                      Checklist görevlerinde "genel red nedeni" alanı yok — her reddedilen madde
                      kendi notunu taşır (madde kartının altındaki TextInput). Sıralı/zincir/adhoc
                      görevlerde ise tek bir genel red nedeni gerekir, mevcut alan korunur.
                    */}
                    {canReject && !isChecklistAuditTask ? (
                      <View style={styles.evSection}>
                        <Text style={styles.evSectionTitle}>Red nedeni</Text>
                        <TextInput
                          value={rejectReason}
                          onChangeText={setRejectReason}
                          placeholder="Kısaca red nedeni yazın..."
                          placeholderTextColor={MUTED}
                          style={styles.textArea}
                          multiline
                        />
                      </View>
                    ) : null}

                    {canApprove && !isSiraliActiveTask ? (
                      <View style={styles.evSection}>
                        <Text style={styles.evSectionTitle}>Onay Puanı</Text>
                        <TextInput
                          value={approvePointInput}
                          onChangeText={(v) => setApprovePointInput(v.replace(/[^0-9.,]/g, ''))}
                          placeholder="Örn: 10"
                          placeholderTextColor={MUTED}
                          keyboardType="decimal-pad"
                          style={styles.textArea}
                        />
                      </View>
                    ) : null}
                  </ScrollView>

                  <View style={styles.evFooter}>
                    {isChecklistAuditTask ? (
                      hasAnyRejectedItem ? (
                        <TouchableOpacity
                          style={[
                            styles.evFooterBtn,
                            styles.evFooterRejectBtn,
                            styles.evFooterBtnFull,
                            (!canReject || !allRejectNotesFilled) && styles.evFooterBtnDisabled,
                          ]}
                          onPress={rejectTask}
                          disabled={!canReject || !allRejectNotesFilled}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.evFooterRejectBtnText}>
                            {!canReject
                              ? rejectLabel
                              : !allRejectNotesFilled
                                ? 'Reddedilen maddelerin notunu doldurun'
                                : 'Görevi Geri Gönder'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.evFooterBtn,
                            styles.evFooterApproveBtn,
                            styles.evFooterBtnFull,
                            !canApproveActiveTask && styles.evFooterBtnDisabled,
                          ]}
                          onPress={approveTask}
                          disabled={!canApproveActiveTask}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.evFooterApproveBtnText}>{approveLabel}</Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[
                            styles.evFooterBtn,
                            styles.evFooterRejectBtn,
                            !canReject && styles.evFooterBtnDisabled,
                          ]}
                          onPress={rejectTask}
                          disabled={!canReject}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.evFooterRejectBtnText}>{rejectLabel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.evFooterBtn,
                            styles.evFooterApproveBtn,
                            !canApproveActiveTask && styles.evFooterBtnDisabled,
                          ]}
                          onPress={approveTask}
                          disabled={!canApproveActiveTask}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.evFooterApproveBtnText}>{approveLabel}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              )
            })()}
          </View>
          {(lightbox || videoPreview?.uri) ? (
            <View style={styles.evMediaOverlay} pointerEvents="box-none">
              <PhotoViewerModal
                visible={!!lightbox}
                imageUrls={lightbox?.images || []}
                initialIndex={lightbox?.index ?? 0}
                onRequestClose={() => setLightbox(null)}
                title={lightbox?.title || 'Kanıt Görseli'}
              />
              <VideoPreviewModal
                visible={!!videoPreview?.uri}
                uri={videoPreview?.uri}
                title={videoPreview?.title || 'Video'}
                durationSec={videoPreview?.durationSec ?? null}
                onRequestClose={() => setVideoPreview(null)}
              />
            </View>
          ) : null}
        </View>
      </Modal>

    </Screen>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    marginBottom: kitSpacing.lg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: kitSpacing.md,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.xs,
    alignItems: 'center',
  },
  title: {
    color: Colors.primary,
    fontSize: Typography.heading.fontSize,
    fontWeight: Typography.heading.fontWeight,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: MUTED,
    fontSize: Typography.body.fontSize,
    fontWeight: Typography.body.fontWeight,
  },
  listContent: { paddingBottom: Spacing.md },
  empty: { color: MUTED, textAlign: 'center', marginTop: Spacing.md },
  skeletonWrap: { paddingHorizontal: 0, paddingVertical: 8 },
  skeletonCard: {
    height: 92,
    borderRadius: Layout.borderRadius.lg,
    backgroundColor: MUTED,
    opacity: 0.12,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: Card.padding,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  metaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  metaPill: {
    backgroundColor: Colors.alpha.indigo10,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  metaPillPool: {
    backgroundColor: Colors.alpha?.amber10 ?? 'rgba(245, 158, 11, 0.12)',
  },
  metaPillPoolText: {
    color: kitPalette.warning[700],
  },
  poolMetaWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.alpha?.gray10 ?? 'rgba(15, 23, 42, 0.06)',
  },
  poolMetaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  poolMetaValue: {
    marginTop: 2,
    fontSize: Typography.body.fontSize,
    color: Colors.text ?? kitPalette.slate[800],
    fontWeight: '600',
  },
  poolCompletedRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  poolCompletedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: EMERALD_500,
    marginRight: 6,
  },
  poolCompletedText: {
    flex: 1,
    fontSize: 12,
    color: MUTED,
  },
  poolCompletedName: {
    color: EMERALD_500,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
  },
  cardTitle: { color: Colors.primary, fontSize: Typography.subheading.fontSize, fontWeight: Typography.subheading.fontWeight, marginBottom: Spacing.xs },
  cardMeta: { color: MUTED, fontSize: Typography.body.fontSize, fontWeight: Typography.body.fontWeight },
  primaryBtn: {
    backgroundColor: INDIGO_600,
    borderRadius: Radii.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  primaryBtnText: { color: Colors.surface, fontWeight: Typography.heading.fontWeight, fontSize: Typography.body.fontSize },
  modalBackdrop: {
    flex: 1,
    position: 'relative',
    backgroundColor: Colors.alpha.black55,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  /** Kanıt modalı açıkken foto lightbox / video tam ekran — sheet üstünde, dokunma ve Modal sırası için */
  evMediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '92%',
    flexShrink: 1,
    zIndex: 5,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    overflow: 'hidden',
    ...Shadows.card,
  },
  // Yeniden tasarlanan kanıt modalı (Denetim Merkezi)
  evHeader: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.alpha.gray18,
    backgroundColor: Colors.surface,
  },
  evHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  evChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  evTypeChip: {
    backgroundColor: Colors.alpha.indigo10,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  evTypeChipText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  evStatusChip: {
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  evStatusChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  evCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: Radii.full,
    backgroundColor: Colors.alpha.gray10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evCloseBtnText: {
    color: Colors.text,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  evTitle: {
    color: Colors.primary,
    fontSize: Typography.subheading.fontSize,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  evBody: {
    flexShrink: 1,
  },
  evBodyContent: {
    padding: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: 12,
  },

  evPersonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.alpha.indigo06,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: Radii.md,
    padding: 12,
  },
  evPersonAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evPersonAvatarText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.4,
  },
  evPersonName: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  evPersonRole: {
    color: MUTED,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 2,
  },

  evMetaTiles: {
    flexDirection: 'row',
    gap: 8,
  },
  evMetaTile: {
    flex: 1,
    backgroundColor: Colors.alpha.gray08,
    borderRadius: Radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  evMetaTileLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  evMetaTileValue: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  evFocusCard: {
    backgroundColor: Colors.alpha.indigo06,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: Radii.md,
    padding: 12,
  },
  evFocusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  evFocusHint: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  evStepBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.full,
  },
  evStepBadgeText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  evFieldLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  evFieldValue: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },

  evChecklistSummary: {
    backgroundColor: Colors.alpha.indigo06,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: Radii.md,
    padding: 12,
  },
  evChecklistSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  evChecklistSummaryTitle: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  evChecklistSummaryCount: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },
  evChecklistStatRow: {
    flexDirection: 'row',
    gap: 8,
  },
  evChecklistStat: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evChecklistStatAccept: {
    backgroundColor: Colors.alpha.emerald10,
    borderColor: Colors.alpha.emerald25,
  },
  evChecklistStatReject: {
    backgroundColor: Colors.alpha.rose10,
    borderColor: Colors.alpha.rose25,
  },
  evChecklistStatLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  evChecklistStatValue: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },

  evSection: {
    gap: 8,
  },
  evSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evSectionTitle: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  evSectionCountChip: {
    backgroundColor: Colors.alpha.gray10,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  evSectionCountChipText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },

  evPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  evPhotoTile: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: Radii.md,
    overflow: 'hidden',
    backgroundColor: Colors.alpha.gray10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray18,
  },
  evPhotoTileImg: {
    width: '100%',
    height: '100%',
  },

  evEmptyBox: {
    backgroundColor: Colors.alpha.gray08,
    borderRadius: Radii.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  evEmptyText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
  },

  evStepCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray18,
    borderRadius: Radii.md,
    padding: 12,
    gap: 10,
  },
  evStepCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evStepBadgeSm: {
    backgroundColor: Colors.alpha.indigo10,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  evStepBadgeSmText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  evStepStatusPill: {
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  evStepStatusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  evStepPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  evStepAvatar: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    backgroundColor: Colors.alpha.indigo10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evStepAvatarText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 11,
  },
  evStepPersonText: {
    flex: 1,
    minWidth: 0,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  evStepPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  evStepPhotoTile: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: Radii.sm,
    overflow: 'hidden',
    backgroundColor: Colors.alpha.gray10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray18,
  },
  evStepEmptyText: {
    color: MUTED,
    fontSize: 12,
    fontStyle: 'italic',
  },
  evStepRejectBtn: {
    backgroundColor: Colors.alpha.rose10,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
    borderRadius: Radii.md,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  evStepRejectBtnText: {
    color: Colors.error,
    fontWeight: '800',
    fontSize: 13,
  },

  evChecklistCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray18,
    borderRadius: Radii.md,
    padding: 12,
    gap: 8,
  },
  evChecklistCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  evChecklistQNum: {
    width: 26,
    height: 26,
    borderRadius: Radii.full,
    backgroundColor: Colors.alpha.indigo10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evChecklistQNumText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  evChecklistQText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  evChecklistAnswer: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  evChecklistDecisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  evRejectNoteWrap: {
    marginTop: 10,
    padding: 10,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
    backgroundColor: Colors.alpha.rose10,
    gap: 6,
  },
  evRejectNoteLabel: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  evRejectNoteRequired: {
    color: Colors.error,
    fontWeight: '800',
  },
  evRejectNoteInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
    minHeight: 56,
    fontSize: 13,
  },
  evFooterBtnFull: {
    flex: 1,
  },

  evNoteCard: {
    backgroundColor: Colors.alpha.gray08,
    borderRadius: Radii.md,
    padding: 12,
    minHeight: 56,
  },
  evNoteCardEmpty: {
    backgroundColor: Colors.alpha.gray08,
  },
  evNoteText: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '500',
    lineHeight: 21,
  },
  evNoteTextEmpty: {
    color: MUTED,
    fontStyle: 'italic',
    fontWeight: '600',
  },

  evFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.alpha.gray18,
    backgroundColor: Colors.surface,
  },
  evFooterBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  evFooterRejectBtn: {
    backgroundColor: Colors.surface,
    borderColor: Colors.alpha.rose25,
  },
  evFooterRejectBtnText: {
    color: Colors.error,
    fontWeight: '800',
    fontSize: 15,
  },
  evFooterApproveBtn: {
    backgroundColor: EMERALD_500,
    borderColor: EMERALD_500,
  },
  evFooterApproveBtnText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 15,
  },
  evFooterBtnDisabled: {
    opacity: 0.45,
  },

  textArea: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    minHeight: 80,
  },

  decideBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.full,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  decideBtnAcceptActive: {
    backgroundColor: Colors.alpha.emerald10,
    borderColor: Colors.alpha.emerald25,
  },
  decideBtnRejectActive: {
    backgroundColor: Colors.alpha.rose10,
    borderColor: Colors.alpha.rose25,
  },
  decideBtnText: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  decideBtnTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },

  videoEvidenceCol: { gap: 12, width: '100%' },
  auditVideoWrap: {
    width: '100%',
    position: 'relative',
    borderRadius: Radii.md,
    overflow: 'hidden',
    backgroundColor: Colors.alpha.gray10,
  },
  auditVideoFsBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 4,
  },
  auditVideoFsBtnText: {
    color: kitPalette.surface,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  auditVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radii.md,
    backgroundColor: Colors.alpha.gray10,
  },
})

