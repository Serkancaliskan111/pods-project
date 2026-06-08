import React, { useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView, Text as RNText } from 'react-native'
import {
  Text as KitText,
  Heading as KitHeading,
  Avatar as KitAvatar,
  CenterModal as KitCenterModal,
  Button as KitButton,
  palette as kitPalette,
  spacing as kitSpacing,
  radii as kitRadii,
  Icon,
} from '../../ui'
import { AVATAR_TEMPLATES } from '../../lib/avatarTemplates'
import {
  AVATAR_PREF_INITIAL,
  HOME_AVATAR_EMOJI_OPTIONS,
  formatEmojiAvatarPreference,
  parseAvatarPreference,
} from '../../lib/avatarPreference'

export default function HomeAvatarPickerModal({
  visible,
  onClose,
  value,
  displayName,
  onSelect,
}) {
  const parsed = useMemo(() => parseAvatarPreference(value), [value])

  const pick = (next) => {
    onSelect?.(next)
    onClose?.()
  }

  return (
    <KitCenterModal visible={visible} onClose={onClose} padding="lg" maxWidth={400}>
      <KitHeading variant="h3" style={styles.title}>
        Profil görünümü
      </KitHeading>
      <KitText variant="bodySm" color={kitPalette.slate[500]} style={styles.subtitle}>
        Ana sayfadaki puan kartında görünecek avatarı seçin.
      </KitText>

      <KitText variant="overline" color={kitPalette.slate[600]} style={styles.sectionLabel}>
        İsim avatarı
      </KitText>
      <TouchableOpacity
        style={[
          styles.initialOption,
          parsed.kind === 'initial' && styles.optionSelected,
        ]}
        onPress={() => pick(AVATAR_PREF_INITIAL)}
        activeOpacity={0.85}
      >
        <KitAvatar name={displayName} size="md" elevated />
        <View style={styles.initialCopy}>
          <KitText variant="bodySm" weight="SemiBold" color={kitPalette.slate[800]}>
            Baş harfler
          </KitText>
          <KitText variant="caption" color={kitPalette.slate[500]}>
            {displayName || 'Adınızdan oluşturulur'}
          </KitText>
        </View>
        {parsed.kind === 'initial' ? (
          <Icon.Success size={18} color={kitPalette.primary[700]} strokeWidth={2.2} />
        ) : null}
      </TouchableOpacity>

      <KitText variant="overline" color={kitPalette.slate[600]} style={styles.sectionLabel}>
        Profil ikonları
      </KitText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.iconRow}
      >
        {AVATAR_TEMPLATES.map((tpl) => {
          const IconComp = tpl.icon
          const active = parsed.kind === 'template' && parsed.id === tpl.id
          return (
            <TouchableOpacity
              key={tpl.id}
              style={[styles.iconOption, active && styles.optionSelected]}
              onPress={() => pick(tpl.id)}
              activeOpacity={0.85}
              accessibilityLabel={tpl.label}
            >
              <View style={[styles.iconBubble, { backgroundColor: tpl.bg }]}>
                <IconComp size={22} color={tpl.fg} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <KitText variant="overline" color={kitPalette.slate[600]} style={styles.sectionLabel}>
        Emoji
      </KitText>
      <View style={styles.emojiGrid}>
        {HOME_AVATAR_EMOJI_OPTIONS.map((emoji) => {
          const pref = formatEmojiAvatarPreference(emoji)
          const active = parsed.kind === 'emoji' && parsed.emoji === emoji
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.emojiOption, active && styles.optionSelected]}
              onPress={() => pick(pref)}
              activeOpacity={0.85}
            >
              <RNText style={styles.emojiText}>{emoji}</RNText>
            </TouchableOpacity>
          )
        })}
      </View>

      <KitButton variant="secondary" size="md" fullWidth onPress={onClose} style={styles.closeBtn}>
        Kapat
      </KitButton>
    </KitCenterModal>
  )
}

const styles = StyleSheet.create({
  title: {
    marginBottom: kitSpacing.xs,
  },
  subtitle: {
    marginBottom: kitSpacing.lg,
  },
  sectionLabel: {
    marginBottom: kitSpacing.sm,
  },
  initialOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kitSpacing.md,
    padding: kitSpacing.md,
    borderRadius: kitRadii.xl,
    borderWidth: 1,
    borderColor: kitPalette.slate[200],
    backgroundColor: kitPalette.slate[50],
    marginBottom: kitSpacing.lg,
  },
  initialCopy: {
    flex: 1,
    minWidth: 0,
  },
  iconRow: {
    gap: kitSpacing.sm,
    paddingBottom: kitSpacing.lg,
  },
  iconOption: {
    padding: 4,
    borderRadius: kitRadii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: kitSpacing.sm,
    marginBottom: kitSpacing.lg,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: kitRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kitPalette.slate[50],
    borderWidth: 2,
    borderColor: kitPalette.slate[200],
  },
  emojiText: {
    fontSize: 22,
    lineHeight: 26,
  },
  optionSelected: {
    borderColor: kitPalette.primary[400],
    backgroundColor: kitPalette.primary[50],
  },
  closeBtn: {
    marginTop: kitSpacing.xs,
  },
})
