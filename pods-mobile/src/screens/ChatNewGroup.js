import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, ChevronLeft, Users } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { formatFullName } from '../lib/nameFormat'
import { fetchCompanyPeersForChat, rpcCreateGroup } from '../lib/chatApi'
import {
  Screen,
  Text,
  Heading,
  Card,
  Avatar,
  Button,
  EmptyState,
  SkeletonCard,
  palette,
  radii,
  spacing,
  shadows,
} from '../ui'

export default function ChatNewGroup() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { user, personel } = useAuth()
  const uid = user?.id
  const companyId = personel?.ana_sirket_id

  const [title, setTitle] = useState('')
  const [peers, setPeers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  const loadPeers = useCallback(async () => {
    if (!companyId || !uid) {
      setPeers([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await fetchCompanyPeersForChat(companyId, uid)
      setPeers(rows)
    } catch (e) {
      if (__DEV__) console.warn('[ChatNewGroup]', e?.message || e)
      setPeers([])
    } finally {
      setLoading(false)
    }
  }, [companyId, uid])

  useEffect(() => {
    void loadPeers()
  }, [loadPeers])

  const toggle = useCallback((kid) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(kid)) next.delete(kid)
      else next.add(kid)
      return next
    })
  }, [])

  const selectedIds = useMemo(() => [...selected], [selected])
  const canSubmit = title.trim().length > 0 && selectedIds.length >= 1 && !creating

  const onCreate = useCallback(async () => {
    if (!canSubmit) return
    setCreating(true)
    try {
      const chan = await rpcCreateGroup(title.trim(), selectedIds)
      navigation.replace('ChatRoom', { channelId: chan, title: title.trim() })
    } catch (e) {
      if (__DEV__) console.warn('[ChatNewGroup rpc]', e?.message || e)
    } finally {
      setCreating(false)
    }
  }, [canSubmit, title, selectedIds, navigation])

  if (!companyId) {
    return (
      <Screen padded>
        <EmptyState
          icon={<Users size={42} color={palette.slate[400]} strokeWidth={1.5} />}
          title="Personel kaydı yok"
          description="Şirket kaydınız henüz tamamlanmamış görünüyor."
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft size={26} color={palette.primary[700]} strokeWidth={2} />
        </TouchableOpacity>
        <Heading variant="h2" align="center" style={{ flex: 1 }}>
          Yeni Grup
        </Heading>
        <View style={{ width: 34 }} />
      </View>

      <TextInput
        style={styles.titleInput}
        placeholder="Grup adı"
        placeholderTextColor={palette.slate[400]}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />
      <Text variant="caption" color={palette.slate[500]} style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
        En az bir kişi seçin. Siz otomatik eklenirsiniz.
      </Text>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={peers}
          keyExtractor={(item) => String(item.kullanici_id)}
          contentContainerStyle={[styles.list, { paddingBottom: 120 + insets.bottom }]}
          renderItem={({ item }) => {
            const name = formatFullName(item.ad, item.soyad, '') || item.email || 'Personel'
            const on = selected.has(item.kullanici_id)
            return (
              <Card
                tone={on ? 'primary' : 'surface'}
                onPress={() => toggle(item.kullanici_id)}
                padding="md"
                style={{ marginBottom: spacing.sm }}
              >
                <View style={styles.row}>
                  <Avatar name={name} size="sm" />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text variant="bodyLg" weight="SemiBold" color={palette.slate[800]}>
                      {name}
                    </Text>
                    {item.email ? (
                      <Text variant="caption" color={palette.slate[500]}>
                        {item.email}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <Check size={14} color={palette.surface} strokeWidth={3} /> : null}
                  </View>
                </View>
              </Card>
            )
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Users size={42} color={palette.slate[400]} strokeWidth={1.5} />}
              title="Personel bulunamadı"
              description="Şirkette başka personel kaydı yok."
            />
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          variant="accent"
          size="lg"
          fullWidth
          loading={creating}
          disabled={!canSubmit}
          onPress={() => void onCreate()}
        >
          Grubu Oluştur
        </Button>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: { padding: 4 },
  titleInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.slate[100],
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: palette.slate[800],
    ...shadows.xs,
  },
  list: { paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: palette.primary[700],
    backgroundColor: palette.primary[700],
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.slate[100],
  },
})
