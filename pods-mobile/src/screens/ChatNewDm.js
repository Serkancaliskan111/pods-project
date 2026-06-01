import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, TextInput, TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronLeft, Search, UserPlus, Users } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { formatFullName } from '../lib/nameFormat'
import { fetchCompanyPeersForChat, rpcStartDm } from '../lib/chatApi'
import {
  Screen,
  Text,
  Heading,
  Card,
  Avatar,
  IconBubble,
  EmptyState,
  SkeletonCard,
  palette,
  radii,
  spacing,
  shadows,
} from '../ui'

export default function ChatNewDm() {
  const navigation = useNavigation()
  const { user, personel } = useAuth()
  const uid = user?.id
  const companyId = personel?.ana_sirket_id

  const [q, setQ] = useState('')
  const [peers, setPeers] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(null)

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
      if (__DEV__) console.warn('[ChatNewDm]', e?.message || e)
      setPeers([])
    } finally {
      setLoading(false)
    }
  }, [companyId, uid])

  useEffect(() => {
    void loadPeers()
  }, [loadPeers])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return peers
    return peers.filter((p) => {
      const name = formatFullName(p?.ad, p?.soyad, '').toLowerCase()
      const mail = String(p?.email || '').toLowerCase()
      return name.includes(s) || mail.includes(s)
    })
  }, [peers, q])

  const openDm = useCallback(
    async (kullaniciId) => {
      if (!kullaniciId || opening) return
      setOpening(kullaniciId)
      try {
        const chan = await rpcStartDm(kullaniciId)
        const peer = peers.find((p) => p.kullanici_id === kullaniciId)
        const title = peer ? formatFullName(peer.ad, peer.soyad, '') : undefined
        navigation.replace('ChatRoom', { channelId: chan, title: title || undefined })
      } catch (e) {
        if (__DEV__) console.warn('[ChatNewDm rpc]', e?.message || e)
      } finally {
        setOpening(null)
      }
    },
    [navigation, opening, peers],
  )

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
          Yeni Mesaj
        </Heading>
        <View style={{ width: 34 }} />
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={palette.slate[400]} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="İsim veya e-posta ara…"
          placeholderTextColor={palette.slate[400]}
          value={q}
          onChangeText={setQ}
        />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.kullanici_id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const name = formatFullName(item.ad, item.soyad, '') || item.email || 'Personel'
            const busy = opening === item.kullanici_id
            return (
              <Card
                tone="surface"
                onPress={() => void openDm(item.kullanici_id)}
                style={{ marginBottom: spacing.sm, opacity: busy ? 0.6 : 1 }}
                padding="md"
              >
                <View style={styles.row}>
                  <Avatar name={name} size="md" />
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
                  {busy ? (
                    <ActivityIndicator size="small" color={palette.primary[500]} />
                  ) : (
                    <IconBubble tone="primary" size="sm">
                      <UserPlus size={14} color={palette.primary[700]} strokeWidth={2} />
                    </IconBubble>
                  )}
                </View>
              </Card>
            )
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Search size={42} color={palette.slate[400]} strokeWidth={1.5} />}
              title="Eşleşen personel yok"
              description="Aramayı temizleyerek tüm personel listesini görebilirsiniz."
            />
          }
        />
      )}
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
  searchWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.slate[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    ...shadows.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: palette.slate[800],
    fontFamily: 'PlusJakartaSans-Medium',
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
