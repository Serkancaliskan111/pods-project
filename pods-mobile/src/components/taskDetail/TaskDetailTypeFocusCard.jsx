import React from 'react'
import { View, Text } from 'react-native'
import { taskDetailStyles as s } from './taskDetailStyles'

/**
 * Görev tipine göre odak / yönlendirme kartı (6 mod).
 */
export default function TaskDetailTypeFocusCard({ design }) {
  if (!design) return null
  const TypeIcon = design.Icon
  const accent = design.accent || '#2563EB'

  return (
    <View style={[s.focusCard, { borderColor: `${accent}33`, backgroundColor: `${accent}0A` }]}>
      <View style={[s.focusIconWrap, { backgroundColor: `${accent}18` }]}>
        {TypeIcon ? <TypeIcon size={20} color={accent} strokeWidth={2.2} /> : null}
      </View>
      <Text style={[s.focusTitle, { color: accent }]}>{design.focusTitle}</Text>
      <Text style={[s.focusHint, { color: '#475569' }]}>
        {design.focusHint}
      </Text>
    </View>
  )
}
