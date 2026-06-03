import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  TextInput,
  Platform,
  Linking,
} from 'react-native'
import EvidenceVideoPlayer from '../components/EvidenceVideoPlayer'
import EvidenceCaptureModal from '../components/EvidenceCaptureModal'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import {
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
} from '../ui/tokens'
import { ChevronLeft } from 'lucide-react-native'
import { Icon } from '../ui'
import PhotoViewerModal from '../components/PhotoViewerModal'
import VideoPreviewModal from '../components/VideoPreviewModal'
import {
  GOREV_TURU,
  buildKanitFotoDurumlari,
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from '../lib/zincirTasks'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
} from '../lib/taskStatus'
import { logTaskTimelineEvent } from '../lib/taskTimeline'
import { shouldShowTimelineNoteUi } from '../lib/timelineNoteDisplay'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import { restrictQueryByPersonelBirimHierarchy } from '../lib/supabaseScope'
import { canAuditTaskStep } from '../lib/taskPermissions'
import { normalizeJsonObject } from './taskDetail/normalize'
import {
  resolveAdhocKanitRules,
  extractPhotoUrls,
  extractKanitVideoRows,
  extractKanitBelgeRows,
} from './taskDetail/evidenceParsing'
import {
  canonicalReferenceMediaRow,
  normalizeReferenceMediaList,
  inferReferenceRowKind,
} from './taskDetail/referenceMedia'
import {
  normalizeTimelineArray,
  timelineAt,
  fullNamePerson,
  personLabelOrRef,
  samePersonelId,
} from './taskDetail/personAndTimeline'
import {
  formatSiraliAdimDurumu,
  buildSiraliRequirementHint,
  formatTaskTypeShortLabel,
} from './taskDetail/chainLabels'
import {
  uploadPhotoList,
  uploadVideoEvidenceRows,
  uploadDocumentList,
  webFallbackVideoPickerOptions,
} from './taskDetail/uploads'
import ReferenceMediaThumbList from './taskDetail/ReferenceMediaThumbList'

const BUCKET = 'gorev_kanitlari'
const CHECKLIST_PROGRESS_PREFIX = 'pods_task_checklist_progress_v1:'
const supabase = getSupabase()

/** Checklist JSON satırını şablondaki soru id'sine bağla (soru_id eksikse sıra / index). */
function resolveChecklistQuestionId(row, orderedQuestions, rowIndex) {
  const sid = row?.soru_id
  if (sid != null && String(sid).trim() !== '') return String(sid)
  if (row?.sira != null && Array.isArray(orderedQuestions) && orderedQuestions.length) {
    const hit = orderedQuestions.find((q) => Number(q?.sira) === Number(row.sira))
    if (hit?.id != null) return String(hit.id)
  }
  const fb = orderedQuestions?.[rowIndex]
  if (fb?.id != null) return String(fb.id)
  return String(rowIndex)
}

