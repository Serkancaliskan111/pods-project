import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ActivityIndicator,
} from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MessageCirclePlus, Search, Users } from 'lucide-react-native'
import { useAuth } from '../contexts/AuthContext'
import { useUiTheme } from '../contexts/UiThemeContext'
import { buildChatListTheme, buildChatListScreenStyles } from '../lib/buildChatRoomTheme'
import {
  fetchMyChannels,
  resolveChannelTitles,
  subscribeChannelSummaries,
  channelLooksUnread,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../lib/chatApi'
import { useTabBarScrollPadding } from '../navigation/tabBarLayout'
import { Avatar, Text, Icon } from '../ui'
import { formatWhatsAppListTime } from '../theme/whatsappChat'

export default function ChatList() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const tabBarPad = useTabBarScrollPadding()
  const { theme: uiTheme } = useUiTheme()
  const listTheme = useMemo(() => buildChatListTheme(uiTheme), [uiTheme])
  const styles = useMemo(() => buildChatListScreenStyles(listTheme), [listTheme])
  const { user, personel } = useAuth()
  const uid = user?.id
  const companyId = personel?.ana_sirket_id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const debounceRef = useRef(null)

  const channelIdsKey = useMemo(
    () =>
      rows
        .map((r) => String(r.id))
        .sort()
        .join('|'),
    [rows],
  )

  const load = useCallback(async () => {
    if (!uid) return
    try {
      const raw = await fetchMyChannels(uid)
      const titled = await resolveChannelTitles(raw, uid, companyId)
      setRows(titled)
    } catch (e) {
      if (__DEV__) console.warn('[ChatList]', e?.message || e)
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [uid, companyId])

  useFocusEffect(
    useCallback(() => {
      if (!companyId) {
        setLoading(false)
        return undefined
      }
      setLoading(true)
      void load()
      return undefined
    }, [load, companyId]),
  )

  useEffect(() => {
    if (!uid || !companyId || !channelIdsKey) return undefined
    const ids = rows.map((r) => r.id)
    const unsub = subscribeChannelSummaries(ids, () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => void load(), CHAT_REALTIME_LIST_DEBOUNCE_MS)
    })
    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [uid, companyId, channelIdsKey, rows, load])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void load()
  }, [load])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((item) => {
      const title = String(item.displayTitle || '').toLowerCase()
      const preview = String(item.son_mesaj_ozet || '').toLowerCase()
      return title.includes(q) || preview.includes(q)
    })
  }, [rows, search])

  const emptyHint = useMemo(() => {
    if (!companyId) return 'Sohbet için şirket personeli kaydınız olmalıdır.'
    if (search.trim()) return 'Aramanızla eşleşen sohbet bulunamadı.'
    return 'Henüz sohbet yok. Sağ alttaki düğmeyle yeni mesaj başlatın.'
  }, [companyId, search])

  const renderItem = useCallback(
    ({ item }) => {
      const unread = channelLooksUnread(item)
      const isGroup = item.tur === 'grup'
      const time = formatWhatsAppListTime(item.son_mesaj_at || item.created_at)
      const previewText =
        item.son_mesaj_ozet ||
        (isGroup && item.groupCreatorName
          ? `${item.groupCreatorName} sizi gruba ekledi`
          : isGroup
          ? 'Gruba eklendiniz'
          : '')

      return (
        <TouchableOpacity
          activeOpacity={0.65}
          onPress={() =>
            navigation.navigate('ChatRoom', {
              channelId: item.id,
              title: item.displayTitle,
            })
          }
          style={styles.row}
        >
          {isGroup ? (
            <View style={styles.groupAvatar}>
              <Users size={26} color={listTheme.textSecondary} strokeWidth={1.8} />
            </View>
          ) : (
            <Avatar name={item.displayTitle} size="lg" />
          )}
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text
                variant="bodyLg"
                weight={unread ? 'Bold' : 'SemiBold'}
                color={listTheme.textPrimary}
                numberOfLines={1}
                style={styles.rowTitle}
              >
                {item.displayTitle}
              </Text>
              {time ? (
                <Text
                  variant="caption"
                  weight={unread ? 'SemiBold' : 'Medium'}
                  color={unread ? listTheme.unread : listTheme.textSecondary}
                >
                  {time}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowBottom}>
              <Text
                variant="bodySm"
                color={listTheme.textSecondary}
                weight={unread ? 'SemiBold' : 'Regular'}
                numberOfLines={1}
                style={styles.preview}
              >
                {previewText || ' '}
              </Text>
              {unread ? <View style={styles.unreadBadge} /> : null}
            </View>
          </View>
        </TouchableOpacity>
      )
    },
    [navigation, listTheme, styles],
  )

  if (!companyId && !loading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={listTheme.header} />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text variant="h2" weight="Bold" color={listTheme.textHeader}>
            Sohbet
          </Text>
        </View>
        <View style={styles.emptyWrap}>
          <Text variant="bodySm" color={listTheme.textSecondary} align="center">
            {emptyHint}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={listTheme.header} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text variant="h2" weight="Bold" color={listTheme.textHeader} style={styles.headerTitle}>
          Sohbet
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.navigate('ChatNewGroup')}
            accessibilityLabel="Yeni grup"
          >
            <Users size={22} color={listTheme.textHeader} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={18} color={listTheme.textSecondary} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ara"
          placeholderTextColor={listTheme.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={listTheme.unread} size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={[
            filteredRows.length === 0 && styles.listEmpty,
            { paddingBottom: tabBarPad + 88 },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon.Chat size={48} color={listTheme.textSecondary} strokeWidth={1.4} />
              <Text variant="bodyLg" weight="SemiBold" color={listTheme.textPrimary} style={{ marginTop: 12 }}>
                Sohbet yok
              </Text>
              <Text variant="bodySm" color={listTheme.textSecondary} align="center" style={{ marginTop: 6 }}>
                {emptyHint}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarPad + 16 }]}
        activeOpacity={0.88}
        onPress={() => navigation.navigate('ChatNewDm')}
        accessibilityLabel="Yeni sohbet"
      >
        <MessageCirclePlus size={26} color={listTheme.textHeader} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}
