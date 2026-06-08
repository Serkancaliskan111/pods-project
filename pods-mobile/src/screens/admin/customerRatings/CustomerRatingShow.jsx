import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { ChevronLeft, Building2, Star, MessageSquare } from 'lucide-react-native'
import getSupabase from '../../../lib/supabaseClient'
import { useAuth } from '../../../contexts/AuthContext'
import { enrichRatingsWithMediaUrls } from '../../../lib/customerRatingMediaUrls'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import {
  Text,
  Card,
  MetricCard,
  Button,
  EmptyState,
  IconButton,
  StatusBadge,
  palette,
  spacing,
  radii,
} from '../../../ui'

const supabase = getSupabase()

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date) {
  const d = startOfDay(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d
}

function startOfMonth(date) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

function computeRatingStats(ratings) {
  const now = new Date()
  const sod = startOfDay(now).getTime()
  const sow = startOfWeek(now).getTime()
  const som = startOfMonth(now).getTime()
  let day = 0
  let week = 0
  let month = 0
  let sum = 0
  for (const r of ratings || []) {
    const ts = new Date(r.created_at).getTime()
    const val = Number(r.rating) || 0
    sum += val
    if (ts >= sod) day += 1
    if (ts >= sow) week += 1
    if (ts >= som) month += 1
  }
  const total = ratings?.length || 0
  return {
    day,
    week,
    month,
    total,
    avg: Number((sum / Math.max(1, total)).toFixed(2)),
  }
}

async function fetchQrLink(qrId, currentCompanyId) {
  let q = supabase
    .from('customer_unit_qr_links')
    .select('id,code,birim_id,aktif,created_at,birimler(birim_adi),ana_sirket_id')
    .eq('id', qrId)
  if (currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data
}

async function fetchRatingsForQr(qrId) {
  let { data, error } = await supabase
    .from('customer_unit_ratings')
    .select('id,qr_id,rating,yorum,created_at,foto_path,video_path')
    .eq('qr_id', qrId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error?.code === '42703') {
    const legacy = await supabase
      .from('customer_unit_ratings')
      .select('id,qr_id,rating,created_at')
      .eq('qr_id', qrId)
      .order('created_at', { ascending: false })
      .limit(500)
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error
  return data || []
}

function StarRow({ value }) {
  const stars = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={14}
          color={s <= stars ? palette.warning[500] : palette.slate[200]}
          fill={s <= stars ? palette.warning[400] : 'transparent'}
        />
      ))}
    </View>
  )
}

