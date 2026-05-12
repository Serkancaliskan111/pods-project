import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../contexts/AuthContext'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import Theme from '../theme/theme'
import {
  fetchMyChannels,
  resolveChannelTitles,
  subscribeChannelSummaries,
  channelLooksUnread,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../lib/chatApi'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography } = ThemeObj
const H_PADDING = 18

export default function ChatList() {
  const navigation = useNavigation()
  const { user, personel } = useAuth()
  const uid = user?.id
  const companyId = personel?.ana_sirket_id
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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

  const emptyHint = useMemo(() => {
    if (!companyId) return 'Sohbet için şirket personeli kaydınız olmalıdır.'
    return 'Henüz sohbet yok. Yeni mesaj başlatın.'
  }, [companyId])

  const renderItem = useCallback(
    ({ item }) => {
      const unread = channelLooksUnread(item)
      const time =
        (item.son_mesaj_at || item.created_at) &&
        new Date(item.son_mesaj_at || item.created_at).toLocaleString('tr-TR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      const previewText =
        item.son_mesaj_ozet ||
        (item.tur === 'grup' && item.groupCreatorName
          ? `${item.groupCreatorName} sizi gruba ekledi`
          : item.tur === 'grup'
            ? 'Gruba eklendiniz'
            : '—')
      return (
        <TouchableOpacity
          style={[styles.card, item.tur === 'grup' && styles.groupCard]}
          activeOpacity={0.85}
          onPress={() =>
            navigation.navigate('ChatRoom', {
              channelId: item.id,
              title: item.displayTitle,
            })
          }
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}>
              {item.tur === 'grup' ? <Text style={styles.groupPill}>GRUP</Text> : null}
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.displayTitle}
              </Text>
            </View>
            {time ? <Text style={styles.cardTime}>{time}</Text> : null}
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.preview} numberOfLines={2}>
              {previewText}
            </Text>
            {unread ? <View style={styles.dot} /> : null}
          </View>
        </TouchableOpacity>
      )
    },
    [navigation],
  )

  if (!companyId && !loading) {
    return (
      <View style={styles.page}>
        <PremiumBackgroundPattern />
        <View style={styles.header}>
          <Text style={styles.title}>Sohbet</Text>
          <Text style={styles.subtitle}>{emptyHint}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <PremiumBackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.title}>Sohbet</Text>
        <Text style={styles.subtitle}>Şirket içi birebir ve grup konuşmaları</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ChatNewDm')}
          >
            <Text style={styles.actionBtnText}>Kişi seç</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => navigation.navigate('ChatNewGroup')}
          >
            <Text style={styles.actionBtnTextSecondary}>Yeni grup</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{emptyHint}</Text>}
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
  header: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: Typography?.caption?.fontSize ?? 13,
    color: Colors.mutedText,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: ThemeObj.Radii?.md ?? 10,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
  },
  actionBtnText: {
    color: Colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  actionBtnTextSecondary: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: ThemeObj.Radii?.lg ?? 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.alpha?.gray20 ?? '#e2e8f0',
  },
  groupCard: {
    borderColor: Colors.primary,
    borderWidth: 1.2,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupPill: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  cardTime: {
    fontSize: 11,
    color: Colors.mutedText,
    fontWeight: '600',
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  preview: {
    flex: 1,
    fontSize: 13,
    color: Colors.mutedText,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  empty: {
    textAlign: 'center',
    marginTop: 36,
    color: Colors.mutedText,
    fontSize: 14,
    paddingHorizontal: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
