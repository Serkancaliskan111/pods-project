import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { TouchableOpacity } from 'react-native'
import { Home as HomeIcon, ClipboardList as ClipboardIcon, User as UserIcon, Plus as PlusIcon } from 'lucide-react-native'
import Theme from '../theme/theme'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Card, Shadows } = ThemeObj

export default function MobileLayout({ children }) {
  const navigation = useNavigation()

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>PODS - Mobil</Text>
      </View>

      <View style={styles.content}>
        {children}
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.navItem}>
          <HomeIcon size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Tasks')} style={styles.navItem}>
          <ClipboardIcon size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.navItem}>
          <UserIcon size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { height: 56, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerText: { color: Colors.surface, fontWeight: '600' },
  content: { flex: 1, padding: ThemeObj.Spacing.sm, paddingBottom: 80 },
  bottomNav: {
    height: 64,
    borderTopWidth: 1,
    borderTopColor: Colors.gray,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  navItem: { alignItems: 'center', justifyContent: 'center' },
})

