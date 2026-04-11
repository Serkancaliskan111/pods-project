import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import {
  hasManagementPrivileges,
  isTopCompanyScope as isTopCompanyScopeShared,
} from '../lib/managementScope'
import { formatFullName } from '../lib/nameFormat'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { loadPointRows } from '../lib/pointsLedger'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const supabase = getSupabase()

const ThemeObj = Theme?.default ?? Theme
const { Colors, Card, Shadows, Typography, Radii, Spacing } = ThemeObj
const SLATE_950 = Colors.background
const MUTED = Colors.gray

const FILTER_ALL = 'all'
const FILTER_7D = '7d'
const FILTER_30D = '30d'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('tr-TR')
}

function extractTaskNameFromNote(note) {
  const text = String(note || '').trim()
  if (!text) return null
  const approvalPrefix = 'Görev onayı:'
  const timeoutPrefix = 'Süresinde tamamlanmadı:'
  const delayedPrefix = 'Gecikmiş görev cezası:'
  if (text.startsWith(approvalPrefix)) {
    return text.slice(approvalPrefix.length).trim() || null
  }
  const timeoutIdx = text.indexOf(timeoutPrefix)
  if (timeoutIdx >= 0) {
    return text.slice(timeoutIdx + timeoutPrefix.length).trim() || null
  }
  const delayedIdx = text.indexOf(delayedPrefix)
  if (delayedIdx >= 0) {
    return text.slice(delayedIdx + delayedPrefix.length).trim() || null
  }
  return null
}

function getActionLabel(islemTipi, delta) {
  const key = String(islemTipi || '').toUpperCase()
  if (key === 'TASK_APPROVED') return 'Görev Onayı'
  if (key === 'TASK_DELAY_PENALTY') return 'Gecikme Cezası'
  if (key === 'TASK_TIMEOUT_PENALTY') return 'Zaman Aşımı Cezası'
  if (key === 'MANUAL_ADD') return 'Manuel Ekleme'
  if (key === 'MANUAL_DEDUCT') return 'Manuel Düşüm'
  if (Number(delta) > 0) return 'Puan Kazancı'
  if (Number(delta) < 0) return 'Puan Düşümü'
  return 'Puan Hareketi'
}

