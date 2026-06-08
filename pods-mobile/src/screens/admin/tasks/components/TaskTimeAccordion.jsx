import React, { useEffect, useMemo, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Text, cubicle, spacing, radii } from '../../../../ui'

export const SECTION_COLORS = {
  today: cubicle.todayBar,
  tomorrow: '#5B8DEF',
  yesterday: '#8B5CF6',
  week: '#6366F1',
  last7: '#6366F1',
  other: '#64748B',
}

function buildDefaultOpenMap(sections) {
  const map = {}
  for (const s of sections || []) {
    map[s.key] = (s.tasks?.length ?? 0) > 0
  }
  return map
}

export function TaskTimeSectionHeader({ label, count, color, open, onToggle, subtitle }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onToggle}
      style={[styles.sectionHeader, { backgroundColor: color }]}
    >
      <View style={styles.headerTextCol}>
        <Text variant="bodySm" weight="Bold" color="#FFFFFF">
          {label} ({count})
        </Text>
        {subtitle ? (
          <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {open ? (
        <ChevronDown size={20} color="#FFFFFF" strokeWidth={2.2} />
      ) : (
        <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.2} />
      )}
    </TouchableOpacity>
  )
}

/** Accordion list — varsayılan: yalnızca dolu bölümler açık */
export default function TaskTimeAccordion({ sections, renderTask, defaultOpenNonEmpty = true }) {
  const normalized = useMemo(() => sections || [], [sections])
  const [openKeys, setOpenKeys] = useState(() =>
    defaultOpenNonEmpty ? buildDefaultOpenMap(normalized) : Object.fromEntries(normalized.map((s) => [s.key, true])),
  )

  useEffect(() => {
    setOpenKeys(defaultOpenNonEmpty ? buildDefaultOpenMap(normalized) : Object.fromEntries(normalized.map((s) => [s.key, true])))
  }, [normalized, defaultOpenNonEmpty])

  const toggle = (key) => setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }))

  if (!normalized.length) return null

  return (
    <View style={styles.wrap}>
      {normalized.map((section) => {
        const open = openKeys[section.key] ?? false
        const color = section.color || SECTION_COLORS[section.key] || cubicle.todayBar
        const count = section.tasks?.length ?? 0
        return (
          <View key={section.key} style={styles.section}>
            <TaskTimeSectionHeader
              label={section.label}
              count={count}
              color={color}
              open={open}
              subtitle={section.subtitle}
              onToggle={() => toggle(section.key)}
            />
            {open ? (
              <View style={styles.sectionBody}>
                {!count ? (
                  <Text variant="caption" color="#64748B" style={styles.emptyText}>
                    {section.emptyText}
                  </Text>
                ) : (
                  section.tasks.map((task) => (
                    <View key={String(task.id)} style={styles.cardGap}>
                      {renderTask(task)}
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.sm,
  },
  sectionBody: {
    gap: spacing.sm,
    paddingLeft: 2,
  },
  emptyText: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  cardGap: {
    marginBottom: 0,
  },
})
