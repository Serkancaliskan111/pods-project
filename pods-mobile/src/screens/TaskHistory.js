import React, { useCallback, useMemo, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import DateTimePicker from '@react-native-community/datetimepicker'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import { isTopCompanyScope as isTopCompanyScopeShared } from '../lib/managementScope'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import { isApprovedTaskStatus, normalizeTaskStatus } from '../lib/taskStatus'

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
  const d = String(normalizeTaskStatus(durum) || '').toLowerCase()
  if (isApprovedTaskStatus(durum)) return 'Onaylandı'
  if (d.includes('gecik')) return 'Gecikmiş'
  if (d.includes('onaylanmad') || d.includes('revize') || d.includes('redd')) return 'Reddedildi'
  if (d.includes('onay bekliyor')) return 'Onay Bekliyor'
  return String(durum || 'Bekliyor')
}

function getDayRange(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const endExclusive = new Date(start)
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { startIso: start.toISOString(), endIsoExclusive: endExclusive.toISOString() }
}

function getTodayRange() {
  return getDayRange(new Date())
}

function getLastDaysRange(days) {
  const end = new Date()
  const endRange = getDayRange(end)
  const start = new Date(endRange.startIso)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { startIso: start.toISOString(), endIsoExclusive: endRange.endIsoExclusive }
}

