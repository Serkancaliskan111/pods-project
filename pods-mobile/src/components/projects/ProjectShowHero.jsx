import React from 'react'
import { View, StyleSheet } from 'react-native'
import { FolderKanban, CalendarDays, Users, Building2 } from 'lucide-react-native'
import { Text, StatusBadge, palette, spacing, radii } from '../../ui'
import { formatProjectDateLabel } from '../../lib/projectGanttUtils'
import { adminStyles } from '../../screens/admin/adminScreenUtils'

function MetaChip({ icon: Icon, label }) {
  if (!label) return null
  return (
    <View style={styles.metaChip}>
      <Icon size={13} color={palette.slate[500]} strokeWidth={2} />
      <Text variant="caption" color={palette.slate[600]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export default function ProjectShowHero({
  project,
  statusOption,
  progress,
  summary,
  birimLabel,
  teamCount,
  accent,
}) {
  const dateLabel = `${formatProjectDateLabel(project?.baslangic_tarihi)} – ${formatProjectDateLabel(project?.bitis_tarihi)}`
  const pct = progress?.pct ?? 0

  return (
    <View style={[styles.wrap, { borderColor: `${accent}33` }]}>
      <View style={[styles.accentBand, { backgroundColor: `${accent}14` }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.iconBox, { backgroundColor: accent }]}>
            <FolderKanban size={22} color="#fff" strokeWidth={1.75} />
          </View>
          <View style={styles.titleCol}>
            <Text variant="h2" weight="Bold" color={palette.slate[900]} numberOfLines={2}>
              {project?.baslik || 'Proje'}
            </Text>
            {project?.kod ? (
              <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 2 }}>
                {project.kod}
              </Text>
            ) : null}
          </View>
          {statusOption ? (
            <StatusBadge tone={statusOption.tone} size="sm">
              {statusOption.label}
            </StatusBadge>
          ) : null}
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressHead}>
            <Text variant="bodySm" weight="SemiBold" color={palette.slate[700]}>
              İlerleme
            </Text>
            <Text variant="bodySm" weight="Bold" color={accent}>
              %{pct}
            </Text>
          </View>
          <View style={adminStyles.progressTrack}>
            <View style={[adminStyles.progressFill, { width: `${pct}%`, backgroundColor: accent }]} />
          </View>
          <Text variant="caption" color={palette.slate[500]} style={{ marginTop: spacing.xs }}>
            {progress?.done ?? 0}/{progress?.total ?? 0} görev tamamlandı
            {summary?.overdueTasks?.length
              ? ` · ${summary.overdueTasks.length} geciken`
              : ''}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <MetaChip icon={CalendarDays} label={dateLabel} />
          {birimLabel ? <MetaChip icon={Building2} label={birimLabel} /> : null}
          {teamCount > 0 ? (
            <MetaChip icon={Users} label={`${teamCount} ekip üyesi`} />
          ) : null}
        </View>

        {summary?.projectPastDue ? (
          <View style={styles.warnBox}>
            <Text variant="caption" weight="SemiBold" color={palette.danger[700]}>
              Proje bitiş tarihi geçti
            </Text>
          </View>
        ) : null}

        {summary?.daysRemaining != null && !summary?.projectPastDue && project?.durum !== 'tamamlandi' ? (
          <Text variant="caption" color={palette.slate[500]}>
            {summary.daysRemaining >= 0
              ? `${summary.daysRemaining} gün kaldı`
              : `${Math.abs(summary.daysRemaining)} gün gecikme`}
          </Text>
        ) : null}

        {project?.aciklama ? (
          <Text variant="bodySm" color={palette.slate[600]} style={styles.desc}>
            {project.aciklama}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: palette.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  accentBand: {
    height: 4,
    width: '100%',
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  progressBlock: {
    marginTop: spacing.xs,
  },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.slate[50],
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  warnBox: {
    backgroundColor: palette.danger[50],
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  desc: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
})
