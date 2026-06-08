import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native'
import { BarChart3, Camera, FileText, Images, MapPin } from 'lucide-react-native'

export const CHAT_ATTACHMENT_SHEET_HEIGHT = 300

const ICONS = {
  gallery: Images,
  camera: Camera,
  location: MapPin,
  document: FileText,
  poll: BarChart3,
}

/**
 * WhatsApp + paneli — klavye alanında açılan ek grid’i.
 */
export default function ChatAttachmentSheet({ visible, theme, onPick, bottomInset = 0 }) {
  const [mounted, setMounted] = useState(visible)
  const slide = useRef(new Animated.Value(CHAT_ATTACHMENT_SHEET_HEIGHT)).current

  useEffect(() => {
    if (visible) {
      setMounted(true)
      slide.setValue(CHAT_ATTACHMENT_SHEET_HEIGHT)
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start()
      return
    }
    if (!mounted) return
    Animated.timing(slide, {
      toValue: CHAT_ATTACHMENT_SHEET_HEIGHT,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false)
    })
  }, [visible, slide, mounted])

  if (!mounted) return null

  const items = [
    { key: 'gallery', label: 'Fotoğraflar', bg: theme.attachment.gallery },
    { key: 'camera', label: 'Kamera', bg: theme.attachment.camera },
    { key: 'location', label: 'Konum', bg: theme.attachment.location },
    { key: 'document', label: 'Belge', bg: theme.attachment.document },
    { key: 'poll', label: 'Anket', bg: theme.attachment.poll },
  ]

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.sheetBg,
          borderTopColor: theme.sheetBorder || 'rgba(0,0,0,0.08)',
          paddingBottom: bottomInset,
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <View style={styles.grid}>
        {items.map((item) => {
          const IconComp = ICONS[item.key]
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.cell}
              activeOpacity={0.75}
              onPress={() => onPick?.(item.key)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                <IconComp size={26} color="#FFFFFF" strokeWidth={2} />
              </View>
              <Text style={[styles.label, { color: theme.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    height: CHAT_ATTACHMENT_SHEET_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 18,
    gap: 8,
  },
  cell: {
    width: '23%',
    minWidth: 72,
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
})
