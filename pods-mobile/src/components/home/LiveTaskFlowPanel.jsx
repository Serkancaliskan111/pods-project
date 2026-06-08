import React from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native'
import {
  Text as KitText,
  Section as KitSection,
  Card as KitCard,
  EmptyState as KitEmptyState,
  StatusBadge as KitStatusBadge,
  IconBubble as KitIconBubble,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  Icon,
} from '../../ui'
import { extractKanitPhotoUrls } from '../../lib/liveFieldAuditFeed'
import { normalizeTaskStatus, TASK_STATUS } from '../../lib/taskStatus'

function getFirstPhotoUrl(job) {
  return extractKanitPhotoUrls(job)[0] ?? null
}

function mapAuditStatusMeta(durum) {
  const status = normalizeTaskStatus(durum)
  if (status === TASK_STATUS.PENDING_APPROVAL) return { label: TASK_STATUS.PENDING_APPROVAL, color: 'pending' }
  if (status === TASK_STATUS.RESUBMITTED) return { label: TASK_STATUS.RESUBMITTED, color: 'accent' }
  if (status === TASK_STATUS.APPROVED) return { label: TASK_STATUS.APPROVED, color: 'success' }
  if (status === TASK_STATUS.REJECTED) return { label: TASK_STATUS.REJECTED, color: 'rejected' }
  if (status === TASK_STATUS.ASSIGNED) return { label: TASK_STATUS.ASSIGNED, color: 'pending' }
  return { label: String(status || durum || 'Durum'), color: 'pending' }
}

function badgeToneFromMeta(meta) {
  if (meta.color === 'success') return 'success'
  if (meta.color === 'accent') return 'blurple'
  return 'warning'
}

export default function LiveTaskFlowPanel({ jobs = [], loading, onOpenTask, style }) {
  return (
    <KitSection
      title="Canlı Görev Akışı"
      subtitle="Anlık görev ve kanıt akışı"
      icon={
        <KitIconBubble tone="success" size="md">
          <Icon.LiveFlow size={18} color={kitPalette.success[700]} strokeWidth={2} />
        </KitIconBubble>
      }
      style={style}
    >
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={kitPalette.primary[700]} />
        </View>
      ) : jobs.length === 0 ? (
        <KitEmptyState
          tone="soft"
          icon={<Icon.LiveFlow size={28} color={kitPalette.slate[400]} strokeWidth={1.6} />}
          title="Henüz görev akışı yok"
          description="Personeller görev kanıtı gönderdikçe burada anlık olarak görünür."
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          contentContainerStyle={styles.feedScroll}
        >
          {jobs.map((item) => {
            const thumbKind =
              item?.thumb_kind ||
              (item?.thumb_url || getFirstPhotoUrl(item) ? 'photo' : null)
            const thumb =
              thumbKind === 'video'
                ? item?.thumb_url
                : item?.thumb_url || getFirstPhotoUrl(item)
            const showVideoTile = thumbKind === 'video' && !!thumb
            const meta = mapAuditStatusMeta(item?.durum)

            return (
              <KitCard
                key={item.id}
                tone="surface"
                padding="none"
                radius="2xl"
                elevated
                interactive
                onPress={() => onOpenTask?.(item)}
                style={styles.feedCard}
              >
                {showVideoTile ? (
                  <View style={styles.feedVideoThumb}>
                    <Icon.Video size={26} color={kitPalette.surface} strokeWidth={2} />
                    <KitText variant="overline" color={kitPalette.surface}>
                      Video kanıt
                    </KitText>
                  </View>
                ) : thumb ? (
                  <Image source={{ uri: thumb }} style={styles.feedImg} resizeMode="cover" />
                ) : (
                  <View style={styles.feedFallback}>
                    <Icon.Photo size={24} color={kitPalette.slate[500]} strokeWidth={1.8} />
                    <KitText variant="overline" color={kitPalette.slate[500]}>
                      Kanıt yok
                    </KitText>
                  </View>
                )}
                <View style={styles.feedBody}>
                  <KitText variant="bodySm" weight="Bold" numberOfLines={1}>
                    {item.baslik || 'İş'}
                  </KitText>
                  <KitText variant="caption" color={kitPalette.slate[500]} numberOfLines={1}>
                    {item.sorumlu_personel_adi || 'Personel'}
                  </KitText>
                  <View style={styles.feedFooter}>
                    <KitStatusBadge tone={badgeToneFromMeta(meta)} size="sm">
                      {meta.label}
                    </KitStatusBadge>
                  </View>
                </View>
              </KitCard>
            )
          })}
        </ScrollView>
      )}
    </KitSection>
  )
}

const styles = StyleSheet.create({
  loadingWrap: {
    paddingVertical: kitSpacing.xl,
    alignItems: 'center',
  },
  feedScroll: {
    paddingRight: kitSpacing.lg,
    gap: kitSpacing.md,
  },
  feedCard: {
    width: 200,
  },
  feedImg: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: kitRadii['2xl'],
    borderTopRightRadius: kitRadii['2xl'],
  },
  feedFallback: {
    width: '100%',
    height: 120,
    backgroundColor: kitPalette.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: kitRadii['2xl'],
    borderTopRightRadius: kitRadii['2xl'],
    gap: 4,
  },
  feedVideoThumb: {
    width: '100%',
    height: 120,
    backgroundColor: kitPalette.primary[700],
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: kitRadii['2xl'],
    borderTopRightRadius: kitRadii['2xl'],
    gap: 4,
  },
  feedBody: {
    padding: kitSpacing.md,
    gap: 4,
  },
  feedFooter: {
    marginTop: kitSpacing.xs,
  },
})
