import React, { useMemo } from 'react'
import { View } from 'react-native'
import { useNavigation, useNavigationState } from '@react-navigation/native'
import { ChevronRight } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { buildMobileStackLinks, navigateMobileRoute, resolveMobileRouteName } from '../lib/mobileAdminNav'
import { Section, Card, Text, palette, spacing } from '../ui'

/**
 * Ek ekranlara kısayol — ayrı “Modüller” sekmesi yok.
 */
export default function ProfileMenuSection() {
  const navigation = useNavigation()
  const { permissions, personel, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin

  const tabNames = useNavigationState((state) => (state?.routes ?? []).map((r) => r.name))

  const links = useMemo(
    () => buildMobileStackLinks({ permissions, isSystemAdmin, personel }, tabNames),
    [permissions, isSystemAdmin, personel, tabNames],
  )

  const bySection = useMemo(() => {
    const map = new Map()
    for (const link of links) {
      const title = link.section || 'Diğer'
      if (!map.has(title)) map.set(title, [])
      map.get(title).push(link)
    }
    return Array.from(map.entries())
  }, [links])

  if (!links.length) return null

  const onPress = (item) => {
    const name = resolveMobileRouteName(item.key)
    navigateMobileRoute(navigation, name)
  }

  return (
    <Section
      title="Diğer özellikler"
      subtitle="Takvim, şablonlar ve diğer yönetim araçları"
      style={{ marginBottom: spacing.lg }}
    >
      {bySection.map(([sectionTitle, items]) => (
        <View key={sectionTitle} style={{ marginBottom: spacing.md }}>
          <Text variant="overline" color={palette.slate[500]} style={{ marginBottom: spacing.sm }}>
            {sectionTitle.toUpperCase()}
          </Text>
          {items.map((item) => (
            <Card
              key={item.key}
              tone="surface"
              elevated
              onPress={() => onPress(item)}
              style={{ marginBottom: spacing.sm }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="bodyMd" weight="SemiBold" color={palette.slate[800]}>
                  {item.label}
                </Text>
                <ChevronRight size={18} color={palette.slate[400]} />
              </View>
            </Card>
          ))}
        </View>
      ))}
    </Section>
  )
}
