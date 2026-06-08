import React, { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Avatar as KitAvatar, Text as KitText, palette as kitPalette } from '../../ui'
import { createProfilePhotoSignedUrl } from '../../lib/profilePhotoApi'
import { getPersonInitials } from '../../lib/nameFormat'

export default function HomePointsAvatar({ firstName, lastName, fallbackName, photoPath, style }) {
  const [url, setUrl] = useState(null)
  const initials = useMemo(
    () => getPersonInitials(firstName, lastName, fallbackName),
    [firstName, lastName, fallbackName],
  )

  useEffect(() => {
    let alive = true
    const path = String(photoPath || '').trim()
    if (!path) {
      setUrl(null)
      return undefined
    }
    void createProfilePhotoSignedUrl(path, 3600).then((signed) => {
      if (alive) setUrl(signed)
    })
    return () => {
      alive = false
    }
  }, [photoPath])

  if (url) {
    return <KitAvatar url={url} name={initials} size="lg" style={style} />
  }

  return (
    <View style={[styles.initialsWrap, style]}>
      <KitText variant="h2" weight="Bold" color={kitPalette.primary[800]}>
        {initials}
      </KitText>
    </View>
  )
}

const SIZE = 56

const styles = StyleSheet.create({
  initialsWrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: kitPalette.surface,
    borderWidth: 2,
    borderColor: kitPalette.primary[200],
  },
})
