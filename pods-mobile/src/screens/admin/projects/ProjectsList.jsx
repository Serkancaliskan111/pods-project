import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { FolderKanban, Plus, Search } from 'lucide-react-native'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchProjects, fetchProjectTasks } from '../../../lib/projectApi'
import {
  PROJECT_STATUS_OPTIONS,
  getProjectStatusOption,
} from '../../../lib/projectStatus'
import { computeProjectProgress, formatProjectDateLabel } from '../../../lib/projectGanttUtils'
import { canManageProjects } from '../../../lib/permissions'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  StatusBadge,
  Button,
  EmptyState,
  SkeletonCard,
  Chip,
  palette,
  spacing,
  radii,
} from '../../../ui'
import { adminStyles, pickFromList } from '../adminScreenUtils'

export default function ProjectsList() {
  const navigation = useNavigation()
  const { personel, profile, permissions } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const mayManage = canManageProjects(permissions, isSystemAdmin, personel)

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId: personel?.ana_sirket_id || null,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
    }),
    [isSystemAdmin, personel],
  )

  const [projects, setProjects] = useState([])
  const [progressMap, setProgressMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchProjects(scopeCtx, {
        status: statusFilter || undefined,
        search,
        personelId: personel?.id,
        userId: profile?.id,
      })
      setProjects(list)
      const prog = {}
      await Promise.all(
        list.slice(0, 40).map(async (p) => {
          try {
            const tasks = await fetchProjectTasks(p.id)
            prog[p.id] = computeProjectProgress(tasks)
          } catch {
            prog[p.id] = { pct: 0, total: 0, done: 0, blocked: 0 }
          }
        }),
      )
      setProgressMap(prog)
    } catch (e) {
      if (__DEV__) console.warn('ProjectsList', e)
      Alert.alert('Hata', e?.message || 'Projeler yüklenemedi')
      setProjects([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [scopeCtx, statusFilter, search, personel?.id, profile?.id])

  useEffect(() => {
    const t = setTimeout(() => load(), search ? 320 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const statusLabel =
    PROJECT_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || 'Tüm durumlar'

  const renderItem = useCallback(
    ({ item: p }) => {
      const st = getProjectStatusOption(p.durum)
      const prog = progressMap[p.id] || { pct: 0, total: 0, done: 0 }
      const accent = p.renk || palette.primary[600]
      return (
        <Card
          tone="surface"
          elevated
          onPress={() => navigation.navigate('ProjectShow', { projectId: p.id })}
          style={{ marginBottom: spacing.md }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radii.lg,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderKanban size={20} color="#fff" strokeWidth={1.75} />
            </View>
            <StatusBadge tone={st.tone} size="sm">
              {st.label}
            </StatusBadge>
          </View>
          <Text variant="bodyLg" weight="Bold" color={palette.slate[800]} style={{ marginTop: spacing.sm }}>
            {p.baslik}
          </Text>
          {p.kod ? (
            <Text variant="caption" color={palette.slate[400]}>
              {p.kod}
            </Text>
          ) : null}
          <Text variant="caption" color={palette.slate[500]} style={{ marginTop: spacing.xs }}>
            {formatProjectDateLabel(p.baslangic_tarihi)} – {formatProjectDateLabel(p.bitis_tarihi)}
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" color={palette.slate[500]}>
                {prog.done}/{prog.total} görev tamam
              </Text>
              <Text variant="caption" weight="Bold" color={palette.slate[700]}>
                %{prog.pct}
              </Text>
            </View>
            <View style={adminStyles.progressTrack}>
              <View style={[adminStyles.progressFill, { width: `${prog.pct}%`, backgroundColor: accent }]} />
            </View>
          </View>
        </Card>
      )
    },
    [navigation, progressMap],
  )

  if (loading && projects.length === 0) {
    return (
      <AdminScreenLayout title="Projeler">
        <SkeletonCard />
        <SkeletonCard />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title="Projeler">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        Atandığınız ve yetkili olduğunuz projeler
      </Text>
      {mayManage ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md }}>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus size={16} color="#fff" />}
            onPress={() => navigation.navigate('ProjectEdit', { projectId: 'new' })}
          >
            Yeni
          </Button>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Search size={16} color={palette.slate[400]} style={{ position: 'absolute', left: 12, top: 14, zIndex: 1 }} />
        <TextInput
          style={[adminStyles.input, { paddingLeft: 36, marginBottom: 0, flex: 1 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Proje adı veya kod ara…"
          placeholderTextColor={palette.slate[400]}
          onSubmitEditing={() => load()}
        />
      </View>

      <TouchableOpacity
        style={{ marginBottom: spacing.md }}
        onPress={() =>
          pickFromList(
            'Durum filtresi',
            [{ label: 'Tüm durumlar', value: '' }, ...PROJECT_STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))],
            setStatusFilter,
          )
        }
      >
        <Chip selected={!!statusFilter}>{statusLabel}</Chip>
      </TouchableOpacity>

      <FlatList
        data={projects}
        keyExtractor={(item) => String(item.id)}
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
            icon={<FolderKanban size={42} color={palette.slate[400]} strokeWidth={1.5} />}
            title="Görüntülenecek proje yok"
            description={
              mayManage
                ? 'Yeni proje oluşturun veya bir projeye ekip olarak eklenin.'
                : 'Size atanan veya yetkili olduğunuz proje bulunmuyor.'
            }
          />
        }
        ListFooterComponent={
          loading && projects.length > 0 ? (
            <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.md }} />
          ) : null
        }
      />
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', marginBottom: spacing.md, position: 'relative' },
})
