import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Animated,
  FlatList,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  filterTasksForCubicleReportScope,
  CUBICLE_REPORT_SCOPE_OPTIONS,
  labelForCubicleReportScope,
} from '../../lib/cubicleHomeTaskBuckets'
import {
  buildManagerReportSummary,
  MANAGER_REPORT_STAT_CARDS,
} from '../../lib/managerReportSummary'
import {
  Text as KitText,
  Heading as KitHeading,
  IconBubble as KitIconBubble,
  SkeletonCard,
  CenterModal,
  Button,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  screenContent,
  hexToRgba,
  Icon,
} from '../../ui'

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList)

/** Aktif kart genişliği — yanlarda komşu kartın bir kısmı görünür */
const CARD_WIDTH_RATIO = 0.82
const CARD_GAP = kitSpacing.sm

const METRIC_ICONS = {
  TrendUp: Icon.TrendUp,
  Urgent: Icon.Urgent,
  Clock: Icon.Clock,
  Focus: Icon.Focus,
  TaskComplete: Icon.TaskComplete,
  Refresh: Icon.Refresh,
}

const HEADER_DOT_GRID = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  col: i % 9,
  row: Math.floor(i / 9),
  size: i % 4 === 0 ? 4 : 2.5,
  alpha: 0.06 + (i % 5) * 0.018,
}))

const HEADER_CHART_BARS = [18, 28, 22, 34, 26, 38, 20]

