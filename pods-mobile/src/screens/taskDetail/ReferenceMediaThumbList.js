import React from 'react'
import { View, Text, TouchableOpacity, Image } from 'react-native'
import EvidenceVideoPlayer from '../../components/EvidenceVideoPlayer'
import Theme from '../../theme/theme'

const ThemeObj = Theme?.default ?? Theme
const { Colors } = ThemeObj

export default function ReferenceMediaThumbList({
  refs = [],
  keyPrefix,
  styles,
  allPhotoGalleryUrls,
  setLightboxIndex,
}) {
  if (!refs.length) return null
  return (
    <View style={styles.photoList}>
      {refs.map((ref, idx) => {
        const isVideo = ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')
        const isImage = ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')
        if (isVideo) {
          return (
            <EvidenceVideoPlayer
              key={`${keyPrefix}-v-${idx}`}
              uri={ref.signedUrl}
              style={styles.videoEvidencePlayer}
            />
          )
        }
        if (isImage) {
          const imageIndex = allPhotoGalleryUrls.findIndex((x) => x === ref.signedUrl)
          return (
            <TouchableOpacity
              key={`${keyPrefix}-i-${idx}`}
              style={styles.photoThumb}
              onPress={() => {
                if (imageIndex >= 0) setLightboxIndex(imageIndex)
              }}
              activeOpacity={0.85}
            >
              <Image source={{ uri: ref.signedUrl }} style={styles.thumbImg} />
              <Text style={styles.referencePhotoBadge}>Referans</Text>
            </TouchableOpacity>
          )
        }
        return (
          <Text key={`${keyPrefix}-f-${idx}`} style={[styles.value, { color: Colors.primary }]}>
            {ref.name || 'Dosya'}
          </Text>
        )
      })}
    </View>
  )
}
