import React, { useCallback, useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { X } from 'lucide-react-native'
import { fetchMyChannels, resolveChannelTitles } from '../../lib/chatApi'
import { buildMessagePreview } from '../../lib/chatMessagePreview'
import { Avatar } from '../../ui'

export default function ChatForwardModal({
  visible,
  theme,
  userId,
  companyId,
  excludeChannelId,
  sourceMessage,
  onClose,
  onForward,
  forwarding,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const raw = await fetchMyChannels(userId)
      const titled = await resolveChannelTitles(raw, userId, companyId)
      setRows(titled.filter((r) => String(r.id) !== String(excludeChannelId)))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [userId, companyId, excludeChannelId])

  useEffect(() => {
    if (visible) void load()
  }, [visible, load])

  const preview = sourceMessage ? buildMessagePreview(sourceMessage) : ''

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme?.composerBg || '#fff' }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme?.textPrimary }]}>Mesajı ilet</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <X size={22} color={theme?.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        {preview ? (
          <Text style={[styles.preview, { color: theme?.textSecondary }]} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={theme?.accent} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: theme?.receivedBubbleBorder }]}
                disabled={forwarding}
                onPress={() => onForward?.(item)}
              >
                <Avatar name={item.displayTitle} size="md" />
                <Text style={[styles.rowTitle, { color: theme?.textPrimary }]} numberOfLines={1}>
                  {item.displayTitle}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme?.textSecondary }]}>İletilecek sohbet yok</Text>
            }
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    marginTop: 'auto',
    maxHeight: '72%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  preview: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    padding: 24,
    fontSize: 14,
  },
})