export default function CustomerRatingShow() {
  const navigation = useNavigation()
  const route = useRoute()
  const qrId = route.params?.qrId
  const { profile, personel } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id

  const [qrRow, setQrRow] = useState(null)
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!qrId) return
    setLoading(true)
    try {
      const row = await fetchQrLink(qrId, currentCompanyId)
      if (!row) {
        setQrRow(null)
        setRatings([])
        return
      }
      setQrRow(row)
      const list = await fetchRatingsForQr(qrId)
      setRatings(await enrichRatingsWithMediaUrls(supabase, list))
    } catch (e) {
      Alert.alert('Hata', e?.message || 'QR detayı yüklenemedi')
      setQrRow(null)
      setRatings([])
    } finally {
      setLoading(false)
    }
  }, [qrId, currentCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => computeRatingStats(ratings), [ratings])

  const feedbackRows = useMemo(
    () =>
      ratings.filter(
        (r) =>
          String(r?.yorum || '').trim().length > 0 || r.foto_url || r.video_url,
      ),
    [ratings],
  )

  const renderRating = ({ item: r }) => {
    const stars = Math.max(1, Math.min(5, Number(r.rating) || 0))
    const tone = stars >= 4 ? 'success' : stars === 3 ? 'warning' : 'danger'
    return (
      <Card style={styles.feedbackCard}>
        <View style={styles.feedbackTop}>
          <StarRow value={stars} />
          <StatusBadge tone={tone}>{stars}/5</StatusBadge>
          <Text variant="caption" style={styles.feedbackDate}>
            {new Date(r.created_at).toLocaleString('tr-TR')}
          </Text>
        </View>
        {r.yorum ? (
          <Text variant="body" style={styles.comment}>
            {r.yorum}
          </Text>
        ) : null}
        {r.foto_url ? (
          <Image source={{ uri: r.foto_url }} style={styles.photo} resizeMode="cover" />
        ) : null}
      </Card>
    )
  }

  if (loading) {
    return (
      <AdminScreenLayout title="Müşteri anketi" screenProps={{ bottomInset: true }}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary[700]} />
        </View>
      </AdminScreenLayout>
    )
  }

  if (!qrRow) {
    return (
      <AdminScreenLayout title="Müşteri anketi" scroll screenProps={{ bottomInset: true }}>
        <EmptyState
          title="QR bulunamadı"
          description="Kayıt silinmiş veya erişim yetkiniz olmayabilir."
          action={
            <Button variant="secondary" size="sm" onPress={() => navigation.goBack()}>
              Geri dön
            </Button>
          }
        />
      </AdminScreenLayout>
    )
  }

  const unitName = qrRow?.birimler?.birim_adi || qrRow.birim_id

  return (
    <AdminScreenLayout title={unitName} screenProps={{ bottomInset: true }}>
      <Text variant="caption" style={styles.code}>
        {qrRow.code}
      </Text>

      <Card style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Building2 size={16} color={palette.slate[400]} />
          <Text variant="body" style={styles.metaUnit}>
            {unitName}
          </Text>
          <StatusBadge tone={qrRow.aktif ? 'success' : 'soft'}>
            {qrRow.aktif ? 'Aktif' : 'Pasif'}
          </StatusBadge>
        </View>
        <Text variant="caption" style={styles.metaDate}>
          Oluşturulma: {new Date(qrRow.created_at).toLocaleString('tr-TR')}
        </Text>
      </Card>

      <View style={styles.metrics}>
        <MetricCard label="Ortalama" value={String(stats.avg)} tone="executiveAccent" style={styles.metric} />
        <MetricCard label="Bugün" value={String(stats.day)} tone="surface" style={styles.metric} />
        <MetricCard label="Hafta" value={String(stats.week)} tone="surface" style={styles.metric} />
        <MetricCard label="Ay" value={String(stats.month)} tone="surface" style={styles.metric} />
        <MetricCard label="Toplam" value={String(stats.total)} tone="surface" style={styles.metric} />
      </View>

      <View style={styles.sectionHead}>
        <MessageSquare size={18} color={palette.accent[600]} />
        <Text variant="overline" style={styles.sectionTitle}>
          Geri bildirimler ({feedbackRows.length})
        </Text>
      </View>

      {feedbackRows.length === 0 ? (
        <Card style={styles.emptyFeedback}>
          <EmptyState
            title="Geri bildirim yok"
            description="Yorum veya medya içeren değerlendirme gelince burada listelenir."
          />
        </Card>
      ) : (
        <FlatList
          style={styles.feedbackList}
          data={feedbackRows}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRating}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerCenter: { flex: 1 },
  code: { fontFamily: 'PlusJakartaSans-Medium', color: palette.slate[500], marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metaCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  metaUnit: { flex: 1, fontWeight: '700' },
  metaDate: { color: palette.slate[500] },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  metric: { width: '47%', minWidth: 140 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontWeight: '700', color: palette.slate[700] },
  emptyFeedback: { marginHorizontal: spacing.lg },
  feedbackList: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] },
  sep: { height: spacing.sm },
  feedbackCard: { gap: spacing.sm },
  feedbackTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  starRow: { flexDirection: 'row', gap: 2 },
  feedbackDate: { marginLeft: 'auto', color: palette.slate[500] },
  comment: { lineHeight: 22 },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: radii.xl,
    backgroundColor: palette.slate[100],
  },
})
