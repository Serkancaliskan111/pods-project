import React from 'react'
import { View, StyleSheet } from 'react-native'
import Theme from '../theme/theme'

const ThemeObj = Theme?.default ?? Theme
const { Colors } = ThemeObj

export default function PremiumBackgroundPattern() {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.blobTop} />
      <View style={styles.blobMid} />
      <View style={styles.blobBottom} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blobTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.alpha.indigo06,
    top: -90,
    right: -80,
  },
  blobMid: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.alpha.gray08,
    top: '34%',
    left: -120,
  },
  blobBottom: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.alpha.indigo06,
    bottom: -110,
    right: -100,
  },
})
