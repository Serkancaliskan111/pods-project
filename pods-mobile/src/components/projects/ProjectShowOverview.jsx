import React, { useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ArrowUpRight,
  AlertTriangle,
  CalendarDays,
  Users,
  ListTree,
  Plus,
  Pencil,
  Building2,
  FolderKanban,
  FileText,
} from 'lucide-react-native'
import { formatProjectDateLabel } from '../../lib/projectGanttUtils'
import { getProjectTaskStatusOption } from '../../lib/projectStatus'
import {
  buildProjectReportSummary,
  filterProjectTasksForReportScope,
  labelForProjectReportScope,
  PROJECT_REPORT_SCOPE_OPTIONS,
} from '../../lib/projectManagerDashboard'
import ManagerOperasyonOzeti from '../home/ManagerOperasyonOzeti'
import {
  Text,
  Heading,
  Card,
  Button,
  IconBubble,
  EmptyState,
  Icon,
  palette,
  spacing,
  radii,
  shadows,
  tones,
  hexToRgba,
} from '../../ui'

const SCREEN_W = Dimensions.get('window').width
const ALERT_CARD_W = Math.min(280, SCREEN_W * 0.72)

function darkenHex(hex, amount = 0.22) {
  const raw = String(hex || '').replace('#', '')
  if (raw.length !== 6) return palette.primary[700]
  const r = Math.max(0, parseInt(raw.slice(0, 2), 16) * (1 - amount))
  const g = Math.max(0, parseInt(raw.slice(2, 4), 16) * (1 - amount))
  const b = Math.max(0, parseInt(raw.slice(4, 6), 16) * (1 - amount))
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
}

function KpiTile({ tone, label, value, IconComp, onPress }) {
  const t = tones[tone] || tones.soft
  const display = String(value ?? 0)
  const isZero = Number(value) === 0
  return (
    <Card tone={tone} padding="sm" radius="xl" interactive onPress={onPress} style={styles.kpiTile}>
      <View style={styles.kpiTileTop}>
        <IconBubble tone={tone} size="sm">
          <IconComp size={16} color={t.icon} strokeWidth={2.2} />
        </IconBubble>
        <ArrowUpRight size={14} color={t.softText} strokeWidth={2.4} />
      </View>
      <Text variant="metricSm" weight="Bold" color={isZero ? palette.slate[400] : t.text} style={styles.kpiValue}>
        {display}
      </Text>
      <Text variant="caption" weight="SemiBold" color={t.softText} numberOfLines={2} style={styles.kpiLabel}>
        {label}
      </Text>
    </Card>
  )
}

function QuickLink({ icon: IconComp, label, hint, onPress, accent }) {
  return (
    <TouchableOpacity style={styles.quickLink} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.quickLinkIcon, { backgroundColor: hexToRgba(accent, 0.12) }]}>
        <IconComp size={18} color={accent} strokeWidth={2.2} />
      </View>
      <Text variant="caption" weight="Bold" color={palette.slate[800]} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

function SectionShell({ title, icon: IconComp, action, children }) {
  return (
    <View style={styles.shell}>
      <View style={styles.shellHead}>
        <IconBubble tone="primary" size="sm" square>
          <IconComp size={16} color={palette.primary[700]} strokeWidth={2.2} />
        </IconBubble>
        <Heading variant="h3" color={palette.slate[900]} style={styles.shellTitle}>
          {title}
        </Heading>
        {action ?? null}
      </View>
      {children}
    </View>
  )
}

function TaskMiniRow({ task, assigneeName, onPress, urgent = false }) {
  const st = getProjectTaskStatusOption(task?.durum)
  return (
    <TouchableOpacity
      style={[styles.taskMini, urgent && styles.taskMiniUrgent]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[styles.taskMiniBar, { backgroundColor: urgent ? palette.danger[500] : st.color }]} />
      <View style={styles.taskMiniBody}>
        <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]} numberOfLines={2}>
          {task?.baslik || 'Görev'}
        </Text>
        <Text variant="caption" color={palette.slate[500]} numberOfLines={1}>
          {assigneeName}
          {task?.bitis_tarihi ? ` · ${formatProjectDateLabel(task.bitis_tarihi)}` : ''}
        </Text>
      </View>
      <ArrowUpRight size={16} color={palette.slate[400]} strokeWidth={2} />
    </TouchableOpacity>
  )
}

