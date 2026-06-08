import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  TextInput,
  View,
  StyleSheet,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { CheckCircle2 } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { canApproveTask } from '../../../lib/permissions'
import {
  enrichScopeWithJunctionPersonelIds,
  scopeAnaSirketlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
  TASKS_LIST_LIMIT,
} from '../../../lib/supabaseScope'
import { isApprovedTaskStatus } from '../../../lib/taskStatus'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../../lib/taskVisibility'
import { groupTasksByGrupId } from '../../../lib/groupTasks'
import { formatFullName } from '../../../lib/nameFormat'
import {
  groupCompletedByTime,
  matchesQuickFilter,
  getTaskCompletionDate,
} from '../tasks/lib/tasksListGrouping'
import { getTaskTypeLabel } from '../tasks/lib/taskTypeLabels'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  Chip,
  StatusBadge,
  EmptyState,
  SkeletonCard,
  palette,
  spacing,
  radii,
} from '../../../ui'

const supabase = getSupabase()

const JOBS_SELECT =
  'id,baslik,aciklama,durum,created_at,updated_at,son_tarih,baslama_tarihi,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu,is_sablon_id,grup_id,acil'

const QUICK_FILTERS = [
  { id: 'assigned_by_me', label: 'Benim atadığım' },
  { id: 'assigned_to_me', label: 'Bana atanan' },
  { id: 'urgent', label: 'Acil' },
]

