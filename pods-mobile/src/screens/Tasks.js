import React, { useCallback, useMemo, useState } from 'react'
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import { normalizeTaskScore, recordTaskPenaltyOnce } from '../lib/pointsLedger'
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
import { useTabBarScrollPadding } from '../navigation/tabBarLayout'
import {
  Screen,
  Heading,
  Text,
  Chip,
  Card,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
  IconBubble,
  palette,
  spacing,
  radii,
  Icon,
} from '../ui'

const supabase = getSupabase()

const FILTER_ALL = 'all'
const FILTER_BEKLEYEN = 'bekleyen'
const FILTER_TAMAMLANAN = 'tamamlanan'

const FILTERS = [
  { id: FILTER_ALL, label: 'Tümü' },
  { id: FILTER_BEKLEYEN, label: 'Bekleyen' },
  { id: FILTER_TAMAMLANAN, label: 'Tamamlanan' },
]

function isCompleted(durum) {
  return isApprovedTaskStatus(durum)
}

function getStatusTone(durum) {
  if (!durum) return 'soft'
  const d = String(durum).toLowerCase()
  if (d.includes('tamam') || d.includes('bitti') || d.includes('onaylanmis') || d.includes('onaylandı')) return 'success'
  if (d.includes('onaylanmad') || d.includes('revize') || d.includes('redd') || d.includes('reddedildi')) return 'danger'
  if (d.includes('beklem') || d.includes('bekliyor')) return 'warning'
  if (d.includes('atand')) return 'blurple'
  return 'soft'
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
  const tabBarPad = useTabBarScrollPadding()
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
      const tone = getStatusTone(item?.durum)
      const acil = !!item?.acil
      const date = item?.created_at ? new Date(item.created_at).toLocaleDateString('tr-TR') : ''
      const done = isCompleted(item?.durum)
      const cardTone = done ? 'success' : acil ? 'danger' : 'surface'
      return (
        <Card
          tone={cardTone}
          padding="md"
          radius="2xl"
          interactive
          onPress={() => openTask(item?.id)}
          style={styles.taskCard}
        >
          <View style={styles.taskRow}>
            <IconBubble tone={cardTone === 'surface' ? 'primary' : cardTone} size="md">
              {done ? (
                <Icon.TaskComplete size={18} color={palette.success[700]} strokeWidth={2} />
              ) : acil ? (
                <Icon.Warning size={18} color={palette.danger[600]} strokeWidth={2} />
              ) : (
                <Icon.Tasks size={18} color={palette.primary[700]} strokeWidth={2} />
              )}
            </IconBubble>
            <View style={{ flex: 1 }}>
              <Text
                variant="bodyLg"
                weight="Bold"
                color={
                  cardTone === 'success'
                    ? palette.success[700]
                    : cardTone === 'danger'
                    ? palette.danger[700]
                    : palette.slate[800]
                }
                numberOfLines={2}
              >
                {title}
              </Text>
              {isSiraliGorevTuru(item?.gorev_turu) ? (
                <Text variant="caption" weight="Bold" color={palette.blurple[600]} style={{ marginTop: 4 }}>
                  Sıralı görev · Adım {Number(item?.zincir_aktif_adim) || 1}
                </Text>
              ) : null}
              <View style={styles.taskMetaRow}>
                <StatusBadge tone={tone} size="sm">
                  {durum}
                </StatusBadge>
                {item?.grup_id ? (
                  <StatusBadge tone="warning" size="sm">
                    Havuz
                  </StatusBadge>
                ) : null}
                {acil && !done ? (
                  <StatusBadge tone="danger" size="sm">
                    ACİL
                  </StatusBadge>
                ) : null}
                {date ? (
                  <Text variant="caption" color={palette.slate[500]}>
                    {date}
                  </Text>
                ) : null}
              </View>
            </View>
            <Icon.Forward size={20} color={palette.slate[400]} strokeWidth={2} />
          </View>
        </Card>
      )
    },
    [openTask]
  )

  if (loading && tasks.length === 0) {
    return (
      <Screen padded>
        <Heading variant="h1">Görevlerim</Heading>
        <Text variant="caption" color={palette.slate[500]} style={{ marginBottom: spacing.lg }}>
          Bugünün liste hazırlanıyor…
        </Text>
          <View style={styles.skeletonWrap}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
      </Screen>
    )
  }

  const empty = filteredTasks.length === 0
  return (
    <Screen padded>
      <View style={styles.headingRow}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Heading variant="h1">Görevlerim</Heading>
          <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 4 }}>
            Yalnızca bugün görünen görevler
          </Text>
        </View>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => navigation?.navigate?.('TaskHistory')}
        >
          Geçmiş
        </Button>
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            tone="soft"
            selected={filter === f.id}
            onPress={() => setFilter(f.id)}
            size="md"
          >
            {f.label}
          </Chip>
        ))}
      </View>
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => String(item?.id ?? '')}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarPad },
          empty && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          <EmptyState
            tone="soft"
            icon={<Icon.TaskComplete size={28} color={palette.success[600]} strokeWidth={1.6} />}
            title="Bugün için görünür görev yok"
            description="Tüm görevleri görmek için yukarıdaki “Geçmiş” butonunu kullanabilirsin."
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  listContent: {
    gap: spacing.sm,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  taskCard: {},
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: 8,
  },
  skeletonWrap: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
})
