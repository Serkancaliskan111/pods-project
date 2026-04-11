import React, { useMemo } from 'react'
import { Text, View, StyleSheet } from 'react-native'
import ImageViewing from 'react-native-image-viewing'
import Theme from '../theme/theme'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography } = ThemeObj

export default function PhotoViewerModal({
  visible,
  imageUrls,
  initialIndex = 0,
  onRequestClose,
  title,
}) {
  const images = useMemo(
    () =>
      (imageUrls || [])
        .filter(Boolean)
        .map((uri) => ({ uri })),
    [imageUrls],
  )

  return (
    <ImageViewing
      images={images}
      imageIndex={initialIndex}
      visible={visible && images.length > 0}
      onRequestClose={onRequestClose}
      HeaderComponent={({ imageIndex }) => (
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || 'Görsel Önizleme'}
          </Text>
          <Text style={styles.headerMeta}>
            {images.length ? `${imageIndex + 1} / ${images.length}` : ''}
          </Text>
        </View>
      )}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      backgroundColor={Colors.alpha.black72}
    />
  )
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: Colors.surface,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  headerMeta: {
    marginTop: 2,
    color: Colors.alpha.white75,
    fontSize: Typography.caption.fontSize,
    fontWeight: '500',
  },
})