/** Rapor başlığı — nokta ızgarası, çapraz bantlar, mini grafik silüeti */
function ReportHeaderPattern() {
  return (
    <View style={styles.headerPattern} pointerEvents="none">
      <LinearGradient
        colors={['transparent', hexToRgba(kitPalette.blurple[500], 0.22), 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.headerStripeA}
      />
      <View style={styles.headerStripeB} />
      <View style={styles.headerStripeC} />

      {HEADER_DOT_GRID.map((dot) => (
        <View
          key={dot.id}
          style={[
            styles.headerDot,
            {
              left: `${6 + dot.col * 10}%`,
              top: `${10 + dot.row * 20}%`,
              width: dot.size,
              height: dot.size,
              opacity: dot.alpha,
            },
          ]}
        />
      ))}

      <View style={styles.headerChartSilhouette}>
        {HEADER_CHART_BARS.map((h, i) => (
          <View
            key={i}
            style={[
              styles.headerChartBar,
              {
                height: h,
                opacity: 0.14 + (i % 3) * 0.04,
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.headerOrb, styles.headerOrbA]} />
      <View style={[styles.headerOrb, styles.headerOrbB]} />
      <View style={styles.headerOrbC} />
    </View>
  )
}

function ReportScopeDropdown({ value, onChange, options, labelForValue }) {
  const [open, setOpen] = useState(false)
  const selectedLabel = labelForValue(value)

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={styles.scopeTrigger}
        accessibilityRole="button"
        accessibilityLabel={`Tarih filtresi: ${selectedLabel}`}
      >
        <KitText variant="caption" weight="Bold" color={kitPalette.primary[800]} numberOfLines={1}>
          {selectedLabel}
        </KitText>
        <Icon.Down size={14} color={kitPalette.primary[700]} strokeWidth={2.4} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scopeBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.scopeMenu} onPress={(e) => e.stopPropagation()}>
            {options.map((opt) => {
              const active = value === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.85}
                  onPress={() => {
                    onChange?.(opt.value)
                    setOpen(false)
                  }}
                  style={[styles.scopeMenuItem, active && styles.scopeMenuItemActive]}
                >
                  <KitText
                    variant="bodySm"
                    weight={active ? 'Bold' : 'SemiBold'}
                    color={active ? kitPalette.primary[800] : kitPalette.slate[700]}
                  >
                    {opt.label}
                  </KitText>
                  {active ? (
                    <Icon.Delivered size={16} color={kitPalette.primary[700]} strokeWidth={2.5} />
                  ) : null}
                </TouchableOpacity>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

function MetricExplainModal({ card, visible, onClose }) {
  if (!card) return null
  const MetricIcon = METRIC_ICONS[card.iconKey] || Icon.Chart

  return (
    <CenterModal visible={visible} onClose={onClose} padding="lg" maxWidth={400}>
      <View style={styles.explainHeader}>
        <View style={[styles.explainIcon, { backgroundColor: hexToRgba(card.color, 0.14) }]}>
          <MetricIcon size={22} color={card.color} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <KitHeading variant="h3">{card.label}</KitHeading>
          <KitText variant="caption" color={kitPalette.slate[500]}>
            {card.hint}
          </KitText>
        </View>
      </View>
      <KitText variant="bodySm" color={kitPalette.slate[700]} style={styles.explainBody}>
        {card.description || card.hint}
      </KitText>
      <Button variant="secondary" size="md" fullWidth onPress={onClose} style={{ marginTop: kitSpacing.lg }}>
        Tamam
      </Button>
    </CenterModal>
  )
}

function MetricSlide({ card, summary, loading, onInfoPress }) {
  const raw = summary[card.field]
  const display = loading ? '—' : raw == null || raw === '' ? '—' : String(raw)
  const numeric = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  const barWidth =
    card.showBar && !loading && !Number.isNaN(numeric)
      ? Math.min(100, Math.max(0, numeric))
      : 0
  const MetricIcon = METRIC_ICONS[card.iconKey] || Icon.Chart

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onInfoPress}
      style={[styles.metricSlide, { borderColor: hexToRgba(card.color, 0.35) }]}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}: ${display}${card.suffix || ''}. Bilgi için dokunun.`}
    >
      <LinearGradient
        colors={[hexToRgba(card.color, 0.08), kitPalette.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.metricSlideInner}
      >
        <View style={styles.metricSlideTop}>
          <View style={[styles.iconWrapLg, { backgroundColor: hexToRgba(card.color, 0.16) }]}>
            <MetricIcon size={20} color={card.color} strokeWidth={2.2} />
          </View>
          <View style={styles.metricTitleCol}>
            <KitText variant="bodySm" weight="Bold" color={kitPalette.slate[800]} numberOfLines={1}>
              {card.shortLabel || card.label}
            </KitText>
            <KitText variant="caption" color={kitPalette.slate[500]} numberOfLines={2} style={styles.slideHint}>
              {card.hint}
            </KitText>
          </View>
          <View style={styles.infoBtn}>
            <KitText variant="caption" weight="Bold" color={kitPalette.slate[500]}>
              i
            </KitText>
          </View>
        </View>

        <View style={styles.valueRow}>
          <KitText variant="displayMd" weight="Bold" color={card.color}>
            {display}
          </KitText>
          {card.suffix ? (
            <KitText variant="bodyLg" weight="Bold" color={card.color}>
              {card.suffix}
            </KitText>
          ) : null}
        </View>

        {card.showBar ? (
          <View style={styles.metricBarTrack}>
            <View
              style={[
                styles.metricBarFill,
                {
                  width: `${barWidth}%`,
                  backgroundColor: loading ? kitPalette.slate[200] : card.color,
                },
              ]}
            />
          </View>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  )
}

function MetricsSlider({ cards, summary, loading }) {
  const listRef = useRef(null)
  const scrollX = useRef(new Animated.Value(0)).current
  const [activeIndex, setActiveIndex] = useState(0)
  const [explainCard, setExplainCard] = useState(null)
  const [viewportWidth, setViewportWidth] = useState(
    () => Dimensions.get('window').width - screenContent.paddingHorizontal * 2,
  )

  const loopEnabled = cards.length > 1
  const loopCards = useMemo(() => {
    if (!loopEnabled) return cards
    const last = cards[cards.length - 1]
    const first = cards[0]
    return [
      { ...last, key: `loop-before-${last.key}` },
      ...cards,
      { ...first, key: `loop-after-${first.key}` },
    ]
  }, [cards, loopEnabled])

  const cardWidth = viewportWidth * CARD_WIDTH_RATIO
  const snapInterval = cardWidth + CARD_GAP
  const sideInset = (viewportWidth - cardWidth) / 2

  const scrollIndexToReal = useCallback(
    (idx) => {
      if (!loopEnabled) return Math.min(Math.max(0, idx), cards.length - 1)
      if (idx <= 0) return cards.length - 1
      if (idx >= loopCards.length - 1) return 0
      return idx - 1
    },
    [cards.length, loopEnabled, loopCards.length],
  )

  const scrollToLoopIndex = useCallback(
    (index, animated = false) => {
      const offset = index * snapInterval
      listRef.current?.scrollToOffset({ offset, animated })
      if (!animated) scrollX.setValue(offset)
    },
    [snapInterval, scrollX],
  )

  useEffect(() => {
    if (!loopEnabled || snapInterval <= 0) return
    const t = requestAnimationFrame(() => {
      scrollToLoopIndex(1, false)
      setActiveIndex(0)
    })
    return () => cancelAnimationFrame(t)
  }, [loopEnabled, snapInterval, scrollToLoopIndex, cards.length])

  const updateActiveIndex = useCallback(
    (x) => {
      const idx = Math.round(x / snapInterval)
      setActiveIndex(scrollIndexToReal(idx))
    },
    [snapInterval, scrollIndexToReal],
  )

  const handleLoopRewind = useCallback(
    (x) => {
      if (!loopEnabled || snapInterval <= 0) {
        updateActiveIndex(x)
        return
      }
      const idx = Math.round(x / snapInterval)
      updateActiveIndex(x)
      if (idx === 0) {
        scrollToLoopIndex(cards.length, false)
        setActiveIndex(cards.length - 1)
      } else if (idx === loopCards.length - 1) {
        scrollToLoopIndex(1, false)
        setActiveIndex(0)
      }
    },
    [
      loopEnabled,
      snapInterval,
      cards.length,
      loopCards.length,
      updateActiveIndex,
      scrollToLoopIndex,
    ],
  )

  const renderItem = useCallback(
    ({ item: card, index }) => {
      const inputRange = [
        (index - 1) * snapInterval,
        index * snapInterval,
        (index + 1) * snapInterval,
      ]
      const scale = scrollX.interpolate({
        inputRange,
        outputRange: [0.93, 1, 0.93],
        extrapolate: 'clamp',
      })
      const opacity = scrollX.interpolate({
        inputRange,
        outputRange: [0.7, 1, 0.7],
        extrapolate: 'clamp',
      })
      const translateY = scrollX.interpolate({
        inputRange,
        outputRange: [4, 0, 4],
        extrapolate: 'clamp',
      })

      return (
        <Animated.View
          style={[
            styles.slidePage,
            {
              width: snapInterval,
              opacity,
              transform: [{ scale }, { translateY }],
            },
          ]}
        >
          <View style={{ width: cardWidth }}>
            <MetricSlide
              card={card}
              summary={summary}
              loading={loading}
              onInfoPress={() => setExplainCard(card)}
            />
          </View>
        </Animated.View>
      )
    },
    [summary, loading, snapInterval, cardWidth, scrollX],
  )

  return (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        if (w > 0 && w !== viewportWidth) setViewportWidth(w)
      }}
    >
      <AnimatedFlatList
        ref={listRef}
        data={loopCards}
        keyExtractor={(c) => c.key}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: sideInset }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
          listener: (e) => updateActiveIndex(e.nativeEvent.contentOffset.x),
        })}
        onMomentumScrollEnd={(e) => handleLoopRewind(e.nativeEvent.contentOffset.x)}
        onScrollEndDrag={(e) => {
          const vx = e.nativeEvent.velocity?.x ?? 0
          if (Math.abs(vx) < 0.05) handleLoopRewind(e.nativeEvent.contentOffset.x)
        }}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: snapInterval,
          offset: snapInterval * index,
          index,
        })}
      />

      <View style={styles.dotsRow}>
        {cards.map((c, i) => (
          <View
            key={c.key}
            style={[
              styles.dot,
              i === activeIndex ? styles.dotActive : null,
              i === activeIndex ? { backgroundColor: cards[i]?.color || kitPalette.primary[600] } : null,
            ]}
          />
        ))}
        <KitText variant="caption" color={kitPalette.slate[400]} style={styles.dotCounter}>
          {activeIndex + 1}/{cards.length}
        </KitText>
      </View>

      <MetricExplainModal
        card={explainCard}
        visible={!!explainCard}
        onClose={() => setExplainCard(null)}
      />
    </View>
  )
}

export default function ManagerOperasyonOzeti({
  loading,
  reportScope,
  onReportScopeChange,
  jobs = [],
  style,
  headerTitle = 'Rapor Özeti',
  headerSubtitle = 'Operasyon metrikleri — seçili döneme göre',
  scopeOptions = CUBICLE_REPORT_SCOPE_OPTIONS,
  scopeLabelFn = labelForCubicleReportScope,
  filterScopedTasks = filterTasksForCubicleReportScope,
  buildSummary = buildManagerReportSummary,
}) {
  const scopedTasks = useMemo(
    () => filterScopedTasks(jobs, reportScope),
    [jobs, reportScope, filterScopedTasks],
  )

  const reportSummary = useMemo(() => buildSummary(scopedTasks), [scopedTasks, buildSummary])

  return (
    <View style={[styles.shell, style]}>
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={[
            kitPalette.primary[800],
            kitPalette.primary[700],
            kitPalette.primary[600],
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[
            hexToRgba(kitPalette.accent[500], 0.28),
            'transparent',
            hexToRgba(kitPalette.blurple[500], 0.2),
          ]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ReportHeaderPattern />

        <View style={styles.header}>
          <KitIconBubble tone="surface" size="sm" square>
            <Icon.Chart size={16} color={kitPalette.primary[700]} strokeWidth={2} />
          </KitIconBubble>
          <View style={styles.headerText}>
            <KitHeading variant="h3" color={kitPalette.surface}>
              {headerTitle}
            </KitHeading>
            <KitText variant="caption" color="rgba(255,255,255,0.82)">
              {headerSubtitle}
            </KitText>
          </View>
          <ReportScopeDropdown
            value={reportScope}
            onChange={onReportScopeChange}
            options={scopeOptions}
            labelForValue={scopeLabelFn}
          />
        </View>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={kitPalette.primary[600]} />
            <SkeletonCard lines={2} />
          </View>
        ) : (
          <MetricsSlider cards={MANAGER_REPORT_STAT_CARDS} summary={reportSummary} loading={loading} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: kitRadii['2xl'],
    backgroundColor: kitPalette.surface,
    borderWidth: 1,
    borderColor: kitPalette.primary[100],
    overflow: 'hidden',
    ...kitShadows.md,
  },
  headerWrap: {
    paddingHorizontal: kitSpacing.md,
    paddingTop: kitSpacing.md,
    paddingBottom: kitSpacing.md,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: hexToRgba(kitPalette.primary[900], 0.2),
  },
  headerPattern: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  headerStripeA: {
    position: 'absolute',
    width: '140%',
    height: 56,
    top: '18%',
    left: '-20%',
    transform: [{ rotate: '-14deg' }],
    opacity: 0.9,
  },
  headerStripeB: {
    position: 'absolute',
    width: '130%',
    height: 36,
    top: '42%',
    left: '-15%',
    transform: [{ rotate: '-14deg' }],
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerStripeC: {
    position: 'absolute',
    width: '120%',
    height: 24,
    bottom: '8%',
    right: '-25%',
    transform: [{ rotate: '12deg' }],
    backgroundColor: hexToRgba(kitPalette.accent[400], 0.12),
  },
  headerDot: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#fff',
  },
  headerChartSilhouette: {
    position: 'absolute',
    right: kitSpacing.sm,
    bottom: kitSpacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    opacity: 0.95,
  },
  headerChartBar: {
    width: 5,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  headerOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerOrbA: {
    width: 100,
    height: 100,
    top: -36,
    right: -20,
  },
  headerOrbB: {
    width: 64,
    height: 64,
    bottom: -18,
    left: 24,
    backgroundColor: hexToRgba(kitPalette.accent[400], 0.2),
  },
  headerOrbC: {
    width: 48,
    height: 48,
    top: 8,
    left: '38%',
    backgroundColor: hexToRgba(kitPalette.blurple[400], 0.18),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: kitSpacing.sm,
    zIndex: 1,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  scopeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 118,
    paddingHorizontal: kitSpacing.sm,
    paddingVertical: kitSpacing.xs + 2,
    borderRadius: kitRadii.lg,
    backgroundColor: kitPalette.surface,
    borderWidth: 1,
    borderColor: hexToRgba(kitPalette.surface, 0.6),
    ...kitShadows.sm,
    marginTop: 2,
  },
  scopeBackdrop: {
    flex: 1,
    backgroundColor: kitPalette.overlayLight,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 120,
    paddingRight: kitSpacing.lg,
  },
  scopeMenu: {
    minWidth: 168,
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: kitPalette.slate[100],
    paddingVertical: kitSpacing.xs,
    ...kitShadows.lg,
  },
  scopeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: kitSpacing.sm + 2,
    paddingHorizontal: kitSpacing.md,
    gap: kitSpacing.sm,
  },
  scopeMenuItemActive: {
    backgroundColor: kitPalette.primary[50],
  },
  body: {
    paddingTop: kitSpacing.md,
    paddingBottom: kitSpacing.sm + 2,
  },
  loadingWrap: {
    paddingHorizontal: kitSpacing.md,
    gap: kitSpacing.sm,
  },
  slidePage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricSlide: {
    width: '100%',
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...kitShadows.sm,
  },
  metricSlideInner: {
    padding: kitSpacing.md,
    minHeight: 124,
    gap: kitSpacing.sm,
  },
  metricSlideTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: kitSpacing.sm,
  },
  metricTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  slideHint: {
    lineHeight: 15,
  },
  iconWrapLg: {
    width: 40,
    height: 40,
    borderRadius: kitRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kitPalette.slate[100],
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    marginTop: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  metricBarTrack: {
    height: 5,
    borderRadius: kitRadii.full,
    backgroundColor: kitPalette.slate[200],
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: kitRadii.full,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: kitSpacing.xs + 2,
    paddingHorizontal: kitSpacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: kitPalette.slate[200],
  },
  dotActive: {
    width: 18,
    borderRadius: 4,
  },
  dotCounter: {
    marginLeft: kitSpacing.xs,
  },
  explainHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: kitSpacing.md,
    marginBottom: kitSpacing.md,
  },
  explainIcon: {
    width: 48,
    height: 48,
    borderRadius: kitRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainBody: {
    lineHeight: 22,
  },
})
