import React from 'react'
import { View, Text } from 'react-native'
import { normalizeJsonObject } from '../../screens/taskDetail/normalize'
import { taskDetailStyles as s } from './taskDetailStyles'

const ROLE_COPY = {
  worker: {
    header: 'Aktif adımınız',
    hint: 'Aşağıdaki forma kanıt ve açıklama ekleyerek adımı denetime gönderin.',
    variant: s.siraliBannerWorker,
  },
  auditor: {
    header: 'Onayınızı bekleyen adım',
    hint: 'Adımın kanıtlarını inceleyin; onaylayın veya gerekçe ile reddedin.',
    variant: s.siraliBannerAuditor,
  },
  rejected: {
    header: 'Adımınız reddedildi',
    hint: 'Denetimci adımınızı reddetti — kanıt/açıklamayı düzenleyip yeniden gönderin.',
    variant: s.siraliBannerRejected,
  },
  approved: {
    header: 'Adımınız onaylandı',
    hint: 'Bu adım sizin için tamamlandı; sıralı görev sonraki adımlarla devam ediyor.',
    variant: s.siraliBannerDone,
  },
  pending: {
    header: 'Adımınız denetimde',
    hint: 'Denetimci onayı bekleniyor; onaylandığında sıradaki adım açılır.',
    variant: s.siraliBannerAuditor,
  },
  waiting: {
    header: 'Sıranızı bekliyor',
    hint: 'Önceki adım onaylandığında sıra otomatik olarak size geçecek.',
    variant: s.siraliBannerWaiting,
  },
}

export default function TaskDetailSiraliRoleBanner({
  info,
  totalSteps,
  formatTs,
  chainPersonNameMap,
  personLabelOrRef,
}) {
  if (!info?.step) return null
  const { role, step } = info
  const copy = ROLE_COPY[role] || ROLE_COPY.waiting
  const adimNo = Number(step?.adim_no) || 0
  const stepTitle = String(step?.adim_baslik || '').trim() || `Adım ${adimNo || '-'}`
  const ist = normalizeJsonObject(step?.adim_istenenler)
  const stepAciklama = String(ist?.aciklama || step?.aciklama || '').trim()
  const stepBitis = ist?.bitis_tarihi || null
  const stepAcil = !!ist?.acil
  const yapanName =
    chainPersonNameMap[String(step?.personel_id)] ||
    personLabelOrRef(null, step?.personel_id)
  const denetimciName = step?.denetimci_personel_id
    ? chainPersonNameMap[String(step.denetimci_personel_id)] ||
      personLabelOrRef(null, step.denetimci_personel_id)
    : '—'

  return (
    <View style={[s.siraliBanner, copy.variant]}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{adimNo || '-'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerText}>{copy.header}</Text>
          <Text style={styles.subText}>
            Adım {adimNo || '-'} / {totalSteps}
          </Text>
        </View>
        {stepAcil ? (
          <View style={styles.urgentChip}>
            <Text style={styles.urgentText}>ACİL</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{stepTitle}</Text>
      {stepAciklama ? <Text style={styles.body}>{stepAciklama}</Text> : null}
      <View style={styles.metaGrid}>
        {role === 'auditor' ? (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Yapan</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {yapanName}
            </Text>
          </View>
        ) : (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Denetimci</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {denetimciName}
            </Text>
          </View>
        )}
        {stepBitis ? (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Bitiş</Text>
            <Text style={styles.metaValue}>{formatTs(stepBitis)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>{copy.hint}</Text>
    </View>
  )
}

const styles = {
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgeText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  headerText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  subText: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
  urgentChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ef4444',
  },
  urgentText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  body: { fontSize: 13, lineHeight: 20, color: '#334155', marginTop: 4 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaCell: { minWidth: 100 },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  hint: { fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 18 },
}
