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
import { Check, ChevronLeft } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { useUiTheme } from '../contexts/UiThemeContext'
import { buildChatListTheme, buildChatListScreenStyles } from '../lib/buildChatRoomTheme'
import { formatFullName } from '../lib/nameFormat'
import { fetchCompanyPeersForChat, rpcCreateGroup } from '../lib/chatApi'
import { Avatar, Text } from '../ui'

export default function ChatNewGroup() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { theme: uiTheme } = useUiTheme()
  const listTheme = useMemo(() => buildChatListTheme(uiTheme), [uiTheme])
  const baseStyles = useMemo(() => buildChatListScreenStyles(listTheme), [listTheme])
  const extraStyles = useMemo(() => buildGroupExtraStyles(listTheme), [listTheme])
  const styles = useMemo(() => ({ ...baseStyles, ...extraStyles }), [baseStyles, extraStyles])
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
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={listTheme.header} />
        <View style={[styles.headerCompact, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <ChevronLeft size={28} color={listTheme.textHeader} strokeWidth={2} />
          </TouchableOpacity>
          <Text variant="h3" weight="Bold" color={listTheme.textHeader} style={{ flex: 1 }}>
            Yeni grup
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
          Yeni grup
        </Text>
        <TouchableOpacity
          onPress={() => void onCreate()}
          disabled={!canSubmit}
          style={[styles.createBtn, !canSubmit && styles.createBtnDisabled]}
        >
          {creating ? (
            <ActivityIndicator size="small" color={listTheme.textHeader} />
          ) : (
            <Check size={24} color={listTheme.textHeader} strokeWidth={2.4} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.titleSection}>
        <TextInput
          style={styles.titleInput}
          placeholder="Grup konusu (isteğe bağlı)"
          placeholderTextColor={listTheme.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />
        <Text variant="caption" color={listTheme.textSecondary}>
          {selectedIds.length} kişi seçildi · en az 1 kişi gerekli
        </Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={listTheme.unread} size="large" />
        </View>
      ) : (
        <FlatList
          data={peers}
          keyExtractor={(item) => String(item.kullanici_id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const name = formatFullName(item.ad, item.soyad, '') || item.email || 'Personel'
            const on = selected.has(item.kullanici_id)
            return (
              <TouchableOpacity style={styles.row} activeOpacity={0.65} onPress={() => toggle(item.kullanici_id)}>
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
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Check size={16} color={listTheme.textHeader} strokeWidth={3} /> : null}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

function buildGroupExtraStyles(t) {
  return StyleSheet.create({
    createBtn: {
      padding: 8,
      marginRight: 4,
    },
    createBtnDisabled: {
      opacity: 0.4,
    },
    titleSection: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.listBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.listDivider,
      gap: 6,
    },
    titleInput: {
      fontSize: 16,
      color: t.textPrimary,
      paddingVertical: 8,
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: t.textSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: {
      borderColor: t.unread,
      backgroundColor: t.unread,
    },
  })
}
