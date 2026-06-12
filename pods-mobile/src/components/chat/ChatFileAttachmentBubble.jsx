import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, TouchableOpacity, View } from 'react-native'
import ChatDocumentPreviewModal from '../ChatDocumentPreviewModal'
import {
  fetchTextAttachmentContent,
  fileTypeIcon,
  getAttachmentPreviewKind,
  truncateTextPreview,
} from '../../lib/chatAttachmentPreviewUtils'
import { Text, palette } from '../../ui'

export default function ChatFileAttachmentBubble({ row, mine, styles, url }) {
  const fileName = row?.ek_orijinal_ad || 'Belge'
  const mime = row?.ek_mime
  const kind = useMemo(() => getAttachmentPreviewKind({ mime, fileName }), [mime, fileName])
  const icon = useMemo(() => fileTypeIcon(fileName, kind), [fileName, kind])
  const [docPreviewOpen, setDocPreviewOpen] = useState(false)
  const [textPreview, setTextPreview] = useState('')
  const [textStatus, setTextStatus] = useState('idle')

  useEffect(() => {
    if (!url || kind !== 'text') {
      setTextPreview('')
      setTextStatus('idle')
      return undefined
    }
    let alive = true
    setTextStatus('loading')
    setTextPreview('')
    void fetchTextAttachmentContent(url)
      .then((body) => {
        if (!alive) return
        setTextPreview(truncateTextPreview(body))
        setTextStatus('ready')
      })
      .catch((e) => {
        if (!alive) return
        setTextStatus(e?.code === 'too_large' ? 'too_large' : 'error')
      })
    return () => {
      alive = false
    }
  }, [url, kind])

  const kindHint =
    kind === 'pdf'
      ? 'PDF — önizleme ve paylaşım için dokunun'
      : kind === 'download'
        ? 'Önizleme ve paylaşım için dokunun'
        : null

  return (
    <>
      <TouchableOpacity
        onPress={() => setDocPreviewOpen(true)}
        activeOpacity={0.75}
        style={[styles.attFileChip, mine && styles.attFileChipMine]}
        accessibilityRole="button"
        accessibilityLabel={`${fileName}, önizle`}
      >
        <View style={styles.attFileChipHead}>
          <Text style={styles.attFileIcon}>{icon}</Text>
          <Text
            style={[styles.attFileName, mine && styles.attFileNameMine]}
            numberOfLines={2}
          >
            {fileName}
          </Text>
        </View>

        {kind === 'text' && textStatus === 'loading' ? (
          <ActivityIndicator
            size="small"
            color={palette.primary[500]}
            style={styles.attFilePreviewLoader}
          />
        ) : null}

        {kind === 'text' && textStatus === 'ready' && textPreview ? (
          <Text
            style={[styles.attFilePreview, mine && styles.attFilePreviewMine]}
            numberOfLines={4}
          >
            {textPreview}
          </Text>
        ) : null}

        {kind === 'text' && textStatus === 'too_large' ? (
          <Text style={[styles.attFileHint, mine && styles.attFileHintMine]}>
            Metin önizlemesi için dosya büyük — paylaşmak için dokunun
          </Text>
        ) : null}

        {kind === 'text' && textStatus === 'error' ? (
          <Text style={[styles.attFileHint, mine && styles.attFileHintMine]}>
            Önizleme yüklenemedi — paylaşmak için dokunun
          </Text>
        ) : null}

        {kindHint ? (
          <Text style={[styles.attFileHint, mine && styles.attFileHintMine]}>{kindHint}</Text>
        ) : null}
      </TouchableOpacity>

      <ChatDocumentPreviewModal
        visible={docPreviewOpen}
        onClose={() => setDocPreviewOpen(false)}
        url={url}
        fileName={fileName}
        mime={mime}
      />
    </>
  )
}
