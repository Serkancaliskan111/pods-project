import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, FlatList } from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchMyChannels,
  resolveChannelTitles,
  subscribeChannelSummaries,
  channelLooksUnread,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../lib/chatApi'
import {
  Screen,
  Heading,
  Text,
  Card,
  Button,
  Avatar,
  StatusBadge,
  EmptyState,
  SkeletonCard,
  IconBubble,
  palette,
  spacing,
  radii,
  Icon,
} from '../ui'

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
      const isGroup = item.tur === 'grup'
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
        (isGroup && item.groupCreatorName
          ? `${item.groupCreatorName} sizi gruba ekledi`
          : isGroup
          ? 'Gruba eklendiniz'
          : '—')
      return (
        <Card
          tone={unread ? 'primary' : 'surface'}
          padding="md"
          radius="2xl"
          interactive
          elevated={unread}
          onPress={() =>
            navigation.navigate('ChatRoom', {
              channelId: item.id,
              title: item.displayTitle,
            })
          }
          style={styles.chatCard}
        >
          <View style={styles.chatRow}>
            {isGroup ? (
              <IconBubble tone="blurple" size="lg" square>
                <Icon.Staff size={22} color={palette.blurple[700]} strokeWidth={2} />
              </IconBubble>
            ) : (
              <Avatar name={item.displayTitle} size="lg" elevated={unread} />
            )}
            <View style={styles.chatTextWrap}>
              <View style={styles.chatTitleRow}>
                <Text
                  variant="bodyLg"
                  weight={unread ? 'Bold' : 'SemiBold'}
                  color={unread ? palette.primary[800] : palette.slate[800]}
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {item.displayTitle}
                </Text>
                {time ? (
                  <Text
                    variant="caption"
                    weight={unread ? 'Bold' : 'SemiBold'}
                    color={unread ? palette.primary[600] : palette.slate[500]}
                  >
                    {time}
                  </Text>
                ) : null}
              </View>
              <View style={styles.chatPreviewRow}>
                <Text
                  variant="bodySm"
                  color={unread ? palette.slate[700] : palette.slate[500]}
                  weight={unread ? 'SemiBold' : 'Medium'}
                  numberOfLines={2}
                  style={{ flex: 1 }}
                >
                  {previewText}
                </Text>
                {unread ? (
                  <View style={styles.unreadDot}>
                    <Text style={styles.unreadDotText}>•</Text>
                  </View>
                ) : null}
              </View>
              {isGroup ? (
                <View style={styles.chatBadgeRow}>
                  <StatusBadge tone="blurple" size="sm">
                    Grup
                  </StatusBadge>
                </View>
              ) : null}
            </View>
          </View>
        </Card>
      )
    },
    [navigation],
  )

  if (!companyId && !loading) {
    return (
      <Screen padded>
        <Heading variant="h1">Sohbet</Heading>
        <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 4 }}>
          {emptyHint}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen padded bottomInset>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Heading variant="h1">Sohbet</Heading>
          <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 4 }}>
            Şirket içi birebir ve grup konuşmaları
          </Text>
        </View>
      </View>
      <View style={styles.actionsRow}>
        <Button
          variant="primary"
          size="sm"
          onPress={() => navigation.navigate('ChatNewDm')}
          style={{ flex: 1 }}
        >
          Kişi Seç
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate('ChatNewGroup')}
          style={{ flex: 1 }}
        >
          Yeni Grup
        </Button>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={[styles.listContent, rows.length === 0 && styles.listContentEmpty]}
          ListEmptyComponent={
            <EmptyState
              tone="soft"
              icon={<Icon.Chat size={28} color={palette.slate[400]} strokeWidth={1.6} />}
              title="Sohbet yok"
              description={emptyHint}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  chatCard: {},
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  chatTextWrap: {
    flex: 1,
    gap: 4,
  },
  chatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chatPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chatBadgeRow: {
    marginTop: 4,
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotText: {
    color: palette.surface,
    fontSize: 8,
    lineHeight: 8,
  },
  skeletonWrap: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
})