export default function PointsHistory() {
  const { personel, permissions } = useAuth()
  const PAGE_SIZE = 20
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState(FILTER_7D)
  const [items, setItems] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [pageOffset, setPageOffset] = useState(0)
  const [errorText, setErrorText] = useState('')

  const isManager = useMemo(
    () => hasManagementPrivileges(permissions, personel),
    [permissions, personel],
  )

  const tenant = useMemo(
    () => ({
      anaSirketId: personel?.ana_sirket_id ?? null,
      birimId: personel?.birim_id ?? null,
    }),
    [personel?.ana_sirket_id, personel?.birim_id],
  )

  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )

  const dateRange = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    const start = new Date(now)
    if (filter === FILTER_ALL) return null
    if (filter === FILTER_7D) start.setDate(start.getDate() - 6)
    if (filter === FILTER_30D) start.setDate(start.getDate() - 29)

    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }, [filter])

  const load = useCallback(async (nextOffset = 0, reset = false) => {
    if (!tenant.anaSirketId || !personel?.id) {
      setItems([])
      setLoading(false)
      setLoadingMore(false)
      setErrorText('Profil bilgisi eksik. Lütfen tekrar giriş yapın.')
      return
    }

    if (reset) {
      setLoading(true)
      setRefreshing(true)
      setItems([])
      setHasMore(true)
      setPageOffset(0)
      setErrorText('')
    } else {
      setLoadingMore(true)
    }
    try {
      const personelIds = []
      const personById = {}

      if (!isManager) {
        personelIds.push(personel.id)
        personById[personel.id] = personel
      } else {
        if (!isTopCompanyScope && !tenant.birimId) {
          setItems([])
          setLoading(false)
          setErrorText('Birim kapsamı bulunamadı.')
          return
        }
        let staffQuery = supabase
          .from('personeller')
          .select('id, ad, soyad')
          .eq('ana_sirket_id', tenant.anaSirketId)
          .is('silindi_at', null)

        if (!isTopCompanyScope) {
          staffQuery = staffQuery.eq('birim_id', tenant.birimId)
        }

        const { data: staffData, error: staffErr } = await staffQuery

        if (staffErr) {
          if (__DEV__) console.warn('PointsHistory staff load error', staffErr)
          // Personel listesi alınamazsa en azından current user kayıtlarını göster.
          personelIds.push(personel.id)
          personById[personel.id] = personel
        }

        const staff = staffData || []
        for (const p of staff) {
          personelIds.push(p.id)
          personById[p.id] = p
        }
      }

      if (!personelIds.length) {
        setItems([])
        setErrorText('Gösterilecek puan kaydı bulunamadı.')
        return
      }

      const pointsResult = await loadPointRows({
        personelIds,
        startIso: dateRange?.startIso || null,
        endIso: dateRange?.endIso || null,
        offset: nextOffset,
        limit: PAGE_SIZE,
      })

      if (!pointsResult.ok) {
        if (__DEV__) console.warn('PointsHistory points load error', pointsResult.error)
        setItems([])
        setErrorText('Puan geçmişi alınamadı. Yetki/RLS kontrol edin.')
        return
      }
      const raw = pointsResult.rows || []

      // gorev_baslik kolonu yoksa gorev_id üzerinden baslik çözümle.
      const missingTitleTaskIds = [
        ...new Set(
          raw
            .filter((r) => r?.gorev_id && !r?.gorev_baslik)
            .map((r) => String(r.gorev_id)),
        ),
      ]
      const taskTitleMap = {}
      if (missingTitleTaskIds.length) {
        try {
          const { data: taskRows } = await supabase
            .from('isler')
            .select('id, baslik')
            .in('id', missingTitleTaskIds)
          ;(taskRows || []).forEach((t) => {
            taskTitleMap[String(t.id)] = t?.baslik || 'Görev'
          })
        } catch {
          // ignore: fallback below handles
        }
      }

      const list = (raw || []).map((r, idx) => {
        const pid = r?.personel_id
        const person = personById[pid] || {}
        const name = formatFullName(person?.ad, person?.soyad, '')
        const resolvedTaskTitle =
          r?.gorev_baslik ||
          (r?.gorev_id ? taskTitleMap[String(r.gorev_id)] : null) ||
          null
        const fallbackId = `${pid || 'p'}-${r?.tarih || 't'}-${r?.puan_degisimi || 0}-${idx}`
        return {
          id: r?.id ?? fallbackId,
          personel_id: pid,
          personName: name || '-',
          tarih: r?.tarih ?? null,
          puan_degisimi: r?.puan_degisimi ?? 0,
          gorev_baslik: resolvedTaskTitle,
          gorev_id: r?.gorev_id || null,
          islem_tipi: r?.islem_tipi || null,
          aciklama: r?.aciklama || null,
        }
      })

      const seen = new Set()
      const dedupedList = list.filter((row) => {
        const key = `${row.id}-${row.personel_id}-${row.tarih}-${row.puan_degisimi}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setItems((prev) => (reset ? dedupedList : [...prev, ...dedupedList]))
      setHasMore((raw || []).length === PAGE_SIZE)
      setPageOffset(nextOffset + (raw || []).length)
      setErrorText('')
    } catch (e) {
      if (__DEV__) console.warn('PointsHistory load error', e)
      setItems([])
      setErrorText('Puan geçmişi yüklenirken beklenmeyen hata oluştu.')
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [
    tenant.anaSirketId,
    tenant.birimId,
    personel?.id,
    isManager,
    isTopCompanyScope,
    dateRange,
    PAGE_SIZE,
  ])

  useEffect(() => {
    load(0, true)
  }, [load])

  const onRefresh = useCallback(() => {
    load(0, true)
  }, [load])

  const rangeButtons = useMemo(() => {
    const mk = (key, label) => ({
      key,
      label,
      active: filter === key,
    })
    return [mk(FILTER_7D, '7 gün'), mk(FILTER_30D, '30 gün'), mk(FILTER_ALL, 'Hepsi')]
  }, [filter])

  const renderItem = useCallback(({ item }) => {
    const delta = Number(item?.puan_degisimi ?? 0)
    const isIncrease = delta > 0
    const isDecrease = delta < 0
    const deltaColor = isIncrease ? Colors.success : isDecrease ? Colors.error : Colors.gray
    const DeltaIcon = isIncrease ? ArrowUp : isDecrease ? ArrowDown : null

    const displayValue = isIncrease ? `+${delta}` : String(delta)

    const parsedTaskName = extractTaskNameFromNote(item?.aciklama)
    const sourceText =
      item?.gorev_baslik ||
      parsedTaskName ||
      (item?.islem_tipi === 'TASK_APPROVED' ? 'Görev onayı' : null) ||
      (item?.islem_tipi === 'TASK_TIMEOUT_PENALTY' ? 'Zaman aşımı cezası' : null) ||
      (item?.islem_tipi === 'TASK_DELAY_PENALTY' ? 'Gecikmiş görev cezası' : null) ||
      null
    const actionLabel = getActionLabel(item?.islem_tipi, delta)

    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{isManager ? item.personName : 'Puanım'}</Text>
            <Text style={styles.date}>{formatDate(item.tarih)}</Text>
            <Text style={styles.actionMeta}>{actionLabel}</Text>
            <Text style={styles.taskMeta}>Görev: {sourceText || 'Sistem / Genel'}</Text>
            {item?.aciklama ? <Text style={styles.noteText}>{String(item.aciklama)}</Text> : null}
          </View>
          <View style={styles.pointsBox}>
            {DeltaIcon ? (
              <DeltaIcon size={16} color={deltaColor} strokeWidth={2} />
            ) : null}
            <Text style={[styles.pointsText, { color: deltaColor }]}>{displayValue}</Text>
          </View>
        </View>
      </View>
    )
  }, [isManager])

  if (loading && items.length === 0) {
    return (
      <View style={styles.skeletonWrap}>
        <View style={styles.header}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonSubtitle} />
        </View>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.skeletonCard} />
        ))}
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <PremiumBackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.title}>Puan Geçmişi</Text>
        <Text style={styles.subtitle}>
          {isManager ? 'Birim genelindeki puan hareketleri' : 'Kendi puan hareketlerim'}
        </Text>
      </View>

      <View style={styles.filterRow}>
        {rangeButtons.map((b) => (
          <TouchableOpacity
            key={b.key}
            style={[styles.filterBtn, b.active && styles.filterBtnActive]}
            onPress={() => setFilter(b.key)}
          >
            <Text style={[styles.filterText, b.active && styles.filterTextActive]}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => String(item?.id ?? '')}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>Kayıt bulunamadı.</Text>}
        onEndReachedThreshold={0.2}
        onEndReached={() => {
          if (!hasMore) return
          if (loadingMore || loading) return
          load(pageOffset, false)
        }}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: Spacing.sm }}>
              <ActivityIndicator size={22} color={Colors.accent} />
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  centered: { justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { paddingHorizontal: 0, paddingVertical: 8 },
  skeletonTitle: {
    height: Typography.subheading.fontSize,
    width: 200,
    backgroundColor: MUTED,
    opacity: 0.25,
    borderRadius: Radii.md,
    marginBottom: Spacing.xs,
  },
  skeletonSubtitle: {
    height: Typography.body.fontSize,
    width: 240,
    backgroundColor: MUTED,
    opacity: 0.18,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
  },
  skeletonCard: {
    height: 92,
    borderRadius: Radii.lg,
    backgroundColor: MUTED,
    opacity: 0.12,
    marginBottom: Spacing.sm,
  },
  header: { marginBottom: Spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: Colors.primary, fontSize: Typography.heading.fontSize, fontWeight: Typography.heading.fontWeight, marginBottom: Spacing.xs },
  subtitle: { color: Colors.primary, fontSize: Typography.subheading.fontSize, fontWeight: Typography.subheading.fontWeight },
  filterRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  filterBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    ...Shadows.card,
  },
  filterBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterText: { color: MUTED, fontWeight: Typography.body.fontWeight },
  filterTextActive: { color: Colors.surface },
  listContent: { paddingBottom: Spacing.md },
  empty: { color: MUTED, textAlign: 'center', marginTop: Spacing.md },
  errorText: {
    color: Colors.error,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Card.borderRadius,
    padding: Card.padding,
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  name: { color: Colors.primary, fontWeight: Typography.subheading.fontWeight, fontSize: Typography.subheading.fontSize, marginBottom: Spacing.xs },
  date: { color: MUTED, fontWeight: Typography.body.fontWeight, fontSize: Typography.body.fontSize },
  actionMeta: { marginTop: 4, color: Colors.accent, fontSize: Typography.caption.fontSize, fontWeight: '700' },
  taskMeta: { marginTop: 4, color: Colors.primary, fontSize: Typography.caption.fontSize, fontWeight: '600' },
  noteText: { marginTop: 2, color: MUTED, fontSize: Typography.caption.fontSize, fontStyle: 'italic' },
  pointsBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
    ...Shadows.card,
  },
  pointsText: { fontWeight: Typography.subheading.fontWeight, fontSize: Typography.bodyLg.fontSize },
})

