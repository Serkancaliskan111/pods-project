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
import { insertPointTransaction, normalizeTaskScore } from '../lib/pointsLedger'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import { isZincirGorevTuru, isZincirOnayTuru } from '../lib/zincirTasks'
import {
  TASK_STATUS,
  getTaskStatusLabel,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../lib/taskStatus'
import { getTaskVisibleAt } from '../lib/taskVisibility'

const ThemeObj = Theme?.default ?? Theme

const { Typography, Colors } = ThemeObj

const supabase = getSupabase()

const FILTER_ALL = 'all'
const FILTER_BEKLEYEN = 'bekleyen'
const FILTER_TAMAMLANAN = 'tamamlanan'

function getTodayIsoRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const endExclusive = new Date(start)
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { startIso: start.toISOString(), endIsoExclusive: endExclusive.toISOString() }
}

function isIsoInRange(isoValue, startIso, endIsoExclusive) {
  if (!isoValue) return false
  const v = String(isoValue)
  return v >= startIso && v < endIsoExclusive
}

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
      const { startIso: todayStartIso, endIsoExclusive: todayEndIsoExclusive } = getTodayIsoRange()
      const baseSelectWithVisibleAt =
        'id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, gorunur_tarih, ana_sirket_id, birim_id, sorumlu_personel_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik)'
      const baseSelectLegacy =
        'id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, ana_sirket_id, birim_id, sorumlu_personel_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik)'
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
      let list = data ? JSON.parse(JSON.stringify(data)) : []
      const listForToday = list.filter((t) => isIsoInRange(getTaskVisibleAt(t), todayStartIso, todayEndIsoExclusive))

      if (error) {
        if (__DEV__) console.warn('Tasks load error, trying fallback', error)
        // Fallback: relation/tenant filtre kaynaklı hatalarda sadece kişiye bağlı iş çek.
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('isler')
          .select('id, baslik, durum, acil, puan, baslama_tarihi, son_tarih, created_at, birim_id, sorumlu_personel_id')
          .eq('sorumlu_personel_id', personelId)
          .order('created_at', { ascending: false })
        if (!fallbackError && fallbackData) {
          list = JSON.parse(JSON.stringify(fallbackData))
          listForToday.splice(0, listForToday.length, ...list.filter((t) => isIsoInRange(getTaskVisibleAt(t), todayStartIso, todayEndIsoExclusive)))
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
          list = JSON.parse(JSON.stringify(fallbackData))
          listForToday.splice(0, listForToday.length, ...list.filter((t) => isIsoInRange(getTaskVisibleAt(t), todayStartIso, todayEndIsoExclusive)))
        }
      }

      // Zincir görev/onaylarda aktif adımı kullanıcıdaysa, sorumlu_personel_id eşit olmasa da görev görünmeli.
      const [zincirGorevStepsRes, zincirOnayStepsRes] = await Promise.all([
        supabase
          .from('isler_zincir_gorev_adimlari')
          .select('is_id, adim_no')
          .eq('personel_id', personelId)
          .eq('durum', 'bekliyor'),
        supabase
          .from('isler_zincir_onay_adimlari')
          .select('is_id, adim_no')
          .eq('onaylayici_personel_id', personelId)
          .eq('durum', 'bekliyor'),
      ])
      const gorevMap = new Map()
      const onayMap = new Map()
      ;(zincirGorevStepsRes?.data || []).forEach((r) => {
        if (!r?.is_id || r?.adim_no == null) return
        gorevMap.set(String(r.is_id), Number(r.adim_no))
      })
      ;(zincirOnayStepsRes?.data || []).forEach((r) => {
        if (!r?.is_id || r?.adim_no == null) return
        onayMap.set(String(r.is_id), Number(r.adim_no))
      })
      const chainIds = Array.from(new Set([...gorevMap.keys(), ...onayMap.keys()]))
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
            if (isApprovedTaskStatus(task?.durum) || durumLower.includes('redded')) return false
            if (isZincirGorevTuru(task?.gorev_turu)) {
              const myStep = gorevMap.get(taskId)
              if (myStep != null && Number(task?.zincir_aktif_adim || 1) === myStep) return true
            }
            if (isZincirOnayTuru(task?.gorev_turu)) {
              const myStep = onayMap.get(taskId)
              if (myStep != null && Number(task?.zincir_onay_aktif_adim || 1) === myStep) return true
            }
            return false
          })
          if (visibleChainTasks.length) {
            const merged = dedupeById([...list, ...visibleChainTasks])
            list = merged
            listForToday.splice(
              0,
              listForToday.length,
              ...merged.filter((t) => isIsoInRange(getTaskVisibleAt(t), todayStartIso, todayEndIsoExclusive)),
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
        const tx = await insertPointTransaction({
          personelId,
          delta: penalty,
          tarih: task?.son_tarih || undefined,
          gorevId: task.id,
          gorevBaslik: task?.baslik || task?.is_sablonlari?.baslik || 'Görev',
          islemTipi: 'TASK_DELAY_PENALTY',
          aciklama: note,
        })
        if (!tx.ok) continue

        // Durum setini standart tuttuğumuz için gecikmede ek durum yazmıyoruz.
      }

      if (penaltyCandidates.length) {
        // Timeout durumları işlendiyse listeyi yeniden çekip güncel gösterelim.
        const { data: refreshed } = await supabase
          .from('isler')
          .select('id, baslik, durum, puan, baslama_tarihi, son_tarih, created_at, ana_sirket_id, birim_id, sorumlu_personel_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik)')
          .eq('sorumlu_personel_id', personelId)
          .order('created_at', { ascending: false })
        const refreshedList = refreshed ? JSON.parse(JSON.stringify(refreshed)) : list
        setTasks(refreshedList.filter((t) => isIsoInRange(getTaskVisibleAt(t), todayStartIso, todayEndIsoExclusive)))
      } else {
        setTasks(listForToday)
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
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.date}>{date}</Text>
            <View style={styles.badgesRow}>
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
          <Text style={styles.heading}>Görevlerim</Text>
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
          ListEmptyComponent={<Text style={styles.empty}>Henüz atanmış görev yok</Text>}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ThemeObj.Colors.background },
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heading: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: Colors.text },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  doneIcon: { fontSize: 13 },
  title: { flex: 1, fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: Typography.caption.fontSize, color: Colors.alpha.gray95, fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { color: Colors.surface, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acilBadge: { borderWidth: 1, borderColor: Colors.alpha.rose25, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.alpha.rose10 },
  acilBadgeText: { color: Colors.error, fontWeight: '900', fontSize: Typography.caption.fontSize },
  empty: { textAlign: 'center', color: Colors.mutedText, marginTop: 24 },
})
