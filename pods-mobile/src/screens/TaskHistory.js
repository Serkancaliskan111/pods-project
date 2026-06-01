import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, TouchableOpacity, View, StyleSheet } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { ChevronLeft, History } from 'lucide-react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { shallowCloneRows } from '../lib/shallowCloneRows'
import {
  TASK_STATUS,
  getTaskStatusLabel,
  isApprovedTaskStatus,
  normalizeTaskStatus,
} from '../lib/taskStatus'
import {
  Screen,
  Text,
  Heading,
  Card,
  Chip,
  StatusBadge,
  EmptyState,
  SkeletonCard,
  palette,
  spacing,
  radii,
} from '../ui'

const supabase = getSupabase()

const FILTER_ALL = 'all'
const FILTER_BEKLEYEN = 'bekleyen'
const FILTER_TAMAMLANAN = 'tamamlanan'

const DATE_PRESET_ALL = 'all'
const DATE_PRESET_TODAY = 'today'
const DATE_PRESET_WEEK = 'week'
const DATE_PRESET_MONTH = 'month'
const DATE_PRESET_3MONTHS = '3months'
const DATE_PRESET_CUSTOM = 'custom'

function isHistoryTerminalStatus(durum) {
  const n = normalizeTaskStatus(durum)
  return n === TASK_STATUS.APPROVED || n === TASK_STATUS.REJECTED
}

function inParticipantHistoryDateRange(task, dateRange) {
  if (!dateRange?.startIso || !dateRange?.endIsoExclusive) return true
  const ref = task?.updated_at || task?.created_at
  if (!ref) return false
  const ts = new Date(ref).getTime()
  const start = new Date(dateRange.startIso).getTime()
  const end = new Date(dateRange.endIsoExclusive).getTime()
  return ts >= start && ts < end
}

function isCompleted(durum) {
  return isApprovedTaskStatus(durum)
}

function getStatusTone(durum) {
  const d = String(durum || '').toLowerCase()
  if (d.includes('tamam') || d.includes('bitti') || d.includes('onayland')) return 'success'
  if (d.includes('onaylanmad') || d.includes('revize') || d.includes('redd')) return 'danger'
  if (d.includes('bekle')) return 'warning'
  return 'soft'
}