export default function TaskHistory() {
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

  const DATE_PRESET_ALL = 'all'
  const DATE_PRESET_TODAY = 'today'
  const DATE_PRESET_WEEK = 'week'
  const DATE_PRESET_MONTH = 'month'
  const DATE_PRESET_3MONTHS = '3months'
  const DATE_PRESET_CUSTOM = 'custom'

  const [datePreset, setDatePreset] = useState(DATE_PRESET_ALL)
  const [customStart, setCustomStart] = useState(null)
  const [customEnd, setCustomEnd] = useState(null)
  const [pickerField, setPickerField] = useState(null) // 'start' | 'end' | null

  const dateRange = useMemo(() => {
    if (datePreset === DATE_PRESET_ALL) return null
    if (datePreset === DATE_PRESET_TODAY) return getTodayRange()
    if (datePreset === DATE_PRESET_WEEK) return getLastDaysRange(7)
    if (datePreset === DATE_PRESET_MONTH) return getLastDaysRange(30)
    if (datePreset === DATE_PRESET_3MONTHS) return getLastDaysRange(90)
    if (datePreset === DATE_PRESET_CUSTOM) {
      if (!customStart || !customEnd) return null
      const start = new Date(customStart)
      const end = new Date(customEnd)
      // Ensure end >= start (swap if needed).
      if (end < start) {
        const tmpMs = start.getTime()
        start.setTime(end.getTime())
        end.setTime(tmpMs)
      }
      // Make the range end exclusive (end day inclusive).
      const { startIso, endIsoExclusive } = getDayRange(start)
      const endDay = getDayRange(end).endIsoExclusive
      return { startIso, endIsoExclusive: endDay }
    }
    return null
  }, [datePreset, customStart, customEnd])

  const load = useCallback(async () => {
    if (!user?.id) {
      setTasks([])
      setLoading(false)
      return
    }
    if (!personel?.id || !personel?.ana_sirket_id) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from('isler')
        .select('id, baslik, durum, acil, puan, son_tarih, created_at, ana_sirket_id, birim_id, sorumlu_personel_id, is_sablonlari(baslik)')
        .eq('sorumlu_personel_id', personel.id)
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .order('created_at', { ascending: false })

      if (dateRange) {
        query = query.gte('created_at', dateRange.startIso).lt('created_at', dateRange.endIsoExclusive)
      }

      if (!isTopCompanyScope && personel?.birim_id) {
        query = query.eq('birim_id', personel.birim_id)
      }

      const { data, error } = await query
      if (error) {
        if (__DEV__) console.warn('TaskHistory load error', error)
        setTasks([])
        return
      }
      setTasks(data ? JSON.parse(JSON.stringify(data)) : [])
    } catch (e) {
      if (__DEV__) console.warn('TaskHistory load catch', e)
      setTasks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, personel?.id, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, dateRange])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || authLoading) return
      load()
    }, [load, user?.id, authLoading]),
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const filteredTasks = useMemo(() => {
    return tasks.filter((item) => {
      const done = isCompleted(item?.durum)
      if (filter === FILTER_TAMAMLANAN) return done
      if (filter === FILTER_BEKLEYEN) return !done
      return true
    })
  }, [tasks, filter])

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
          onPress={() => navigation?.navigate?.('TaskDetail', { taskId: item?.id })}
          activeOpacity={0.7}
        >
          <View style={styles.titleRow}>
            {done ? <Text style={styles.doneIcon}>✅</Text> : null}
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
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
    [navigation],
  )

  const dateChip = (id, label) => (
    <TouchableOpacity
      key={id}
      style={[styles.chipBtn, datePreset === id && styles.chipBtnActive]}
      onPress={() => {
        setDatePreset(id)
        if (id !== DATE_PRESET_CUSTOM) {
          setCustomStart(null)
          setCustomEnd(null)
        }
      }}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, datePreset === id && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PremiumBackgroundPattern />
      <View style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Geçmiş Görevler</Text>
          <TouchableOpacity
            style={styles.backBtn}
            activeOpacity={0.8}
            onPress={() => navigation?.goBack?.()}
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chipsCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {dateChip(DATE_PRESET_ALL, 'Tüm Zamanlar')}
            {dateChip(DATE_PRESET_TODAY, 'Bugün')}
            {dateChip(DATE_PRESET_WEEK, 'Bu Hafta')}
            {dateChip(DATE_PRESET_MONTH, 'Bu Ay')}
            {dateChip(DATE_PRESET_3MONTHS, 'Son 3 Ay')}
            {dateChip(DATE_PRESET_CUSTOM, 'Özel')}
          </ScrollView>
        </View>

        {datePreset === DATE_PRESET_CUSTOM ? (
          <View style={styles.customCard}>
            <View style={styles.customRow}>
              <TouchableOpacity
                style={[styles.dateBox, pickerField === 'start' && styles.dateBoxActive]}
              activeOpacity={0.85}
                onPress={() => setPickerField('start')}
              >
                <Text style={styles.dateBoxLabel}>Başlangıç</Text>
                <Text style={styles.dateBoxValue}>
                  {customStart ? new Date(customStart).toLocaleDateString('tr-TR') : '--'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateBox, pickerField === 'end' && styles.dateBoxActive]}
              activeOpacity={0.85}
                onPress={() => setPickerField('end')}
              >
                <Text style={styles.dateBoxLabel}>Bitiş</Text>
                <Text style={styles.dateBoxValue}>
                  {customEnd ? new Date(customEnd).toLocaleDateString('tr-TR') : '--'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {pickerField ? (
          <DateTimePicker
            value={pickerField === 'start' ? customStart || new Date() : customEnd || new Date()}
            mode="date"
            display="default"
            onChange={(e, selected) => {
              // iOS: selected can be undefined when cancel pressed.
              if (!selected) {
                setPickerField(null)
                return
              }
              if (pickerField === 'start') setCustomStart(selected)
              if (pickerField === 'end') setCustomEnd(selected)
              setPickerField(null)
            }}
          />
        ) : null}

        {loading && tasks.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size={36} color={ThemeObj.Colors.primary} />
          </View>
        ) : (
          <>
            <View style={styles.filterCard}>
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterBtn, filter === FILTER_ALL && styles.filterBtnActive]}
                  onPress={() => setFilter(FILTER_ALL)}
                >
                  <Text
                    style={[styles.filterText, filter === FILTER_ALL && styles.filterTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    Tümü
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBtn, filter === FILTER_BEKLEYEN && styles.filterBtnActive]}
                  onPress={() => setFilter(FILTER_BEKLEYEN)}
                >
                  <Text
                    style={[styles.filterText, filter === FILTER_BEKLEYEN && styles.filterTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    Bekleyen
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterBtn, filter === FILTER_TAMAMLANAN && styles.filterBtnActive]}
                  onPress={() => setFilter(FILTER_TAMAMLANAN)}
                >
                  <Text
                    style={[styles.filterText, filter === FILTER_TAMAMLANAN && styles.filterTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    Tamamlanan
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={filteredTasks}
              keyExtractor={(item) => String(item?.id ?? '')}
              renderItem={renderItem}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {dateRange ? 'Bu aralıkta görev yok' : 'Henüz veri yok'}
                </Text>
              }
            />
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ThemeObj.Colors.background },
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heading: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: Colors.text },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.alpha.gray20, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  backBtnText: { color: Colors.primary, fontSize: 20, fontWeight: '900' },

  chipsCard: {
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    ...ThemeObj.Shadows.card,
  },
  chipsRow: { gap: 10, paddingRight: 8, paddingVertical: 0, alignItems: 'center' },
  chipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: ThemeObj.Layout.borderRadius.full,
    backgroundColor: Colors.alpha.indigo06,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: Typography.caption.fontSize, fontWeight: '800', color: Colors.mutedText },
  chipTextActive: { color: Colors.surface },

  customCard: {
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 12,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  customRow: { flexDirection: 'row', gap: 10 },
  dateBox: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.indigo06,
    justifyContent: 'center',
  },
  dateBoxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo12,
  },
  dateBoxLabel: { fontSize: Typography.caption.fontSize, color: Colors.mutedText, fontWeight: '800' },
  dateBoxValue: { marginTop: 4, fontSize: Typography.bodyLg.fontSize, color: Colors.text, fontWeight: '900' },

  filterCard: {
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Layout.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 10,
    marginBottom: 16,
    ...ThemeObj.Shadows.card,
  },
  filterRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  filterBtn: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: ThemeObj.Layout.borderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: Typography.caption.fontSize, fontWeight: '800', color: Colors.mutedText },
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
  completedCard: { borderColor: Colors.alpha.emerald25, backgroundColor: Colors.alpha.emerald10 },
  acilCard: { borderColor: Colors.alpha.rose25, backgroundColor: Colors.alpha.rose10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  doneIcon: { fontSize: 13 },
  title: { flex: 1, fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: Typography.caption.fontSize, color: Colors.alpha.gray95, fontWeight: '500' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { color: Colors.surface, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  acilBadge: { borderWidth: 1, borderColor: Colors.alpha.rose25, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.alpha.rose10 },
  acilBadgeText: { color: Colors.error, fontWeight: '900', fontSize: Typography.caption.fontSize },
  empty: { textAlign: 'center', color: Colors.mutedText, marginTop: 24 },
})

