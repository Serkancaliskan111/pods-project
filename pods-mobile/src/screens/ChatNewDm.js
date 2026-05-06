import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { formatFullName } from '../lib/nameFormat'
import Theme from '../theme/theme'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import { fetchCompanyPeersForChat, rpcStartDm } from '../lib/chatApi'

const ThemeObj = Theme?.default ?? Theme
const { Colors } = ThemeObj

export default function ChatNewDm() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
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
        navigation.replace('ChatRoom', {
          channelId: chan,
          title: title || undefined,
        })
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
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PremiumBackgroundPattern />
        <Text style={styles.hint}>Personel kaydı bulunamadı.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PremiumBackgroundPattern />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft size={26} color={Colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Yeni mesaj</Text>
        <View style={{ width: 34 }} />
      </View>

      <TextInput
        style={styles.search}
        placeholder="İsim veya e-posta ara…"
        placeholderTextColor={Colors.mutedText}
        value={q}
        onChangeText={setQ}
      />

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.primary} />
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
              <TouchableOpacity
                style={styles.row}
                onPress={() => void openDm(item.kullanici_id)}
                disabled={busy}
              >
                <Text style={styles.rowTitle}>{name}</Text>
                {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={<Text style={styles.empty}>Eşleşen personel yok.</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  backBtn: { padding: 4 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Radii?.md ?? 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 28, color: Colors.mutedText },
  hint: { padding: 24, color: Colors.mutedText, fontWeight: '600' },
})
