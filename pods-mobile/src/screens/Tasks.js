import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import { normalizeTaskScore, recordTaskPenaltyOnce } from '../lib/pointsLedger'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import { isSiraliGorevTuru, isZincirGorevTuru, isZincirOnayTuru } from '../lib/zincirTasks'
import {
  TASK_STATUS,
  getTaskStatusLabel,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../lib/taskStatus'
import {
  isListedTaskVisibleForAssignee,
  isTaskVisibleAtInLocalCalendarDay,
} from '../lib/taskVisibility'
import { shallowCloneRows } from '../lib/shallowCloneRows'

const ThemeObj = Theme?.default ?? Theme

const { Typography, Colors } = ThemeObj

const supabase = getSupabase()

const FILTER_ALL = 'all'
const FILTER_BEKLEYEN = 'bekleyen'
const FILTER_TAMAMLANAN = 'tamamlanan'

function isCompleted(durum) {
  return isApprovedTaskStatus(durum)
}

function getStatusColor(durum) {
  if (!durum) return ThemeObj.Colors.mutedText
  const d = String(durum).toLowerCase()
  if (d.includes('tamam') || d.includes('bitti')) return ThemeObj.Colors.success
  if (d.includes('onaylanmad') || d.includes('revize') || d.includes('redd')) return ThemeObj.Colors.error
  return ThemeObj.Colors.mutedText
}

function getStatusLabel(durum) {
  const normalized = normalizeTaskStatus(durum)
  const d = String(normalized || '').toLowerCase()
  if (d.includes('acil')) return 'Bekliyor'
  if (normalized === TASK_STATUS.APPROVED) return TASK_STATUS.APPROVED
  if (normalized === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  if (normalized === TASK_STATUS.PENDING_APPROVAL) return TASK_STATUS.PENDING_APPROVAL
  if (normalized === TASK_STATUS.RESUBMITTED) return TASK_STATUS.RESUBMITTED
  if (normalized === TASK_STATUS.ASSIGNED) return TASK_STATUS.ASSIGNED
  if (d.includes('gecik')) return 'Gecikmiş'
  return getTaskStatusLabel(durum)
}

function isInReviewState(durum) {
  return isPendingApprovalTaskStatus(durum)
}

function dedupeById(rows) {
  const map = new Map()
  ;(rows || []).forEach((row) => {
    if (!row?.id) return
    map.set(String(row.id), row)
  })
  return Array.from(map.values())
}

/** Görevlerim: görünürlük zamanı geçmiş + yerel takvimde bugün */
function assigneeTasksVisibilityToday(task, now = new Date()) {
  return isListedTaskVisibleForAssignee(task, now) && isTaskVisibleAtInLocalCalendarDay(task, now)
}

/**
 * Onaylı zincir/sıralı/onay katılımcısı için takvim günü süzmesini atlama:
 * tamamlanan işin başlama/görünür tarihi bugün olmayabilir; liste yine de görünmeli.
 */
function assigneeTasksVisibilityTodayWithParticipants(task, participantApprovedTaskIds, now = new Date()) {
  if (!task?.id) return false
  if (!isListedTaskVisibleForAssignee(task, now)) return false
  const tid = String(task.id)
  if (
    participantApprovedTaskIds &&
    participantApprovedTaskIds.size > 0 &&
    participantApprovedTaskIds.has(tid) &&
    isApprovedTaskStatus(task?.durum)
  ) {
    return true
  }
  return isTaskVisibleAtInLocalCalendarDay(task, now)
}

/**
 * Sıralı görevde ana kayıt bazen yanlışlıkla sonraki adımın işçisine atanmış olabilir veya
 * kullanıcı hem sonraki adımda bekliyor hem de listede görünüyor olabilir.
 * Yalnızca `sorumlu_personel_id === personelId` olan sıralı görevleri aktif adım satırına göre süzer.
 */
async function refineSiraliResponsibleRows(rows, personelId, client) {
  if (!rows?.length || !personelId) return rows || []
  const mine = rows.filter(
    (t) =>
      isSiraliGorevTuru(t?.gorev_turu) &&
      String(t?.sorumlu_personel_id || '') === String(personelId || ''),
  )
  if (!mine.length) return rows

  const ids = [...new Set(mine.map((t) => t.id).filter(Boolean))]
  const { data: stepRows, error } = await client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, personel_id, denetimci_personel_id, adim_durum, durum')
    .in('is_id', ids)

  if (error || !stepRows?.length) return rows

  const byKey = new Map()
  for (const s of stepRows) {
    if (!s?.is_id || s.adim_no == null) continue
    byKey.set(`${s.is_id}:${Number(s.adim_no)}`, s)
  }

  return rows.filter((task) => {
    if (!isSiraliGorevTuru(task?.gorev_turu)) return true
    if (String(task?.sorumlu_personel_id || '') !== String(personelId || '')) return true

    const adimNo = Number(task.zincir_aktif_adim) || 1
    const step = byKey.get(`${task.id}:${adimNo}`)
    if (!step) return true

    const pending = isPendingApprovalTaskStatus(task.durum)
    const st = String(step.adim_durum || step.durum || '').toLowerCase()

    if (pending) {
      if (step.denetimci_personel_id != null) {
        return String(step.denetimci_personel_id) === String(personelId)
      }
      return String(step.personel_id) === String(personelId)
    }

    if (String(step.personel_id) !== String(personelId)) return false
    if (st === 'sira_bekliyor') return false
    return true
  })
}

export default function Tasks() {
  const navigation = useNavigation()
  const { user, personel, permissions, loading: authLoading } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState(FILTER_ALL)

  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )

  const load = useCallback(async () => {
    if (!user?.id) {
      setTasks([])
      setLoading(false)
      return
    }
    const personelId = personel?.id ?? null
    const anaSirketId = personel?.ana_sirket_id ?? null
    if (!personelId || !anaSirketId) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // grup_id: havuz görev (bireysel = false) ile oluşturulan görevlerde aynı `grup_id`'ye
      // sahip satırlar olur. Personel kendi satırını görür ama kart üzerinde "Havuz görev"
      // rozeti gösterebilmek için alanı select'e dahil ediyoruz.
      const baseSelectWithVisibleAt =
        'id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, gorunur_tarih, ana_sirket_id, birim_id, sorumlu_personel_id, grup_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik)'
      const baseSelectLegacy =
        'id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, ana_sirket_id, birim_id, sorumlu_personel_id, grup_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik)'
      let query = supabase
        .from('isler')
        .select(baseSelectWithVisibleAt)
        .eq('sorumlu_personel_id', personelId)
        .eq('ana_sirket_id', anaSirketId)
        .order('created_at', { ascending: false })
      let { data, error } = await query
      if (error?.code === '42703') {
        const legacy = await supabase
          .from('isler')
          .select(baseSelectLegacy)
          .eq('sorumlu_personel_id', personelId)
          .eq('ana_sirket_id', anaSirketId)
          .order('created_at', { ascending: false })
        data = legacy.data
        error = legacy.error
      }
      let list = shallowCloneRows(data)
      const visibleList = list.filter((t) => assigneeTasksVisibilityToday(t))

      if (error) {
        if (__DEV__) console.warn('Tasks load error, trying fallback', error)
        // Fallback: relation/tenant filtre kaynaklı hatalarda sadece kişiye bağlı iş çek.
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('isler')
          .select('id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, birim_id, sorumlu_personel_id')
          .eq('sorumlu_personel_id', personelId)
          .order('created_at', { ascending: false })
        if (!fallbackError && fallbackData) {
          list = shallowCloneRows(fallbackData)
          visibleList.splice(0, visibleList.length, ...list.filter((t) => assigneeTasksVisibilityToday(t)))
        } else {
          if (__DEV__) console.warn('Tasks fallback load error', fallbackError)
          list = []
        }
      } else if (!list.length && !isTopCompanyScope) {
        // Legacy fallback: bazı eski kayıtlarda ana_sirket_id boş/yanlış olabilir.
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('isler')
          .select('id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, birim_id, sorumlu_personel_id')
          .eq('sorumlu_personel_id', personelId)
          .order('created_at', { ascending: false })
        if (!fallbackError && fallbackData?.length) {
          list = shallowCloneRows(fallbackData)
          visibleList.splice(0, visibleList.length, ...list.filter((t) => assigneeTasksVisibilityToday(t)))
        }
      }

      // Zincir görev/onaylarda aktif adımı kullanıcıdaysa, sorumlu_personel_id eşit olmasa da görev görünmeli.
      let zincirGorevStepsRes = await supabase
        .from('isler_zincir_gorev_adimlari')
        .select('is_id, adim_no, adim_durum, durum, isler(gorev_turu)')
        .eq('personel_id', personelId)
      let workerStepsJoined = !zincirGorevStepsRes?.error
      if (zincirGorevStepsRes?.error?.code === '42703') {
        zincirGorevStepsRes = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('is_id, adim_no, adim_durum, durum')
          .eq('personel_id', personelId)
        workerStepsJoined = false
      }
      if (zincirGorevStepsRes?.error?.code === '42703') {
        zincirGorevStepsRes = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('is_id, adim_no, durum')
          .eq('personel_id', personelId)
        workerStepsJoined = false
      }

      let [zincirOnayStepsRes, zincirOnayAllMineRes, siraliDenetimRes] = await Promise.all([
        supabase
          .from('isler_zincir_onay_adimlari')
          .select('is_id, adim_no')
          .eq('onaylayici_personel_id', personelId)
          .eq('durum', 'bekliyor'),
        supabase
          .from('isler_zincir_onay_adimlari')
          .select('is_id')
          .eq('onaylayici_personel_id', personelId),
        supabase
          .from('isler_zincir_gorev_adimlari')
          .select('is_id, adim_no, adim_durum, durum, isler(gorev_turu)')
          .eq('denetimci_personel_id', personelId),
      ])
      let denetimJoined = !siraliDenetimRes?.error
      if (siraliDenetimRes?.error?.code === '42703') {
        siraliDenetimRes = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('is_id, adim_no, adim_durum')
          .eq('denetimci_personel_id', personelId)
        denetimJoined = false
      }
      if (siraliDenetimRes?.error?.code === '42703') {
        siraliDenetimRes = { data: [] }
      }
      const gorevMap = new Map()
      /** Sıralı görev: sonraki adımda `sira_bekliyor` olan işçi görünmemeli (zincir görevde sıra bekleyen satır hâlâ gorevMap'te). */
      const siraliWorkerStepMap = new Map()
      const onayMap = new Map()
      const siraliDenetimMap = new Map()
      /**
       * Bu kullanıcının personel_id/denetimci olarak geçtiği tüm işler (embed `gorev_turu` sapmasından bağımsız).
       * Onaylı hybrid / yanlış tur etiketinde zincirPast ∪ siraliPast ayrımı liste koparıyordu.
       */
      const chainJobParticipantIds = new Set()
      /** Zincir onayda bu kullanıcı onaycı olarak geçen işler (onaylı kayıtta da listede görünsün) */
      const zincirOnayPastParticipantIds = new Set()
      ;(zincirOnayAllMineRes?.data || []).forEach((r) => {
        if (r?.is_id) zincirOnayPastParticipantIds.add(String(r.is_id))
      })
      ;(zincirGorevStepsRes?.data || []).forEach((r) => {
        if (!r?.is_id) return
        // Geçmiş katılımcı set'i adım numarasından bağımsız tutulur; eski/eksik
        // kayıtlarda `adim_no` null olsa bile kullanıcı bu işin adımında geçmişse
        // onaylı listede görmesi için id'yi yine de eklemek gerek.
        chainJobParticipantIds.add(String(r.is_id))
        if (r?.adim_no == null) return
        const tur = workerStepsJoined ? r?.isler?.gorev_turu : null
        const adimDurum = String(r?.adim_durum || r?.durum || '').toLowerCase()
        /** tur null/sapmış: aktif adım haritası için her iki dala da aday ver (iş satırı `gorev_turu` süzer) */
        const zincireUygun =
          !workerStepsJoined || tur == null || isZincirGorevTuru(tur)
        const siraliUygun =
          !workerStepsJoined || tur == null || isSiraliGorevTuru(tur)
        if (
          zincireUygun &&
          (adimDurum === 'aktif' || adimDurum === 'bekliyor' || adimDurum === 'sira_bekliyor')
        ) {
          gorevMap.set(String(r.is_id), Number(r.adim_no))
        }
        if (siraliUygun && (adimDurum === 'aktif' || adimDurum === 'bekliyor')) {
          siraliWorkerStepMap.set(String(r.is_id), Number(r.adim_no))
        }
      })
      ;(zincirOnayStepsRes?.data || []).forEach((r) => {
        if (!r?.is_id || r?.adim_no == null) return
        onayMap.set(String(r.is_id), Number(r.adim_no))
      })
      ;(siraliDenetimRes?.data || []).forEach((r) => {
        if (!r?.is_id) return
        // Denetimci olarak geçen kullanıcı zincir/sıralı görev onaylanınca da
        // listede görebilmeli; id'yi geçmiş katılımcı set'ine her durumda ekleriz.
        chainJobParticipantIds.add(String(r.is_id))
        if (r?.adim_no == null) return
        const tur = denetimJoined ? r?.isler?.gorev_turu : null
        if (denetimJoined && !isSiraliGorevTuru(tur)) return
        const adimDurum = String(r?.adim_durum || r?.durum || '').toLowerCase()
        if (adimDurum === 'onay_bekliyor') {
          siraliDenetimMap.set(String(r.is_id), Number(r.adim_no))
        }
      })
      const participantApprovedTaskIds = new Set([
        ...chainJobParticipantIds,
        ...zincirOnayPastParticipantIds,
      ])
      const chainIds = Array.from(
        new Set([
          ...gorevMap.keys(),
          ...onayMap.keys(),
          ...siraliDenetimMap.keys(),
          ...chainJobParticipantIds,
          ...zincirOnayPastParticipantIds,
        ]),
      )
      if (chainIds.length) {
        let { data: chainTasksData, error: chainTasksError } = await supabase
          .from('isler')
          .select(baseSelectWithVisibleAt)
          .in('id', chainIds)
          .eq('ana_sirket_id', anaSirketId)
        if (chainTasksError?.code === '42703') {
          const legacy = await supabase
            .from('isler')
            .select(baseSelectLegacy)
            .in('id', chainIds)
            .eq('ana_sirket_id', anaSirketId)
          chainTasksData = legacy.data
          chainTasksError = legacy.error
        }
        if (!chainTasksError && chainTasksData?.length) {
          const visibleChainTasks = chainTasksData.filter((task) => {
            const taskId = String(task?.id || '')
            const durumLower = String(normalizeTaskStatus(task?.durum) || '').toLowerCase()
            if (durumLower.includes('redded')) return false
            if (isApprovedTaskStatus(task?.durum)) {
              // Onaylanmış görevde "tip" kontrolüne takılma — kullanıcı bu işin
              // adımında işçi/denetimci/onaycı olarak geçtiyse, `gorev_turu` boş
              // veya sapmış olsa dahi listede görünmeli (Görevlerim'de de gözüksün
              // ki sadece "Geçmiş" sekmesinde kalmasın).
              if (chainJobParticipantIds.has(taskId)) return true
              if (zincirOnayPastParticipantIds.has(taskId)) return true
              return false
            }
            if (isZincirGorevTuru(task?.gorev_turu)) {
              const myStep = gorevMap.get(taskId)
              if (myStep != null && Number(task?.zincir_aktif_adim || 1) === myStep) return true
            }
            if (isZincirOnayTuru(task?.gorev_turu)) {
              const myStep = onayMap.get(taskId)
              if (myStep != null && Number(task?.zincir_onay_aktif_adim || 1) === myStep) return true
            }
            if (isSiraliGorevTuru(task?.gorev_turu)) {
              const myActiveStep = siraliWorkerStepMap.get(taskId)
              if (myActiveStep != null && Number(task?.zincir_aktif_adim || 1) === myActiveStep) return true
              const myAuditStep = siraliDenetimMap.get(taskId)
              if (myAuditStep != null && Number(task?.zincir_aktif_adim || 1) === myAuditStep) return true
            }
            return false
          })
          if (visibleChainTasks.length) {
            const merged = dedupeById([...list, ...visibleChainTasks])
            list = merged
            visibleList.splice(
              0,
              visibleList.length,
              ...merged.filter((t) =>
                assigneeTasksVisibilityTodayWithParticipants(t, participantApprovedTaskIds),
              ),
            )
          }
        }
      }

      // Süresi geçen ve hiç tamamlanmayan görevler için tek seferlik -1x ceza.
      const nowIso = new Date().toISOString()
      const penaltyCandidates = list.filter((task) => {
        if (!task?.id || !task?.son_tarih) return false
        if (String(task.son_tarih) >= nowIso) return false
        const d = String(task?.durum || '').toLowerCase()
        if (isCompleted(d)) return false
        if (isInReviewState(d)) return false
        return !d.includes('gecik')
      })

      for (const task of penaltyCandidates) {
        const baseScore = normalizeTaskScore(task?.puan)
        if (baseScore <= 0) continue
        const penalty = normalizeTaskScore(baseScore * -1)
        const note = `[AUTO_DELAY_${task.id}] Gecikmiş görev cezası: ${task?.baslik || 'Görev'}`
        // Idempotent: aynı personel + görev + TASK_DELAY_PENALTY için kayıt
        // varsa yeni ceza yazılmaz; aksi halde her ekran açılışında biriken
        // tekrarlanmış eksi puanlar oluşuyordu.
        await recordTaskPenaltyOnce({
          personelId,
          gorevId: task.id,
          islemTipi: 'TASK_DELAY_PENALTY',
          delta: penalty,
          gorevBaslik: task?.baslik || task?.is_sablonlari?.baslik || 'Görev',
          aciklama: note,
          tarih: task?.son_tarih || undefined,
        })

        // Durum setini standart tuttuğumuz için gecikmede ek durum yazmıyoruz.
      }

      if (penaltyCandidates.length) {
        // Timeout durumları işlendiyse listeyi yeniden çekip güncel gösterelim.
        const { data: refreshed } = await supabase
          .from('isler')
          .select('id, baslik, durum, puan, baslama_tarihi, son_tarih, created_at, ana_sirket_id, birim_id, sorumlu_personel_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik)')
          .eq('sorumlu_personel_id', personelId)
          .order('created_at', { ascending: false })
        const refreshedList = refreshed ? shallowCloneRows(refreshed) : list
        const visibleRefreshed = refreshedList.filter((t) =>
          assigneeTasksVisibilityTodayWithParticipants(t, participantApprovedTaskIds),
        )
        const refinedRefresh = await refineSiraliResponsibleRows(visibleRefreshed, personelId, supabase)
        setTasks(
          refinedRefresh.filter((t) =>
            assigneeTasksVisibilityTodayWithParticipants(t, participantApprovedTaskIds),
          ),
        )
      } else {
        const refined = await refineSiraliResponsibleRows(visibleList, personelId, supabase)
        setTasks(
          refined.filter((t) =>
            assigneeTasksVisibilityTodayWithParticipants(t, participantApprovedTaskIds),
          ),
        )
      }
    } catch (e) {
      if (__DEV__) console.warn('Tasks load error', e)
      setTasks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, personel?.id, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || authLoading) return
      load()
    }, [load, user?.id, authLoading])
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const filteredTasks = tasks.filter((item) => {
    const done = isCompleted(item?.durum)
    if (filter === FILTER_TAMAMLANAN) return done
    if (filter === FILTER_BEKLEYEN) return !done
    return true
  })

  const openTask = useCallback(
    (taskId) => {
      if (taskId != null) navigation?.navigate?.('TaskDetail', { taskId })
    },
    [navigation]
  )

  const renderItem = useCallback(
    ({ item }) => {
      const title = item?.baslik || item?.is_sablonlari?.baslik || 'Görev'
      const durum = getStatusLabel(item?.durum)
      const statusColor = getStatusColor(item?.durum)
      const acil = !!item?.acil
      const date = item?.created_at ? new Date(item.created_at).toLocaleDateString('tr-TR') : ''
      const done = isCompleted(item?.durum)
      return (
        <TouchableOpacity
          style={[styles.card, done && styles.completedCard, acil && !done && styles.acilCard]}
          onPress={() => openTask(item?.id)}
          activeOpacity={0.7}
        >
          <View style={styles.titleRow}>
            {done ? <Text style={styles.doneIcon}>✅</Text> : null}
            <View style={styles.titleCol}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              {isSiraliGorevTuru(item?.gorev_turu) ? (
                <Text style={styles.siraliListMeta}>
                  Sıralı görev · Adım {Number(item?.zincir_aktif_adim) || 1}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.date}>{date}</Text>
            <View style={styles.badgesRow}>
              {/* Havuz görev: aynı `grup_id` altındaki diğer atananlar arasında ilk yapan kazanır;
                  bilgi rozeti olarak gösteriyoruz. */}
              {item?.grup_id ? (
                <View style={styles.poolBadge}>
                  <Text style={styles.poolBadgeText}>Havuz</Text>
                </View>
              ) : null}
              <View style={[styles.badge, { backgroundColor: statusColor }]}>
                <Text style={styles.badgeText}>{durum}</Text>
              </View>
              {acil && !done ? (
                <View style={styles.acilBadge}>
                  <Text style={styles.acilBadgeText}>⏰ ACİL</Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      )
    },
    [openTask]
  )

  if (loading && tasks.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size={36} color={ThemeObj.Colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PremiumBackgroundPattern />
      <View style={styles.page}>
        <View style={styles.headingRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.heading}>Görevlerim</Text>
            <Text style={styles.dayHint}>Yalnızca bugün görünen görevler</Text>
          </View>
          <TouchableOpacity
            style={styles.historyBtn}
            activeOpacity={0.8}
            onPress={() => navigation?.navigate?.('TaskHistory')}
          >
            <Text style={styles.historyBtnText}>Geçmiş</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === FILTER_ALL && styles.filterBtnActive]}
            onPress={() => setFilter(FILTER_ALL)}
          >
            <Text style={[styles.filterText, filter === FILTER_ALL && styles.filterTextActive]}>Tümü</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === FILTER_BEKLEYEN && styles.filterBtnActive]}
            onPress={() => setFilter(FILTER_BEKLEYEN)}
          >
            <Text style={[styles.filterText, filter === FILTER_BEKLEYEN && styles.filterTextActive]}>Bekleyen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === FILTER_TAMAMLANAN && styles.filterBtnActive]}
            onPress={() => setFilter(FILTER_TAMAMLANAN)}
          >
            <Text style={[styles.filterText, filter === FILTER_TAMAMLANAN && styles.filterTextActive]}>Tamamlanan</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => String(item?.id ?? '')}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Bugün için görünür görev yok. Tümünü görmek için Geçmiş’e gidin.
            </Text>
          }
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ThemeObj.Colors.background },
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  heading: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: Colors.text },
  dayHint: {
    marginTop: 4,
    fontSize: Typography.caption.fontSize,
    color: Colors.mutedText,
    fontWeight: '600',
  },
  historyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: ThemeObj.Layout.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
  },
  historyBtnText: { color: Colors.primary, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: ThemeObj.Layout.borderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: Typography.body.fontSize, fontWeight: '600', color: Colors.mutedText },
  filterTextActive: { color: Colors.surface },
  listContent: { paddingBottom: 24 },
  card: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    ...ThemeObj.Shadows.card,
  },
  completedCard: {
    borderColor: Colors.alpha.emerald25,
    backgroundColor: Colors.alpha.emerald10,
  },
  acilCard: {
    borderColor: Colors.alpha.rose25,
    backgroundColor: Colors.alpha.rose10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  titleCol: { flex: 1, minWidth: 0 },
  doneIcon: { fontSize: 13, marginTop: 2 },
  title: { fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.text },
  siraliListMeta: {
    marginTop: 4,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    color: Colors.primary,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: Typography.caption.fontSize, color: Colors.alpha.gray95, fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { color: Colors.surface, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acilBadge: { borderWidth: 1, borderColor: Colors.alpha.rose25, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.alpha.rose10 },
  acilBadgeText: { color: Colors.error, fontWeight: '900', fontSize: Typography.caption.fontSize },
  poolBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  poolBadgeText: {
    color: '#B45309',
    fontWeight: '800',
    fontSize: Typography.caption.fontSize,
  },
  empty: { textAlign: 'center', color: Colors.mutedText, marginTop: 24 },
})