/** `denetim_karari` alanını accept | reject | '' olarak tekilleştir. */
function normalizeChecklistAuditDecision(raw) {
  if (raw === true) return 'accept'
  if (raw === false) return 'reject'
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!s) return ''
  if (s.includes('reject') || s.includes('redd')) return 'reject'
  if (s.includes('accept') || s.includes('kabul')) return 'accept'
  return ''
}
const ThemeObj = Theme?.default ?? Theme
const { Colors, Layout, Typography } = ThemeObj
export default function TaskDetail({ taskId: taskIdProp, onBack: onBackProp }) {
  const route = useRoute()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { personel, permissions, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const taskId = route.params?.taskId ?? taskIdProp
  const handleBack = useCallback(() => {
    if (onBackProp) onBackProp()
    else navigation?.goBack?.()
  }, [onBackProp, navigation])
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState([])
  const [videos, setVideos] = useState([])
  const [documents, setDocuments] = useState([])
  const [personelNotu, setPersonelNotu] = useState('')
  const [templateQuestions, setTemplateQuestions] = useState([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionAnswers, setQuestionAnswers] = useState({})
  const [questionPhotos, setQuestionPhotos] = useState({})
  const [questionVideos, setQuestionVideos] = useState({})
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [completing, setCompleting] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  // Henüz yüklenmemiş yerel taslak foto/video önizleme: { type: 'photo' | 'video', images?: string[], index?: number, videoUri?: string, durationSec?: number, title?: string }
  const [localPreview, setLocalPreview] = useState(null)
  const [chainGorevSteps, setChainGorevSteps] = useState([])
  const [chainOnaySteps, setChainOnaySteps] = useState([])
  const [chainPersonNameMap, setChainPersonNameMap] = useState({})
  const [assigneePerson, setAssigneePerson] = useState(null)
  const [assignerPerson, setAssignerPerson] = useState(null)
  /**
   * Havuz görev (`grup_id`) için diğer sorumluların özet bilgisi.
   *  - members: `[{ id, ad, soyad, isim, durum, isCompleter }]`
   *  - completer: tamamlayan (kanıt yükleyen) kişi varsa karta belirgin gösterilir.
   *  - Yalnız `task.grup_id` doluyken hesaplanır; olmayan görevlerde state boş kalır.
   */
  const [poolGroupSummary, setPoolGroupSummary] = useState(null)
  const [taskReferenceMedia, setTaskReferenceMedia] = useState([])
  const [stepReferenceMediaMap, setStepReferenceMediaMap] = useState({})
  const [captureUi, setCaptureUi] = useState(null)
  const captureUiRef = useRef(null)
  /** `takePhoto` vb. hook'lar checklist karar map'inden önce tanımlandığı için güncel kilit durumu ref ile okunur. */
  const checklistDecisionsRef = useRef({})

  useEffect(() => {
    captureUiRef.current = captureUi
  }, [captureUi])

  const isPermTruthy = useCallback(
    (key) => {
      const v = permissions?.[key]
      return v === true || v === 'true' || v === 1 || v === '1'
    },
    [permissions]
  )
  const canApproveTask = isPermTruthy('gorev_onayla') || isPermTruthy('denetim.onayla')
  const canAuditStep = canAuditTaskStep(permissions)
  /** RLS / görev sorgusu genişliği: onay yetkisi de yöneticiye dahil */
  const isManager =
    isPermTruthy('is_admin') ||
    isPermTruthy('is_manager') ||
    isPermTruthy('personel.yonet') ||
    isPermTruthy('personel_yonet') ||
    isPermTruthy('sube.yonet') ||
    isPermTruthy('sirket.yonet') ||
    isPermTruthy('rol.yonet') ||
    canApproveTask
  /**
   * Zincir adım listesi gizliliği: yalnızca şirket/hiyerarşi yöneticisi tam zinciri görür.
   * `canApproveTask` tek başına burada sayılmaz — aksi halde onaycı personel de tüm halkaları görüyordu.
   */
  const isBroadHierarchyManager =
    isSystemAdmin ||
    isPermTruthy('is_admin') ||
    isPermTruthy('is_manager') ||
    isPermTruthy('personel.yonet') ||
    isPermTruthy('personel_yonet') ||
    isPermTruthy('sube.yonet') ||
    isPermTruthy('sirket.yonet') ||
    isPermTruthy('rol.yonet')

  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )

  // AuthContext 45 saniyede bir profile refresh yapıyor ve `accessibleUnitIds`
  // her seferinde yeni bir array referansı olarak dönüyor. Referans değişimi
  // load() callback'ini yeniden üretip görev tamamlama ekranındaki yerel medya
  // state'lerinin sıfırlanmasına yol açabiliyor. İçerik aynıysa referansı da
  // sabit tutmak için stringified bir anahtar üzerinden memoize ediyoruz.
  const accessibleUnitIdsKey = useMemo(() => {
    const arr = Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []
    return arr.map((x) => String(x)).sort().join('|')
  }, [personel?.accessibleUnitIds])

  const birimHierarchyCtx = useMemo(
    () => ({
      isSystemAdmin,
      isTopCompanyScope,
      accessibleUnitIds: Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : [],
      fallbackBirimId: personel?.birim_id ?? null,
    }),
    // accessibleUnitIdsKey içerik değiştiğinde tetiklenir; referans değişikliği
    // (içerik aynı) artık ctx'i değiştirmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSystemAdmin, isTopCompanyScope, accessibleUnitIdsKey, personel?.birim_id],
  )

  const load = useCallback(async () => {
    if (!taskId || !personel?.id || !personel?.ana_sirket_id) {
      setLoading(false)
      return
    }

    try {
      const pid = personel.id
      /** Zincir/sıralı/onay satırında geçen işçi ana tabloda `sorumlu` olmayabilir; tekilleştirilmiş sorgudan önce hızlı kontrol */
      let chainParticipantCanLoadJob = false
      if (!isManager && taskId && pid) {
        const ringOr = `personel_id.eq.${pid},denetimci_personel_id.eq.${pid}`
        const [{ data: ringHit }, { data: onayHit }] = await Promise.all([
          supabase
            .from('isler_zincir_gorev_adimlari')
            .select('id')
            .eq('is_id', taskId)
            .or(ringOr)
            .limit(1),
          supabase
            .from('isler_zincir_onay_adimlari')
            .select('id')
            .eq('is_id', taskId)
            .eq('onaylayici_personel_id', pid)
            .limit(1),
        ])
        chainParticipantCanLoadJob = !!(ringHit?.length || onayHit?.length)
      }

      const selectWithManagerNote =
        'id, baslik, is_sablon_id, durum, grup_id, acil, aciklama, personel_tamamlama_notu, red_nedeni, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_videolar, belge_zorunlu, min_belge_sayisi, kanit_belgeler, referans_medya, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, tamamlama_gecmisi, denetim_gecmisi, tekrar_gonderim_sayisi, is_sablonlari(baslik, aciklama)'
      const selectWithoutManagerNote =
        'id, baslik, is_sablon_id, durum, grup_id, acil, aciklama, personel_tamamlama_notu, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_videolar, belge_zorunlu, min_belge_sayisi, kanit_belgeler, referans_medya, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, tamamlama_gecmisi, denetim_gecmisi, tekrar_gonderim_sayisi, is_sablonlari(baslik, aciklama)'

      const selectWithManagerNoteNoGroup =
        'id, baslik, is_sablon_id, durum, acil, aciklama, personel_tamamlama_notu, red_nedeni, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_videolar, belge_zorunlu, min_belge_sayisi, kanit_belgeler, referans_medya, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, tamamlama_gecmisi, denetim_gecmisi, tekrar_gonderim_sayisi, is_sablonlari(baslik, aciklama)'
      const selectWithoutManagerNoteNoGroup =
        'id, baslik, is_sablon_id, durum, acil, aciklama, personel_tamamlama_notu, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, video_zorunlu, min_video_sayisi, max_video_suresi_sn, kanit_videolar, belge_zorunlu, min_belge_sayisi, kanit_belgeler, referans_medya, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, tamamlama_gecmisi, denetim_gecmisi, tekrar_gonderim_sayisi, is_sablonlari(baslik, aciklama)'

      const buildScopedQuery = (selectClause) => {
        let q = supabase
          .from('isler')
          .select(selectClause)
          .eq('id', taskId)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        if (isManager) {
          q = restrictQueryByPersonelBirimHierarchy(q, birimHierarchyCtx)
        } else if (!chainParticipantCanLoadJob) {
          q = q.eq('sorumlu_personel_id', pid)
        }
        return q
      }

      let selectMain = selectWithManagerNote
      let selectForFallback = selectWithoutManagerNote

      let { data, error } = await buildScopedQuery(selectMain).maybeSingle()

      if (
        error?.code === '42703' &&
        String(error?.message || '').toLowerCase().includes('grup_id')
      ) {
        selectMain = selectWithManagerNoteNoGroup
        selectForFallback = selectWithoutManagerNoteNoGroup
        ;({ data, error } = await buildScopedQuery(selectMain).maybeSingle())
      } else if (
        error?.code === '42703' &&
        (String(error?.message || '').toLowerCase().includes('gorev_turu') ||
          String(error?.message || '').toLowerCase().includes('zincir_'))
      ) {
        selectMain = selectWithManagerNote
          .replace(', gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim', '')
        selectForFallback = selectWithoutManagerNote
          .replace(', gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim', '')
        ;({ data, error } = await buildScopedQuery(selectMain).maybeSingle())
      } else if (error?.code === '42703') {
        ;({ data, error } = await buildScopedQuery(selectForFallback).maybeSingle())
      }

      let resolved = data
      if (error || !resolved) {
        if (__DEV__ && error) console.warn('TaskDetail load error', error)
        // Fallback: eski/eksik tenant alanlı kayıtlarda en azından görev sahibi kendi kaydını görebilsin.
        if (!isManager) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('isler')
            .select(selectForFallback)
            .eq('id', taskId)
            .eq('sorumlu_personel_id', pid)
            .maybeSingle()
          if (!fallbackError && fallbackData) {
            resolved = fallbackData
          }
        }
        if (!resolved) {
          // Son fallback: kayıt tutarsız tenant/birim/sorumlu alanlarına sahip olsa bile detay ekranı açılsın.
          const { data: lastFallbackData, error: lastFallbackError } = await supabase
            .from('isler')
            .select(selectForFallback)
            .eq('id', taskId)
            .maybeSingle()
          if (!lastFallbackError && lastFallbackData) {
            resolved = lastFallbackData
          }
        }
      }
      const safe = resolved && typeof resolved === 'object' ? { ...resolved } : null

      let assigneeRow = null
      let assignerRow = null
      const earlyContactIds = [
        ...new Set([safe?.sorumlu_personel_id, safe?.atayan_personel_id].filter(Boolean)),
      ]
      if (earlyContactIds.length) {
        const { data: contactRows } = await supabase
          .from('personeller')
          .select('id,ad,soyad,email')
          .in('id', earlyContactIds)
        const byId = {}
        for (const r of contactRows || []) {
          if (r?.id) byId[String(r.id)] = r
        }
        assigneeRow = byId[String(safe?.sorumlu_personel_id || '')] || null
        assignerRow = byId[String(safe?.atayan_personel_id || '')] || null
      }

      setTask(safe)
      setAssigneePerson(assigneeRow)
      setAssignerPerson(assignerRow)
      setChainGorevSteps([])
      setChainOnaySteps([])
      setChainPersonNameMap({})
      let gorevSteps = []
      let onaySteps = []
      if (
        safe?.id &&
        (isZincirGorevTuru(safe.gorev_turu) ||
          safe.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY ||
          isSiraliGorevTuru(safe.gorev_turu))
      ) {
        let zgQuery = supabase
          .from('isler_zincir_gorev_adimlari')
          .select('id, adim_no, personel_id, denetimci_personel_id, adim_baslik, adim_istenenler, adim_durum, adim_gonderim_at, adim_onay_at, adim_onay_notu, durum, kanit_resim_ler, kanit_videolar, kanit_belgeler, kanit_foto_durumlari, aciklama, tamamlandi_at')
          .eq('is_id', safe.id)
          .order('adim_no', { ascending: true })
        let { data: zg, error: zgErr } = await zgQuery
        if (zgErr?.code === '42703') {
          const fb = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('id, adim_no, personel_id, adim_istenenler, durum, kanit_resim_ler, kanit_videolar, kanit_belgeler, kanit_foto_durumlari')
            .eq('is_id', safe.id)
            .order('adim_no', { ascending: true })
          zg = fb.data
        }
        gorevSteps = zg || []
        if (gorevSteps.length) setChainGorevSteps(gorevSteps)
      }
      if (safe?.id && isZincirOnayTuru(safe.gorev_turu)) {
        let zoQuery = supabase
          .from('isler_zincir_onay_adimlari')
          .select('id, adim_no, onaylayici_personel_id, durum, onaylandi_at')
          .eq('is_id', safe.id)
          .order('adim_no', { ascending: true })
        let { data: zo, error: zoErr } = await zoQuery
        if (zoErr?.code === '42703') {
          const fb = await supabase
            .from('isler_zincir_onay_adimlari')
            .select('id, adim_no, onaylayici_personel_id, durum')
            .eq('is_id', safe.id)
            .order('adim_no', { ascending: true })
          zo = fb.data
        }
        onaySteps = zo || []
        if (onaySteps.length) setChainOnaySteps(onaySteps)
      }
      const chainPersonIds = Array.from(
        new Set([
          ...gorevSteps.map((s) => s?.personel_id).filter(Boolean),
          ...gorevSteps.map((s) => s?.denetimci_personel_id).filter(Boolean),
          ...onaySteps.map((s) => s?.onaylayici_personel_id).filter(Boolean),
        ].map((x) => String(x))),
      )
      if (chainPersonIds.length) {
        const { data: people } = await supabase
          .from('personeller')
          .select('id,ad,soyad,email')
          .in('id', chainPersonIds)
        const map = {}
        for (const p of people || []) {
          const full = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim()
          map[String(p.id)] = full || p?.email || String(p.id)
        }
        setChainPersonNameMap(map)
      }

      // NOT: Burada `personelNotu`, `photos`, `videos` state'leri sıfırlanmaz.
      // AuthContext arka plan presence/profile refresh'leri (her 45sn) yüzünden
      // `load` yeniden tetiklenebilir; bu sıfırlamalar kullanıcının çektiği
      // video/fotoğrafı ve girdiği notu silerek "kaybolma" hatasına yol açıyordu.
      // Görev değiştiğinde sıfırlama, aşağıdaki taskId'ye bağlı ayrı useEffect
      // ile yapılır.
    } catch (e) {
      if (__DEV__) console.warn('TaskDetail load error', e)
      setTask(null)
      setAssigneePerson(null)
      setAssignerPerson(null)
    } finally {
      setLoading(false)
    }
  }, [taskId, personel?.id, personel?.ana_sirket_id, isManager, birimHierarchyCtx])

  useEffect(() => {
    load()
  }, [load])

  // Kullanıcı arabirimi state'lerinin (yerel medya + not) yalnızca **görev
  // değişiminde** sıfırlanmasını sağlar. `load` periyodik olarak yeniden
  // çağrılsa bile (örn. AuthContext refresh tetiklediğinde) yerel olarak
  // çekilen fotoğraf/video kaybolmaz.
  useEffect(() => {
    setPhotos([])
    setVideos([])
    setDocuments([])
    setPersonelNotu('')
  }, [taskId])

  /**
   * Havuz görev (grup_id) özetini yükler:
   *  - Aynı grup_id'ye sahip tüm `isler` satırlarını çeker (bu işle birlikte 2-N kişi).
   *  - Sorumlu personel id'lerini topluca `personeller` tablosundan ad/soyad ile eşler.
   *  - Tamamlayan kişi: kanıt yüklemiş veya `personel_tamamlama_notu` doldurmuş olan ilk kişi
   *    (yoksa hepsi APPROVED durumdaysa en son güncellenen).
   *  - `task.grup_id` yoksa veya satır <2 ise state null kalır (görsel rozet gösterilmez).
   */
  useEffect(() => {
    let cancelled = false
    async function loadPoolSummary() {
      try {
        if (!task?.grup_id || !task?.ana_sirket_id) {
          if (!cancelled) setPoolGroupSummary(null)
          return
        }
        const { data: groupRows } = await supabase
          .from('isler')
          .select(
            'id, sorumlu_personel_id, durum, kanit_resim_ler, kanit_videolar, personel_tamamlama_notu, updated_at',
          )
          .eq('ana_sirket_id', task.ana_sirket_id)
          .eq('grup_id', task.grup_id)
        if (cancelled) return
        const rows = Array.isArray(groupRows) ? groupRows : []
        if (rows.length < 2) {
          setPoolGroupSummary(null)
          return
        }
        const personIds = [
          ...new Set(rows.map((r) => r?.sorumlu_personel_id).filter(Boolean)),
        ]
        let nameMap = {}
        if (personIds.length) {
          const { data: people } = await supabase
            .from('personeller')
            .select('id, ad, soyad')
            .in('id', personIds)
          ;(people || []).forEach((p) => {
            const isim = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim() || 'Personel'
            nameMap[String(p.id)] = isim
          })
        }
        const evidenceCount = (r) => {
          let n = 0
          const ph = r?.kanit_resim_ler
          if (Array.isArray(ph)) n += ph.length
          else if (ph && typeof ph === 'object') n += Object.keys(ph).length
          const vd = r?.kanit_videolar
          if (Array.isArray(vd)) n += vd.length
          else if (vd && typeof vd === 'object') n += Object.keys(vd).length
          return n
        }
        let completer = rows.find(
          (r) => evidenceCount(r) > 0 || (r?.personel_tamamlama_notu && String(r.personel_tamamlama_notu).trim()),
        )
        if (!completer && rows.every((r) => isApprovedTaskStatus(r?.durum))) {
          completer = [...rows].sort((a, b) => {
            const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0
            const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0
            return tb - ta
          })[0]
        }
        const completerId = completer?.sorumlu_personel_id
          ? String(completer.sorumlu_personel_id)
          : null
        const members = rows
          .map((r) => {
            const id = r?.sorumlu_personel_id ? String(r.sorumlu_personel_id) : ''
            return {
              id,
              isim: nameMap[id] || 'Personel',
              durum: r?.durum,
              isCompleter: completerId != null && completerId === id,
            }
          })
          .sort((a, b) => {
            if (a.isCompleter && !b.isCompleter) return -1
            if (!a.isCompleter && b.isCompleter) return 1
            return a.isim.localeCompare(b.isim, 'tr')
          })
        setPoolGroupSummary({
          memberCount: rows.length,
          members,
          completerId,
          completerName: completerId ? nameMap[completerId] || 'Personel' : null,
        })
      } catch (e) {
        if (__DEV__) console.warn('TaskDetail pool group summary error', e)
        if (!cancelled) setPoolGroupSummary(null)
      }
    }
    void loadPoolSummary()
    return () => {
      cancelled = true
    }
  }, [task?.grup_id, task?.ana_sirket_id])

  useEffect(() => {
    let cancelled = false
    const resolveRefItems = async (items) => {
      const list = normalizeReferenceMediaList(items)
      const out = []
      for (const item of list) {
        const directRaw =
          item?.signedUrl ||
          item?.publicUrl ||
          (typeof item?.url === 'string' && /^https?:\/\//i.test(item.url.trim()) ? item.url.trim() : '')
        if (directRaw) {
          const mimeType = String(item?.mimeType || '')
          const kind = inferReferenceRowKind(item, directRaw)
          const typeStr = kind === 'video' ? 'video' : kind === 'image' ? 'image' : String(item?.type || 'file')
          out.push({
            ...item,
            signedUrl: directRaw,
            type: typeStr,
            mimeType,
            name: String(item?.name || ''),
          })
          continue
        }
        const path = String(item?.path || item?.yol || '').trim()
        if (!path) continue
        const { data } = await supabase.storage
          .from('task-reference-media')
          .createSignedUrl(path, 60 * 60 * 24)
        const signedUrl = data?.signedUrl || null
        if (!signedUrl) continue
        out.push({
          ...item,
          signedUrl,
          type: String(item?.type || inferReferenceRowKind(item, signedUrl)),
          mimeType: String(item?.mimeType || ''),
          name: String(item?.name || ''),
        })
      }
      return out
    }
    ;(async () => {
      if (!task?.id) {
        setTaskReferenceMedia([])
        setStepReferenceMediaMap({})
        return
      }
      const taskRefs = await resolveRefItems(task?.referans_medya)
      const stepEntries = await Promise.all(
        (chainGorevSteps || []).map(async (step) => {
          const ist = normalizeJsonObject(step?.adim_istenenler)
          const refs = await resolveRefItems(ist?.referans_medya)
          return [String(step.id), refs]
        }),
      )
      if (cancelled) return
      setTaskReferenceMedia(taskRefs)
      setStepReferenceMediaMap(Object.fromEntries(stepEntries))
    })()
    return () => {
      cancelled = true
    }
  }, [task?.id, task?.referans_medya, chainGorevSteps])

  const handleEvidencePhotoComplete = useCallback((payload) => {
    const snap = captureUiRef.current
    setCaptureUi(null)
    if (!snap?.context || !payload?.uri) return
    const ctx = snap.context
    if (ctx.type === 'adhoc_photo') {
      setPhotos((prev) => [...prev, { uri: payload.uri, base64: payload.base64 ?? null }])
    } else if (ctx.type === 'checklist_photo') {
      const qid = String(ctx.questionId)
      if (checklistDecisionsRef.current?.[qid] === 'accept') return
      setQuestionPhotos((prev) => ({
        ...prev,
        [qid]: [...(prev?.[qid] || []), { uri: payload.uri, base64: payload.base64 ?? null }],
      }))
    }
  }, [])

  const handleEvidenceVideoComplete = useCallback(
    (payload) => {
      const snap = captureUiRef.current
      if (!snap?.context || !payload?.uri) return
      const ctx = snap.context
      const maxSec =
        ctx.type === 'checklist_video'
          ? Math.min(60, Math.max(5, Number(ctx.maxVideoSec) || 60))
          : Math.min(60, Math.max(5, Number(ctx.maxVideoSec ?? task?.max_video_suresi_sn) || 60))
      let durationSec =
        payload.durationSec != null && Number.isFinite(Number(payload.durationSec))
          ? Number(payload.durationSec)
          : null
      // Süre limitinde kesilen kayıtta native / saat küçük taşma yapabilir; reddetmek videoyu sıfırlıyordu.
      if (durationSec != null && durationSec > maxSec) {
        durationSec = maxSec
      }
      if (ctx.type === 'adhoc_video') {
        setVideos((prev) => [...prev, { uri: payload.uri, durationSec }])
      } else if (ctx.type === 'checklist_video') {
        const qid = String(ctx.questionId)
        if (checklistDecisionsRef.current?.[qid] === 'accept') {
          setCaptureUi(null)
          return
        }
        setQuestionVideos((prev) => ({
          ...prev,
          [qid]: [...(prev?.[qid] || []), { uri: payload.uri, durationSec }],
        }))
      }
    },
    [task?.max_video_suresi_sn],
  )

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
        const asset = result.assets[0]
        setPhotos((prev) => [...prev, { uri: asset.uri, base64: asset.base64 || null }])
      }
      return
    }
    setCaptureUi({ mode: 'photo', context: { type: 'adhoc_photo' } })
  }, [])

  const removePhoto = useCallback((index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const takeVideo = useCallback(async () => {
    const maxSec = Math.min(60, Math.max(5, Number(task?.max_video_suresi_sn) || 60))
    if (Platform.OS === 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('İzin gerekli', 'Kamera izni verin.')
        return
      }
      const result = await ImagePicker.launchCameraAsync(webFallbackVideoPickerOptions(maxSec))
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        let durationSec =
          asset.duration != null && Number.isFinite(Number(asset.duration))
            ? Number(asset.duration) / 1000
            : null
        if (durationSec != null && durationSec > maxSec + 0.75) {
          Alert.alert('Çok uzun', `Video en fazla ${maxSec} saniye olabilir.`)
          return
        }
        setVideos((prev) => [...prev, { uri: asset.uri, durationSec }])
      }
      return
    }
    setCaptureUi({ mode: 'video', context: { type: 'adhoc_video', maxVideoSec: maxSec } })
  }, [task?.max_video_suresi_sn])

  const removeVideo = useCallback((index) => {
    setVideos((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const pickDocuments = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const assets = result.assets || (result.uri ? [result] : [])
      const next = assets
        .map((a) => ({
          uri: a.uri,
          name: a.name || 'belge',
          mimeType: a.mimeType || null,
          size: a.size ?? null,
        }))
        .filter((a) => a.uri)
      if (next.length) setDocuments((prev) => [...prev, ...next])
    } catch (e) {
      Alert.alert('Belge seçilemedi', e?.message || 'Dosya seçimi başarısız')
    }
  }, [])

  const removeDocument = useCallback((index) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const checklistStorageKey = useMemo(() => `${CHECKLIST_PROGRESS_PREFIX}${String(taskId || '')}`, [taskId])

  const persistChecklistProgress = useCallback(
    async (nextIndex, nextAnswers, nextPhotos, nextNote = personelNotu, nextVideos = {}) => {
      if (!taskId) return
      const payload = {
        questionIndex: Number.isFinite(nextIndex) ? nextIndex : 0,
        answers: nextAnswers || {},
        photos: nextPhotos || {},
        videos: nextVideos || {},
        note: String(nextNote || ''),
      }
      setDraftSaving(true)
      try {
        await AsyncStorage.setItem(checklistStorageKey, JSON.stringify(payload))
        setDraftSavedAt(Date.now())
      } catch {
        // best-effort
      } finally {
        setDraftSaving(false)
      }
    },
    [checklistStorageKey, taskId, personelNotu],
  )

  useEffect(() => {
    const loadChecklist = async () => {
      const sablonId = task?.is_sablon_id
      if (!sablonId || !personel?.ana_sirket_id) {
        setTemplateQuestions([])
        setQuestionIndex(0)
        setQuestionAnswers({})
        setQuestionPhotos({})
        setQuestionVideos({})
        return
      }

      setChecklistLoading(true)
      try {
        const { data: qRows, error } = await supabase
          .from('is_sablon_sorulari')
          .select(
            'id, sablon_id, soru_metni, soru_tipi, puan_degeri, foto_zorunlu, min_foto_sayisi, max_video_suresi_sn, zorunlu_mu, sira',
          )
          .eq('sablon_id', sablonId)
          .order('sira', { ascending: true })

        if (error) throw error

        const qs = (qRows || []).map((q, idx) => ({
          ...q,
          _idx: idx,
          soru_tipi: String(q?.soru_tipi || 'METIN').toUpperCase(),
        }))

        setTemplateQuestions(qs)

        const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
        let answers = {}
        let photos = {}
        let videos = {}
        let hadRaw = false
        // Taslak + sunucu: denetimcinin "kabul" verdiği maddeler yerel taslaktan silinir (tekrar düzenlenemesin);
        // reddedilen veya henüz denetlenmemiş maddelerde boş alanlar sunucudaki cevapla dolar.
        try {
          const raw = await AsyncStorage.getItem(checklistStorageKey)
          if (raw) {
            hadRaw = true
            const parsed = JSON.parse(raw)
            setQuestionIndex(Math.min(Number(parsed?.questionIndex) || 0, Math.max(qs.length - 1, 0)))
            answers = parsed?.answers && typeof parsed.answers === 'object' ? { ...parsed.answers } : {}
            photos = parsed?.photos && typeof parsed.photos === 'object' ? { ...parsed.photos } : {}
            videos = parsed?.videos && typeof parsed.videos === 'object' ? { ...parsed.videos } : {}
            setPersonelNotu(String(parsed?.note || ''))
          }
        } catch {
          // ignore
        }

        rows.forEach((row, i) => {
          const qid = resolveChecklistQuestionId(row, qs, i)
          if (normalizeChecklistAuditDecision(row?.denetim_karari) === 'accept') {
            delete answers[qid]
            delete photos[qid]
            delete videos[qid]
          }
        })

        rows.forEach((row, i) => {
          const qid = resolveChecklistQuestionId(row, qs, i)
          if (normalizeChecklistAuditDecision(row?.denetim_karari) === 'accept') return
          if (!String(answers[qid] || '').trim()) {
            const c = String(
              row?.cevap ?? row?.cevap_metni ?? row?.answer ?? row?.value ?? '',
            ).trim()
            if (c) answers[qid] = c
          }
          const existingPh = photos[qid]
          if (!Array.isArray(existingPh) || !existingPh.length) {
            const urls = normalizeChecklistPhotos(
              row?.fotograflar ??
                row?.fotos ??
                row?.foto_urls ??
                row?.photo_urls ??
                row?.images ??
                null,
            )
            if (urls.length) {
              photos[qid] = urls.map((u) =>
                typeof u === 'string' ? { uri: u } : { uri: u?.uri || u?.url || String(u) },
              )
            }
          }
          const existingVid = videos[qid]
          if (!Array.isArray(existingVid) || !existingVid.length) {
            const vr = extractKanitVideoRows(row)
            if (vr.length) {
              videos[qid] = vr.map((v) => ({
                uri: v.url,
                durationSec:
                  v.duration_sec != null && Number.isFinite(Number(v.duration_sec))
                    ? Number(v.duration_sec)
                    : null,
              }))
            }
          }
        })

        setQuestionAnswers(answers)
        setQuestionPhotos(photos)
        setQuestionVideos(videos)
        if (!hadRaw && task?.personel_tamamlama_notu) {
          setPersonelNotu(String(task.personel_tamamlama_notu))
        }
      } catch (e) {
        if (__DEV__) console.warn('TaskDetail loadChecklist error', e)
        setTemplateQuestions([])
      } finally {
        setChecklistLoading(false)
      }
    }

    loadChecklist()
  }, [
    task?.id,
    task?.is_sablon_id,
    task?.checklist_cevaplari,
    task?.personel_tamamlama_notu,
    personel?.ana_sirket_id,
    checklistStorageKey,
  ])

  const takePhotoForQuestion = useCallback(async (questionId) => {
    const qid = String(questionId)
    if (checklistDecisionsRef.current?.[qid] === 'accept') return
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
        const asset = result.assets[0]
        const qid = String(questionId)
        setQuestionPhotos((prev) => ({
          ...prev,
          [qid]: [...(prev?.[qid] || []), { uri: asset.uri, base64: asset.base64 || null }],
        }))
      }
      return
    }
    setCaptureUi({
      mode: 'photo',
      context: { type: 'checklist_photo', questionId: String(questionId) },
    })
  }, [])

  const takeVideoForQuestion = useCallback(async (questionId, maxSecAllowed = 60) => {
    const qid = String(questionId)
    if (checklistDecisionsRef.current?.[qid] === 'accept') return
    const maxSec = Math.min(60, Math.max(5, Number(maxSecAllowed) || 60))
    if (Platform.OS === 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('İzin gerekli', 'Kamera izni verin.')
        return
      }
      const result = await ImagePicker.launchCameraAsync(webFallbackVideoPickerOptions(maxSec))
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        let durationSec =
          asset.duration != null && Number.isFinite(Number(asset.duration))
            ? Number(asset.duration) / 1000
            : null
        if (durationSec != null && durationSec > maxSec + 0.75) {
          Alert.alert('Çok uzun', `Bu soru için video en fazla ${maxSec} saniye olabilir.`)
          return
        }
        const qid = String(questionId)
        setQuestionVideos((prev) => ({
          ...prev,
          [qid]: [...(prev?.[qid] || []), { uri: asset.uri, durationSec }],
        }))
      }
      return
    }
    setCaptureUi({
      mode: 'video',
      context: {
        type: 'checklist_video',
        questionId: String(questionId),
        maxVideoSec: maxSec,
      },
    })
  }, [])

  const removeQuestionVideo = useCallback((questionId, videoIndex) => {
    const qid = String(questionId)
    if (checklistDecisionsRef.current?.[qid] === 'accept') return
    setQuestionVideos((prev) => {
      const list = prev?.[qid] || []
      const nextForQuestion = list.filter((_, i) => i !== videoIndex)
      return { ...prev, [qid]: nextForQuestion }
    })
  }, [])

  const removeQuestionPhoto = useCallback(
    async (questionId, photoIndex) => {
      const qid = String(questionId)
      if (checklistDecisionsRef.current?.[qid] === 'accept') return
      setQuestionPhotos((prev) => {
        const list = prev?.[qid] || []
        const nextForQuestion = list.filter((_, i) => i !== photoIndex)
        return { ...prev, [qid]: nextForQuestion }
      })
    },
    [],
  )

  const hasChecklist =
    !!task?.is_sablon_id ||
    (Array.isArray(task?.checklist_cevaplari) &&
      task.checklist_cevaplari.length > 0)

  const normalizeChecklistPhotos = useCallback((raw) => {
    if (!raw) return []
    if (Array.isArray(raw)) return raw.filter(Boolean)
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) return []
      try {
        if (
          (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
          (trimmed.startsWith('{') && trimmed.endsWith('}'))
        ) {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed.filter(Boolean)
        }
      } catch {
        // ignore parse errors
      }
      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      }
      return [trimmed]
    }
    return []
  }, [])

  const checklistDecisionsByQuestionId = useMemo(() => {
    const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const qs = templateQuestions || []
    const map = {}
    rows.forEach((row, i) => {
      const qid = resolveChecklistQuestionId(row, qs, i)
      map[qid] = normalizeChecklistAuditDecision(row?.denetim_karari)
    })
    return map
  }, [task?.checklist_cevaplari, templateQuestions])

  /**
   * Reddedilen maddenin denetimci tarafından girilen kısa notu — personel görevi tekrar
   * açtığında soru kartının üstünde kırmızı uyarı banner'ında gösterilir.
   */
  const checklistRejectNotesByQuestionId = useMemo(() => {
    const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const qs = templateQuestions || []
    const map = {}
    rows.forEach((row, i) => {
      const qid = resolveChecklistQuestionId(row, qs, i)
      const note = String(row?.denetim_red_notu || '').trim()
      if (note) map[qid] = note
    })
    return map
  }, [task?.checklist_cevaplari, templateQuestions])

  const checklistAnswersByQuestionId = useMemo(() => {
    const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const qs = templateQuestions || []
    const map = {}
    rows.forEach((row, i) => {
      const qid = resolveChecklistQuestionId(row, qs, i)
      map[qid] = String(
        row?.cevap ?? row?.cevap_metni ?? row?.answer ?? row?.value ?? '',
      ).trim()
    })
    return map
  }, [task?.checklist_cevaplari, templateQuestions])

  const checklistPhotosByQuestionId = useMemo(() => {
    const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const qs = templateQuestions || []
    const map = {}
    rows.forEach((row, i) => {
      const qid = resolveChecklistQuestionId(row, qs, i)
      map[qid] = normalizeChecklistPhotos(
        row?.fotograflar ??
          row?.fotos ??
          row?.foto_urls ??
          row?.photo_urls ??
          row?.images ??
          null,
      )
    })
    return map
  }, [task?.checklist_cevaplari, templateQuestions, normalizeChecklistPhotos])

  const checklistVideosByQuestionId = useMemo(() => {
    const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const qs = templateQuestions || []
    const map = {}
    rows.forEach((row, i) => {
      const qid = resolveChecklistQuestionId(row, qs, i)
      map[qid] = extractKanitVideoRows(row)
    })
    return map
  }, [task?.checklist_cevaplari, templateQuestions])

  useEffect(() => {
    checklistDecisionsRef.current = checklistDecisionsByQuestionId || {}
  }, [checklistDecisionsByQuestionId])

  const isQuestionDone = useCallback(
    (q) => {
      const qid = String(q?.id || '')
      // Denetimcinin daha önce kabul ettiği madde resubmit akışında zaten kilitli ve
      // tamamlama için yeni veri girilmesine gerek yok — her zaman tamamlanmış sayılır.
      if (checklistDecisionsByQuestionId?.[qid] === 'accept') return true
      const qType = String(q?.soru_tipi || 'METIN').toUpperCase()
      const required = !!q?.zorunlu_mu
      const answer = questionAnswers?.[qid]
      const qPhotos = questionPhotos?.[qid] || []
      const qVideos = questionVideos?.[qid] || []

      if (qType === 'EVET_HAYIR') return answer === 'EVET' || answer === 'HAYIR'
      if (qType === 'METIN') return required ? !!String(answer || '').trim() : !!String(answer || '').trim()
      if (qType === 'FOTOGRAF') {
        const qMin = Number(q?.min_foto_sayisi) || 0
        const need = !!q?.foto_zorunlu || required
        if (!need) return qPhotos.length > 0
        return qPhotos.length >= qMin
      }
      if (qType === 'VIDEO') {
        const need = required
        if (!need) return qVideos.length > 0
        return qVideos.length >= 1
      }
      return false
    },
    [questionAnswers, questionPhotos, questionVideos, checklistDecisionsByQuestionId],
  )

  useEffect(() => {
    if (!hasChecklist) return
    const t = setTimeout(() => {
      const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
      const qs = templateQuestions || []
      const answers = { ...questionAnswers }
      const photos = { ...questionPhotos }
      const videos = { ...questionVideos }
      rows.forEach((row, i) => {
        const qid = resolveChecklistQuestionId(row, qs, i)
        if (normalizeChecklistAuditDecision(row?.denetim_karari) === 'accept') {
          delete answers[qid]
          delete photos[qid]
          delete videos[qid]
        }
      })
      persistChecklistProgress(questionIndex, answers, photos, personelNotu, videos)
    }, 600)
    return () => clearTimeout(t)
  }, [
    hasChecklist,
    persistChecklistProgress,
    questionIndex,
    questionAnswers,
    questionPhotos,
    questionVideos,
    personelNotu,
    task?.checklist_cevaplari,
    templateQuestions,
  ])

  const completeTask = useCallback(async () => {
    if (!taskId || !task) return
    const isTaskOwner = String(task.sorumlu_personel_id || '') === String(personel?.id || '')
    if (!isTaskOwner) {
      Alert.alert('Yetki yok', 'Bu görevi güncelleme yetkiniz bulunmuyor.')
      return
    }
    const siraliStep =
      isSiraliGorevTuru(task?.gorev_turu) &&
      (chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'aktif') ||
        chainGorevSteps.find((s) => Number(s?.adim_no || 0) === Number(task?.zincir_aktif_adim || 1)))
    const zincirStepForComplete =
      !isSiraliGorevTuru(task?.gorev_turu) && chainGorevSteps.length
        ? chainGorevSteps.find((s) => Number(s.adim_no) === Number(task?.zincir_aktif_adim || 1))
        : null
    const incompleteNonSiraliChain =
      chainGorevSteps.length > 0 &&
      !isSiraliGorevTuru(task?.gorev_turu) &&
      !isApprovedTaskStatus(String(task?.durum ?? 'Bekliyor'))
    /** Zincir halkada checklist UI tamamlanamaz; is_sablon_id yüzünden kanıt formu kaybolmasın */
    const effectiveHasChecklistForComplete =
      hasChecklist && !incompleteNonSiraliChain
    const chainRowForRules = isSiraliGorevTuru(task?.gorev_turu) ? siraliStep : zincirStepForComplete
    const rulePack = resolveAdhocKanitRules(task, chainRowForRules)
    const minFoto = rulePack.minFoto
    const fotoZorunlu = rulePack.fotoZorunlu
    const minVideo = rulePack.minVideo
    const videoZorunlu = rulePack.videoZorunlu
    const belgeZorunlu = rulePack.belgeZorunlu
    const minBelge = rulePack.minBelge
    const taskMaxVidSn = rulePack.maxVideoSn
    const aciklamaZorunlu = rulePack.aciklamaZorunlu
    const trimmedNote = (personelNotu || '').trim()
    const dueDate = task?.son_tarih ? new Date(task.son_tarih) : null
    const isOverdue = !!(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now())

    if (isOverdue) {
      Alert.alert('Gecikmiş görev', 'Bu görev gecikmiş durumda olduğu için tamamlanamaz.')
      return
    }

    if (!effectiveHasChecklistForComplete) {
      if (aciklamaZorunlu && !trimmedNote) {
        Alert.alert('Açıklama gerekli', 'Bu görevi tamamlarken açıklama yazmanız gerekiyor.')
        return
      }

      if (fotoZorunlu && photos.length < minFoto) {
        Alert.alert('Eksik fotoğraf', `En az ${minFoto} fotoğraf eklemelisiniz.`)
        return
      }

      if (videoZorunlu && videos.length < minVideo) {
        Alert.alert('Eksik video', `En az ${minVideo} video eklemelisiniz.`)
        return
      }
      if (belgeZorunlu && documents.length < minBelge) {
        Alert.alert(
          'Eksik belge',
          `En az ${minBelge} belge ekleyin (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX).`,
        )
        return
      }
      for (const v of videos) {
        const d = v?.durationSec
        if (d != null && Number.isFinite(Number(d)) && Number(d) > taskMaxVidSn + 0.75) {
          Alert.alert('Video süresi', `Her video en fazla ${taskMaxVidSn} saniye olmalı.`)
          return
        }
      }
    }

    if (effectiveHasChecklistForComplete && templateQuestions.length) {
      // Checklist validations
      for (const q of templateQuestions) {
        const qid = String(q?.id)
        // Önceden onaylanmış maddeler resubmit akışında kilitli; eski veri korunur, yeniden
        // doğrulamaya gerek yok (zaten denetimden geçmiş kabul edilmiş hali).
        if (checklistDecisionsByQuestionId?.[qid] === 'accept') continue
        const qType = String(q?.soru_tipi || 'METIN').toUpperCase()
        const isRequired = !!q?.zorunlu_mu
        const qPhotos = questionPhotos?.[qid] || []
        const qVideos = questionVideos?.[qid] || []
        const answer = questionAnswers?.[qid]

        if (qType === 'EVET_HAYIR' && isRequired && answer !== 'EVET' && answer !== 'HAYIR') {
          Alert.alert('Eksik cevap', `Checklist sorusu cevaplanmalı: ${q?.soru_metni || ''}`)
          return
        }
        if (qType === 'METIN' && isRequired && !String(answer || '').trim()) {
          Alert.alert('Eksik cevap', `Checklist sorusu cevaplanmalı: ${q?.soru_metni || ''}`)
          return
        }
        if (qType === 'FOTOGRAF') {
          const qMin = Number(q?.min_foto_sayisi) || 0
          const need = !!q?.foto_zorunlu || isRequired
          if (need && qPhotos.length < qMin) {
            Alert.alert('Eksik fotoğraf', `En az ${qMin} fotoğraf ekleyin: ${q?.soru_metni || ''}`)
            return
          }
        }
        if (qType === 'VIDEO') {
          const qMax = Math.min(60, Math.max(5, Number(q?.max_video_suresi_sn) || 60))
          const need = isRequired
          if (need && qVideos.length < 1) {
            Alert.alert('Eksik video', `Video ekleyin: ${q?.soru_metni || ''}`)
            return
          }
          for (const v of qVideos) {
            const d = v?.durationSec
            if (d != null && Number.isFinite(Number(d)) && Number(d) > qMax + 0.75) {
              Alert.alert('Video süresi', `"${q?.soru_metni || ''}" için en fazla ${qMax} sn.`)
              return
            }
          }
        }
      }
    }
    setCompleting(true)
    try {
      if (isSiraliGorevTuru(task?.gorev_turu)) {
        if (!siraliStep || String(siraliStep?.personel_id || '') !== String(personel?.id || '')) {
          Alert.alert('Sıra hatası', 'Aktif sıralı görev adımı size ait değil.')
          setCompleting(false)
          return
        }
        let uploadedUrls = []
        let uploadedVidRows = []
        let uploadedDocRows = []
        try {
          ;[uploadedUrls, uploadedVidRows, uploadedDocRows] = await Promise.all([
            uploadPhotoList(BUCKET, `task-${taskId}-sirali-${siraliStep.adim_no}`, photos),
            uploadVideoEvidenceRows(
              BUCKET,
              `task-${taskId}-sirali-${siraliStep.adim_no}-vid`,
              videos,
            ),
            documents.length
              ? uploadDocumentList(
                  BUCKET,
                  `task-${taskId}-sirali-${siraliStep.adim_no}-doc`,
                  documents,
                )
              : Promise.resolve([]),
          ])
        } catch (uploadErr) {
          Alert.alert('Yükleme hatası', uploadErr?.message || 'Kanıt yüklenemedi')
          setCompleting(false)
          return
        }
        const kanitDurum = buildKanitFotoDurumlari(uploadedUrls)
        const { error: stepUpdErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .update({
            kanit_resim_ler: uploadedUrls,
            kanit_videolar: uploadedVidRows,
            kanit_belgeler: uploadedDocRows,
            kanit_foto_durumlari: kanitDurum,
          })
          .eq('id', siraliStep.id)
        if (stepUpdErr) {
          Alert.alert('Hata', stepUpdErr.message || 'Kanıt kaydedilemedi')
          setCompleting(false)
          return
        }
        const { error } = await supabase.rpc('rpc_sirali_adim_tamamla', {
          p_is_id: taskId,
          p_adim_no: Number(siraliStep.adim_no),
          p_aciklama: (personelNotu || '').trim() || null,
        })
        if (error) {
          Alert.alert('Hata', error.message || 'Adım tamamlanamadı')
          setCompleting(false)
          return
        }
        await logTaskTimelineEvent(taskId, 'completion', personel?.id, `sirali-step-complete:${siraliStep.adim_no}`)
        Alert.alert('Başarılı', 'Görev tamamlandı ve başarıyla sisteme gönderildi.', [{ text: 'Tamam', onPress: handleBack }])
        setCompleting(false)
        load()
        return
      }

      if (
        effectiveHasChecklistForComplete &&
        task?.gorev_turu &&
        task.gorev_turu !== GOREV_TURU.NORMAL &&
        task.gorev_turu !== 'normal'
      ) {
        Alert.alert(
          'Zincir modu',
          'Şablonlu (checklist) görevlerde zincir görev/onay henüz desteklenmiyor; şablonsuz görev oluşturun.',
        )
        setCompleting(false)
        return
      }

      const durumText = String(task?.durum || '').toLowerCase()
      const isResubmission =
        durumText.includes('onaylanmad') ||
        durumText.includes('revize') ||
        durumText.includes('redd')

      /** Zincir görev: ara halkalar — sonraki personele devret veya onaya gönder */
      if (!effectiveHasChecklistForComplete && !isSiraliGorevTuru(task?.gorev_turu) && chainGorevSteps.length) {
        let uploadedUrls = []
        let uploadedVidRows = []
        let uploadedDocRows = []
        const currentAdim = Number(task.zincir_aktif_adim) || 1
        const zincirPrefix = `task-${taskId}-zincir-${currentAdim}`
        try {
          ;[uploadedUrls, uploadedVidRows, uploadedDocRows] = await Promise.all([
            uploadPhotoList(BUCKET, zincirPrefix, photos),
            uploadVideoEvidenceRows(BUCKET, `${zincirPrefix}-vid`, videos),
            documents.length
              ? uploadDocumentList(BUCKET, `${zincirPrefix}-doc`, documents)
              : Promise.resolve([]),
          ])
        } catch (uploadErr) {
          Alert.alert('Yükleme hatası', uploadErr?.message || 'Kanıt yüklenemedi')
          setCompleting(false)
          return
        }
        const currentRow = chainGorevSteps.find((s) => Number(s.adim_no) === currentAdim)
        if (!currentRow || String(currentRow.personel_id) !== String(personel?.id)) {
          Alert.alert('Sıra hatası', 'Bu zincir adımı sizin sıranızda değil.')
          setCompleting(false)
          return
        }
        const kanitDurum = buildKanitFotoDurumlari(uploadedUrls)
        const { error: stepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .update({
            kanit_resim_ler: uploadedUrls,
            kanit_videolar: uploadedVidRows,
            kanit_belgeler: uploadedDocRows,
            kanit_foto_durumlari: kanitDurum,
            durum: 'tamamlandi',
            tamamlandi_at: new Date().toISOString(),
            aciklama: trimmedNote || null,
          })
          .eq('id', currentRow.id)
        if (stepErr) {
          Alert.alert('Hata', stepErr.message || 'Zincir adımı kaydedilemedi')
          setCompleting(false)
          return
        }
        const total = chainGorevSteps.length
        if (currentAdim < total) {
          const nextRow = chainGorevSteps.find((s) => Number(s.adim_no) === currentAdim + 1)
          if (!nextRow) {
            Alert.alert('Hata', 'Sonraki adım bulunamadı')
            setCompleting(false)
            return
          }
          const { data: nextPerson } = await supabase
            .from('personeller')
            .select('id, birim_id')
            .eq('id', nextRow.personel_id)
            .maybeSingle()
          const { error: handoffErr } = await supabase
            .from('isler')
            .update({
              sorumlu_personel_id: nextRow.personel_id,
              birim_id: nextPerson?.birim_id || null,
              zincir_aktif_adim: currentAdim + 1,
              durum: TASK_STATUS.ASSIGNED,
            })
            .eq('id', taskId)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          if (handoffErr) {
            Alert.alert('Hata', handoffErr.message || 'Devretme başarısız')
            setCompleting(false)
            return
          }
          Alert.alert('Tamam', 'Görev sıradaki personele iletildi.', [{ text: 'OK', onPress: handleBack }])
          setCompleting(false)
          load()
          return
        }
        const nextPayload = {
          durum: isResubmission
            ? TASK_STATUS.RESUBMITTED
            : TASK_STATUS.PENDING_APPROVAL,
          kanit_resim_ler: uploadedUrls,
          kanit_videolar: uploadedVidRows,
          kanit_belgeler: uploadedDocRows,
        }
        if (trimmedNote) nextPayload.personel_tamamlama_notu = trimmedNote
        if (
          chainOnaySteps.length &&
          (task.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY || task.gorev_turu === GOREV_TURU.ZINCIR_ONAY)
        ) {
          const firstOnayPersonId = chainOnaySteps[0]?.onaylayici_personel_id
          if (firstOnayPersonId) {
            const { data: firstOnayPerson } = await supabase
              .from('personeller')
              .select('id, birim_id')
              .eq('id', firstOnayPersonId)
              .maybeSingle()
            nextPayload.sorumlu_personel_id = firstOnayPersonId
            nextPayload.birim_id = firstOnayPerson?.birim_id || null
          }
          nextPayload.zincir_onay_aktif_adim = 1
        }
        let upd = supabase
          .from('isler')
          .update(nextPayload)
          .eq('id', taskId)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        upd = restrictQueryByPersonelBirimHierarchy(upd, birimHierarchyCtx)
        if (!isManager) {
          upd = upd.eq('sorumlu_personel_id', personel?.id || '')
        }
        const { error: lastErr } = await upd
        if (lastErr) {
          Alert.alert('Güncelleme hatası', lastErr.message || 'Görev tamamlanamadı')
          setCompleting(false)
          return
        }
        await logTaskTimelineEvent(taskId, 'completion', personel?.id, isResubmission ? 'resubmitted-completion' : 'completion')
        if (isResubmission) {
          await logTaskTimelineEvent(taskId, 'resubmitted', personel?.id, 'resubmitted')
        }
        Alert.alert('Başarılı', 'Görev tamamlandı ve başarıyla sisteme gönderildi.', [{ text: 'Tamam', onPress: handleBack }])
        setCompleting(false)
        load()
        return
      }

      const updatePayload = {
        // İlk gönderim denetime düşer, red/revizyondan sonra tekrar gönderim işaretlenir.
        durum: isResubmission
          ? TASK_STATUS.RESUBMITTED
          : TASK_STATUS.PENDING_APPROVAL,
      }

      if (trimmedNote) updatePayload.personel_tamamlama_notu = trimmedNote

      if (
        chainOnaySteps.length &&
        (task.gorev_turu === GOREV_TURU.ZINCIR_ONAY ||
          task.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) &&
        !isZincirGorevTuru(task?.gorev_turu)
      ) {
        updatePayload.zincir_onay_aktif_adim = 1
      }

      if (effectiveHasChecklistForComplete && templateQuestions.length) {
        let checklistAnswersPayload = []
        let uploadedUrls = []
        let uploadedVidAgg = []
        // Önceki gönderimde denetimcinin verdiği kararları soru_id -> ham satır map'i;
        // resubmit akışında 'accept' olan satırlar olduğu gibi korunur (yeniden upload yok),
        // 'reject' olanlar yeni state üzerinden tekrar oluşturulur ve denetim alanları temizlenir.
        const previousChecklistRowsByQid = {}
        const previousRows = Array.isArray(task?.checklist_cevaplari)
          ? task.checklist_cevaplari
          : []
        for (const prevRow of previousRows) {
          const pqid = prevRow?.soru_id != null ? String(prevRow.soru_id) : null
          if (pqid) previousChecklistRowsByQid[pqid] = prevRow
        }

        try {
          const checklistChunks = await Promise.all(
            templateQuestions.map(async (q, idx) => {
              const qid = String(q?.id)
              const qType = String(q?.soru_tipi || 'METIN').toUpperCase()
              const previousDecision = checklistDecisionsByQuestionId?.[qid]
              // Kabul edilmiş madde: yeniden upload yapma, eski satırı koru.
              if (previousDecision === 'accept' && previousChecklistRowsByQid[qid]) {
                return { idx, kind: 'preserved', q, qType, prevRow: previousChecklistRowsByQid[qid] }
              }
              const qPhotos = questionPhotos?.[qid] || []
              const qVideos = questionVideos?.[qid] || []
              const ans = questionAnswers?.[qid]

              if (qType === 'FOTOGRAF') {
                const qPhotoUrls = await uploadPhotoList(BUCKET, `task-${taskId}-${qid}`, qPhotos)
                return { idx, kind: 'foto', qPhotoUrls, q, qType }
              }
              if (qType === 'VIDEO') {
                const vidRows = await uploadVideoEvidenceRows(BUCKET, `task-${taskId}-${qid}`, qVideos)
                return { idx, kind: 'video', vidRows, q, qType }
              }
              if (qType === 'EVET_HAYIR') {
                return { idx, kind: 'evet', ans, q, qType }
              }
              return { idx, kind: 'metin', ans, q, qType }
            }),
          )

          checklistAnswersPayload = []
          uploadedUrls = []
          uploadedVidAgg = []

          for (const chunk of checklistChunks) {
            const idx = chunk.idx
            const q = chunk.q
            const qType = chunk.qType
            const qid = String(q?.id)

            if (chunk.kind === 'preserved') {
              // Önceden onaylanmış madde: tüm satırı (denetim_karari dahil) koruyoruz; ek olarak
              // foto/video URL'leri toplu kanıt listelerine de eklensin ki rapor/önizleme bozulmasın.
              const prevRow = chunk.prevRow || {}
              const prevPhotos = Array.isArray(prevRow?.fotograflar)
                ? prevRow.fotograflar.filter((u) => typeof u === 'string' && u)
                : []
              const prevVideos = Array.isArray(prevRow?.videolar)
                ? prevRow.videolar.filter((v) => v && (v.url || v.uri))
                : []
              uploadedUrls.push(...prevPhotos)
              uploadedVidAgg.push(...prevVideos)
              checklistAnswersPayload.push({ ...prevRow })
              continue
            }

            // Resubmit edilen (önceden reddedilen) veya ilk kez gönderilen satır: denetim alanlarını
            // sıfırla — denetimci yeni cevaba/kanıta göre kararı yeniden verecek.
            const resetReviewFields = {
              denetim_karari: '',
              denetim_red_notu: '',
              denetim_karari_at: null,
              denetim_karari_by: null,
            }

            if (chunk.kind === 'foto') {
              uploadedUrls.push(...chunk.qPhotoUrls)
              checklistAnswersPayload.push({
                sira: idx + 1,
                soru_id: qid,
                soru_metni: q?.soru_metni || 'Fotoğraf sorusu',
                soru_tipi: qType,
                cevap: null,
                foto_sayisi: chunk.qPhotoUrls.length,
                fotograflar: chunk.qPhotoUrls,
                video_sayisi: 0,
                videolar: [],
                ...resetReviewFields,
              })
            } else if (chunk.kind === 'video') {
              uploadedVidAgg.push(...chunk.vidRows)
              checklistAnswersPayload.push({
                sira: idx + 1,
                soru_id: qid,
                soru_metni: q?.soru_metni || 'Video kanıtı',
                soru_tipi: qType,
                cevap: null,
                foto_sayisi: 0,
                fotograflar: [],
                video_sayisi: chunk.vidRows.length,
                videolar: chunk.vidRows,
                ...resetReviewFields,
              })
            } else if (chunk.kind === 'evet') {
              checklistAnswersPayload.push({
                sira: idx + 1,
                soru_id: qid,
                soru_metni: q?.soru_metni || 'Evet/Hayır',
                soru_tipi: qType,
                cevap: chunk.ans || null,
                foto_sayisi: 0,
                fotograflar: [],
                video_sayisi: 0,
                videolar: [],
                ...resetReviewFields,
              })
            } else {
              checklistAnswersPayload.push({
                sira: idx + 1,
                soru_id: qid,
                soru_metni: q?.soru_metni || 'Metin',
                soru_tipi: qType,
                cevap: String(chunk.ans || ''),
                foto_sayisi: 0,
                fotograflar: [],
                video_sayisi: 0,
                videolar: [],
                ...resetReviewFields,
              })
            }
          }
        } catch (uploadErr) {
          Alert.alert('Yükleme hatası', uploadErr?.message || 'Kanıt yüklenemedi')
          setCompleting(false)
          return
        }

        updatePayload.checklist_cevaplari = checklistAnswersPayload
        // compatibility: eski kanıt ekranları/raporlar için düz kanıt listesi
        if (uploadedUrls.length > 0) updatePayload.kanit_resim_ler = uploadedUrls
        if (uploadedVidAgg.length > 0) updatePayload.kanit_videolar = uploadedVidAgg
      } else {
        // Ad-hoc görev (standart)
        let uploadedUrls = []
        let uploadedVidRows = []
        let uploadedDocRows = []
        try {
          ;[uploadedUrls, uploadedVidRows, uploadedDocRows] = await Promise.all([
            uploadPhotoList(BUCKET, `task-${taskId}-adhoc`, photos),
            uploadVideoEvidenceRows(BUCKET, `task-${taskId}-adhoc-vid`, videos),
            documents.length
              ? uploadDocumentList(BUCKET, `task-${taskId}-adhoc-doc`, documents)
              : Promise.resolve([]),
          ])
        } catch (uploadErr) {
          Alert.alert('Yükleme hatası', uploadErr?.message || 'Kanıt yüklenemedi')
          setCompleting(false)
          return
        }
        if (uploadedUrls.length > 0) updatePayload.kanit_resim_ler = uploadedUrls
        if (uploadedVidRows.length > 0) updatePayload.kanit_videolar = uploadedVidRows
        if (uploadedDocRows.length > 0) updatePayload.kanit_belgeler = uploadedDocRows
      }
      let updateQuery = supabase
        .from('isler')
        .update(updatePayload)
        .eq('id', taskId)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      updateQuery = restrictQueryByPersonelBirimHierarchy(updateQuery, birimHierarchyCtx)
      if (!isManager) {
        updateQuery = updateQuery.eq('sorumlu_personel_id', personel?.id || '')
      }
      const { error: updateError } = await updateQuery
      if (updateError) {
        Alert.alert('Güncelleme hatası', updateError.message || 'Görev tamamlanamadı')
        setCompleting(false)
        return
      }
      await logTaskTimelineEvent(taskId, 'completion', personel?.id, isResubmission ? 'resubmitted-completion' : 'completion')
      if (isResubmission) {
        await logTaskTimelineEvent(taskId, 'resubmitted', personel?.id, 'resubmitted')
      }

      // Grup (bireysel olmayan çoklu atama) modunda: bir kişi gönderdikten sonra aynı grup
      // içindeki diğer personellerin görevini sistemlerinden düşürmek için onları TAMAMLANDI yapıyoruz.
      // Havuz görev: grup satırları farklı birim_id taşıyabilir; birim filtresi kullanılmaz.
      if (task?.grup_id) {
        try {
          await supabase
            .from('isler')
            .update({ durum: TASK_STATUS.APPROVED, puan: 0 })
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
            .eq('grup_id', task.grup_id)
            .neq('id', taskId)
        } catch {
          // best-effort suppression
        }
      }

      Alert.alert('Başarılı', 'Görev tamamlandı ve başarıyla sisteme gönderildi.', [{ text: 'Tamam', onPress: handleBack }])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Bir hata oluştu')
    } finally {
      setCompleting(false)
    }
  }, [
    taskId,
    task,
    photos,
    videos,
    documents,
    templateQuestions,
    questionIndex,
    questionAnswers,
    questionPhotos,
    questionVideos,
    hasChecklist,
    personelNotu,
    handleBack,
    personel?.id,
    personel?.ana_sirket_id,
    isManager,
    birimHierarchyCtx,
    chainGorevSteps,
    chainOnaySteps,
    load,
    checklistDecisionsByQuestionId,
  ])

  const approveTask = useCallback(async () => {
    if (!taskId || !task) return
    const isOwnerTaskNow = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
    if (!canApproveTask || isOwnerTaskNow) {
      Alert.alert('Onay yetkisi', 'Görevi yapan kişi kendi görevini onaylayamaz.')
      return
    }
    const activeSiraliStep =
      isSiraliGorevTuru(task?.gorev_turu) &&
      (chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'onay_bekliyor') ||
        chainGorevSteps.find((s) => Number(s?.adim_no || 0) === Number(task?.zincir_aktif_adim || 1)))
    try {
      if (isSiraliGorevTuru(task?.gorev_turu)) {
        if (
          !activeSiraliStep ||
          String(activeSiraliStep?.denetimci_personel_id || '') !== String(personel?.id || '') ||
          !canAuditStep
        ) {
          Alert.alert('Onay yetkisi', 'Bu adımı onaylama yetkiniz bulunmuyor.')
          return
        }
        const { error } = await supabase.rpc('rpc_sirali_adim_onayla_reddet', {
          p_is_id: taskId,
          p_adim_no: Number(activeSiraliStep.adim_no),
          p_karar: 'onayla',
          p_yorum: null,
        })
        if (error) {
          Alert.alert('Onay hatası', error.message || 'Adım onaylanamadı')
          return
        }
        await logTaskTimelineEvent(taskId, 'review', personel?.id, `sirali-step-approve:${activeSiraliStep.adim_no}`)
        Alert.alert('Başarılı', 'Görev başarıyla onaylandı.', [{ text: 'Tamam', onPress: handleBack }])
        return
      }
      let approveQuery = supabase
        .from('isler')
        .update({ durum: TASK_STATUS.APPROVED })
        .eq('id', taskId)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      approveQuery = restrictQueryByPersonelBirimHierarchy(approveQuery, birimHierarchyCtx)
      const { error } = await approveQuery
      if (error) {
        Alert.alert('Onay hatası', error.message || 'Görev onaylanamadı')
        return
      }
      await logTaskTimelineEvent(taskId, 'review', personel?.id, 'approve')
      Alert.alert('Başarılı', 'Görev onaylandı.', [{ text: 'Tamam', onPress: handleBack }])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Bir hata oluştu')
    }
  }, [
    canApproveTask,
    canAuditStep,
    taskId,
    task,
    personel?.id,
    personel?.ana_sirket_id,
    birimHierarchyCtx,
    handleBack,
    chainGorevSteps,
  ])

  const rejectSiraliStep = useCallback(async () => {
    if (!taskId || !task || !isSiraliGorevTuru(task?.gorev_turu)) return
    const activeSiraliStep =
      chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'onay_bekliyor') ||
      chainGorevSteps.find((s) => Number(s?.adim_no || 0) === Number(task?.zincir_aktif_adim || 1))
    if (
      !activeSiraliStep ||
      String(activeSiraliStep?.denetimci_personel_id || '') !== String(personel?.id || '') ||
      !canAuditStep
    ) {
      Alert.alert('Yetki', 'Bu adımı reddetme yetkiniz bulunmuyor.')
      return
    }
    const reason =
      Platform.OS === 'web'
        ? window.prompt('Red nedeni girin:') || ''
        : 'Denetim tarafından reddedildi'
    const trimmed = String(reason || '').trim()
    if (!trimmed) {
      Alert.alert('Eksik bilgi', 'Red nedeni zorunludur.')
      return
    }
    const { error } = await supabase.rpc('rpc_sirali_adim_onayla_reddet', {
      p_is_id: taskId,
      p_adim_no: Number(activeSiraliStep.adim_no),
      p_karar: 'reddet',
      p_yorum: trimmed,
    })
    if (error) {
      Alert.alert('Hata', error.message || 'Adım reddedilemedi')
      return
    }
    await logTaskTimelineEvent(taskId, 'review', personel?.id, `sirali-step-reject:${activeSiraliStep.adim_no}`)
    Alert.alert('Başarılı', 'Görev reddedildi.', [{ text: 'Tamam', onPress: handleBack }])
  }, [taskId, task, chainGorevSteps, personel?.id, canAuditStep, handleBack])

  const title = task?.baslik || task?.is_sablonlari?.baslik || 'Görev'
  const durum = String(task?.durum ?? 'Bekliyor')
  const isDone = isApprovedTaskStatus(durum)
  const isTaskOwner = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
  const formatTs = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('tr-TR')
  }
  const completionHistory = normalizeTimelineArray(task?.tamamlama_gecmisi)
  const reviewHistory = normalizeTimelineArray(task?.denetim_gecmisi)
  const lastCompletionActorId =
    completionHistory.length > 0
      ? String(completionHistory[completionHistory.length - 1]?.actor_id || '')
      : ''
  const activeSiraliStepForUi =
    isSiraliGorevTuru(task?.gorev_turu) &&
    (chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'aktif') ||
      chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'onay_bekliyor') ||
      chainGorevSteps.find((s) => Number(s?.adim_no || 0) === Number(task?.zincir_aktif_adim || 1)))
  const canApproveCurrentTask = isSiraliGorevTuru(task?.gorev_turu)
    ? !!(
        canAuditStep &&
        activeSiraliStepForUi &&
        String(activeSiraliStepForUi?.adim_durum || '') === 'onay_bekliyor' &&
        String(activeSiraliStepForUi?.denetimci_personel_id || '') === String(personel?.id || '')
      )
    : canApproveTask && (
        lastCompletionActorId
          ? String(personel?.id || '') !== lastCompletionActorId
          : !isTaskOwner
      )
  const isTaskSender = String(task?.atayan_personel_id || '') === String(personel?.id || '')
  const isApprovalPending = isPendingApprovalTaskStatus(task?.durum)
  /** Zincir (sıralı olmayan) halkalar: gorev_turu yazımı sapsa bile aynı tablodan gelen adımlar */
  const zincirAktifAdimNo = Number(task?.zincir_aktif_adim) || 1
  const isNonSiraliChainTask =
    chainGorevSteps.length > 0 && !isSiraliGorevTuru(task?.gorev_turu)
  const zincirCurrentStepRow =
    task && isNonSiraliChainTask
      ? chainGorevSteps.find((s) => Number(s.adim_no) === zincirAktifAdimNo) || null
      : null
  /** Zincir / sıralı / zincir-onay: yönetici değil ve görevde tanımlı bir rolü varsa yalnız kendi adım(onayı)nı görsün */
  const viewerHasChainRole = useMemo(() => {
    if (!personel?.id) return false
    const pid = personel.id
    const gSteps = chainGorevSteps || []
    const oSteps = chainOnaySteps || []
    return (
      gSteps.some(
        (s) =>
          samePersonelId(s?.personel_id, pid) || samePersonelId(s?.denetimci_personel_id, pid),
      ) || oSteps.some((s) => samePersonelId(s?.onaylayici_personel_id, pid))
    )
  }, [personel?.id, chainGorevSteps, chainOnaySteps])
  const chainOverviewEligible =
    (chainGorevSteps || []).length > 0 || (chainOnaySteps || []).length > 0
  /**
   * Katılımcı/sorumlu kendi adımını görür. Geniş yönetici bayrakları normalde tam zinciri açar;
   * onaylanmış ve kendi sorumluluğundaki iş için tam zincir yerine yine adım kısıtı uygulanır.
   */
  const viewerOwnFinishedChainAssignee =
    isDone &&
    String(task?.sorumlu_personel_id || '') === String(personel?.id || '') &&
    (isZincirGorevTuru(task?.gorev_turu) || isSiraliGorevTuru(task?.gorev_turu))
  /**
   * Onaylanmış zincir/sıralı/zincir-onay işlerinde halkada bulunan herkes (yönetici dahil)
   * yalnız kendi adımını görmeli — başkalarının kanıtı/notu sızdırılmasın.
   *
   * Sıralı görevde ise aktif görevde de aynı kural geçerlidir: yapan/denetimci
   * her zaman sadece kendi adımına ait bilgileri görür. Her adım, kendi sahibi
   * için bir "standart görev" gibi davranır; diğer adımların başlığı, açıklaması,
   * kanıtı bu kullanıcıya hiç gösterilmez.
   */
  const viewerScopedOwnStepsOnly =
    chainOverviewEligible &&
    (viewerHasChainRole || viewerOwnFinishedChainAssignee) &&
    (
      // Sıralı görev: viewer bir adımın yapanı/denetimcisi ise yönetici bile olsa scope edilir
      isSiraliGorevTuru(task?.gorev_turu) ||
      isDone ||
      !isBroadHierarchyManager ||
      viewerOwnFinishedChainAssignee
    )
  /** Eski bundle/HMR bazen bu sembolleri bekleyebilir — tutulur */
  const zincirWorkerDoneOwnStepOnly =
    viewerScopedOwnStepsOnly &&
    !!task &&
    isZincirGorevTuru(task?.gorev_turu) &&
    !isSiraliGorevTuru(task?.gorev_turu)
  const siraliWorkerDoneOwnStepOnly =
    viewerScopedOwnStepsOnly && !!task && isSiraliGorevTuru(task?.gorev_turu)
  const chainGorevStepsForViewer = useMemo(() => {
    const steps = chainGorevSteps || []
    if (!viewerScopedOwnStepsOnly) return steps
    const pid = personel?.id
    let mine = steps.filter(
      (s) =>
        samePersonelId(s?.personel_id, pid) || samePersonelId(s?.denetimci_personel_id, pid),
    )
    if (
      !mine.length &&
      isDone &&
      task &&
      samePersonelId(task?.sorumlu_personel_id, pid)
    ) {
      const completedMine = steps
        .filter((s) => samePersonelId(s?.personel_id, pid) && s?.tamamlandi_at)
        .sort(
          (a, b) =>
            new Date(b.tamamlandi_at).getTime() - new Date(a.tamamlandi_at).getTime(),
        )
      if (completedMine.length) mine = [completedMine[0]]
    }
    const onayMine = (chainOnaySteps || []).some((s) =>
      samePersonelId(s?.onaylayici_personel_id, pid),
    )
    if (mine.length) return mine
    if (onayMine) return []
    return []
  }, [
    viewerScopedOwnStepsOnly,
    chainGorevSteps,
    chainOnaySteps,
    personel?.id,
    isDone,
    task,
  ])
  const chainOnayStepsForViewer = useMemo(() => {
    const steps = chainOnaySteps || []
    if (!viewerScopedOwnStepsOnly) return steps
    const pid = personel?.id
    return steps.filter((s) => samePersonelId(s?.onaylayici_personel_id, pid))
  }, [viewerScopedOwnStepsOnly, chainOnaySteps, personel?.id])
  const sortedSiraliSteps = useMemo(
    () =>
      [...(chainGorevStepsForViewer || [])].sort(
        (a, b) => Number(a?.adim_no || 0) - Number(b?.adim_no || 0),
      ),
    [chainGorevStepsForViewer],
  )
  const canCompleteTask = isSiraliGorevTuru(task?.gorev_turu)
    ? !!(
        activeSiraliStepForUi &&
        String(activeSiraliStepForUi?.adim_durum || '') === 'aktif' &&
        String(activeSiraliStepForUi?.personel_id || '') === String(personel?.id || '')
      )
    : isNonSiraliChainTask
      ? !!(
          isTaskOwner &&
          !isApprovalPending &&
          !isDone &&
          zincirCurrentStepRow &&
          String(zincirCurrentStepRow.personel_id || '') === String(personel?.id || '')
        )
      : isTaskOwner && !isApprovalPending && !isDone
  const canEditTask = canCompleteTask
  // Onay sürecindeki görevleri personel veya işi gönderen kişi tekrar açıp işlem yapamaz.
  const isLocked = isApprovalPending && !canApproveTask && (isTaskOwner || isTaskSender)
  /** Şablonsuz kanıt kuralları: sıralı ve zincir görevde aktif adımın adim_istenenler; aksi halde görev satırı */
  const evidenceRuleStepRow = isSiraliGorevTuru(task?.gorev_turu)
    ? chainGorevSteps.find((s) => String(s?.adim_durum || '') === 'aktif') ||
      chainGorevSteps.find(
        (s) => Number(s?.adim_no || 0) === Number(task?.zincir_aktif_adim || 1),
      )
    : isNonSiraliChainTask
      ? zincirCurrentStepRow
      : null
  const adhocKanitRules = resolveAdhocKanitRules(task, evidenceRuleStepRow)
  const minFoto = adhocKanitRules.minFoto
  const fotoZorunlu = adhocKanitRules.fotoZorunlu
  const minVideo = adhocKanitRules.minVideo
  const videoZorunlu = adhocKanitRules.videoZorunlu
  const minBelge = adhocKanitRules.minBelge
  const belgeZorunlu = adhocKanitRules.belgeZorunlu
  const taskMaxVideoSn = adhocKanitRules.maxVideoSn
  /** Şablonsuz görev: yalnız bir medya türü zorunluysa diğer düğmeyi gösterme; belge bağımsızdır */
  const neitherKanitRequired = !fotoZorunlu && !videoZorunlu && !belgeZorunlu
  const showAdhocPhotoUi = fotoZorunlu || (!neitherKanitRequired && !videoZorunlu && !belgeZorunlu)
  const showAdhocVideoUi = videoZorunlu || (!neitherKanitRequired && !fotoZorunlu && !belgeZorunlu)
  const showAdhocBelgeUi = belgeZorunlu
  const aciklamaZorunlu = adhocKanitRules.aciklamaZorunlu
  const created = task?.created_at ? new Date(task.created_at).toLocaleString('tr-TR') : ''
  const baslamaTarihStr = task?.baslama_tarihi
    ? new Date(task.baslama_tarihi).toLocaleString('tr-TR')
    : ''
  const sonTarih = task?.son_tarih ? new Date(task.son_tarih).toLocaleString('tr-TR') : ''
  const completerNote = String(
    task?.personel_tamamlama_notu ||
      task?.tamamlayan_aciklama ||
      task?.personel_aciklama ||
      '',
  ).trim()
  /** Kök görev kanıtı: diğer adımların birleşik kartında gösterildiğinde çiftlemeyi önle */
  const suppressRootTaskKanitForScopedViewer =
    (zincirWorkerDoneOwnStepOnly && chainGorevStepsForViewer.length > 0) ||
    siraliWorkerDoneOwnStepOnly ||
    (viewerScopedOwnStepsOnly &&
      !zincirWorkerDoneOwnStepOnly &&
      !siraliWorkerDoneOwnStepOnly &&
      (chainGorevStepsForViewer.length > 0 || isSiraliGorevTuru(task?.gorev_turu)))
  const evidencePhotos = suppressRootTaskKanitForScopedViewer ? [] : extractPhotoUrls(task)
  const acil = !!task?.acil
  const durumDisplay =
    acil && String(durum || '').toUpperCase().includes('ACIL') ? 'Bekliyor' : durum
  const chainStepPhotoUrls = useMemo(
    () =>
      (chainGorevStepsForViewer || [])
        .flatMap((s) => extractPhotoUrls(s))
        .filter(Boolean),
    [chainGorevStepsForViewer],
  )
  const checklistPhotoUrls = useMemo(
    () =>
      Object.values(checklistPhotosByQuestionId || {})
        .flatMap((photos) => photos || [])
        .filter(Boolean),
    [checklistPhotosByQuestionId],
  )
  const taskReferencePhotoUrls = useMemo(
    () =>
      (taskReferenceMedia || [])
        .filter((row) => row?.signedUrl)
        .filter(
          (row) =>
            row.type === 'image' || String(row?.mimeType || '').startsWith('image/'),
        )
        .map((row) => row.signedUrl),
    [taskReferenceMedia],
  )
  const stepReferencePhotoUrls = useMemo(() => {
    if (viewerScopedOwnStepsOnly) {
      const scopedSteps = chainGorevStepsForViewer
      const urls = []
      for (const step of scopedSteps || []) {
        const rows = stepReferenceMediaMap[String(step.id)] || []
        for (const row of rows || []) {
          if (!row?.signedUrl) continue
          if (row.type === 'image' || String(row?.mimeType || '').startsWith('image/')) {
            urls.push(row.signedUrl)
          }
        }
      }
      return urls
    }
    return Object.values(stepReferenceMediaMap || {})
      .flatMap((rows) => rows || [])
      .filter((row) => row?.signedUrl)
      .filter(
        (row) =>
          row.type === 'image' || String(row?.mimeType || '').startsWith('image/'),
      )
      .map((row) => row.signedUrl)
  }, [stepReferenceMediaMap, viewerScopedOwnStepsOnly, chainGorevStepsForViewer])
  const aggregateStepReferenceMedia = useMemo(
    () =>
      Object.values(stepReferenceMediaMap || {}).flatMap((rows) =>
        Array.isArray(rows) ? rows : [],
      ),
    [stepReferenceMediaMap],
  )
  const aggregateStepReferenceMediaVisible = useMemo(() => {
    if (!viewerScopedOwnStepsOnly) return aggregateStepReferenceMedia
    const out = []
    for (const step of chainGorevStepsForViewer || []) {
      const rows = stepReferenceMediaMap[String(step.id)] || []
      if (Array.isArray(rows)) out.push(...rows)
    }
    return out
  }, [viewerScopedOwnStepsOnly, aggregateStepReferenceMedia, chainGorevStepsForViewer, stepReferenceMediaMap])
  /** Yüklenen kanıt fotoğrafları (referans medya hariç — tamamlanmış görev kartında karışmayı önler) */
  const kanitOnlyPhotoUrls = useMemo(() => {
    const merged = [...evidencePhotos, ...chainStepPhotoUrls, ...checklistPhotoUrls]
    return Array.from(new Set(merged.filter(Boolean)))
  }, [evidencePhotos, chainStepPhotoUrls, checklistPhotoUrls])
  /** Lightbox: kanıt + referans (referans küçük resmine basınca doğru indeks) */
  const allPhotoGalleryUrls = useMemo(() => {
    const merged = [
      ...kanitOnlyPhotoUrls,
      ...taskReferencePhotoUrls,
      ...stepReferencePhotoUrls,
    ]
    const seen = new Set()
    const out = []
    for (const u of merged) {
      if (!u || seen.has(u)) continue
      seen.add(u)
      out.push(u)
    }
    return out
  }, [kanitOnlyPhotoUrls, taskReferencePhotoUrls, stepReferencePhotoUrls])

  const evidenceVideoRows = useMemo(
    () =>
      suppressRootTaskKanitForScopedViewer ? [] : extractKanitVideoRows(task),
    [task, suppressRootTaskKanitForScopedViewer],
  )
  const chainStepVideoRows = useMemo(
    () => (chainGorevStepsForViewer || []).flatMap((s) => extractKanitVideoRows(s)),
    [chainGorevStepsForViewer],
  )
  const checklistVideoRowsFlat = useMemo(() => {
    return Object.values(checklistVideosByQuestionId || {}).flatMap((r) => r || [])
  }, [checklistVideosByQuestionId])
  const allEvidenceVideoRows = useMemo(() => {
    const merged = [...evidenceVideoRows, ...chainStepVideoRows, ...checklistVideoRowsFlat]
    const seen = new Set()
    const out = []
    for (const row of merged) {
      const u = row?.url
      if (!u || seen.has(u)) continue
      seen.add(u)
      out.push(row)
    }
    return out
  }, [evidenceVideoRows, chainStepVideoRows, checklistVideoRowsFlat])
  const evidenceBelgeRows = useMemo(
    () =>
      suppressRootTaskKanitForScopedViewer ? [] : extractKanitBelgeRows(task),
    [task, suppressRootTaskKanitForScopedViewer],
  )
  const chainStepBelgeRows = useMemo(
    () => (chainGorevStepsForViewer || []).flatMap((s) => extractKanitBelgeRows(s)),
    [chainGorevStepsForViewer],
  )
  const allEvidenceBelgeRows = useMemo(() => {
    const merged = [...evidenceBelgeRows, ...chainStepBelgeRows]
    const seen = new Set()
    const out = []
    for (const row of merged) {
      const u = row?.url
      if (!u || seen.has(u)) continue
      seen.add(u)
      out.push(row)
    }
    return out
  }, [evidenceBelgeRows, chainStepBelgeRows])
  /**
   * Genel görev açıklamasını gizleme:
   *  - Onaylı + viewer scope edilmiş (zincir/sıralı): başkalarının bağlamı sızdırılmasın
   *  - Sıralı görev viewer adım sahibi (aktif görev de dahil): banner ve form zaten
   *    adımın kendi açıklamasını gösteriyor; üst seviye task.aciklama yine başkalarının
   *    bağlamına özeldir (örn. tüm adımlara hitap eden bir manager notu)
   */
  const suppressGeneralTaskAciklamaForScopedApproved =
    (viewerScopedOwnStepsOnly && isDone && chainOverviewEligible) ||
    (isSiraliGorevTuru(task?.gorev_turu) && !!siraliViewerStepInfo)
  const suppressTaskLevelRefsForScopedApprovedChain =
    suppressGeneralTaskAciklamaForScopedApproved && taskReferenceMedia.length > 0
  const activeSiraliStepForHero =
    viewerScopedOwnStepsOnly && sortedSiraliSteps.length === 1
      ? sortedSiraliSteps[0]
      : activeSiraliStepForUi
  const siraliHeroPrimary =
    task &&
    isSiraliGorevTuru(task?.gorev_turu) &&
    sortedSiraliSteps.length > 0
      ? String(activeSiraliStepForHero?.adim_baslik || '').trim() || title
      : null

  /**
   * Sıralı görev — viewer rolü (aktif veya onaylanmış görev fark etmez):
   *  - "worker": şu anda aktif olan adımın yapan personeli (tamamlama formu görür)
   *  - "auditor": şu anda onay bekleyen adımın denetimcisi (Onayla/Reddet butonları görür)
   *  - "waiting": kullanıcı sıralı görevin bir adımında geçiyor ama sıra ona değil
   *  - "done": kullanıcının adımı tamamlanmış (kendi yaptığı işten gurur duysun)
   *  - "rejected": kullanıcının adımı reddedildi
   *  - null: kullanıcı bu sıralı görevde hiçbir adımda geçmiyor (yönetici / atayan)
   *
   * NOT: "viewer adım sahibi" olduğu sürece — yönetici dahi olsa — yalnız kendi
   * adımına ait bilgi gösterilir. Başkalarının kanıtları/notları sızdırılmaz.
   * (Sıralı görevin temel ilkesi: her adım kendi sahibi için bir standart görev gibidir.)
   */
  const siraliViewerStepInfo = useMemo(() => {
    if (!task || !isSiraliGorevTuru(task?.gorev_turu)) return null
    if (!(sortedSiraliSteps || []).length) return null
    const pid = String(personel?.id || '')
    if (!pid) return null
    const active = activeSiraliStepForUi || null
    if (active && !isDone) {
      const adimDurum = String(active?.adim_durum || '').toLowerCase()
      if (
        adimDurum === 'aktif' &&
        String(active?.personel_id || '') === pid
      ) {
        return { role: 'worker', step: active }
      }
      if (
        adimDurum === 'onay_bekliyor' &&
        String(active?.denetimci_personel_id || '') === pid
      ) {
        return { role: 'auditor', step: active }
      }
    }
    const myWorkerStep = (sortedSiraliSteps || []).find(
      (s) => String(s?.personel_id || '') === pid,
    )
    const myAuditorStep = (sortedSiraliSteps || []).find(
      (s) => String(s?.denetimci_personel_id || '') === pid,
    )
    const myStep = myWorkerStep || myAuditorStep
    if (!myStep) return null
    const mineDurum = String(myStep?.adim_durum || '').toLowerCase()
    if (mineDurum === 'onaylandi') {
      return { role: 'approved', step: myStep }
    }
    if (mineDurum === 'tamamlandi') {
      // Bazı sıralı RPC akışlarında "tamamlandi" tek başına onay verilmiş anlamında kullanılır
      return { role: 'approved', step: myStep }
    }
    if (mineDurum === 'reddedildi') {
      return { role: 'rejected', step: myStep }
    }
    if (mineDurum === 'onay_bekliyor') {
      // Yapan: kanıt göndermiş, denetimci onayı bekliyor
      // Denetimci: kendi onaylayacağı adım — aslında 'auditor' branch'inde yakalanır,
      //             buraya düşerse genel "bekleniyor" mesajı yine geçerli.
      return { role: 'pending', step: myStep }
    }
    return { role: 'waiting', step: myStep }
  }, [task, sortedSiraliSteps, activeSiraliStepForUi, personel?.id, isDone])
  /**
   * Checklist salt-okunur kuralı:
   *  • Görev tamamlandıysa (onaylandı) — herkes salt okunur görür (mevcut davranış).
   *  • Görev sahibi DEĞİLSE (yönetici / denetçi / izleyici) — checklist asla edit edilemez,
   *    kanıt foto/videoları silinemez, cevaplar değiştirilemez.
   *    Denetim akışı `AuditCenter`'da yürür; `TaskDetail` yalnız incelemedir.
   *  • Görev sahibi VE tamamlanmamışsa — düzenlenebilir (cevap girişi + kanıt yükleme).
   */
  const readOnlyChecklist = hasChecklist && (isDone || !isTaskOwner)
  /** Adım kartlarında kanıt zaten gösteriliyorsa üstteki birleşik kanıt bloklarını gösterme */
  const suppressAggregateKanitCardsWhenChainDone =
    isDone &&
    ((chainGorevStepsForViewer || []).length > 0 || (chainOnayStepsForViewer || []).length > 0)
  /** Aktif zincir halkada checklist tamamlama yok; şablon bayrağı kanıt UI’ını çökertmesin */
  const effectiveHasChecklist = hasChecklist && !(isNonSiraliChainTask && !isDone)
  /** Tamamlanmış veya onay bekleyen denetçi: checklist tamamlama olmadan da soru listesi gösterilmeli */
  const showChecklistReviewCard =
    effectiveHasChecklist &&
    (canCompleteTask ||
      readOnlyChecklist ||
      (isApprovalPending && canApproveCurrentTask))
  const resubmissionCount = Number(task?.tekrar_gonderim_sayisi || 0)
  /**
   * «Zincir görev — adımlar»: Tamamlanmamış görevde gösterme (personel tamamlama ekranı).
   * - isManager içinde `canApproveTask` vardı; onay yetkisi olan herkes yönetici sayılıyordu → liste hiç kapanmıyordu.
   * - `isZincirGorevTuru` şartını kaldırdık: `gorev_turu` sapmış olsa bile zincir adım satırı varsa ve sıralı görev değilse gizlenir.
   * Sıralı görev (`sirali_gorev`) aynı tablodan çeker; başlık «Sıralı görev — adımlar» olur, bu kural onu dokunmaz.
   */
  const suppressZincirPersonelChainStepList =
    !readOnlyChecklist &&
    !isDone &&
    chainGorevSteps.length > 0 &&
    !isSiraliGorevTuru(task?.gorev_turu)
  /**
   * Sıralı görev — adımlar listesi viewer'ın rolüne göre saklanır:
   *  - "worker" / "waiting": banner + form zaten yeterli, liste tekrarlı bilgi olur → gizle
   *  - "auditor" / "done" / "rejected": kanıt+meta görmek için liste gösterilir (yalnız kendi adımı)
   *  - null (yönetici/atayan): tüm adımlar gösterilir
   */
  const suppressSiraliStepListForViewerRole =
    isSiraliGorevTuru(task?.gorev_turu) &&
    siraliViewerStepInfo &&
    (siraliViewerStepInfo.role === 'worker' || siraliViewerStepInfo.role === 'waiting')
  /** Checklist özeti açıkken de onaylı görevde zincir kartı gösterilsin (salt okunur kendi adımı) */
  const showChainStepsOverview =
    (chainGorevSteps.length > 0 || chainOnaySteps.length > 0) &&
    !suppressZincirPersonelChainStepList &&
    !suppressSiraliStepListForViewerRole
  const showZincirWorkerStepFocus =
    canCompleteTask && !isDone && !!zincirCurrentStepRow && isNonSiraliChainTask
  /**
   * Sıralı görev — yapan personelin tamamlama formunda kullanılacak adım odaklı bayrak.
   * Banner üstte adımın detaylarını gösteriyor; form başlığı "Personel Notu" yerine "Adım
   * açıklaması", placeholder ve hint metinleri adıma odaklı oluyor.
   */
  const showSiraliWorkerStepFocus =
    canCompleteTask &&
    !isDone &&
    isSiraliGorevTuru(task?.gorev_turu) &&
    !!activeSiraliStepForUi &&
    String(activeSiraliStepForUi?.personel_id || '') === String(personel?.id || '') &&
    String(activeSiraliStepForUi?.adim_durum || '') === 'aktif'
  const managerNote = String(
    String(task?.red_nedeni || '').trim() ||
      (!showZincirWorkerStepFocus && !suppressGeneralTaskAciklamaForScopedApproved
        ? String(task?.aciklama || '').trim()
        : ''),
  ).trim()
  const zincirWorkerDisplayRefs = useMemo(() => {
    const stepRefs =
      zincirCurrentStepRow?.id != null
        ? stepReferenceMediaMap[String(zincirCurrentStepRow.id)] || []
        : []
    const merged = [...taskReferenceMedia, ...stepRefs]
    const seen = new Set()
    const out = []
    for (const r of merged) {
      const k = String(r?.signedUrl || '').trim()
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
    return out
  }, [taskReferenceMedia, stepReferenceMediaMap, zincirCurrentStepRow?.id])
  const taskTypeShortLabel = formatTaskTypeShortLabel(task?.gorev_turu)
  const zincirRingScopedSubtitle =
    suppressGeneralTaskAciklamaForScopedApproved &&
    isNonSiraliChainTask &&
    chainGorevStepsForViewer.length === 1
      ? String(chainGorevStepsForViewer[0]?.adim_baslik || '').trim() || null
      : null
  const heroMainTitle = showZincirWorkerStepFocus ? title : siraliHeroPrimary ?? title
  const heroSubtitle = showZincirWorkerStepFocus
    ? String(zincirCurrentStepRow?.adim_baslik || '').trim() || null
    : zincirRingScopedSubtitle
      ? zincirRingScopedSubtitle
      : siraliHeroPrimary && String(siraliHeroPrimary).trim() !== String(title || '').trim()
        ? `Üst görev · ${title}`
        : null

  /**
   * Onaylanmış görev özet bandı: kullanıcının kendi adımı varsa adıma özel zaman/denetimci,
   * yoksa son tamamlanma zamanını / atayanı özetler.
   */
  const approvalSummary = useMemo(() => {
    if (!isDone || !task) return null
    const ownStep =
      viewerScopedOwnStepsOnly && chainGorevStepsForViewer.length
        ? chainGorevStepsForViewer.find((s) => samePersonelId(s?.personel_id, personel?.id)) ||
          chainGorevStepsForViewer[0] || null
        : null
    const ownOnayStep =
      viewerScopedOwnStepsOnly && !ownStep && chainOnayStepsForViewer.length
        ? chainOnayStepsForViewer[0] || null
        : null
    const completedAt =
      ownStep?.adim_onay_at ||
      ownStep?.tamamlandi_at ||
      ownOnayStep?.onaylandi_at ||
      (completionHistory.length
        ? timelineAt(completionHistory[completionHistory.length - 1])
        : null)
    const denetimciId = ownStep?.denetimci_personel_id
    const onayciName = denetimciId
      ? chainPersonNameMap[String(denetimciId)] || personLabelOrRef(null, denetimciId)
      : null
    const stepLabel = ownStep
      ? String(ownStep?.adim_baslik || '').trim() ||
        (Number(ownStep?.adim_no) ? `Adım ${Number(ownStep.adim_no)}` : null)
      : null
    const onayStepLabel = ownOnayStep && Number(ownOnayStep?.adim_no)
      ? `Onay adımı ${Number(ownOnayStep.adim_no)}`
      : null
    return {
      completedAt: completedAt || null,
      denetimciName: onayciName,
      stepLabel: stepLabel || onayStepLabel || null,
      isApproverScope: !!ownOnayStep,
    }
  }, [
    isDone,
    task,
    viewerScopedOwnStepsOnly,
    chainGorevStepsForViewer,
    chainOnayStepsForViewer,
    personel?.id,
    chainPersonNameMap,
    completionHistory,
  ])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={36} color={Colors.primary} />
      </View>
    )
  }

  if (!task) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Görev bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Onay sürecindeki görevleri personel/atayan tekrar açıp işlem yapamaz.
  if (isLocked) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockTitle}>Görev onay sürecinde</Text>
        <Text style={styles.lockText}>
          Onay bekleyen işler tekrar açılamaz. Reddedilirse veya tamamlanırsa tekrar görebilirsiniz.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top + (Platform.OS === 'ios' ? kitSpacing.lg : kitSpacing.md) }]}>
      <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
        <ChevronLeft size={18} color={kitPalette.primary[700]} strokeWidth={2.4} />
        <Text style={styles.backBtnText}>Geri</Text>
      </TouchableOpacity>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 + Math.max(insets.bottom, 12) },
        ]}
      >
          <View style={styles.heroCard}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle} numberOfLines={4}>
                {heroMainTitle}
              </Text>
              {taskTypeShortLabel ? (
                <View style={styles.heroTypeChip}>
                  <Text style={styles.heroTypeChipText}>{taskTypeShortLabel}</Text>
                </View>
              ) : null}
            </View>
            {heroSubtitle ? (
              <Text style={styles.heroSubtitle} numberOfLines={2}>
                {heroSubtitle}
              </Text>
            ) : null}
            <View style={styles.heroMetaChips}>
              <View
                style={[
                  styles.heroStatusChip,
                  isDone ? styles.heroStatusChipDone : styles.heroStatusChipNeutral,
                ]}
              >
                {isDone ? (
                  <Icon.Delivered size={12} color={kitPalette.success[700]} strokeWidth={3} />
                ) : null}
                <Text
                  style={[
                    styles.heroStatusChipText,
                    isDone && styles.heroStatusChipTextDone,
                  ]}
                >
                  {durumDisplay}
                </Text>
              </View>
              {acil ? (
                <View style={[styles.heroStatusChip, styles.heroStatusChipAcil]}>
                  <Text style={styles.heroStatusChipTextAcil}>Acil</Text>
                </View>
              ) : null}
            </View>
          </View>

        {/* Havuz görev (grup_id) özeti: bu görev birden fazla kişiyle paylaşıldı.
            Tamamlayan kişi belirgin yeşil ile öne çıkarılır; diğer üyeler küçük rozetlerle listelenir. */}
        {poolGroupSummary && poolGroupSummary.memberCount > 1 ? (
          <View style={styles.poolBanner}>
            <View style={styles.poolBannerHeader}>
              <View style={styles.poolBannerBadge}>
                <Text style={styles.poolBannerBadgeText}>
                  Havuz · {poolGroupSummary.memberCount} kişi
                </Text>
              </View>
              {poolGroupSummary.completerName ? (
                <View style={styles.poolBannerDoneRow}>
                  <Icon.Delivered size={14} color={kitPalette.success[700]} strokeWidth={3} />
                  <Text style={styles.poolBannerDoneText} numberOfLines={1}>
                    Tamamlayan:{' '}
                    <Text style={styles.poolBannerDoneName}>{poolGroupSummary.completerName}</Text>
                  </Text>
                </View>
              ) : (
                <Text style={styles.poolBannerHint}>İlk yapan kazanır — kanıt henüz yok</Text>
              )}
            </View>
            <View style={styles.poolBannerChips}>
              {poolGroupSummary.members.map((m) => (
                <View
                  key={m.id || m.isim}
                  style={[
                    styles.poolBannerChip,
                    m.isCompleter && styles.poolBannerChipDone,
                  ]}
                >
                  <View style={styles.poolBannerChipInner}>
                    {m.isCompleter ? (
                      <Icon.Delivered size={11} color={kitPalette.success[700]} strokeWidth={3} />
                    ) : null}
                    <Text
                      style={[
                        styles.poolBannerChipText,
                        m.isCompleter && styles.poolBannerChipTextDone,
                      ]}
                      numberOfLines={1}
                    >
                      {m.isim}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {isDone && approvalSummary ? (
          <View style={styles.approvalBanner}>
            <View style={styles.approvalBannerIconWrap}>
              <Icon.Delivered size={18} color={kitPalette.success[700]} strokeWidth={3} />
            </View>
            <View style={styles.approvalBannerBody}>
              <Text style={styles.approvalBannerTitle}>
                {approvalSummary.isApproverScope ? 'Onayınız tamamlandı' : 'Görev tamamlandı'}
              </Text>
              {approvalSummary.stepLabel ? (
                <Text style={styles.approvalBannerStep}>{approvalSummary.stepLabel}</Text>
              ) : null}
              <View style={styles.approvalBannerMetaRow}>
                {approvalSummary.completedAt ? (
                  <View style={styles.approvalBannerMetaItem}>
                    <Text style={styles.approvalBannerMetaLabel}>Onay zamanı</Text>
                    <Text style={styles.approvalBannerMetaValue}>
                      {formatTs(approvalSummary.completedAt)}
                    </Text>
                  </View>
                ) : null}
                {approvalSummary.denetimciName ? (
                  <View style={styles.approvalBannerMetaItem}>
                    <Text style={styles.approvalBannerMetaLabel}>Denetimci</Text>
                    <Text style={styles.approvalBannerMetaValue} numberOfLines={1}>
                      {approvalSummary.denetimciName}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* Sıralı görev viewer adım sahibi için "Son tarih" + "Görev atayan"
            banner'daki "Bitiş" + "Denetimci" ile çakışırdı; bu meta kartını
            yalnız standart/zincir görevde veya viewer adım dışı kullanıcılarda
            gösteriyoruz. */}
        {!(isSiraliGorevTuru(task?.gorev_turu) && !!siraliViewerStepInfo) ? (
          <View style={styles.infoCard}>
            {sonTarih ? (
              <>
                <Text style={styles.label}>Son tarih</Text>
                <Text style={styles.value}>{sonTarih}</Text>
              </>
            ) : null}
            <Text style={styles.label}>Görev atayan</Text>
            <Text style={styles.value}>
              {task?.atayan_personel_id
                ? personLabelOrRef(assignerPerson, task.atayan_personel_id)
                : 'Kayıtta yok (eski kayıt)'}
            </Text>
          </View>
        ) : null}

        {!isDone && managerNote ? (
          <View style={styles.noteSurfaceCardMuted}>
            <Text style={styles.sectionTitle}>Yönetici notu</Text>
            <Text style={styles.noteSurfaceBody}>{managerNote}</Text>
          </View>
        ) : null}

        {showZincirWorkerStepFocus ? (
          <>
            {String(task?.aciklama || '').trim() ||
            String(zincirCurrentStepRow?.aciklama || '').trim() ? (
              <View style={[styles.mediaCard, styles.zincirInstructionCard]}>
                {String(task?.aciklama || '').trim() ? (
                  <>
                    <Text style={styles.label}>Görev açıklaması</Text>
                    <Text style={[styles.value, styles.zincirInstructionBody]}>
                      {String(task.aciklama).trim()}
                    </Text>
                  </>
                ) : null}
                {String(zincirCurrentStepRow?.aciklama || '').trim() ? (
                  <>
                    <Text style={[styles.label, String(task?.aciklama || '').trim() ? { marginTop: 12 } : null]}>
                      Ne yapmalısınız?
                    </Text>
                    <Text style={[styles.value, styles.zincirInstructionBody]}>
                      {String(zincirCurrentStepRow.aciklama)}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
            {zincirWorkerDisplayRefs.length > 0 ? (
              <View style={[styles.mediaCard, styles.zincirInstructionCard]}>
                <Text style={styles.sectionTitle}>Referans</Text>
                <ReferenceMediaThumbList
                  refs={zincirWorkerDisplayRefs}
                  keyPrefix="zincir-worker-ref"
                  styles={styles}
                  allPhotoGalleryUrls={allPhotoGalleryUrls}
                  setLightboxIndex={setLightboxIndex}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {isDone && (completerNote || managerNote) ? (
          <View style={styles.noteSurfaceCard}>
            {completerNote ? (
              <>
                <Text style={styles.sectionTitle}>Personel notu</Text>
                <Text style={styles.noteSurfaceBody}>{completerNote}</Text>
              </>
            ) : null}
            {managerNote ? (
              <>
                <Text
                  style={[styles.sectionTitle, completerNote ? styles.noteAfterNoteTitle : null]}
                >
                  Yönetici notu
                </Text>
                <Text style={styles.noteSurfaceBody}>{managerNote}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {!readOnlyChecklist &&
        !showZincirWorkerStepFocus &&
        ((!suppressTaskLevelRefsForScopedApprovedChain && taskReferenceMedia.length > 0) ||
          aggregateStepReferenceMediaVisible.length > 0) ? (
          <View style={styles.mediaCard}>
            <Text style={styles.sectionTitle}>Referans</Text>
            {!suppressTaskLevelRefsForScopedApprovedChain && taskReferenceMedia.length > 0 ? (
              <ReferenceMediaThumbList
                refs={taskReferenceMedia}
                keyPrefix="task-ref"
                styles={styles}
                allPhotoGalleryUrls={allPhotoGalleryUrls}
                setLightboxIndex={setLightboxIndex}
              />
            ) : null}
            {aggregateStepReferenceMediaVisible.length > 0 ? (
              <View
                style={
                  !suppressTaskLevelRefsForScopedApprovedChain && taskReferenceMedia.length > 0
                    ? { marginTop: 12 }
                    : null
                }
              >
                <ReferenceMediaThumbList
                  refs={aggregateStepReferenceMediaVisible}
                  keyPrefix="step-ref-flat"
                  styles={styles}
                  allPhotoGalleryUrls={allPhotoGalleryUrls}
                  setLightboxIndex={setLightboxIndex}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {showChainStepsOverview ? (
          <View style={[styles.mediaCard, { borderColor: Colors.alpha.indigo15 || '#c7d2fe' }]}>
            {String(task?.aciklama || '').trim() && !suppressGeneralTaskAciklamaForScopedApproved ? (
              <View
                style={{
                  marginBottom:
                    chainGorevStepsForViewer.length || chainOnayStepsForViewer.length ? 14 : 0,
                }}
              >
                <Text style={styles.label}>Görev açıklaması</Text>
                <Text style={[styles.value, styles.zincirInstructionBody]}>
                  {String(task.aciklama).trim()}
                </Text>
              </View>
            ) : null}
            {chainGorevStepsForViewer.length > 0 ? (
              <View style={{ marginBottom: chainOnayStepsForViewer.length ? 14 : 0 }}>
                <Text style={styles.sectionTitle}>
                  {isSiraliGorevTuru(task?.gorev_turu)
                    ? siraliViewerStepInfo
                      ? 'Görev detayı'
                      : 'Sıralı görev — adımlar'
                    : 'Zincir görev — adımlar'}
                </Text>
                {isSiraliGorevTuru(task?.gorev_turu)
                  ? sortedSiraliSteps.map((step) => {
                      const stepPhotos = extractPhotoUrls(step)
                      const stepVideos = extractKanitVideoRows(step)
                      const stepRefs = stepReferenceMediaMap[String(step.id)] || []
                      const adimNo = Number(step?.adim_no) || 0
                      const pointerAdim = Number(task?.zincir_aktif_adim) || 1
                      const isCurrentPointer = adimNo === pointerAdim
                      const reqHint = buildSiraliRequirementHint(step)
                      const stepDurumRaw = String(step?.adim_durum || step?.durum || '').toLowerCase()
                      const stepDurumLabel = formatSiraliAdimDurumu(step?.adim_durum || step?.durum)
                      const stepTitle =
                        String(step?.adim_baslik || '').trim() || `Adım ${adimNo || '-'}`
                      const yapanName =
                        chainPersonNameMap[String(step?.personel_id)] ||
                        personLabelOrRef(null, step?.personel_id)
                      const denetimciName = step?.denetimci_personel_id
                        ? chainPersonNameMap[String(step?.denetimci_personel_id)] ||
                          personLabelOrRef(null, step.denetimci_personel_id)
                        : '—'
                      const stepStatusVariantStyle =
                        stepDurumRaw === 'onaylandi' || stepDurumRaw === 'tamamlandi'
                          ? styles.stepStatusPillSuccess
                          : stepDurumRaw === 'reddedildi'
                            ? styles.stepStatusPillError
                            : stepDurumRaw === 'onay_bekliyor'
                              ? styles.stepStatusPillPending
                              : stepDurumRaw === 'aktif'
                                ? styles.stepStatusPillActive
                                : styles.stepStatusPillNeutral
                      const stepStatusVariantText =
                        stepDurumRaw === 'onaylandi' || stepDurumRaw === 'tamamlandi'
                          ? styles.stepStatusPillSuccessText
                          : stepDurumRaw === 'reddedildi'
                            ? styles.stepStatusPillErrorText
                            : stepDurumRaw === 'onay_bekliyor'
                              ? styles.stepStatusPillPendingText
                              : stepDurumRaw === 'aktif'
                                ? styles.stepStatusPillActiveText
                                : styles.stepStatusPillNeutralText
                      // Sıralı viewer adım sahibi ise (worker/auditor/pending/approved/rejected),
                      // banner zaten başlık, açıklama, yapan/denetimci, gereksinim chip'leri ve
                      // bitiş tarihini gösteriyor. Kart bu durumda yalnızca kanıtlara odaklansın;
                      // çakışan başlık / yapan-denetimci grid / "İstenenler" / "Açıklama"
                      // bölümlerini gizliyoruz.
                      const isSiraliViewerOwnStep = !!siraliViewerStepInfo
                      return (
                        <View
                          key={`sirali-step-${step.id}`}
                          style={[
                            styles.siraliStepCard,
                            isCurrentPointer && styles.siraliStepCardCurrent,
                          ]}
                        >
                          {!isSiraliViewerOwnStep ? (
                            <>
                              <View style={styles.siraliStepCardHeader}>
                                <View style={styles.stepHeaderLeft}>
                                  <Text style={styles.siraliStepCardIndex}>Adım {adimNo || '-'}</Text>
                                  {isCurrentPointer ? (
                                    <View style={styles.siraliStepCurrentChip}>
                                      <Text style={styles.siraliStepCurrentChipText}>Şu anki</Text>
                                    </View>
                                  ) : null}
                                </View>
                                <View style={[styles.stepStatusPill, stepStatusVariantStyle]}>
                                  <Text style={[styles.stepStatusPillText, stepStatusVariantText]}>
                                    {stepDurumLabel}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.siraliStepCardTitle}>{stepTitle}</Text>

                              <View style={styles.stepMetaGrid}>
                                <View style={styles.stepMetaCell}>
                                  <Text style={styles.stepMetaLabel}>Yapan</Text>
                                  <Text style={styles.stepMetaValue} numberOfLines={1}>
                                    {yapanName}
                                  </Text>
                                </View>
                                <View style={styles.stepMetaCell}>
                                  <Text style={styles.stepMetaLabel}>Denetimci</Text>
                                  <Text style={styles.stepMetaValue} numberOfLines={1}>
                                    {denetimciName}
                                  </Text>
                                </View>
                              </View>
                            </>
                          ) : null}

                          {(step?.tamamlandi_at || step?.adim_onay_at) ? (
                            <View style={styles.stepMetaGrid}>
                              {step?.tamamlandi_at ? (
                                <View style={styles.stepMetaCell}>
                                  <Text style={styles.stepMetaLabel}>Tamamlanma</Text>
                                  <Text style={styles.stepMetaValue}>
                                    {formatTs(step.tamamlandi_at)}
                                  </Text>
                                </View>
                              ) : null}
                              {step?.adim_onay_at ? (
                                <View style={styles.stepMetaCell}>
                                  <Text style={styles.stepMetaLabel}>Onay zamanı</Text>
                                  <Text style={styles.stepMetaValue}>
                                    {formatTs(step.adim_onay_at)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}

                          {!isSiraliViewerOwnStep && reqHint ? (
                            <View style={styles.stepInlineNote}>
                              <Text style={styles.stepInlineNoteLabel}>İstenenler</Text>
                              <Text style={styles.stepInlineNoteText}>{reqHint}</Text>
                            </View>
                          ) : null}
                          {!isSiraliViewerOwnStep && step?.aciklama ? (
                            <View style={styles.stepInlineNote}>
                              <Text style={styles.stepInlineNoteLabel}>Açıklama</Text>
                              <Text style={[styles.stepInlineNoteText, { fontStyle: 'italic' }]}>
                                {String(step.aciklama)}
                              </Text>
                            </View>
                          ) : null}

                          {!isSiraliViewerOwnStep ? <View style={styles.stepDivider} /> : null}

                          <View style={styles.stepEvidenceHeader}>
                            <Text style={styles.stepEvidenceTitle}>Kanıt fotoğrafları</Text>
                            {stepPhotos.length ? (
                              <Text style={styles.stepEvidenceCount}>{stepPhotos.length}</Text>
                            ) : null}
                          </View>
                          {stepPhotos.length ? (
                            <View style={styles.stepPhotoGrid}>
                              {stepPhotos.map((url, idx) => {
                                const globalIdx = allPhotoGalleryUrls.findIndex((x) => x === url)
                                return (
                                  <TouchableOpacity
                                    key={`${step.id}-${idx}`}
                                    style={styles.stepPhotoThumb}
                                    activeOpacity={0.85}
                                    onPress={() => setLightboxIndex(globalIdx >= 0 ? globalIdx : 0)}
                                  >
                                    <Image source={{ uri: url }} style={styles.thumbImg} />
                                  </TouchableOpacity>
                                )
                              })}
                            </View>
                          ) : (
                            <View style={styles.stepEmptyEvidence}>
                              <Text style={styles.stepEmptyEvidenceText}>
                                Bu adımda fotoğraf yok
                              </Text>
                            </View>
                          )}

                          {stepVideos.length ? (
                            <View style={[styles.videoEvidenceList, { marginTop: 14 }]}>
                              <Text style={styles.stepEvidenceTitle}>Kanıt videoları</Text>
                              {stepVideos.map((vr, vidx) => (
                                <EvidenceVideoPlayer
                                  key={`${step.id}-vid-${vidx}-${vr.url}`}
                                  uri={vr.url}
                                  style={styles.videoEvidencePlayer}
                                />
                              ))}
                            </View>
                          ) : null}
                          {stepRefs.length ? (
                            <View style={[styles.videoEvidenceList, { marginTop: 14 }]}>
                              <Text style={styles.stepEvidenceTitle}>Referans medya</Text>
                              {stepRefs.map((ref, ridx) => {
                                const isVideo =
                                  ref.type === 'video' ||
                                  String(ref.mimeType || '').startsWith('video/')
                                const isImage =
                                  ref.type === 'image' ||
                                  String(ref.mimeType || '').startsWith('image/')
                                if (isVideo) {
                                  return (
                                    <EvidenceVideoPlayer
                                      key={`step-ref-video-${step.id}-${ridx}`}
                                      uri={ref.signedUrl}
                                      style={styles.videoEvidencePlayer}
                                    />
                                  )
                                }
                                if (isImage) {
                                  const imageIndex = allPhotoGalleryUrls.findIndex((x) => x === ref.signedUrl)
                                  return (
                                    <TouchableOpacity
                                      key={`step-ref-image-${step.id}-${ridx}`}
                                      style={styles.stepPhotoThumb}
                                      onPress={() => {
                                        if (imageIndex >= 0) setLightboxIndex(imageIndex)
                                      }}
                                      activeOpacity={0.85}
                                    >
                                      <Image source={{ uri: ref.signedUrl }} style={styles.thumbImg} />
                                      <Text style={styles.referencePhotoBadge}>Referans fotoğraf</Text>
                                    </TouchableOpacity>
                                  )
                                }
                                return (
                                  <Text
                                    key={`step-ref-file-${step.id}-${ridx}`}
                                    style={[styles.value, { color: Colors.primary }]}
                                  >
                                    {ref.name || 'Dosya'}
                                  </Text>
                                )
                              })}
                            </View>
                          ) : null}
                        </View>
                      )
                    })
                  : chainGorevStepsForViewer.map((step) => {
                      const stepPhotos = extractPhotoUrls(step)
                      const stepVideos = extractKanitVideoRows(step)
                      const stepRefs = stepReferenceMediaMap[String(step.id)] || []
                      const adimNo = Number(step?.adim_no) || 0
                      const yapanName =
                        chainPersonNameMap[String(step?.personel_id)] ||
                        personLabelOrRef(null, step?.personel_id)
                      const stepDurumRaw = String(step?.durum || '').toLowerCase()
                      const stepDurumLabelZ = formatSiraliAdimDurumu(step?.durum)
                      const zStatusVariantStyle =
                        stepDurumRaw === 'tamamlandi' || stepDurumRaw === 'onaylandi'
                          ? styles.stepStatusPillSuccess
                          : stepDurumRaw === 'reddedildi'
                            ? styles.stepStatusPillError
                            : stepDurumRaw === 'aktif'
                              ? styles.stepStatusPillActive
                              : styles.stepStatusPillNeutral
                      const zStatusVariantText =
                        stepDurumRaw === 'tamamlandi' || stepDurumRaw === 'onaylandi'
                          ? styles.stepStatusPillSuccessText
                          : stepDurumRaw === 'reddedildi'
                            ? styles.stepStatusPillErrorText
                            : stepDurumRaw === 'aktif'
                              ? styles.stepStatusPillActiveText
                              : styles.stepStatusPillNeutralText
                      return (
                        <View key={`chain-step-${step.id}`} style={styles.siraliStepCard}>
                          <View style={styles.siraliStepCardHeader}>
                            <View style={styles.stepHeaderLeft}>
                              <Text style={styles.siraliStepCardIndex}>Adım {adimNo || '-'}</Text>
                            </View>
                            <View style={[styles.stepStatusPill, zStatusVariantStyle]}>
                              <Text style={[styles.stepStatusPillText, zStatusVariantText]}>
                                {stepDurumLabelZ}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.stepMetaGrid}>
                            <View style={styles.stepMetaCell}>
                              <Text style={styles.stepMetaLabel}>Personel</Text>
                              <Text style={styles.stepMetaValue} numberOfLines={1}>
                                {yapanName}
                              </Text>
                            </View>
                            {step?.tamamlandi_at ? (
                              <View style={styles.stepMetaCell}>
                                <Text style={styles.stepMetaLabel}>Tamamlanma</Text>
                                <Text style={styles.stepMetaValue}>
                                  {formatTs(step.tamamlandi_at)}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          {step?.aciklama ? (
                            <View style={styles.stepInlineNote}>
                              <Text style={styles.stepInlineNoteLabel}>Adım notu</Text>
                              <Text style={[styles.stepInlineNoteText, { fontStyle: 'italic' }]}>
                                {String(step.aciklama)}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.stepDivider} />

                          <View style={styles.stepEvidenceHeader}>
                            <Text style={styles.stepEvidenceTitle}>Kanıt fotoğrafları</Text>
                            {stepPhotos.length ? (
                              <Text style={styles.stepEvidenceCount}>{stepPhotos.length}</Text>
                            ) : null}
                          </View>
                          {stepPhotos.length ? (
                            <View style={styles.stepPhotoGrid}>
                              {stepPhotos.map((url, idx) => {
                                const globalIdx = allPhotoGalleryUrls.findIndex((x) => x === url)
                                return (
                                  <TouchableOpacity
                                    key={`${step.id}-${idx}`}
                                    style={styles.stepPhotoThumb}
                                    activeOpacity={0.85}
                                    onPress={() => setLightboxIndex(globalIdx >= 0 ? globalIdx : 0)}
                                  >
                                    <Image source={{ uri: url }} style={styles.thumbImg} />
                                  </TouchableOpacity>
                                )
                              })}
                            </View>
                          ) : (
                            <View style={styles.stepEmptyEvidence}>
                              <Text style={styles.stepEmptyEvidenceText}>
                                Bu adımda fotoğraf yok
                              </Text>
                            </View>
                          )}

                          {stepVideos.length ? (
                            <View style={[styles.videoEvidenceList, { marginTop: 14 }]}>
                              <Text style={styles.stepEvidenceTitle}>Kanıt videoları</Text>
                              {stepVideos.map((vr, vidx) => (
                                <EvidenceVideoPlayer
                                  key={`${step.id}-vid-${vidx}-${vr.url}`}
                                  uri={vr.url}
                                  style={styles.videoEvidencePlayer}
                                />
                              ))}
                            </View>
                          ) : null}
                          {stepRefs.length ? (
                            <View style={[styles.videoEvidenceList, { marginTop: 14 }]}>
                              <Text style={styles.stepEvidenceTitle}>Adım referans medya</Text>
                              {stepRefs.map((ref, ridx) => {
                                const isVideo =
                                  ref.type === 'video' ||
                                  String(ref.mimeType || '').startsWith('video/')
                                const isImage =
                                  ref.type === 'image' ||
                                  String(ref.mimeType || '').startsWith('image/')
                                if (isVideo) {
                                  return (
                                    <EvidenceVideoPlayer
                                      key={`step-ref-video-${step.id}-${ridx}`}
                                      uri={ref.signedUrl}
                                      style={styles.videoEvidencePlayer}
                                    />
                                  )
                                }
                                if (isImage) {
                                  const imageIndex = allPhotoGalleryUrls.findIndex((x) => x === ref.signedUrl)
                                  return (
                                    <TouchableOpacity
                                      key={`step-ref-image-${step.id}-${ridx}`}
                                      style={styles.stepPhotoThumb}
                                      onPress={() => {
                                        if (imageIndex >= 0) setLightboxIndex(imageIndex)
                                      }}
                                      activeOpacity={0.85}
                                    >
                                      <Image source={{ uri: ref.signedUrl }} style={styles.thumbImg} />
                                      <Text style={styles.referencePhotoBadge}>Referans fotoğraf</Text>
                                    </TouchableOpacity>
                                  )
                                }
                                return (
                                  <Text
                                    key={`step-ref-file-${step.id}-${ridx}`}
                                    style={[styles.value, { color: Colors.primary }]}
                                  >
                                    {ref.name || 'Dosya'}
                                  </Text>
                                )
                              })}
                            </View>
                          ) : null}
                        </View>
                      )
                    })}
              </View>
            ) : null}
            {chainOnayStepsForViewer.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>Zincir onay — adımlar</Text>
                {chainOnayStepsForViewer.map((step) => {
                  const onayDurumRaw = String(step?.durum || '').toLowerCase()
                  const onayDurumLabel = formatSiraliAdimDurumu(step?.durum)
                  const onayName =
                    chainPersonNameMap[String(step?.onaylayici_personel_id)] ||
                    personLabelOrRef(null, step?.onaylayici_personel_id)
                  const oStatusVariantStyle =
                    onayDurumRaw === 'onaylandi' || onayDurumRaw === 'tamamlandi'
                      ? styles.stepStatusPillSuccess
                      : onayDurumRaw === 'reddedildi'
                        ? styles.stepStatusPillError
                        : onayDurumRaw === 'bekliyor'
                          ? styles.stepStatusPillPending
                          : styles.stepStatusPillNeutral
                  const oStatusVariantText =
                    onayDurumRaw === 'onaylandi' || onayDurumRaw === 'tamamlandi'
                      ? styles.stepStatusPillSuccessText
                      : onayDurumRaw === 'reddedildi'
                        ? styles.stepStatusPillErrorText
                        : onayDurumRaw === 'bekliyor'
                          ? styles.stepStatusPillPendingText
                          : styles.stepStatusPillNeutralText
                  return (
                    <View key={`chain-onay-${step.id}`} style={styles.siraliStepCard}>
                      <View style={styles.siraliStepCardHeader}>
                        <View style={styles.stepHeaderLeft}>
                          <Text style={styles.siraliStepCardIndex}>
                            Onay {Number(step?.adim_no) || '-'}
                          </Text>
                        </View>
                        <View style={[styles.stepStatusPill, oStatusVariantStyle]}>
                          <Text style={[styles.stepStatusPillText, oStatusVariantText]}>
                            {onayDurumLabel}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.stepMetaGrid}>
                        <View style={styles.stepMetaCell}>
                          <Text style={styles.stepMetaLabel}>Onaylayan</Text>
                          <Text style={styles.stepMetaValue} numberOfLines={1}>
                            {onayName}
                          </Text>
                        </View>
                        {step?.onaylandi_at ? (
                          <View style={styles.stepMetaCell}>
                            <Text style={styles.stepMetaLabel}>Onay zamanı</Text>
                            <Text style={styles.stepMetaValue}>
                              {formatTs(step.onaylandi_at)}
                            </Text>
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

        {isDone &&
        !suppressAggregateKanitCardsWhenChainDone &&
        !hasChecklist &&
        (kanitOnlyPhotoUrls.length > 0 || showAdhocPhotoUi) ? (
          <View style={styles.mediaCard}>
            <Text style={styles.sectionTitle}>Kanıt fotoğrafları</Text>
            {kanitOnlyPhotoUrls.length ? (
              <View style={styles.photoList}>
                {kanitOnlyPhotoUrls.map((url, i) => (
                  <TouchableOpacity
                    key={`${url}-${i}`}
                    style={styles.photoThumb}
                    activeOpacity={0.85}
                    onPress={() => {
                      const gi = allPhotoGalleryUrls.findIndex((x) => x === url)
                      setLightboxIndex(gi >= 0 ? gi : 0)
                    }}
                  >
                    <Image source={{ uri: url }} style={styles.thumbImg} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.value}>Kanıt fotoğrafı yok.</Text>
            )}
          </View>
        ) : null}

        {isDone &&
        !suppressAggregateKanitCardsWhenChainDone &&
        !hasChecklist &&
        allEvidenceVideoRows.length ? (
          <View style={styles.mediaCard}>
            <Text style={styles.sectionTitle}>Kanıt videoları</Text>
            <View style={styles.videoEvidenceList}>
              {allEvidenceVideoRows.map((vr, i) => (
                <EvidenceVideoPlayer
                  key={`ev-vid-${vr.url}-${i}`}
                  uri={vr.url}
                  style={styles.videoEvidencePlayer}
                />
              ))}
            </View>
          </View>
        ) : null}

        {isDone &&
        !suppressAggregateKanitCardsWhenChainDone &&
        !hasChecklist &&
        allEvidenceBelgeRows.length ? (
          <View style={styles.mediaCard}>
            <Text style={styles.sectionTitle}>Kanıt belgeleri</Text>
            {allEvidenceBelgeRows.map((doc, i) => (
              <TouchableOpacity
                key={`ev-doc-${doc.url}-${i}`}
                style={styles.documentRow}
                onPress={() => Linking.openURL(doc.url).catch(() => {})}
              >
                <Text style={styles.documentRowText} numberOfLines={2}>
                  {doc.name || 'Belge'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {siraliViewerStepInfo ? (() => {
          const { role, step } = siraliViewerStepInfo
          const adimNo = Number(step?.adim_no) || 0
          const stepTitle = String(step?.adim_baslik || '').trim() || `Adım ${adimNo || '-'}`
          const ist = normalizeJsonObject(step?.adim_istenenler)
          const stepAciklama = String(ist?.aciklama || step?.aciklama || '').trim()
          const stepBitis = ist?.bitis_tarihi || null
          const stepAcil = !!ist?.acil
          // NOT: Gereksinim chip'leri (foto/video min sayı, max süre, "Açıklama
          // zorunlu", puan) banner'dan çıkarıldı; bu bilgiler tamamlama formunda
          // "Adım kanıtınızı ekleyin" ve açıklama label'ında zaten görünüyor.
          const yapanName =
            chainPersonNameMap[String(step?.personel_id)] ||
            personLabelOrRef(null, step?.personel_id)
          const denetimciName = step?.denetimci_personel_id
            ? chainPersonNameMap[String(step?.denetimci_personel_id)] ||
              personLabelOrRef(null, step.denetimci_personel_id)
            : '—'
          const variant =
            role === 'worker'
              ? styles.siraliBannerWorker
              : role === 'auditor'
                ? styles.siraliBannerAuditor
                : role === 'rejected'
                  ? styles.siraliBannerRejected
                  : role === 'approved'
                    ? styles.siraliBannerDone
                    : role === 'pending'
                      ? styles.siraliBannerAuditor
                      : styles.siraliBannerWaiting
          const headerText =
            role === 'worker'
              ? 'Aktif adımınız'
              : role === 'auditor'
                ? 'Onayınızı bekleyen adım'
                : role === 'rejected'
                  ? 'Adımınız reddedildi'
                  : role === 'approved'
                    ? 'Adımınız onaylandı'
                    : role === 'pending'
                      ? 'Adımınız denetimde'
                      : 'Sıranızı bekliyor'
          const hintText =
            role === 'worker'
              ? 'Aşağıdaki forma kanıt ve açıklama ekleyerek adımı denetime gönderin.'
              : role === 'auditor'
                ? 'Adımın kanıtlarını ve açıklamasını inceleyin; onaylayın veya gerekçe ile reddedin.'
                : role === 'rejected'
                  ? 'Denetimci adımınızı reddetti — gerekçe doğrultusunda kanıt/açıklamayı düzenleyip yeniden gönderin.'
                  : role === 'approved'
                    ? 'Bu adım sizin için tamamlandı; sıralı görev sonraki adımlarla yürümeye devam ediyor.'
                    : role === 'pending'
                      ? 'Denetimci onayı bekleniyor; onaylandığında sıralı görevde sıradaki adım açılır.'
                      : 'Önceki adım onaylandığında sıra otomatik olarak size geçecek.'
          return (
            <View style={[styles.siraliBanner, variant]}>
              <View style={styles.siraliBannerHeader}>
                <View style={styles.siraliBannerBadge}>
                  <Text style={styles.siraliBannerBadgeText}>{adimNo || '-'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.siraliBannerHeaderText}>{headerText}</Text>
                  <Text style={styles.siraliBannerSubText}>
                    Adım {adimNo || '-'} / {sortedSiraliSteps.length}
                  </Text>
                </View>
                {stepAcil ? (
                  <View style={styles.siraliBannerUrgentChip}>
                    <Text style={styles.siraliBannerUrgentChipText}>ACİL</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.siraliBannerTitle}>{stepTitle}</Text>
              {stepAciklama ? (
                <Text style={styles.siraliBannerBody}>{stepAciklama}</Text>
              ) : null}
              {/* Worker/owner rolleri kullanıcının kendisidir → "Denetimci" göster.
                  Auditor için kendisi denetimci → "Yapan" göster. */}
              <View style={styles.siraliBannerMetaGrid}>
                {role === 'auditor' ? (
                  <View style={styles.siraliBannerMetaCell}>
                    <Text style={styles.siraliBannerMetaLabel}>Yapan</Text>
                    <Text style={styles.siraliBannerMetaValue} numberOfLines={1}>
                      {yapanName}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.siraliBannerMetaCell}>
                    <Text style={styles.siraliBannerMetaLabel}>Denetimci</Text>
                    <Text style={styles.siraliBannerMetaValue} numberOfLines={1}>
                      {denetimciName}
                    </Text>
                  </View>
                )}
                {stepBitis ? (
                  <View style={styles.siraliBannerMetaCell}>
                    <Text style={styles.siraliBannerMetaLabel}>Bitiş</Text>
                    <Text style={styles.siraliBannerMetaValue}>{formatTs(stepBitis)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.siraliBannerHint}>{hintText}</Text>
            </View>
          )
        })() : null}

        {((!isLocked && !isDone && canEditTask) ||
          readOnlyChecklist ||
          (isApprovalPending && canApproveCurrentTask) ||
          (isSiraliGorevTuru(task?.gorev_turu) && !isDone && canApproveCurrentTask)) && (
          <View style={styles.actionCard}>
            {canCompleteTask && !effectiveHasChecklist ? (
              <>
                {showZincirWorkerStepFocus || showSiraliWorkerStepFocus ? (
                  <>
                    {/* Görev tamamlama formu — sıralı/zincir/normal her tür
                        görevde aynı klasik "Personel Notu" başlığı kullanılır.
                        Banner üstte gerekli bağlamı zaten veriyor. */}
                    <Text style={styles.sectionTitle}>Personel Notu</Text>
                    <Text style={styles.label}>
                      Açıklamanız {aciklamaZorunlu ? '(zorunlu)' : '(isteğe bağlı)'}
                    </Text>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Yaptığınız işi kısaca açıklayın..."
                      multiline
                      value={personelNotu}
                      onChangeText={setPersonelNotu}
                    />
                  </>
                ) : null}
                {/* Standart görev: Personel Notu üstte, sonra kanıt çekme/önizleme — böylece foto/video çek butonları "Görevi Tamamla" butonunun hemen üzerinde kalır. */}
                {!showZincirWorkerStepFocus && !showSiraliWorkerStepFocus ? (
                  <>
                    <Text style={styles.sectionTitle}>Personel Notu</Text>
                    <Text style={styles.label}>
                      Açıklamanız {aciklamaZorunlu ? '(zorunlu)' : '(isteğe bağlı)'}
                    </Text>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Yaptığınız işi kısaca açıklayın..."
                      multiline
                      value={personelNotu}
                      onChangeText={setPersonelNotu}
                    />
                  </>
                ) : null}
                {(showAdhocPhotoUi || showAdhocVideoUi || showAdhocBelgeUi) ? (
                  <>
                    {showZincirWorkerStepFocus || showSiraliWorkerStepFocus ? (
                      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Kanıtınızı ekleyin</Text>
                    ) : (
                      <Text style={styles.sectionTitle}>Kanıtınızı ekleyin</Text>
                    )}
                    {showAdhocPhotoUi && fotoZorunlu ? (
                      <Text style={styles.hint}>En az {minFoto} fotoğraf ekleyin</Text>
                    ) : null}
                    {showAdhocVideoUi ? (
                      <Text
                        style={[styles.hint, { marginTop: showAdhocPhotoUi && fotoZorunlu ? 6 : 0 }]}
                      >
                        {videoZorunlu
                          ? `En az ${minVideo} video ekleyin (en fazla ${taskMaxVideoSn} sn).`
                          : `İsteğe bağlı video (en fazla ${taskMaxVideoSn} sn).`}
                      </Text>
                    ) : null}
                    {showAdhocBelgeUi ? (
                      <Text style={[styles.hint, { marginTop: 6 }]}>
                        En az {minBelge} belge ekleyin (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX).
                      </Text>
                    ) : null}
                    {showAdhocPhotoUi && showAdhocVideoUi ? (
                      <View style={styles.captureBtnRow}>
                        <TouchableOpacity style={[styles.photoBtn, styles.captureBtnHalf]} onPress={takePhoto}>
                          <Text style={styles.photoBtnText}>Fotoğraf Çek</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.photoBtn, styles.captureBtnHalf]} onPress={takeVideo}>
                          <Text style={styles.photoBtnText}>Video Çek</Text>
                        </TouchableOpacity>
                      </View>
                    ) : showAdhocPhotoUi ? (
                      <TouchableOpacity style={[styles.photoBtn, styles.photoBtnSingle]} onPress={takePhoto}>
                        <Text style={styles.photoBtnText}>Fotoğraf Çek</Text>
                      </TouchableOpacity>
                    ) : showAdhocVideoUi ? (
                      <TouchableOpacity style={[styles.photoBtn, styles.photoBtnSingle]} onPress={takeVideo}>
                        <Text style={styles.photoBtnText}>Video Çek</Text>
                      </TouchableOpacity>
                    ) : null}
                    {showAdhocPhotoUi ? (
                      <View style={styles.photoList}>
                        {photos.map((p, i) => (
                          <View key={i} style={styles.photoThumb}>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() =>
                                setLocalPreview({
                                  type: 'photo',
                                  images: photos.map((x) => x.uri).filter(Boolean),
                                  index: i,
                                  title: 'Çekilen Fotoğraflar',
                                })
                              }
                              style={styles.thumbTouchable}
                              accessibilityRole="button"
                              accessibilityLabel="Fotoğrafı büyüt"
                            >
                              <Image source={{ uri: p.uri }} style={styles.thumbImg} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.removeThumb} onPress={() => removePhoto(i)}>
                              <Text style={styles.removeThumbText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {showAdhocVideoUi ? (
                      <View style={styles.videoDraftList}>
                        {videos.map((v, i) => (
                          <View key={`${v.uri}-${i}`} style={styles.videoDraftWrap}>
                            <EvidenceVideoPlayer uri={v.uri} style={styles.videoDraftPlayer} />
                            <TouchableOpacity
                              style={styles.videoExpandBtn}
                              onPress={() =>
                                setLocalPreview({
                                  type: 'video',
                                  videoUri: v.uri,
                                  durationSec: v.durationSec ?? null,
                                  title: 'Çekilen Video',
                                })
                              }
                              activeOpacity={0.85}
                              accessibilityRole="button"
                              accessibilityLabel="Videoyu tam ekran önizle"
                            >
                              <Text style={styles.videoExpandBtnText}>Tam ekran</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.removeVideoDraft} onPress={() => removeVideo(i)}>
                              <Text style={styles.removeThumbText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {showAdhocBelgeUi ? (
                      <>
                        <TouchableOpacity
                          style={[styles.photoBtn, styles.photoBtnSingle, { marginTop: 10 }]}
                          onPress={pickDocuments}
                        >
                          <Text style={styles.photoBtnText}>Belge Seç</Text>
                        </TouchableOpacity>
                        {documents.length ? (
                          <View style={styles.documentDraftList}>
                            {documents.map((doc, i) => (
                              <View key={`${doc.uri}-${i}`} style={styles.documentDraftRow}>
                                <Text style={styles.documentDraftName} numberOfLines={2}>
                                  {doc.name || 'Belge'}
                                </Text>
                                <TouchableOpacity onPress={() => removeDocument(i)}>
                                  <Text style={styles.removeThumbText}>×</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : showChecklistReviewCard ? (
              <>
                <Text style={styles.sectionTitle}>
                  {readOnlyChecklist ? 'Checklist özeti' : 'Checklist Soruları'}
                </Text>
                {readOnlyChecklist ? (
                  <Text style={[styles.hint, { marginBottom: 10 }]}>
                    Görev tamamlandı; aşağıda gönderdiğiniz cevaplar ve kanıtlar salt okunur görünür.
                  </Text>
                ) : null}
                {!readOnlyChecklist ? (
                  <View style={styles.checklistDraftRow}>
                    <Text style={styles.draftText}>
                      {draftSaving
                        ? 'Taslak kaydediliyor...'
                        : draftSavedAt
                          ? `Son kayıt: ${new Date(draftSavedAt).toLocaleTimeString('tr-TR')}`
                          : 'Taslak hazır'}
                    </Text>
                  </View>
                ) : null}

                {checklistLoading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size={36} color={Colors.primary} />
                  </View>
                ) : (
                  <>
                    <View style={styles.questionList}>
                      {templateQuestions.map((q, idx) => {
                        const qid = String(q?.id || idx)
                        const done = isQuestionDone(q)
                        const decision = checklistDecisionsByQuestionId[qid] || ''
                        const isActive = idx === questionIndex
                        const statusColor =
                          decision === 'reject' ? Colors.error : decision === 'accept' ? Colors.success : done ? Colors.success : Colors.mutedText
                        const StatusIconComp =
                          decision === 'reject'
                            ? Icon.TaskReject
                            : decision === 'accept'
                            ? Icon.TaskComplete
                            : done
                            ? Icon.TaskComplete
                            : null

                        return (
                          <View key={qid}>
                            <TouchableOpacity
                              style={[styles.questionListItem, isActive && styles.questionListItemActive]}
                              onPress={() => setQuestionIndex(idx)}
                              activeOpacity={0.85}
                            >
                              <Text style={[styles.questionListIndex, { color: Colors.text }]}>
                                {idx + 1}
                              </Text>
                              <View style={styles.questionListTextWrap}>
                                <Text style={styles.questionListTitle} numberOfLines={1}>
                                  {q?.soru_metni || 'Soru'}
                                </Text>
                                <Text style={styles.questionListMeta}>
                                  {String(q?.soru_tipi || '').toUpperCase()}
                                </Text>
                              </View>
                              {StatusIconComp ? (
                                <StatusIconComp size={18} color={statusColor} strokeWidth={2.2} />
                              ) : (
                                <View style={[styles.questionListDot, { backgroundColor: statusColor }]} />
                              )}
                            </TouchableOpacity>

                            {isActive
                              ? (() => {
                                  /**
                                   * Madde-bazlı kilitleme:
                                   *  • Görev tamamen onaylanmışsa (readOnlyChecklist) → her madde salt okunur (mevcut).
                                   *  • Resubmit akışında (görev personele geri döndü) denetimcinin önceden 'accept'
                                   *    verdiği maddeler kilitlenir; personel cevap/foto/videoya dokunamaz.
                                   *  • 'reject' verilen maddelerde red notu kırmızı banner'da gösterilir; cevap/kanıt
                                   *    yeniden girilebilir.
                                   *  • Henüz denetlenmemiş (denetim_karari boş) maddeler için davranış değişmez.
                                   */
                                  const isLockedItem =
                                    decision === 'accept' && !readOnlyChecklist
                                  const isRejectedItem =
                                    decision === 'reject' && !readOnlyChecklist
                                  const rejectNote = checklistRejectNotesByQuestionId[qid] || ''
                                  const inputsReadOnly = readOnlyChecklist || isLockedItem
                                  return (
                                    <View style={styles.questionCardInline}>
                                      <Text style={styles.questionTitle}>
                                        {q?.soru_metni || 'Soru'}
                                      </Text>

                                      {isLockedItem ? (
                                        <View style={styles.itemLockedBanner}>
                                          <Icon.TaskComplete size={16} color={Colors.success} strokeWidth={2.4} />
                                          <Text style={styles.itemLockedBannerText}>
                                            Bu madde denetimci tarafından onaylandı. Değiştirilemez.
                                          </Text>
                                        </View>
                                      ) : null}

                                      {isRejectedItem ? (
                                        <View style={styles.itemRejectBanner}>
                                          <Icon.TaskReject size={16} color={Colors.error} strokeWidth={2.4} />
                                          <View style={{ flex: 1 }}>
                                            <Text style={styles.itemRejectBannerTitle}>
                                              Bu madde reddedildi — yeniden cevaplayın
                                            </Text>
                                            {rejectNote ? (
                                              <Text style={styles.itemRejectBannerNote}>
                                                {rejectNote}
                                              </Text>
                                            ) : null}
                                          </View>
                                        </View>
                                      ) : null}

                                      {String(q?.soru_tipi || '').toUpperCase() === 'EVET_HAYIR' ? (
                                        <View style={styles.yesNoRow}>
                                          <TouchableOpacity
                                            disabled={inputsReadOnly}
                                            style={[
                                              styles.answerBtn,
                                              (inputsReadOnly
                                                ? checklistAnswersByQuestionId[String(q?.id)]
                                                : questionAnswers[String(q?.id)]) === 'EVET' &&
                                                styles.answerBtnActive,
                                            ]}
                                            onPress={() =>
                                              !inputsReadOnly &&
                                              setQuestionAnswers((prev) => ({
                                                ...prev,
                                                [String(q?.id)]: 'EVET',
                                              }))
                                            }
                                            activeOpacity={inputsReadOnly ? 1 : 0.85}
                                          >
                                            <Text style={styles.answerBtnText}>Evet</Text>
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            disabled={inputsReadOnly}
                                            style={[
                                              styles.answerBtn,
                                              (inputsReadOnly
                                                ? checklistAnswersByQuestionId[String(q?.id)]
                                                : questionAnswers[String(q?.id)]) === 'HAYIR' &&
                                                styles.answerBtnActive,
                                            ]}
                                            onPress={() =>
                                              !inputsReadOnly &&
                                              setQuestionAnswers((prev) => ({
                                                ...prev,
                                                [String(q?.id)]: 'HAYIR',
                                              }))
                                            }
                                            activeOpacity={inputsReadOnly ? 1 : 0.85}
                                          >
                                            <Text style={styles.answerBtnText}>Hayır</Text>
                                          </TouchableOpacity>
                                        </View>
                                      ) : null}

                                      {String(q?.soru_tipi || '').toUpperCase() === 'METIN' ? (
                                        <TextInput
                                          style={styles.noteInput}
                                          placeholder="Cevabınızı yazın..."
                                          multiline
                                          editable={!inputsReadOnly}
                                          value={String(
                                            inputsReadOnly
                                              ? checklistAnswersByQuestionId[String(q?.id)] || ''
                                              : questionAnswers[String(q?.id)] || '',
                                          )}
                                          onChangeText={(txt) =>
                                            !inputsReadOnly &&
                                            setQuestionAnswers((prev) => ({
                                              ...prev,
                                              [String(q?.id)]: txt,
                                            }))
                                          }
                                        />
                                      ) : null}

                                      {String(q?.soru_tipi || '').toUpperCase() === 'FOTOGRAF' ? (
                                        <>
                                          {!inputsReadOnly &&
                                          (!!q?.foto_zorunlu || !!q?.zorunlu_mu) ? (
                                            <Text style={styles.hint}>
                                              En az {Number(q?.min_foto_sayisi) || 0} fotoğraf ekleyin
                                            </Text>
                                          ) : null}

                                          {!inputsReadOnly ? (
                                            <TouchableOpacity
                                              style={[styles.photoBtn, styles.photoBtnSingle]}
                                              onPress={() => takePhotoForQuestion(q?.id)}
                                            >
                                              <Text style={styles.photoBtnText}>Fotoğraf Çek</Text>
                                            </TouchableOpacity>
                                          ) : null}
                                          <View style={styles.photoList}>
                                            {(inputsReadOnly
                                              ? checklistPhotosByQuestionId[String(q?.id)] || []
                                              : questionPhotos?.[String(q?.id)] || []
                                            ).map((p, i) =>
                                              inputsReadOnly ? (
                                                <TouchableOpacity
                                                  key={i}
                                                  style={styles.photoThumb}
                                                  onPress={() => {
                                                    const idxInAll = allPhotoGalleryUrls.findIndex(
                                                      (x) => x === p,
                                                    )
                                                    if (idxInAll >= 0) setLightboxIndex(idxInAll)
                                                  }}
                                                  activeOpacity={0.85}
                                                >
                                                  <Image
                                                    source={{ uri: p }}
                                                    style={styles.thumbImg}
                                                  />
                                                </TouchableOpacity>
                                              ) : (
                                                <View key={i} style={styles.photoThumb}>
                                                  <TouchableOpacity
                                                    activeOpacity={0.85}
                                                    style={styles.thumbTouchable}
                                                    onPress={() => {
                                                      const all = (
                                                        questionPhotos?.[String(q?.id)] || []
                                                      )
                                                        .map((x) => x?.uri)
                                                        .filter(Boolean)
                                                      setLocalPreview({
                                                        type: 'photo',
                                                        images: all,
                                                        index: i,
                                                        title: 'Soru Fotoğrafları',
                                                      })
                                                    }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Fotoğrafı büyüt"
                                                  >
                                                    <Image
                                                      source={{ uri: p.uri }}
                                                      style={styles.thumbImg}
                                                    />
                                                  </TouchableOpacity>
                                                  <TouchableOpacity
                                                    style={styles.removeThumb}
                                                    onPress={() => removeQuestionPhoto(q?.id, i)}
                                                  >
                                                    <Text style={styles.removeThumbText}>×</Text>
                                                  </TouchableOpacity>
                                                </View>
                                              ),
                                            )}
                                          </View>
                                          {inputsReadOnly &&
                                          !(checklistPhotosByQuestionId[String(q?.id)] || []).length ? (
                                            <Text style={styles.hint}>Bu soruda fotoğraf yok.</Text>
                                          ) : null}
                                        </>
                                      ) : null}

                                      {String(q?.soru_tipi || '').toUpperCase() === 'VIDEO' ? (
                                        <>
                                          {!inputsReadOnly ? (
                                            <Text style={styles.hint}>
                                              {!!q?.zorunlu_mu ? 'Video kanıtı zorunlu. ' : ''}
                                              En fazla{' '}
                                              {Math.min(
                                                60,
                                                Math.max(5, Number(q?.max_video_suresi_sn) || 60),
                                              )}{' '}
                                              sn.
                                            </Text>
                                          ) : null}
                                          {!inputsReadOnly ? (
                                            <TouchableOpacity
                                              style={[styles.photoBtn, styles.photoBtnSingle]}
                                              onPress={() =>
                                                takeVideoForQuestion(
                                                  q?.id,
                                                  Math.min(
                                                    60,
                                                    Math.max(
                                                      5,
                                                      Number(q?.max_video_suresi_sn) || 60,
                                                    ),
                                                  ),
                                                )
                                              }
                                            >
                                              <Text style={styles.photoBtnText}>Video Çek</Text>
                                            </TouchableOpacity>
                                          ) : null}
                                          <View style={styles.videoDraftList}>
                                            {(inputsReadOnly
                                              ? checklistVideosByQuestionId[String(q?.id)] || []
                                              : questionVideos?.[String(q?.id)] || []
                                            ).map((row, i) => {
                                              const uri =
                                                typeof row === 'string'
                                                  ? row
                                                  : row?.uri || row?.url
                                              if (!uri) return null
                                              return inputsReadOnly ? (
                                                <EvidenceVideoPlayer
                                                  key={`qvid-ro-${q?.id}-${i}-${uri}`}
                                                  uri={uri}
                                                  style={styles.videoEvidencePlayer}
                                                />
                                              ) : (
                                                <View
                                                  key={`qvid-${q?.id}-${i}`}
                                                  style={styles.videoDraftWrap}
                                                >
                                                  <EvidenceVideoPlayer
                                                    uri={row.uri}
                                                    style={styles.videoDraftPlayer}
                                                  />
                                                  <TouchableOpacity
                                                    style={styles.videoExpandBtn}
                                                    onPress={() =>
                                                      setLocalPreview({
                                                        type: 'video',
                                                        videoUri: row.uri,
                                                        durationSec: row?.durationSec ?? null,
                                                        title: 'Soru Videosu',
                                                      })
                                                    }
                                                    activeOpacity={0.85}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Videoyu tam ekran önizle"
                                                  >
                                                    <Text style={styles.videoExpandBtnText}>
                                                      Tam ekran
                                                    </Text>
                                                  </TouchableOpacity>
                                                  <TouchableOpacity
                                                    style={styles.removeVideoDraft}
                                                    onPress={() => removeQuestionVideo(q?.id, i)}
                                                  >
                                                    <Text style={styles.removeThumbText}>×</Text>
                                                  </TouchableOpacity>
                                                </View>
                                              )
                                            })}
                                          </View>
                                          {inputsReadOnly &&
                                          !(checklistVideosByQuestionId[String(q?.id)] || []).some(
                                            (row) => {
                                              const u =
                                                typeof row === 'string'
                                                  ? row
                                                  : row?.uri || row?.url
                                              return !!u
                                            },
                                          ) ? (
                                            <Text style={styles.hint}>Bu soruda video yok.</Text>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </View>
                                  )
                                })()
                              : null}
                          </View>
                        )
                      })}
                    </View>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.hint}>
                {isSiraliGorevTuru(task?.gorev_turu)
                  ? 'Bu adımın kanıtları ve açıklamasını yukarıda inceleyin; onay veya reddetme kararınızı aşağıdaki butonlardan verin.'
                  : 'Bu görev denetim aşamasında. Detayları inceleyip onay işlemi yapabilirsiniz.'}
              </Text>
            )}

            {!readOnlyChecklist && canCompleteTask ? (
              <TouchableOpacity
                style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
                onPress={completeTask}
                disabled={completing}
              >
                {completing ? (
                  <View style={styles.completeInner}>
                    <ActivityIndicator size={20} color={Colors.text} />
                    <Text style={styles.completeBtnText}>Kaydediliyor...</Text>
                  </View>
                ) : (
                  <Text style={styles.completeBtnText}>Görevi Tamamla</Text>
                )}
              </TouchableOpacity>
            ) : null}
            {!readOnlyChecklist && canApproveCurrentTask ? (
              <TouchableOpacity style={styles.approveBtn} onPress={approveTask}>
                <Text style={styles.completeBtnText}>Onayla</Text>
              </TouchableOpacity>
            ) : null}
            {!readOnlyChecklist &&
            isSiraliGorevTuru(task?.gorev_turu) &&
            canApproveCurrentTask ? (
              <TouchableOpacity style={styles.rejectBtn} onPress={rejectSiraliStep}>
                <Text style={styles.completeBtnText}>Reddet</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>

      <EvidenceCaptureModal
        visible={!!captureUi}
        mode={captureUi?.mode === 'video' ? 'video' : 'photo'}
        maxVideoDurationSec={
          captureUi?.mode === 'video'
            ? Math.min(60, Math.max(5, Number(captureUi?.context?.maxVideoSec) || 60))
            : 60
        }
        onClose={() => setCaptureUi(null)}
        onPhotoComplete={handleEvidencePhotoComplete}
        onVideoComplete={handleEvidenceVideoComplete}
      />

      <PhotoViewerModal
        visible={lightboxIndex != null}
        imageUrls={allPhotoGalleryUrls}
        initialIndex={lightboxIndex ?? 0}
        onRequestClose={() => setLightboxIndex(null)}
        title="Görev Kanıtları"
      />

      {/* Henüz yüklenmemiş, yerel olarak çekilen taslak foto/video önizlemesi */}
      <PhotoViewerModal
        visible={localPreview?.type === 'photo'}
        imageUrls={localPreview?.images || []}
        initialIndex={localPreview?.index ?? 0}
        onRequestClose={() => setLocalPreview(null)}
        title={localPreview?.title || 'Önizleme'}
      />
      <VideoPreviewModal
        visible={localPreview?.type === 'video'}
        uri={localPreview?.videoUri}
        durationSec={localPreview?.durationSec ?? null}
        title={localPreview?.title || 'Video Önizleme'}
        onRequestClose={() => setLocalPreview(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: kitPalette.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: kitSpacing.lg, paddingBottom: 40 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: kitSpacing.lg,
    paddingTop: kitSpacing.md,
    paddingBottom: kitSpacing.sm,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    fontSize: 14,
    color: kitPalette.primary[700],
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  heroCard: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    paddingHorizontal: kitSpacing.lg,
    paddingVertical: kitSpacing.lg,
    marginBottom: kitSpacing.md,
    ...kitShadows.md,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: kitSpacing.sm,
    flexWrap: 'wrap',
  },
  heroTitle: {
    flex: 1,
    flexShrink: 1,
    minWidth: 160,
    fontSize: 22,
    fontWeight: '800',
    color: kitPalette.slate[800],
    lineHeight: 28,
    letterSpacing: -0.4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  heroTypeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: kitSpacing.md,
    paddingVertical: 5,
    borderRadius: kitRadii.pill,
    backgroundColor: kitPalette.primary[50],
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
    marginTop: 2,
  },
  heroTypeChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: kitPalette.primary[700],
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.mutedText,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 10,
  },
  heroMetaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  heroStatusChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: Layout.borderRadius.full,
    borderWidth: 1,
  },
  heroStatusChipNeutral: {
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.gray06 || Colors.surface,
  },
  heroStatusChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  heroStatusChipAcil: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo08 || '#f5f3ff',
  },
  heroStatusChipTextAcil: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  heroStatusChipDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderColor: Colors.alpha.emerald25 || '#a7f3d0',
    backgroundColor: Colors.alpha.emerald10 || '#ecfdf5',
  },
  heroStatusChipDoneIcon: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.success,
    lineHeight: 14,
  },
  heroStatusChipTextDone: {
    color: Colors.success,
    fontWeight: '800',
  },
  poolBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderLeftWidth: 4,
    borderLeftColor: kitPalette.warning[500],
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  poolBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  poolBannerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  poolBannerBadgeText: {
    color: kitPalette.warning[700],
    fontSize: 12,
    fontWeight: '800',
  },
  poolBannerDoneRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  poolBannerDoneIcon: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '900',
    marginRight: 4,
  },
  poolBannerDoneText: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
  },
  poolBannerDoneName: {
    color: Colors.success,
    fontWeight: '800',
  },
  poolBannerHint: {
    flex: 1,
    fontSize: 12,
    color: Colors.mutedText,
    fontStyle: 'italic',
  },
  poolBannerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  poolBannerChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  poolBannerChipDone: {
    backgroundColor: Colors.alpha.emerald10 || '#ECFDF5',
    borderColor: Colors.alpha.emerald25 || '#A7F3D0',
  },
  poolBannerChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  poolBannerChipTextDone: {
    color: Colors.success,
  },
  poolBannerChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  approvalBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.alpha.emerald10 || '#ecfdf5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.emerald25 || '#a7f3d0',
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  approvalBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalBannerIcon: {
    color: Colors.surface,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  approvalBannerBody: {
    flex: 1,
    minWidth: 0,
  },
  approvalBannerTitle: {
    fontSize: Typography.bodyLg.fontSize,
    fontWeight: '800',
    color: Colors.success,
    marginBottom: 2,
  },
  approvalBannerStep: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  approvalBannerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 2,
  },
  approvalBannerMetaItem: {
    minWidth: 110,
    flexShrink: 1,
  },
  approvalBannerMetaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  approvalBannerMetaValue: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  infoCard: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    padding: kitSpacing.lg,
    marginBottom: kitSpacing.md,
    ...kitShadows.sm,
  },
  mediaCard: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    padding: kitSpacing.lg,
    marginBottom: kitSpacing.md,
    ...kitShadows.sm,
  },
  actionCard: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    padding: kitSpacing.lg,
    marginBottom: kitSpacing.md,
    ...kitShadows.sm,
  },
  label: {
    fontSize: 11,
    color: kitPalette.slate[500],
    marginTop: kitSpacing.md,
    marginBottom: 4,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    fontSize: 14,
    color: kitPalette.slate[800],
    fontFamily: 'PlusJakartaSans-Medium',
  },
  empty: { color: kitPalette.slate[500], marginBottom: kitSpacing.lg },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: kitPalette.slate[800],
    marginTop: 0,
    marginBottom: kitSpacing.sm,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: -0.2,
  },
  timelineNote: { fontSize: 12, color: Colors.mutedText, marginTop: 2, marginLeft: 4 },
  noteSurfaceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 16,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  noteSurfaceCardMuted: {
    backgroundColor: Colors.alpha.amber10 || Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.amber25 || Colors.alpha.gray20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    padding: 14,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  noteSurfaceBody: { fontSize: 14, color: Colors.text, lineHeight: 21 },
  noteAfterNoteTitle: { marginTop: 14 },
  hint: { fontSize: Typography.caption.fontSize, color: Colors.mutedText, marginBottom: 12 },
  noteInput: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: Typography.body.fontSize,
    color: Colors.text,
    backgroundColor: Colors.card,
    marginBottom: 12,
  },
  completeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  captureBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  captureBtnHalf: { flex: 1, alignItems: 'center' },
  photoBtn: { backgroundColor: Colors.accent, paddingVertical: 12, paddingHorizontal: 20, borderRadius: Layout.borderRadius.lg },
  photoBtnSingle: { marginBottom: 12 },
  photoBtnText: { color: Colors.surface, fontWeight: '600' },
  photoList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  photoThumb: { width: 80, height: 80, position: 'relative' },
  thumbTouchable: { width: '100%', height: '100%', borderRadius: Layout.borderRadius.md, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%', borderRadius: Layout.borderRadius.md },
  referencePhotoBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    color: kitPalette.surface,
    fontSize: 9,
    fontWeight: '700',
    overflow: 'hidden',
  },
  removeThumb: { position: 'absolute', top: -4, right: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center' },
  removeThumbText: { color: Colors.text, fontSize: Typography.body.fontSize, fontWeight: '700' },
  videoEvidenceList: { gap: 12, marginTop: 8 },
  videoEvidencePlayer: {
    width: '100%',
    height: 228,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.gray10,
  },
  videoDraftList: { gap: 12, marginBottom: 12 },
  documentDraftList: { gap: 8, marginBottom: 12, marginTop: 8 },
  documentDraftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.gray10,
  },
  documentDraftName: { flex: 1, fontSize: Typography.body.fontSize, color: Colors.text },
  documentRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.gray10,
    marginTop: 8,
  },
  documentRowText: { fontSize: Typography.body.fontSize, color: Colors.primary, fontWeight: '600' },
  videoDraftWrap: { position: 'relative', width: '100%' },
  videoDraftPlayer: {
    width: '100%',
    height: 228,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.gray10,
  },
  removeVideoDraft: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  videoExpandBtn: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 2,
  },
  videoExpandBtnText: {
    color: kitPalette.surface,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  completeBtn: {
    backgroundColor: kitPalette.success[500],
    paddingVertical: 16,
    borderRadius: kitRadii.pill,
    alignItems: 'center',
    ...kitShadows.success,
  },
  approveBtn: {
    backgroundColor: kitPalette.success[500],
    paddingVertical: 16,
    borderRadius: kitRadii.pill,
    alignItems: 'center',
    marginTop: kitSpacing.sm,
    ...kitShadows.success,
  },
  rejectBtn: {
    backgroundColor: kitPalette.danger[500],
    paddingVertical: 16,
    borderRadius: kitRadii.pill,
    alignItems: 'center',
    marginTop: kitSpacing.sm,
    ...kitShadows.danger,
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: {
    color: kitPalette.surface,
    fontWeight: '700',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.2,
  },

  checklistDraftRow: { marginBottom: 10 },
  draftText: { color: Colors.mutedText, fontWeight: '600' },
  doneChecklistList: { gap: 8 },
  doneChecklistItem: {
    borderWidth: 1,
    borderRadius: Layout.borderRadius.md,
    padding: 10,
  },
  doneChecklistItemAccepted: {
    borderColor: Colors.alpha.emerald35 || '#86efac',
    backgroundColor: Colors.alpha.emerald08 || '#f0fdf4',
  },
  doneChecklistItemRejected: {
    borderColor: Colors.alpha.rose35 || '#fca5a5',
    backgroundColor: Colors.alpha.rose08 || '#fff1f2',
  },
  doneChecklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  doneChecklistTitle: { flex: 1, color: Colors.text, fontWeight: '700' },
  doneChecklistBadge: {
    borderRadius: Layout.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  doneChecklistBadgeAccepted: {
    backgroundColor: Colors.alpha.emerald10 || '#dcfce7',
    borderColor: Colors.alpha.emerald35 || '#86efac',
  },
  doneChecklistBadgeRejected: {
    backgroundColor: Colors.alpha.rose10 || '#fee2e2',
    borderColor: Colors.alpha.rose35 || '#fca5a5',
  },
  doneChecklistBadgeText: { color: Colors.text, fontWeight: '700', fontSize: Typography.caption.fontSize },
  doneChecklistAnswer: { color: Colors.textSecondary || Colors.mutedText, marginBottom: 8 },

  questionList: { marginBottom: 12, gap: 8 },
  questionListItem: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: kitPalette.slate[50],
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questionListItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo06,
  },
  questionListIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.alpha.gray10,
    textAlign: 'center',
    fontWeight: '800',
    paddingTop: 2,
  },
  questionListTextWrap: { flex: 1 },
  questionListTitle: { color: Colors.text, fontWeight: '700' },
  questionListMeta: { color: Colors.mutedText, fontWeight: '600', fontSize: Typography.caption.fontSize, marginTop: 2 },
  questionListStatus: { fontWeight: '900', fontSize: 18 },
  questionListDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  questionCard: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 14,
    marginBottom: 12,
  },
  questionCardInline: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 14,
    marginTop: 8,
    marginBottom: 2,
  },
  itemLockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.emerald10,
    borderWidth: 1,
    borderColor: Colors.alpha.emerald25,
    marginTop: 4,
    marginBottom: 12,
  },
  itemLockedBannerIcon: {
    color: Colors.success,
    fontSize: 16,
    fontWeight: '900',
  },
  itemLockedBannerText: {
    flex: 1,
    color: Colors.success,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemRejectBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.rose10,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
    marginTop: 4,
    marginBottom: 12,
  },
  itemRejectBannerIcon: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 1,
  },
  itemRejectBannerTitle: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  itemRejectBannerNote: {
    marginTop: 4,
    color: Colors.text,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
    backgroundColor: Colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  questionTypeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.indigo06,
    color: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Layout.borderRadius.full,
    fontWeight: '800',
  },
  questionTitle: { marginTop: 10, marginBottom: 10, fontWeight: '800', color: Colors.text, fontSize: Typography.body.fontSize },

  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  answerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  answerBtnActive: { backgroundColor: Colors.alpha.indigo10, borderColor: Colors.primary },
  answerBtnText: { fontWeight: '800', color: Colors.text },

  lockCard: {
    marginBottom: 12,
    backgroundColor: Colors.alpha.rose10,
    borderRadius: Layout.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
    padding: 16,
  },
  lockTitle: {
    color: Colors.error,
    fontWeight: '900',
    fontSize: Typography.body.fontSize,
    marginBottom: 6,
  },
  lockText: {
    color: Colors.error,
    fontWeight: '600',
    fontSize: Typography.caption.fontSize,
  },
  zincirInstructionCard: {
    borderColor: Colors.alpha.indigo15 || '#c7d2fe',
    borderWidth: 1,
  },
  zincirMutedDetail: {
    color: Colors.mutedText,
    fontStyle: 'italic',
  },
  zincirInstructionBody: {
    lineHeight: 22,
  },
  siraliBanner: {
    borderWidth: 1,
    borderRadius: Layout.borderRadius.lg,
    padding: 14,
    marginBottom: 14,
    gap: 8,
    ...ThemeObj.Shadows.card,
  },
  siraliBannerWorker: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo06 || '#eef2ff',
  },
  siraliBannerAuditor: {
    borderColor: kitPalette.info[500],
    backgroundColor: kitPalette.info[100],
  },
  siraliBannerRejected: {
    borderColor: Colors.error,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  siraliBannerDone: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  siraliBannerWaiting: {
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.gray08 || '#f8fafc',
  },
  siraliBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  siraliBannerBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  siraliBannerBadgeText: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '800',
  },
  siraliBannerHeaderText: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '800',
  },
  siraliBannerSubText: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  siraliBannerUrgentChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Layout.borderRadius.full,
    backgroundColor: Colors.error,
  },
  siraliBannerUrgentChipText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  siraliBannerTitle: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '800',
  },
  siraliBannerBody: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    lineHeight: 20,
  },
  siraliBannerMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  siraliBannerMetaCell: {
    minWidth: 110,
  },
  siraliBannerMetaLabel: {
    color: Colors.mutedText,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  siraliBannerMetaValue: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    marginTop: 2,
  },
  siraliBannerReqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  siraliBannerReqChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Layout.borderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  siraliBannerReqChipText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  siraliBannerHint: {
    color: Colors.mutedText,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  siraliStepCard: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 14,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  siraliStepCardCurrent: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo06,
  },
  siraliStepCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  siraliStepCardIndex: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  siraliStepCurrentChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Layout.borderRadius.full,
    backgroundColor: Colors.primary,
  },
  siraliStepCurrentChipText: {
    color: Colors.surface,
    fontSize: 11,
    fontWeight: '800',
  },
  siraliStepCardTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
  },
  stepHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  stepStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Layout.borderRadius.full,
    borderWidth: 1,
  },
  stepStatusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  stepStatusPillSuccess: {
    borderColor: Colors.alpha.emerald25 || '#a7f3d0',
    backgroundColor: Colors.alpha.emerald10 || '#ecfdf5',
  },
  stepStatusPillSuccessText: { color: Colors.success },
  stepStatusPillError: {
    borderColor: Colors.alpha.rose25 || '#fecaca',
    backgroundColor: Colors.alpha.rose10 || '#fef2f2',
  },
  stepStatusPillErrorText: { color: Colors.error },
  stepStatusPillPending: {
    borderColor: Colors.alpha.amber25 || '#fde68a',
    backgroundColor: Colors.alpha.amber10 || '#fffbeb',
  },
  stepStatusPillPendingText: { color: kitPalette.warning[700] },
  stepStatusPillActive: {
    borderColor: Colors.alpha.indigo25 || Colors.alpha.indigo15,
    backgroundColor: Colors.alpha.indigo10 || '#eef2ff',
  },
  stepStatusPillActiveText: { color: Colors.primary },
  stepStatusPillNeutral: {
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.gray08 || Colors.alpha.gray10,
  },
  stepStatusPillNeutralText: { color: Colors.mutedText },
  stepMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  stepMetaCell: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 130,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.alpha.gray08 || '#F3F4F6',
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.alpha.gray18 || Colors.alpha.gray20,
  },
  stepMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  stepMetaValue: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  stepInlineNote: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.alpha.indigo06 || '#f5f3ff',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    borderRadius: Layout.borderRadius.sm,
  },
  stepInlineNoteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  stepInlineNoteText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.bodyText || Colors.text,
    lineHeight: 18,
  },
  stepDivider: {
    height: 1,
    backgroundColor: Colors.alpha.gray18 || Colors.alpha.gray20,
    marginVertical: 14,
  },
  stepEvidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepEvidenceTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: '800',
    color: Colors.text,
  },
  stepEvidenceCount: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    color: Colors.primary,
    backgroundColor: Colors.alpha.indigo10 || '#eef2ff',
    borderRadius: Layout.borderRadius.full,
    overflow: 'hidden',
  },
  stepPhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepPhotoThumb: {
    width: 92,
    height: 92,
    borderRadius: Layout.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.alpha.gray18 || Colors.alpha.gray20,
    position: 'relative',
    backgroundColor: Colors.alpha.gray08 || '#F3F4F6',
  },
  stepEmptyEvidence: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.gray08 || '#F9FAFB',
  },
  stepEmptyEvidenceText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.mutedText,
    fontWeight: '600',
  },
})
