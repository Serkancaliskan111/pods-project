import React, { useState } from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import {
  Text as KitText,
  Heading as KitHeading,
  Button,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  shadows as kitShadows,
  cubicle,
} from '../../ui'
import {
  CUBICLE_REPORT_SCOPE_OPTIONS,
  labelForCubicleReportScope,
} from '../../lib/cubicleHomeTaskBuckets'

const REPORT_DOT = {
  todo: cubicle.statusTodo,
  onTime: cubicle.statusOnTime,
  overdue: cubicle.statusOverdue,
  waiting: cubicle.statusWaiting,
  cancelled: cubicle.statusCancelled,
}

function ScopePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const label = labelForCubicleReportScope(value)

  return (
    <>
      <TouchableOpacity style={styles.scopeBtn} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <KitText variant="caption" weight="SemiBold" color={kitPalette.slate[700]}>
          {label}
        </KitText>
        <ChevronDown size={14} color={kitPalette.slate[500]} strokeWidth={2.2} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={styles.modalSheet}>
          <KitHeading variant="h3" style={{ marginBottom: kitSpacing.md }}>
            Rapor aralığı
          </KitHeading>
          {CUBICLE_REPORT_SCOPE_OPTIONS.map((opt) => {
            const active = opt.value === value
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.scopeOption, active && styles.scopeOptionActive]}
                onPress={() => {
                  onChange?.(opt.value)
                  setOpen(false)
                }}
              >
                <KitText
                  variant="bodySm"
                  weight={active ? 'Bold' : 'Medium'}
                  color={active ? kitPalette.primary[700] : kitPalette.slate[700]}
                >
                  {opt.label}
                </KitText>
              </TouchableOpacity>
            )
          })}
        </View>
      </Modal>
    </>
  )
}

export default function CubicleReportPanel({
  loading,
  reportRows = [],
  reportTotal = 0,
  reportScope,
  onReportScopeChange,
  onOpenAllTasks,
  fetchError,
  onRetry,
  style,
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <KitHeading variant="h3" color={kitPalette.slate[800]}>
          Raporlar
        </KitHeading>
        <ScopePicker value={reportScope} onChange={onReportScopeChange} />
      </View>

      {fetchError ? (
        <View style={styles.errorBox}>
          <KitText variant="caption" color={kitPalette.danger[700]}>
            {fetchError}
          </KitText>
          {onRetry ? (
            <Button variant="secondary" size="sm" onPress={onRetry} style={{ marginTop: kitSpacing.sm }}>
              Yeniden dene
            </Button>
          ) : null}
        </View>
      ) : null}

      <View style={styles.tableHead}>
        <KitText variant="overline" color={kitPalette.slate[400]} style={styles.colStatus}>
          Durum
        </KitText>
        <KitText variant="overline" color={kitPalette.slate[400]} style={styles.colBar}>
          Oran
        </KitText>
        <KitText variant="overline" color={kitPalette.slate[400]} style={styles.colCount}>
          Sayı
        </KitText>
      </View>

      {loading ? (
        <ActivityIndicator color={kitPalette.primary[600]} style={{ marginVertical: kitSpacing.lg }} />
      ) : (
        <View style={styles.rows}>
          {reportRows.map((row) => {
            const dot = REPORT_DOT[row.key] || row.color
            const barPct = Math.max(row.count > 0 ? 8 : 0, Math.round(row.pct * 100))
            return (
              <View key={row.key} style={styles.row}>
                <View style={styles.statusCell}>
                  <View style={[styles.dot, { backgroundColor: dot }]} />
                  <KitText variant="bodySm" weight="Medium" color={kitPalette.slate[700]} numberOfLines={1}>
                    {row.label}
                  </KitText>
                </View>
                <View style={styles.colBar}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${barPct}%`,
                          backgroundColor: row.count > 0 ? row.color : kitPalette.slate[200],
                        },
                      ]}
                    />
                  </View>
                </View>
                <KitText variant="bodySm" weight="Bold" color={kitPalette.slate[800]} style={styles.colCount}>
                  {row.count}
                </KitText>
              </View>
            )
          })}
        </View>
      )}

      <KitText variant="caption" color={kitPalette.slate[500]} style={styles.footer}>
        {reportTotal === 0 && !loading
          ? 'Seçilen aralıkta görev bulunamadı.'
          : `Özet: ${reportTotal} görev (${labelForCubicleReportScope(reportScope)}).`}
      </KitText>

      {onOpenAllTasks ? (
        <TouchableOpacity onPress={onOpenAllTasks} activeOpacity={0.85} style={styles.link}>
          <KitText variant="caption" weight="Bold" color={kitPalette.primary[600]}>
            Tüm görevlere git →
          </KitText>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: cubicle.border,
    padding: kitSpacing.lg,
    ...kitShadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: kitSpacing.md,
    gap: kitSpacing.sm,
  },
  scopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: kitSpacing.sm,
    paddingVertical: kitSpacing.xs,
    borderRadius: kitRadii.lg,
    backgroundColor: kitPalette.slate[50],
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: kitSpacing.sm,
    gap: kitSpacing.sm,
  },
  colStatus: {
    flex: 1,
    letterSpacing: 0.5,
  },
  colBar: {
    flex: 1.4,
    letterSpacing: 0.5,
  },
  colCount: {
    width: 36,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  rows: {
    gap: kitSpacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.sm,
  },
  statusCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: kitSpacing.xs,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: kitRadii.pill,
    backgroundColor: kitPalette.slate[100],
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: kitRadii.pill,
  },
  footer: {
    marginTop: kitSpacing.md,
    lineHeight: 16,
  },
  link: {
    marginTop: kitSpacing.sm,
  },
  errorBox: {
    marginBottom: kitSpacing.sm,
    padding: kitSpacing.sm,
    borderRadius: kitRadii.lg,
    backgroundColor: kitPalette.danger[50],
    borderWidth: 1,
    borderColor: kitPalette.danger[100],
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    left: kitSpacing.lg,
    right: kitSpacing.lg,
    bottom: kitSpacing['2xl'],
    backgroundColor: kitPalette.surface,
    borderRadius: kitRadii['2xl'],
    padding: kitSpacing.lg,
    ...kitShadows.lg,
  },
  scopeOption: {
    paddingVertical: kitSpacing.md,
    paddingHorizontal: kitSpacing.sm,
    borderRadius: kitRadii.lg,
  },
  scopeOptionActive: {
    backgroundColor: kitPalette.primary[50],
  },
})