function getStatusLabel(durum) {
  const normalized = normalizeTaskStatus(durum)
  const d = String(normalized || '').toLowerCase()
  if (normalized === TASK_STATUS.APPROVED) return TASK_STATUS.APPROVED
  if (normalized === TASK_STATUS.REJECTED) return TASK_STATUS.REJECTED
  if (normalized === TASK_STATUS.PENDING_APPROVAL) return TASK_STATUS.PENDING_APPROVAL
  if (normalized === TASK_STATUS.RESUBMITTED) return TASK_STATUS.RESUBMITTED
  if (normalized === TASK_STATUS.ASSIGNED) return TASK_STATUS.ASSIGNED
  if (d.includes('gecik')) return 'Gecikmiş'
  return getTaskStatusLabel(durum)
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
  const { user, personel, loading: authLoading } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState(FILTER_ALL)
  const [datePreset, setDatePreset] = useState(DATE_PRESET_ALL)
  const [customStart, setCustomStart] = useState(null)
  const [customEnd, setCustomEnd] = useState(null)
  const [pickerField, setPickerField] = useState(null)

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
      if (end < start) {
        const tmpMs = start.getTime()
        start.setTime(end.getTime())
        end.setTime(tmpMs)
      }
      const { startIso } = getDayRange(start)
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
      const personelId = personel.id
      const anaSirketId = personel.ana_sirket_id
      const baseSelect =
        'id, baslik, durum, acil, puan, son_tarih, created_at, updated_at, ana_sirket_id, birim_id, sorumlu_personel_id, grup_id, is_sablonlari(baslik)'
      const baseSelectLegacy =
        'id, baslik, durum, acil, puan, son_tarih, created_at, ana_sirket_id, birim_id, sorumlu_personel_id, grup_id, is_sablonlari(baslik)'

      let primaryQuery = supabase
        .from('isler')
        .select(baseSelect)
        .eq('sorumlu_personel_id', personelId)
        .eq('ana_sirket_id', anaSirketId)
        .order('created_at', { ascending: false })

      if (dateRange) {
        primaryQuery = primaryQuery
          .gte('created_at', dateRange.startIso)
          .lt('created_at', dateRange.endIsoExclusive)
      }

      const [chainWorkerStepsRes, chainAuditorStepsRes, chainApproverStepsRes] = await Promise.all([
        supabase.from('isler_zincir_gorev_adimlari').select('is_id').eq('personel_id', personelId),
        supabase.from('isler_zincir_gorev_adimlari').select('is_id').eq('denetimci_personel_id', personelId),
        supabase.from('isler_zincir_onay_adimlari').select('is_id').eq('onaylayici_personel_id', personelId),
      ])

      const participantIsIds = new Set()
      ;(chainWorkerStepsRes?.data || []).forEach((r) => r?.is_id && participantIsIds.add(String(r.is_id)))
      ;(chainAuditorStepsRes?.data || []).forEach((r) => r?.is_id && participantIsIds.add(String(r.is_id)))
      ;(chainApproverStepsRes?.data || []).forEach((r) => r?.is_id && participantIsIds.add(String(r.is_id)))

      let { data: primaryData, error: primaryError } = await primaryQuery
      if (
        primaryError?.code === '42703' &&
        String(primaryError?.message || '').toLowerCase().includes('updated_at')
      ) {
        let legacyQ = supabase
          .from('isler')
          .select(baseSelectLegacy)
          .eq('sorumlu_personel_id', personelId)
          .eq('ana_sirket_id', anaSirketId)
          .order('created_at', { ascending: false })
        if (dateRange) {
          legacyQ = legacyQ.gte('created_at', dateRange.startIso).lt('created_at', dateRange.endIsoExclusive)
        }
        const r = await legacyQ
        primaryData = r.data
        primaryError = r.error
      }
      if (primaryError && __DEV__) console.warn('TaskHistory primary load error', primaryError)

      const primaryRows = primaryError ? [] : primaryData || []
      const primaryIds = new Set((primaryRows || []).map((r) => String(r?.id || '')))
      const missingIds = Array.from(participantIsIds).filter((id) => id && !primaryIds.has(id))

      let participantRows = []
      if (missingIds.length) {
        let { data: chainData, error: chainErr } = await supabase
          .from('isler')
          .select(baseSelect)
          .in('id', missingIds)
          .eq('ana_sirket_id', anaSirketId)
          .order('updated_at', { ascending: false })

        if (
          chainErr?.code === '42703' &&
          String(chainErr?.message || '').toLowerCase().includes('updated_at')
        ) {
          const r = await supabase
            .from('isler')
            .select(baseSelectLegacy)
            .in('id', missingIds)
            .eq('ana_sirket_id', anaSirketId)
            .order('created_at', { ascending: false })
          chainData = r.data
          chainErr = r.error
        }

        if (chainErr) {
          if (__DEV__) console.warn('TaskHistory chain load error', chainErr)
        } else {
          participantRows = (chainData || [])
            .filter((t) => isHistoryTerminalStatus(t?.durum))
            .filter((t) => inParticipantHistoryDateRange(t, dateRange))
        }
      }

      const merged = [...primaryRows, ...participantRows]
      const dedupMap = new Map()
      for (const row of merged) {
        if (!row?.id) continue
        dedupMap.set(String(row.id), row)
      }
      const finalRows = Array.from(dedupMap.values()).sort((a, b) => {
        const ta = new Date(a?.updated_at || a?.created_at || 0).getTime()
        const tb = new Date(b?.updated_at || b?.created_at || 0).getTime()
        return tb - ta
      })

      setTasks(shallowCloneRows(finalRows))
    } catch (e) {
      if (__DEV__) console.warn('TaskHistory load catch', e)
      setTasks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, personel?.id, personel?.ana_sirket_id, dateRange])

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
      const statusTone = getStatusTone(item?.durum)
      const acil = !!item?.acil
      const dateIso = isCompleted(item?.durum) && item?.updated_at ? item.updated_at : item?.created_at
      const date = dateIso ? new Date(dateIso).toLocaleDateString('tr-TR') : ''
      const done = isCompleted(item?.durum)

      return (
        <Card
          tone={done ? 'success' : acil ? 'danger' : 'surface'}
          elevated
          onPress={() => navigation?.navigate?.('TaskDetail', { taskId: item?.id })}
          style={{ marginBottom: spacing.sm }}
        >
          <Text variant="bodyLg" weight="SemiBold" color={palette.slate[800]} style={{ marginBottom: spacing.xs }}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <Text variant="caption" color={palette.slate[500]}>
              {date}
            </Text>
            <View style={styles.badgesRow}>
              {item?.grup_id ? (
                <StatusBadge tone="warning" size="sm">
                  Havuz
                </StatusBadge>
              ) : null}
              <StatusBadge tone={statusTone} size="sm">
                {durum}
              </StatusBadge>
              {acil && !done ? (
                <StatusBadge tone="danger" size="sm">
                  ACİL
                </StatusBadge>
              ) : null}
            </View>
          </View>
        </Card>
      )
    },
    [navigation],
  )

  const datePresets = [
    { id: DATE_PRESET_ALL, label: 'Tümü' },
    { id: DATE_PRESET_TODAY, label: 'Bugün' },
    { id: DATE_PRESET_WEEK, label: 'Bu Hafta' },
    { id: DATE_PRESET_MONTH, label: 'Bu Ay' },
    { id: DATE_PRESET_3MONTHS, label: '3 Ay' },
    { id: DATE_PRESET_CUSTOM, label: 'Özel' },
  ]

  return (
    <Screen padded bottomInset>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={24} color={palette.primary[700]} strokeWidth={2} />
        </TouchableOpacity>
        <Heading variant="h1" style={{ flex: 1, marginLeft: spacing.sm }}>
          Geçmiş Görevler
        </Heading>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={{ marginBottom: spacing.md }}
      >
        {datePresets.map((dp) => (
          <Chip
            key={dp.id}
            selected={datePreset === dp.id}
            onPress={() => {
              setDatePreset(dp.id)
              if (dp.id !== DATE_PRESET_CUSTOM) {
                setCustomStart(null)
                setCustomEnd(null)
              }
            }}
          >
            {dp.label}
          </Chip>
        ))}
      </ScrollView>

      {datePreset === DATE_PRESET_CUSTOM ? (
        <View style={styles.customRow}>
          <TouchableOpacity
            style={[styles.dateBox, pickerField === 'start' && styles.dateBoxActive]}
            activeOpacity={0.85}
            onPress={() => setPickerField('start')}
          >
            <Text variant="overline" color={palette.slate[500]}>
              Başlangıç
            </Text>
            <Text variant="bodyLg" weight="Bold" color={palette.slate[800]}>
              {customStart ? new Date(customStart).toLocaleDateString('tr-TR') : '--'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateBox, pickerField === 'end' && styles.dateBoxActive]}
            activeOpacity={0.85}
            onPress={() => setPickerField('end')}
          >
            <Text variant="overline" color={palette.slate[500]}>
              Bitiş
            </Text>
            <Text variant="bodyLg" weight="Bold" color={palette.slate[800]}>
              {customEnd ? new Date(customEnd).toLocaleDateString('tr-TR') : '--'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {pickerField ? (
        <DateTimePicker
          value={pickerField === 'start' ? customStart || new Date() : customEnd || new Date()}
          mode="date"
          display="default"
          onChange={(e, selected) => {
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

      <View style={styles.filterRow}>
        <Chip selected={filter === FILTER_ALL} onPress={() => setFilter(FILTER_ALL)}>
          Tümü
        </Chip>
        <Chip selected={filter === FILTER_BEKLEYEN} onPress={() => setFilter(FILTER_BEKLEYEN)}>
          Bekleyen
        </Chip>
        <Chip selected={filter === FILTER_TAMAMLANAN} onPress={() => setFilter(FILTER_TAMAMLANAN)}>
          Tamamlanan
        </Chip>
      </View>

      {loading && tasks.length === 0 ? (
        <View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => String(item?.id ?? '')}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary[500]}
              colors={[palette.primary[700], palette.accent[500]]}
            />
          }
          contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
          ListEmptyComponent={
            <EmptyState
              icon={<History size={42} color={palette.slate[400]} strokeWidth={1.5} />}
              title={dateRange ? 'Bu aralıkta görev yok' : 'Henüz veri yok'}
              description="Tamamlanan ve sonuçlanan görevler burada listelenecek."
            />
          }
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  backBtn: { padding: 4 },
  chipsRow: { gap: spacing.sm, paddingRight: spacing.sm, alignItems: 'center' },
  customRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  dateBox: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.slate[100],
    backgroundColor: palette.surface,
  },
  dateBoxActive: {
    borderColor: palette.primary[700],
    backgroundColor: palette.primary[50],
  },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
})
