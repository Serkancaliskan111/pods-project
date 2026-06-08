import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { MapPin } from 'lucide-react-native'

export default function ChatLocationBubble({ row, styles, theme }) {
  const lat = row?.konum_lat
  const lng = row?.konum_lng
  const label = (row?.konum_etiket || row?.icerik || '').trim() || 'Konum'

  const openMaps = () => {
    if (lat == null || lng == null) return
    const url = `https://maps.google.com/?q=${lat},${lng}`
    void Linking.openURL(url).catch(() => {})
  }

  return (
    <TouchableOpacity style={locStyles.wrap} activeOpacity={0.85} onPress={openMaps}>
      <View style={[locStyles.iconBox, { backgroundColor: theme?.accent || '#2563eb' }]}>
        <MapPin size={22} color="#fff" strokeWidth={2} />
      </View>
      <View style={locStyles.body}>
        <Text style={[styles.msgText, locStyles.title]} numberOfLines={2}>
          {label}
        </Text>
        {lat != null && lng != null ? (
          <Text style={[styles.msgTime, locStyles.coords]} numberOfLines={1}>
            {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
          </Text>
        ) : null}
        <Text style={[locStyles.link, { color: theme?.link }]}>Haritada aç</Text>
      </View>
    </TouchableOpacity>
  )
}

const locStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
    maxWidth: 260,
    paddingVertical: 2,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontWeight: '600',
  },
  coords: {
    fontSize: 11,
  },
  link: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
  },
})
