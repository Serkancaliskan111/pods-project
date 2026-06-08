import React, { useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'

export default function ChatPollBubble({ poll, theme, onVote, voting }) {
  const totalVotes = useMemo(
    () => (poll?.secenekler || []).reduce((sum, o) => sum + (o.oy_sayisi || 0), 0),
    [poll],
  )

  if (!poll) {
    return <Text style={{ color: theme?.textSecondary, fontSize: 13 }}>Anket yükleniyor…</Text>
  }

  return (
    <View style={pollStyles.wrap}>
      <Text style={[pollStyles.question, { color: theme?.textPrimary || '#111' }]}>{poll.soru}</Text>
      {(poll.secenekler || []).map((opt) => {
        const pct = totalVotes > 0 ? Math.round((opt.oy_sayisi / totalVotes) * 100) : 0
        const selected = (poll.benim_oylarim || []).includes(opt.id)
        return (
          <TouchableOpacity
            key={String(opt.id)}
            style={[
              pollStyles.option,
              {
                borderColor: selected ? theme?.accent : theme?.receivedBubbleBorder || '#e2e8f0',
                backgroundColor: selected ? `${theme?.accent || '#2563eb'}14` : 'rgba(0,0,0,0.03)',
              },
            ]}
            activeOpacity={0.8}
            disabled={voting}
            onPress={() => onVote?.(opt.id)}
          >
            <View
              style={[
                pollStyles.fill,
                { width: `${pct}%`, backgroundColor: `${theme?.accent || '#2563eb'}22` },
              ]}
            />
            <Text style={[pollStyles.optionText, { color: theme?.textPrimary || '#111' }]} numberOfLines={2}>
              {opt.metin}
            </Text>
            <Text style={[pollStyles.pct, { color: theme?.textSecondary || '#64748b' }]}>{pct}%</Text>
          </TouchableOpacity>
        )
      })}
      <Text style={[pollStyles.meta, { color: theme?.textSecondary || '#64748b' }]}>
        {totalVotes} oy · {poll.coklu_secim ? 'Çoklu seçim' : 'Tek seçim'}
      </Text>
      {voting ? <ActivityIndicator size="small" color={theme?.accent} style={{ marginTop: 6 }} /> : null}
    </View>
  )
}

const pollStyles = StyleSheet.create({
  wrap: {
    minWidth: 220,
    maxWidth: 280,
    gap: 8,
    paddingVertical: 2,
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  option: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    zIndex: 1,
  },
  pct: {
    position: 'absolute',
    right: 10,
    top: 10,
    fontSize: 12,
    fontWeight: '700',
    zIndex: 1,
  },
  meta: {
    fontSize: 11,
    marginTop: 2,
  },
})
