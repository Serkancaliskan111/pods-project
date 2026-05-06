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
import { fetchCompanyPeersForChat, rpcCreateGroup } from '../lib/chatApi'

const ThemeObj = Theme?.default ?? Theme
const { Colors } = ThemeObj

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

  const canSubmit =
    title.trim().length > 0 && selectedIds.length >= 1 && !creating

  const onCreate = useCallback(async () => {
    if (!canSubmit) return
    setCreating(true)
    try {
      const chan = await rpcCreateGroup(title.trim(), selectedIds)
      navigation.replace('ChatRoom', {
        channelId: chan,
        title: title.trim(),
      })
    } catch (e) {
      if (__DEV__) console.warn('[ChatNewGroup rpc]', e?.message || e)
    } finally {
      setCreating(false)
    }
  }, [canSubmit, title, selectedIds, navigation])

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
        <Text style={styles.topTitle}>Yeni grup</Text>
        <View style={{ width: 34 }} />
      </View>

      <TextInput
        style={styles.titleInput}
        placeholder="Grup adı"
        placeholderTextColor={Colors.mutedText}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />

      <Text style={styles.help}>En az bir kişi seçin (siz otomatik eklenirsiniz).</Text>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={peers}
          keyExtractor={(item) => String(item.kullanici_id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const name = formatFullName(item.ad, item.soyad, '') || item.email || 'Personel'
            const on = selected.has(item.kullanici_id)
            return (
              <TouchableOpacity style={[styles.row, on && styles.rowOn]} onPress={() => toggle(item.kullanici_id)}>
                <View style={[styles.check, on && styles.checkOn]} />
                <Text style={styles.rowTitle}>{name}</Text>
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={<Text style={styles.empty}>Şirkette başka personel yok.</Text>}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
          onPress={() => void onCreate()}
          disabled={!canSubmit}
        >
          {creating ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <Text style={styles.primaryBtnText}>Grubu oluştur</Text>
          )}
        </TouchableOpacity>
      </View>
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
  titleInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  help: {
    marginHorizontal: 18,
    marginBottom: 10,
    fontSize: 12,
    color: Colors.mutedText,
    fontWeight: '600',
  },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Radii?.md ?? 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
  },
  rowOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.inputBg ?? Colors.background,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.mutedText,
  },
  checkOn: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 28, color: Colors.mutedText },
  hint: { padding: 24, color: Colors.mutedText, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.alpha?.gray20 ?? '#e2e8f0',
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    color: Colors.surface,
    fontWeight: '800',
    fontSize: 15,
  },
})
