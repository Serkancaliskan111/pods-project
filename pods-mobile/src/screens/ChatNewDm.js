import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Search } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { useUiTheme } from '../contexts/UiThemeContext'
import { buildChatListTheme, buildChatListScreenStyles } from '../lib/buildChatRoomTheme'
import { formatFullName } from '../lib/nameFormat'
import { fetchCompanyPeersForChat, rpcStartDm } from '../lib/chatApi'
import { Avatar, Text } from '../ui'

export default function ChatNewDm() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { theme: uiTheme } = useUiTheme()
  const listTheme = useMemo(() => buildChatListTheme(uiTheme), [uiTheme])
  const styles = useMemo(() => buildChatListScreenStyles(listTheme), [listTheme])
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
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={listTheme.header} />
        <View style={[styles.headerCompact, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <ChevronLeft size={28} color={listTheme.textHeader} strokeWidth={2} />
          </TouchableOpacity>
          <Text variant="h3" weight="Bold" color={listTheme.textHeader} style={{ flex: 1 }}>
            Yeni sohbet
          </Text>
        </View>
        <View style={styles.centerEmpty}>
          <Text variant="bodySm" color={listTheme.textSecondary} align="center">
            Şirket kaydınız henüz tamamlanmamış görünüyor.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={listTheme.header} />
      <View style={[styles.headerCompact, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={28} color={listTheme.textHeader} strokeWidth={2} />
        </TouchableOpacity>
        <Text variant="h3" weight="Bold" color={listTheme.textHeader} style={{ flex: 1 }}>
          Yeni sohbet
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={listTheme.textSecondary} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Kişi ara"
          placeholderTextColor={listTheme.textSecondary}
          value={q}
          onChangeText={setQ}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={listTheme.unread} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.kullanici_id)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const name = formatFullName(item.ad, item.soyad, '') || item.email || 'Personel'
            const busy = opening === item.kullanici_id
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.65}
                onPress={() => void openDm(item.kullanici_id)}
                disabled={busy}
              >
                <Avatar name={name} size="lg" />
                <View style={styles.rowText}>
                  <Text variant="bodyLg" weight="SemiBold" color={listTheme.textPrimary} numberOfLines={1}>
                    {name}
                  </Text>
                  {item.email ? (
                    <Text variant="caption" color={listTheme.textSecondary} numberOfLines={1}>
                      {item.email}
                    </Text>
                  ) : null}
                </View>
                {busy ? <ActivityIndicator size="small" color={listTheme.unread} /> : null}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <View style={styles.centerEmpty}>
              <Text variant="bodySm" color={listTheme.textSecondary} align="center">
                Eşleşen personel bulunamadı.
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}
