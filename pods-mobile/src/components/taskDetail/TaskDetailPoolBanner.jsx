import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Icon } from '../../ui'
import { taskDetailStyles as s } from './taskDetailStyles'

export default function TaskDetailPoolBanner({ summary }) {
  if (!summary || summary.memberCount <= 1) return null

  return (
    <View style={s.poolBanner}>
      <View style={styles.header}>
        <View style={s.poolBadge}>
          <Text style={s.poolBadgeText}>Havuz · {summary.memberCount} kişi</Text>
        </View>
        {summary.completerName ? (
          <View style={styles.doneRow}>
            <Icon.Delivered size={14} color="#15803d" strokeWidth={3} />
            <Text style={styles.doneText} numberOfLines={1}>
              Tamamlayan: <Text style={styles.doneName}>{summary.completerName}</Text>
            </Text>
          </View>
        ) : (
          <Text style={styles.hint}>İlk yapan kazanır — kanıt henüz yok</Text>
        )}
      </View>
      <View style={s.poolChipRow}>
        {summary.members.map((m) => (
          <View key={m.id || m.isim} style={[s.poolChip, m.isCompleter && s.poolChipDone]}>
            <View style={styles.chipInner}>
              {m.isCompleter ? (
                <Icon.Delivered size={11} color="#15803d" strokeWidth={3} />
              ) : null}
              <Text style={[s.poolChipText, m.isCompleter && s.poolChipTextDone]} numberOfLines={1}>
                {m.isim}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  doneRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  doneText: { flex: 1, fontSize: 12, color: '#334155' },
  doneName: { color: '#15803d', fontWeight: '800' },
  hint: { fontSize: 12, color: '#64748b', flex: 1 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
