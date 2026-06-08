import React from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { CheckCircle2, Clock, CalendarClock, ChevronRight } from 'lucide-react-native'
import { Screen, Heading, Text, palette, spacing, radii } from '../ui'
import { useTabBarScrollPadding } from '../navigation/tabBarLayout'

function HubCard({ icon: IconComp, tone, title, subtitle, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[styles.card, { borderLeftColor: tone }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${tone}18` }]}>
        <IconComp size={26} color={tone} strokeWidth={2} />
      </View>
      <View style={styles.cardBody}>
        <Text variant="bodyMd" weight="Bold" color={palette.slate[900]}>
          {title}
        </Text>
        <Text variant="bodySm" color={palette.slate[500]} style={styles.cardSub}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={22} color={palette.slate[300]} strokeWidth={2} />
    </TouchableOpacity>
  )
}

/**
 * Görevler sekmesi — doğrudan bekleyen / tamamlanan listelerine giden mobil hub.
 */
export default function TasksTabPlaceholder() {
  const navigation = useNavigation()
  const tabBarPad = useTabBarScrollPadding(spacing.md)

  return (
    <Screen padded topInset>
      <View style={[styles.wrap, { paddingBottom: tabBarPad }]}>
        <Heading variant="h1">Görevler</Heading>
        <Text variant="bodySm" color={palette.slate[500]} style={styles.hint}>
          Listeyi seçin veya alttaki Görevler menüsünden hızlıca geçiş yapın.
        </Text>

        <HubCard
          icon={Clock}
          tone={palette.primary[600]}
          title="Bekleyen görevler"
          subtitle="Bugün, yarın ve önümüzdeki 7 gün"
          onPress={() => navigation.navigate('TasksPending', { listMode: 'pending' })}
        />

        <HubCard
          icon={CheckCircle2}
          tone={palette.success[600]}
          title="Tamamlanan görevler"
          subtitle="Onaylanmış görev geçmişi"
          onPress={() => navigation.navigate('TasksCompleted', { listMode: 'completed' })}
        />

        <HubCard
          icon={CalendarClock}
          tone={palette.blurple[500]}
          title="Yaklaşan görevler"
          subtitle="Henüz görünür olmayan planlı işler"
          onPress={() => navigation.navigate('TasksUpcoming', { listMode: 'upcoming' })}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  hint: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.slate[100],
    borderLeftWidth: 4,
    minHeight: 84,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardSub: {
    lineHeight: 20,
  },
})
