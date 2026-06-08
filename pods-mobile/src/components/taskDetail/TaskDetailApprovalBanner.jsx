import React from 'react'
import { View, Text } from 'react-native'
import { Icon } from '../../ui'
import { taskDetailStyles as s } from './taskDetailStyles'

export default function TaskDetailApprovalBanner({ summary, formatTs }) {
  if (!summary) return null

  return (
    <View style={s.approvalBanner}>
      <View style={s.approvalIcon}>
        <Icon.Delivered size={18} color="#15803d" strokeWidth={3} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.approvalTitle}>
          {summary.isApproverScope ? 'Onayınız tamamlandı' : 'Görev tamamlandı'}
        </Text>
        {summary.stepLabel ? <Text style={s.approvalStep}>{summary.stepLabel}</Text> : null}
        <View style={s.approvalMetaRow}>
          {summary.completedAt ? (
            <View>
              <Text style={s.approvalMetaLabel}>Onay zamanı</Text>
              <Text style={s.approvalMetaValue}>{formatTs(summary.completedAt)}</Text>
            </View>
          ) : null}
          {summary.denetimciName ? (
            <View>
              <Text style={s.approvalMetaLabel}>Denetimci</Text>
              <Text style={s.approvalMetaValue} numberOfLines={1}>
                {summary.denetimciName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}