export default function ProjectShowOverview({
  project,
  statusOption,
  progress,
  summary,
  kpis,
  alerts,
  reportTasks = [],
  birimLabel,
  teamCount,
  accent,
  mayManage,
  refreshing,
  onRefresh,
  getAssigneeName,
  onJumpToTasks,
  onOpenTask,
  onGoTasks,
  onGoTeam,
  onAssignTask,
  onEditProject,
}) {
  const pct = progress?.pct ?? 0
  const timelinePct = summary?.timelinePct ?? 0
  const gradEnd = darkenHex(accent, 0.18)
  const [reportScope, setReportScope] = useState('30d')

  const kpiCards = useMemo(
    () => [
      {
        key: 'pending',
        tone: 'warning',
        label: 'Bekleyen Görevler',
        value: kpis?.pending ?? 0,
        IconComp: Icon.Clock,
        onPress: () => onJumpToTasks('all', 'pending'),
      },
      {
        key: 'overdue',
        tone: 'danger',
        label: 'Geciken Görevler',
        value: kpis?.overdue ?? 0,
        IconComp: Icon.Warning,
        onPress: () => onJumpToTasks('overdue', 'pending'),
      },
      {
        key: 'completed',
        tone: 'success',
        label: 'Tamamlanan Görevler',
        value: kpis?.completed ?? 0,
        IconComp: Icon.TaskComplete,
        onPress: () => onJumpToTasks('all', 'completed'),
      },
      {
        key: 'all',
        tone: 'primary',
        label: 'Tüm Görevler',
        value: kpis?.total ?? progress?.total ?? 0,
        IconComp: Icon.Tasks,
        onPress: () => onJumpToTasks('all', 'all'),
      },
    ],
    [kpis, progress?.total, onJumpToTasks],
  )

  const visibleAlerts = useMemo(
    () => (alerts || []).filter((a) => a.key !== 'blocked'),
    [alerts],
  )

  const overduePreview = (summary?.overdueTasks || []).slice(0, 5)
  const dueSoonPreview = (summary?.dueSoonTasks || []).slice(0, 5)

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={styles.scrollPad}
      showsVerticalScrollIndicator={false}
    >
      {/* Kokpit hero — ana sayfa gradient hissi */}
      <LinearGradient
        colors={[accent, gradEnd, palette.primary[900]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, shadows.primary]}
      >
        <View pointerEvents="none" style={styles.heroBlobA} />
        <View pointerEvents="none" style={styles.heroBlobB} />

        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <FolderKanban size={22} color="#fff" strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="overline" color="rgba(255,255,255,0.75)">
              PROJE KOKPİT
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.82)" numberOfLines={1} style={{ marginTop: 4 }}>
              {project?.kod || birimLabel || 'Operasyon özeti'}
            </Text>
          </View>
          {statusOption ? (
            <View style={styles.heroStatusPill}>
              <Text variant="caption" weight="Bold" color="#fff">
                {statusOption.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroMetrics}>
          <View style={styles.heroPctCol}>
            <Text variant="displayMd" weight="Bold" color="#fff">
              %{pct}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.78)">
              görev ilerlemesi
            </Text>
          </View>
          <View style={styles.heroBarsCol}>
            <View style={styles.heroBarRow}>
              <Text variant="caption" color="rgba(255,255,255,0.72)" style={styles.heroBarLabel} numberOfLines={1}>
                Görev
              </Text>
              <View style={styles.heroTrack}>
                <View style={[styles.heroFill, { width: `${pct}%` }]} />
              </View>
              <Text variant="caption" weight="Bold" color="#fff">
                {progress?.done ?? 0}/{progress?.total ?? 0}
              </Text>
            </View>
            {summary?.daysTotal != null ? (
              <View style={styles.heroBarRow}>
                <Text variant="caption" color="rgba(255,255,255,0.72)" style={styles.heroBarLabel} numberOfLines={1}>
                  Süre
                </Text>
                <View style={styles.heroTrack}>
                  <View style={[styles.heroFillSoft, { width: `${timelinePct}%` }]} />
                </View>
                <Text variant="caption" weight="Bold" color="#fff">
                  {summary?.daysRemaining != null
                    ? summary.daysRemaining >= 0
                      ? `${summary.daysRemaining}g`
                      : `${Math.abs(summary.daysRemaining)}g+`
                    : '—'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.heroMeta}>
          <View style={styles.heroMetaChip}>
            <CalendarDays size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            <Text variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={1}>
              {formatProjectDateLabel(project?.baslangic_tarihi)} – {formatProjectDateLabel(project?.bitis_tarihi)}
            </Text>
          </View>
          {birimLabel ? (
            <View style={styles.heroMetaChip}>
              <Building2 size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              <Text variant="caption" color="rgba(255,255,255,0.9)" numberOfLines={1}>
                {birimLabel}
              </Text>
            </View>
          ) : null}
          {teamCount > 0 ? (
            <View style={styles.heroMetaChip}>
              <Users size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              <Text variant="caption" color="rgba(255,255,255,0.9)">
                {teamCount} kişi
              </Text>
            </View>
          ) : null}
        </View>

        {summary?.projectPastDue ? (
          <View style={styles.heroWarn}>
            <AlertTriangle size={14} color="#fff" strokeWidth={2.2} />
            <Text variant="caption" weight="SemiBold" color="#fff">
              Proje bitiş tarihi geçti
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      {!mayManage ? (
        <View style={styles.readOnlyBanner}>
          <Text variant="caption" weight="SemiBold" color={palette.warning[700]}>
            Salt okunur — proje yönetimi yetkiniz yok
          </Text>
        </View>
      ) : null}

      {project?.aciklama ? (
        <View style={[styles.noteShell, { borderLeftColor: accent }]}>
          <View style={styles.noteHead}>
            <View style={[styles.noteIcon, { backgroundColor: hexToRgba(accent, 0.12) }]}>
              <FileText size={18} color={accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="overline" weight="Bold" color={palette.slate[500]}>
                PROJE NOTU
              </Text>
              <Heading variant="h3" color={palette.slate[900]} style={{ marginTop: 2 }}>
                Proje hakkında
              </Heading>
            </View>
          </View>
          <Text variant="body" color={palette.slate[700]} style={styles.noteBody}>
            {project.aciklama}
          </Text>
        </View>
      ) : null}

      {/* Hızlı erişim */}
      <View style={styles.quickRow}>
        <QuickLink
          icon={ListTree}
          label="Görevler"
          hint={`${progress?.total ?? 0} görev`}
          accent={accent}
          onPress={onGoTasks}
        />
        <QuickLink
          icon={Users}
          label="Ekip"
          hint={teamCount > 0 ? `${teamCount} kişi` : 'Boş'}
          accent={accent}
          onPress={onGoTeam}
        />
        {mayManage ? (
          <QuickLink icon={Pencil} label="Düzenle" hint="Ayarlar" accent={accent} onPress={onEditProject} />
        ) : (
          <QuickLink
            icon={Icon.Tasks}
            label="Bekleyen"
            hint={`${kpis?.pending ?? 0} aktif`}
            accent={accent}
            onPress={() => onJumpToTasks('all', 'pending')}
          />
        )}
      </View>

      {/* KPI grid — ManagerHomeKpiStrip tarzı */}
      <SectionShell title="Görev özeti" icon={Icon.Tasks}>
        <View style={styles.kpiGrid}>
          {kpiCards.map(({ key: tileKey, tone, label, value, IconComp, onPress }) => (
            <View key={tileKey} style={styles.kpiCell}>
              <KpiTile tone={tone} label={label} value={value} IconComp={IconComp} onPress={onPress} />
            </View>
          ))}
        </View>
      </SectionShell>

      <ManagerOperasyonOzeti
        jobs={reportTasks}
        reportScope={reportScope}
        onReportScopeChange={setReportScope}
        headerSubtitle="Proje görev metrikleri — seçili döneme göre"
        scopeOptions={PROJECT_REPORT_SCOPE_OPTIONS}
        scopeLabelFn={labelForProjectReportScope}
        filterScopedTasks={filterProjectTasksForReportScope}
        buildSummary={buildProjectReportSummary}
      />

      {/* Uyarılar — yatay kaydırma */}
      {visibleAlerts.length > 0 ? (
        <SectionShell title="Dikkat gerektiren" icon={Icon.Warning}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alertScroll}>
            {visibleAlerts.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.alertCard, { width: ALERT_CARD_W }]}
                onPress={() => onJumpToTasks(a.action, 'pending')}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={[palette.danger[50], palette.surface]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.alertGrad}
                >
                  <Text variant="metricSm" weight="Bold" color={palette.danger[700]}>
                    {a.count}
                  </Text>
                  <Text variant="bodySm" weight="Bold" color={palette.slate[900]} style={{ marginTop: 4 }}>
                    {a.title}
                  </Text>
                  <Text variant="caption" color={palette.slate[500]} numberOfLines={2} style={{ marginTop: 2 }}>
                    {a.detail}
                  </Text>
                  <Text variant="caption" weight="Bold" color={palette.primary[600]} style={{ marginTop: spacing.sm }}>
                    Görevleri gör →
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SectionShell>
      ) : null}

      {/* Geciken / yaklaşan */}
      {(overduePreview.length > 0 || dueSoonPreview.length > 0) ? (
        <SectionShell
          title="Odak görevler"
          icon={Icon.Clock}
          action={
            <TouchableOpacity onPress={onGoTasks}>
              <Text variant="caption" weight="Bold" color={palette.primary[600]}>
                Tümü
              </Text>
            </TouchableOpacity>
          }
        >
          {overduePreview.length > 0 ? (
            <>
              <Text variant="overline" weight="Bold" color={palette.danger[600]} style={styles.focusLabel}>
                GECİKEN
              </Text>
              {overduePreview.map((task) => (
                <TaskMiniRow
                  key={String(task.id)}
                  task={task}
                  urgent
                  assigneeName={getAssigneeName(task)}
                  onPress={() => onOpenTask(task)}
                />
              ))}
            </>
          ) : null}
          {dueSoonPreview.length > 0 ? (
            <>
              <Text
                variant="overline"
                weight="Bold"
                color={palette.warning[700]}
                style={[styles.focusLabel, overduePreview.length > 0 && { marginTop: spacing.md }]}
              >
                7 GÜN İÇİNDE
              </Text>
              {dueSoonPreview.map((task) => (
                <TaskMiniRow
                  key={String(task.id)}
                  task={task}
                  assigneeName={getAssigneeName(task)}
                  onPress={() => onOpenTask(task)}
                />
              ))}
            </>
          ) : null}
        </SectionShell>
      ) : null}

      {!summary?.hasTasks ? (
        <EmptyState
          tone="soft"
          icon={<Icon.Tasks size={28} color={palette.primary[600]} strokeWidth={1.75} />}
          title="Henüz görev yok"
          description={mayManage ? 'Görev atayarak projeyi başlatın.' : 'Bu projede henüz planlanmış görev bulunmuyor.'}
          action={
            mayManage ? (
              <Button variant="primary" size="sm" onPress={onAssignTask} iconLeft={<Plus size={16} color="#fff" />}>
                Görev ata
              </Button>
            ) : null
          }
        />
      ) : null}

      {mayManage ? (
        <View style={styles.footerActions}>
          <Button variant="primary" size="md" fullWidth onPress={onAssignTask} iconLeft={<Plus size={18} color="#fff" />}>
            Görev ata
          </Button>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollPad: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  hero: {
    borderRadius: radii['3xl'],
    padding: spacing.lg,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  heroBlobA: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -20,
  },
  heroBlobB: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20,
    left: -10,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  heroPctCol: {
    minWidth: 72,
  },
  heroBarsCol: {
    flex: 1,
    gap: spacing.sm,
  },
  heroBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBarLabel: {
    width: 40,
    flexShrink: 0,
  },
  heroTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  heroFill: {
    height: '100%',
    borderRadius: radii.full,
    backgroundColor: '#fff',
  },
  heroFillSoft: {
    height: '100%',
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  heroMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  heroWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  readOnlyBanner: {
    backgroundColor: palette.warning[50],
    borderRadius: radii.lg,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.warning[100],
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickLink: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    padding: spacing.sm,
    alignItems: 'center',
    gap: 4,
    ...shadows.xs,
  },
  quickLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  shell: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    padding: spacing.md,
    ...shadows.sm,
  },
  shellHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  shellTitle: {
    flex: 1,
    minWidth: 0,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCell: {
    width: '48%',
    flexGrow: 1,
  },
  kpiTile: {
    minHeight: 108,
  },
  kpiTileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  kpiValue: {
    marginBottom: 2,
  },
  kpiLabel: {
    lineHeight: 16,
    minHeight: 32,
  },
  alertScroll: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  alertCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.danger[100],
  },
  alertGrad: {
    padding: spacing.md,
    minHeight: 120,
  },
  focusLabel: {
    marginBottom: spacing.sm,
  },
  taskMini: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.slate[50],
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[100],
  },
  taskMiniUrgent: {
    backgroundColor: palette.danger[50],
    borderColor: palette.danger[100],
  },
  taskMiniBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  taskMiniBody: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minWidth: 0,
  },
  footerActions: {
    marginTop: spacing.xs,
  },
  noteShell: {
    backgroundColor: palette.surface,
    borderRadius: radii['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    borderLeftWidth: 4,
    padding: spacing.lg,
    ...shadows.sm,
  },
  noteHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  noteIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBody: {
    lineHeight: 24,
  },
})
