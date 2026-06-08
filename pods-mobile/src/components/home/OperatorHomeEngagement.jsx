import React, { useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg'
import {
  Text as KitText,
  Heading as KitHeading,
  Card as KitCard,
  Section as KitSection,
  StatusBadge as KitStatusBadge,
  IconBubble as KitIconBubble,
  EmptyState as KitEmptyState,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  hexToRgba,
  tones as kitTones,
  Icon,
} from '../../ui'
import HomePointsAvatar from './HomePointsAvatar'
import {
  DAILY_TARGET_POINTS,
  mapGorevTuruBadge,
  mapRecentStatusMeta,
} from './operatorHomeEngagementUtils'

const RECENT_MAX = 5

function PointsCardBackdrop({ goalReached }) {
  const brand = goalReached ? kitPalette.success : kitPalette.primary
  const dotColor = hexToRgba(brand[400], goalReached ? 0.22 : 0.18)

  return (
    <View style={styles.pointsBackdrop} pointerEvents="none">
      <LinearGradient
        colors={[brand[50], kitPalette.surface, brand[100], brand[50]]}
        locations={[0, 0.38, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Svg width="100%" height="100%" viewBox="0 0 360 240" preserveAspectRatio="none" style={styles.pointsDotSvg}>
        <Defs>
          <Pattern id="pointsDotGrid" width={18} height={18} patternUnits="userSpaceOnUse">
            <Circle cx={3} cy={3} r={1.35} fill={dotColor} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={360} height={240} fill="url(#pointsDotGrid)" />
      </Svg>

      <View
        style={[
          styles.pointsDecorRing,
          styles.pointsDecorRingTop,
          { borderColor: hexToRgba(brand[300], 0.22) },
        ]}
      />
      <View
        style={[
          styles.pointsDecorRing,
          styles.pointsDecorRingBottom,
          { borderColor: hexToRgba(kitPalette.blurple[300], 0.18) },
        ]}
      />
      <View
        style={[
          styles.pointsDecorBlob,
          styles.pointsDecorBlobRight,
          { backgroundColor: hexToRgba(brand[300], 0.14) },
        ]}
      />
      <View
        style={[
          styles.pointsDecorBlob,
          styles.pointsDecorBlobLeft,
          { backgroundColor: hexToRgba(kitPalette.blurple[200], 0.16) },
        ]}
      />

      <LinearGradient
        colors={[hexToRgba(brand[500], 0.07), 'transparent', hexToRgba(kitPalette.blurple[400], 0.05)]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  )
}

function PointsStat({ icon: IconComp, label, value, tone = 'primary' }) {
  const isSuccess = tone === 'success'
  const iconColor = isSuccess ? kitPalette.success[700] : kitPalette.primary[700]
  const bg = isSuccess ? kitPalette.success[50] : kitPalette.primary[50]
  const border = isSuccess ? kitPalette.success[100] : kitPalette.primary[100]

  return (
    <View style={[styles.pointsStat, { backgroundColor: bg, borderColor: border }]}>
      <IconComp size={14} color={iconColor} strokeWidth={2.2} />
      <KitText variant="caption" weight="SemiBold" color={kitPalette.slate[500]}>
        {label}
      </KitText>
      <KitText variant="bodySm" weight="Bold" color={kitPalette.slate[800]}>
        {value}
      </KitText>
    </View>
  )
}

export function OperatorHomeFocusCard({ nextTask, onOpenTask, style }) {
  const hasFocus = !!nextTask?.id
  const subtitle = nextTask?.son_tarih
    ? new Date(nextTask.son_tarih).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : hasFocus
      ? 'Bu görevi tamamlaman gerekiyor'
      : 'Günün tamamlandı, harika ilerliyorsun'

  return (
    <KitCard
      tone={hasFocus ? 'primary' : 'success'}
      padding="lg"
      radius="2xl"
      interactive={hasFocus}
      onPress={() => hasFocus && onOpenTask?.(nextTask.id)}
      style={style}
    >
      <View style={styles.focusRow}>
        <KitIconBubble tone={hasFocus ? 'primary' : 'success'} size="lg" square>
          {hasFocus ? (
            <Icon.Focus size={22} color={kitPalette.primary[700]} strokeWidth={2} />
          ) : (
            <Icon.TaskComplete size={22} color={kitPalette.success[700]} strokeWidth={2} />
          )}
        </KitIconBubble>
        <View style={styles.focusTextWrap}>
          <KitText variant="overline" color={hasFocus ? kitPalette.primary[600] : kitPalette.success[700]}>
            SIRADAKİ GÖREVİN
          </KitText>
          <KitHeading variant="h2" style={styles.focusTitle} numberOfLines={2}>
            {nextTask?.baslik || 'Görevlerini tamamladın'}
          </KitHeading>
          <View style={styles.focusMetaRow}>
            {nextTask?.gorev_turu && mapGorevTuruBadge(nextTask.gorev_turu) ? (
              <KitStatusBadge tone="blurple" size="sm">
                {mapGorevTuruBadge(nextTask.gorev_turu)?.label}
              </KitStatusBadge>
            ) : null}
            <KitText variant="caption" color={kitPalette.slate[500]}>
              {subtitle}
            </KitText>
          </View>
        </View>
        {hasFocus ? <Icon.Forward size={22} color={kitPalette.primary[700]} strokeWidth={2.2} /> : null}
      </View>
    </KitCard>
  )
}

export function OperatorHomePointsCard({
  firstName,
  lastName,
  fallbackName,
  profilePhotoPath,
  monthlyNetPoints = 0,
  gainedPointsToday = 0,
  todayTaskCount = 0,
  streakDays = 0,
  onPress,
  style,
}) {
  const points = Math.round(monthlyNetPoints)
  const percent = Math.max(0, Math.min(100, Math.trunc((monthlyNetPoints / DAILY_TARGET_POINTS) * 100)))
  const kalan = Math.max(0, DAILY_TARGET_POINTS - monthlyNetPoints)
  const goalReached = points >= DAILY_TARGET_POINTS
  const monthLabel = useMemo(
    () =>
      new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
    [],
  )

  return (
    <View style={[styles.pointsShell, style]}>
      <PointsCardBackdrop goalReached={goalReached} />

      <View
        style={[
          styles.pointsTopStripe,
          { backgroundColor: goalReached ? kitPalette.success[500] : kitPalette.primary[600] },
        ]}
        pointerEvents="none"
      />

      <View style={styles.pointsContent}>
      <View style={styles.pointsHeaderBand}>
        <HomePointsAvatar
          firstName={firstName}
          lastName={lastName}
          fallbackName={fallbackName}
          photoPath={profilePhotoPath}
        />

        <View style={styles.pointsIntro}>
          <KitText variant="overline" weight="Bold" color={kitPalette.primary[700]}>
            AYLIK NET PUAN
          </KitText>
          <KitText variant="caption" color={kitPalette.slate[600]} numberOfLines={1}>
            {monthLabel}
          </KitText>
        </View>

        <View
          style={[
            styles.pointsPercentRing,
            goalReached ? styles.pointsPercentRingSuccess : null,
          ]}
        >
          <KitText
            variant="caption"
            weight="ExtraBold"
            color={goalReached ? kitPalette.success[700] : kitPalette.primary[700]}
          >
            %{percent}
          </KitText>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel="Puan geçmişi"
        style={styles.pointsMetricPanel}
      >
        <View style={styles.pointsValueRow}>
          <KitHeading variant="displayLg" color={kitPalette.slate[900]}>
            {points.toLocaleString('tr-TR')}
          </KitHeading>
          <KitText variant="h3" weight="SemiBold" color={kitPalette.slate[400]} style={styles.pointsTarget}>
            / {DAILY_TARGET_POINTS.toLocaleString('tr-TR')}
          </KitText>
        </View>

        <KitText variant="bodySm" color={kitPalette.slate[600]} style={styles.pointsMotivation}>
          {goalReached
            ? 'Aylık hedefe ulaştın. Harika bir performans!'
            : `Hedefe ${kalan.toLocaleString('tr-TR')} puan kaldı — devam et!`}
        </KitText>

        <View style={styles.pointsProgressTrack}>
          <View
            style={[
              styles.pointsProgressFill,
              {
                width: `${percent}%`,
                backgroundColor: goalReached ? kitPalette.success[500] : kitPalette.primary[500],
              },
            ]}
          />
        </View>
      </TouchableOpacity>

      <View style={styles.pointsStatsRow}>
        <PointsStat
          icon={Icon.TrendUp}
          label="Bugün puan"
          value={`+${Math.round(gainedPointsToday).toLocaleString('tr-TR')}`}
        />
        <PointsStat icon={Icon.Tasks} label="Bugünkü görev" value={String(todayTaskCount)} />
        {streakDays > 0 ? (
          <PointsStat icon={Icon.Streak} label="Seri" value={`${streakDays} gün`} tone="success" />
        ) : null}
      </View>

      {onPress ? (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onPress}
          style={styles.pointsFooter}
          accessibilityRole="button"
          accessibilityLabel="Puan geçmişi"
        >
          <KitText variant="caption" weight="Bold" color={kitPalette.primary[700]}>
            Puan geçmişini incele
          </KitText>
          <Icon.Forward size={16} color={kitPalette.primary[700]} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}
      </View>
    </View>
  )
}

export function OperatorHomeRecentSection({ items = [], onOpenTask, style }) {
  const recent = items.slice(0, RECENT_MAX)

  return (
    <KitSection
      title="Son Gönderilen İşler"
      subtitle="Son tamamlama ve onay sürecindekiler"
      icon={
        <KitIconBubble tone="blurple" size="md">
          <Icon.Upload size={18} color={kitPalette.blurple[700]} strokeWidth={2} />
        </KitIconBubble>
      }
      style={style}
    >
      {recent.length === 0 ? (
        <KitEmptyState
          tone="soft"
          icon={<Icon.TaskComplete size={28} color={kitPalette.success[600]} strokeWidth={1.6} />}
          title="Henüz kayıt yok"
          description="Görev tamamladığında veya onaya gönderdiğinde burada görünür."
        />
      ) : (
        <View style={styles.recentList}>
          {recent.map((item) => {
            const statusMeta = mapRecentStatusMeta(item?.durum)
            const tone =
              statusMeta.tone === 'approved'
                ? 'success'
                : statusMeta.tone === 'rejected'
                  ? 'danger'
                  : 'warning'
            const RecentIcon =
              tone === 'success'
                ? Icon.TaskComplete
                : tone === 'danger'
                  ? Icon.TaskReject
                  : Icon.TaskPending
            const t = kitTones[tone] || kitTones.warning

            return (
              <KitCard
                key={item.id}
                tone={tone}
                padding="md"
                radius="2xl"
                interactive
                onPress={() => onOpenTask?.(item.id)}
              >
                <View style={styles.recentRow}>
                  <KitIconBubble tone={tone} size="md">
                    <RecentIcon size={18} color={t.icon} strokeWidth={2} />
                  </KitIconBubble>
                  <View style={styles.recentTextWrap}>
                    <KitText variant="bodyLg" weight="Bold" color={t.text} numberOfLines={1}>
                      {item.baslik != null && item.baslik !== '' ? String(item.baslik) : 'Görev'}
                    </KitText>
                    <View style={styles.recentMetaRow}>
                      <KitStatusBadge tone={tone} size="sm">
                        {statusMeta.label}
                      </KitStatusBadge>
                      {item.bitis_tarihi || item.updated_at ? (
                        <KitText variant="caption" color={t.softText}>
                          {new Date(item.bitis_tarihi || item.updated_at).toLocaleDateString('tr-TR')}
                        </KitText>
                      ) : null}
                      {mapGorevTuruBadge(item?.gorev_turu) ? (
                        <KitText variant="caption" color={t.softText}>
                          {mapGorevTuruBadge(item?.gorev_turu)?.label}
                        </KitText>
                      ) : null}
                    </View>
                  </View>
                  <Icon.Forward size={18} color={t.text} strokeWidth={2} />
                </View>
              </KitCard>
            )
          })}
        </View>
      )}
    </KitSection>
  )
}

const styles = StyleSheet.create({
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  focusTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  focusTitle: {
    marginTop: 2,
    marginBottom: 4,
  },
  focusMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
  },
  pointsShell: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: kitRadii['2xl'],
    backgroundColor: kitPalette.surface,
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
    ...kitShadows.sm,
  },
  pointsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  pointsDotSvg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  pointsDecorRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 999,
  },
  pointsDecorRingTop: {
    width: 160,
    height: 160,
    top: -56,
    right: -36,
  },
  pointsDecorRingBottom: {
    width: 120,
    height: 120,
    bottom: -44,
    left: -28,
  },
  pointsDecorBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  pointsDecorBlobRight: {
    width: 88,
    height: 88,
    top: '38%',
    right: -20,
  },
  pointsDecorBlobLeft: {
    width: 64,
    height: 64,
    bottom: 28,
    left: '46%',
  },
  pointsContent: {
    paddingHorizontal: kitSpacing.lg,
    paddingTop: kitSpacing.md,
    paddingBottom: kitSpacing.lg,
    zIndex: 1,
  },
  pointsTopStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    zIndex: 2,
  },
  pointsHeaderBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
    marginTop: kitSpacing.xs,
  },
  pointsIntro: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pointsPercentRing: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kitPalette.surface,
    borderWidth: 3,
    borderColor: kitPalette.primary[200],
  },
  pointsPercentRingSuccess: {
    borderColor: kitPalette.success[300],
  },
  pointsMetricPanel: {
    marginTop: kitSpacing.lg,
    padding: kitSpacing.lg,
    borderRadius: kitRadii.xl,
    backgroundColor: kitPalette.surface,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    ...kitShadows.sm,
  },
  pointsValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  pointsTarget: {
    marginBottom: 8,
  },
  pointsMotivation: {
    marginTop: kitSpacing.sm,
  },
  pointsProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: kitPalette.slate[100],
    overflow: 'hidden',
    marginTop: kitSpacing.md,
  },
  pointsProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  pointsStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginTop: kitSpacing.md,
  },
  pointsStat: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 92,
    alignItems: 'center',
    gap: 2,
    paddingVertical: kitSpacing.sm,
    paddingHorizontal: kitSpacing.xs,
    borderRadius: kitRadii.lg,
    borderWidth: 1,
    backgroundColor: kitPalette.surface,
  },
  pointsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: kitSpacing.md,
    paddingVertical: kitSpacing.sm,
  },
  recentList: {
    gap: kitSpacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
  },
  recentTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginTop: 6,
  },
})
