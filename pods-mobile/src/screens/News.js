import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, View } from 'react-native'
import { Bell, Megaphone } from 'lucide-react-native'
import {
  Screen,
  Heading,
  Text,
  Card,
  IconBubble,
  EmptyState,
  SkeletonCard,
  palette,
  spacing,
} from '../ui'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatFullName } from '../lib/nameFormat'

const supabase = getSupabase()

export default function News() {
  const { personel } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!personel?.ana_sirket_id) {
      setItems([])
      setLoading(false)
      setRefreshing(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('duyurular')
        .select('id, metin, created_at, gonderen_personel_id, hedef_birim_ids')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error || !data) {
        setItems([])
      } else {
        const senderIds = [...new Set((data || []).map((d) => d.gonderen_personel_id).filter(Boolean))]
        const nameMap = {}
        if (senderIds.length) {
          const { data: peopleData } = await supabase
            .from('personeller')
            .select('id, ad, soyad')
            .in('id', senderIds)
          ;(peopleData || []).forEach((p) => {
            nameMap[String(p.id)] = formatFullName(p.ad, p.soyad, 'Yönetici')
          })
        }
        setItems(
          (data || []).map((d) => ({
            ...d,
            gonderen_adi: nameMap[String(d.gonderen_personel_id)] || 'Yönetici',
          })),
        )
      }
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [personel?.ana_sirket_id])

  useEffect(() => {
    load()
  }, [load])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const renderItem = useCallback(({ item }) => {
    const dateText = item?.created_at ? new Date(item.created_at).toLocaleString('tr-TR') : '-'
    return (
      <Card tone="surface" elevated style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <IconBubble tone="blurple" size="md">
            <Megaphone size={18} color={palette.blurple[600]} strokeWidth={2} />
          </IconBubble>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLg" weight="SemiBold" color={palette.slate[800]} style={{ marginBottom: spacing.sm }}>
              {item?.metin || '-'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text variant="caption" color={palette.slate[500]}>
                Gönderen: {item?.gonderen_adi || 'Yönetici'}
              </Text>
              <Text variant="caption" color={palette.slate[400]}>
                {dateText}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    )
  }, [])

  const keyExtractor = useCallback((item) => String(item.id), [])

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )
    }
    return (
      <EmptyState
        icon={<Bell size={42} color={palette.slate[400]} strokeWidth={1.5} />}
        title="Henüz duyuru yok"
        description="Şirket duyuruları geldikçe bu liste güncellenecek."
      />
    )
  }, [loading])

  return (
    <Screen padded background={palette.background}>
      <Heading variant="h1" style={{ marginBottom: spacing.lg }}>
        Duyurular
      </Heading>
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary[500]}
            colors={[palette.primary[700], palette.accent[500]]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={items.length ? { paddingBottom: spacing['3xl'] } : { flexGrow: 1 }}
      />
    </Screen>
  )
}