export default function AuditApproved() {
  const navigation = useNavigation()
  const { profile, personel, scopeReady } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canReview = isSystemAdmin || canApproveTask(permissions)
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIdsRaw = isSystemAdmin ? [] : personel?.accessibleUnitIds
  const accessibleUnitIds = isSystemAdmin
    ? null
    : Array.isArray(accessibleUnitIdsRaw)
      ? accessibleUnitIdsRaw
      : null
  const localScopeReady = isSystemAdmin
    ? true
    : Boolean(currentCompanyId) && Array.isArray(accessibleUnitIdsRaw)
  const canLoadWithScope = Boolean(scopeReady) && localScopeReady
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')

  const staffNameById = useMemo(() => {
    const map = {}
    for (const s of staff || []) {
      map[String(s.id)] = formatFullName(s.ad, s.soyad, '') || s.email || '-'
    }
    return map
  }, [staff])

  const companyNameById = useMemo(() => {
    const map = {}
    for (const c of companies || []) {
      map[String(c.id)] = c.ana_sirket_adi || '-'
    }
    return map
  }, [companies])

  const load = useCallback(async () => {
    if (!canLoadWithScope || !canReview) return
    setLoading(true)
    try {
      const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
        isSystemAdmin,
        currentCompanyId,
        accessibleUnitIds,
      })

      const [{ data: comps }, { data: staffData }, jobsRes] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
          scope,
        ),
        scopePersonelQuery(
          supabase.from('personeller').select('id,ad,soyad,email').is('silindi_at', null),
          scope,
        ),
        scopeIslerQuery(
          supabase
            .from('isler')
            .select(JOBS_SELECT)
            .order('updated_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT),
          scope,
        ),
      ])

      if (jobsRes.error) throw jobsRes.error

      let rows = (jobsRes.data || []).filter(
        (t) =>
          isTaskVisibleNow(t) &&
          isTaskVisibleToPerson(t, personel?.id) &&
          isApprovedTaskStatus(t?.durum),
      )

      const { items: grouped } = groupTasksByGrupId(rows)
      setTasks(grouped)
      setCompanies(comps || [])
      setStaff(staffData || [])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Onaylanan görevler yüklenemedi')
      setTasks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [
    canLoadWithScope,
    canReview,
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIds,
    personel?.id,
  ])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (tasks || []).filter((t) => {
      if (!matchesQuickFilter(t, quickFilter, personel?.id)) return false
      if (!term) return true
      const haystack = [
        t.baslik,
        companyNameById[String(t.ana_sirket_id)],
        staffNameById[String(t.sorumlu_personel_id)],
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [tasks, quickFilter, personel?.id, search, companyNameById, staffNameById])

  const listSections = useMemo(() => {
    const { today, yesterday, last7Days } = groupCompletedByTime(filtered)
    return [
      { key: 'today', label: 'Bugün', tasks: today },
      { key: 'yesterday', label: 'Dün', tasks: yesterday },
      { key: 'last7', label: 'Son 7 gün', tasks: last7Days },
    ].filter((s) => s.tasks.length > 0)
  }, [filtered])

  const flatListData = useMemo(() => {
    const rows = []
    for (const section of listSections) {
      rows.push({ type: 'section', key: `sec-${section.key}`, label: section.label })
      for (const task of section.tasks) {
        rows.push({ type: 'task', key: String(task.id), task })
      }
    }
    return rows
  }, [listSections])

  const renderItem = useCallback(
    ({ item: row }) => {
      if (row.type === 'section') {
        return (
          <Text
            variant="overline"
            color={palette.slate[500]}
            weight="Bold"
            style={{ marginTop: spacing.md, marginBottom: spacing.sm }}
          >
            {row.label}
          </Text>
        )
      }
      const task = row.task
      const completed = getTaskCompletionDate(task)
      const dateText = completed ? completed.toLocaleString('tr-TR') : '—'
      return (
        <Card
          tone="surface"
          elevated
          onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
          style={{ marginBottom: spacing.md }}
        >
          <Text variant="bodyLg" weight="SemiBold" color={palette.slate[800]}>
            {task.baslik || 'Görev'}
          </Text>
          <Text variant="caption" color={palette.slate[500]} style={{ marginTop: spacing.xs }}>
            {staffNameById[String(task.sorumlu_personel_id)] || '—'} •{' '}
            {getTaskTypeLabel(task.gorev_turu)}
          </Text>
          {!companyScoped ? (
            <Text variant="caption" color={palette.slate[400]}>
              {companyNameById[String(task.ana_sirket_id)] || '—'}
            </Text>
          ) : null}
          <View style={styles.cardFooter}>
            <StatusBadge tone="success" size="sm">
              Onaylandı
            </StatusBadge>
            <Text variant="caption" color={palette.slate[400]}>
              {dateText}
            </Text>
          </View>
        </Card>
      )
    },
    [navigation, staffNameById, companyNameById, companyScoped],
  )

  if (!canReview) {
    return (
      <AdminScreenLayout title="Onaylananlar">
        <EmptyState title="Yetki yok" description="Bu sayfa için onay yetkisi gerekir." />
      </AdminScreenLayout>
    )
  }

  if (loading && !flatListData.length) {
    return (
      <AdminScreenLayout title="Onaylananlar">
        <SkeletonCard />
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Onaylananlar">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        Onaylanmış görevleri filtreleyerek görüntüleyin.
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Görev veya kişi ara…"
        placeholderTextColor={palette.slate[400]}
        style={styles.search}
      />

      <View style={styles.chips}>
        {QUICK_FILTERS.map((f) => (
          <Chip
            key={f.id}
            selected={quickFilter === f.id}
            onPress={() => setQuickFilter(quickFilter === f.id ? 'all' : f.id)}
            style={{ marginRight: spacing.sm, marginBottom: spacing.sm }}
          >
            {f.label}
          </Chip>
        ))}
      </View>

      <FlatList
        data={flatListData}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              load()
            }}
            tintColor={palette.primary[500]}
          />
        }
        contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
        ListEmptyComponent={
          <EmptyState
            icon={<CheckCircle2 size={42} color={palette.slate[400]} strokeWidth={1.5} />}
            title="Onaylanan görev yok"
            description="Seçili filtrelere uygun kayıt bulunamadı."
          />
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.md }} />
          ) : null
        }
      />
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderColor: palette.slate[200],
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: palette.slate[800],
    backgroundColor: palette.surface,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
})
