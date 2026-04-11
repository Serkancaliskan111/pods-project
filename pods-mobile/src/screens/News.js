import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Bell } from 'lucide-react-native'
import Theme from '../theme/theme'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatFullName } from '../lib/nameFormat'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography } = ThemeObj
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
      let query = supabase
        .from('duyurular')
        .select('id, metin, created_at, gonderen_personel_id, hedef_birim_ids')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .order('created_at', { ascending: false })
        .limit(100)

      const { data, error } = await query
      if (error || !data) {
        setItems([])
      } else {
        const senderIds = [...new Set((data || []).map((d) => d.gonderen_personel_id).filter(Boolean))]
        let nameMap = {}
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
      <View style={styles.card}>
        <Text style={styles.cardMessage}>{item?.metin || '-'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Gönderen: {item?.gonderen_adi || 'Yönetici'}</Text>
          <Text style={styles.metaText}>{dateText}</Text>
        </View>
      </View>
    )
  }, [])

  const keyExtractor = useCallback((item) => String(item.id), [])

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyBox}>
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : (
          <>
            <Bell size={48} color={Colors.mutedText} strokeWidth={1.5} />
            <Text style={styles.emptyText}>Henüz duyuru yok</Text>
          </>
        )}
      </View>
    ),
    [loading],
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PremiumBackgroundPattern />
      <View style={styles.page}>
        <Text style={styles.heading}>Duyurular</Text>
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={items.length ? styles.listContent : styles.listContentEmpty}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  heading: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  listContent: { paddingBottom: 24 },
  listContentEmpty: { flexGrow: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 14,
    marginBottom: 10,
    ...ThemeObj.Shadows.card,
  },
  cardMessage: { color: Colors.text, fontSize: Typography.body.fontSize, fontWeight: '500', lineHeight: 20, marginBottom: 8 },
  metaRow: { gap: 4 },
  metaText: { color: Colors.mutedText, fontSize: Typography.caption.fontSize },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: { fontSize: Typography.body.fontSize, color: Colors.mutedText, marginTop: 12 },
})
