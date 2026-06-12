import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, ActivityIndicator, Alert } from 'react-native'
import {
  fetchTextAttachmentContent,
  getAttachmentPreviewKind,
  shareChatAttachmentFile,
} from '../lib/chatAttachmentPreviewUtils'
import { CenterModal, Text, Button, Heading, palette, spacing } from '../ui'

export default function ChatDocumentPreviewModal({ visible, onClose, url, fileName, mime }) {
  const kind = useMemo(() => getAttachmentPreviewKind({ mime, fileName }), [mime, fileName])
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle')
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!visible || !url) return undefined
    if (kind !== 'text') {
      setStatus('ready')
      setText('')
      return undefined
    }
    let alive = true
    setStatus('loading')
    setText('')
    void fetchTextAttachmentContent(url)
      .then((body) => {
        if (!alive) return
        setText(body)
        setStatus('ready')
      })
      .catch((e) => {
        if (!alive) return
        setStatus(e?.code === 'too_large' ? 'too_large' : 'error')
      })
    return () => {
      alive = false
    }
  }, [visible, url, kind])

  const runShare = async () => {
    if (sharing) return
    setSharing(true)
    try {
      await shareChatAttachmentFile({
        url,
        fileName,
        mime,
        textFallback: kind === 'text' && status === 'ready' ? text : null,
      })
    } catch (e) {
      Alert.alert('Paylaşılamadı', e?.message === 'share_unavailable' ? 'Bu cihazda paylaşım desteklenmiyor.' : 'Dosya paylaşılamadı.')
    } finally {
      setSharing(false)
    }
  }

  const title = fileName || 'Belge önizleme'

  return (
    <CenterModal visible={visible} onClose={onClose} maxWidth={400}>
      <Heading variant="h3" style={{ marginBottom: spacing.sm }} numberOfLines={2}>
        {title}
      </Heading>
      {kind === 'text' && status === 'loading' ? (
        <ActivityIndicator color={palette.primary[500]} style={{ marginVertical: spacing.lg }} />
      ) : null}

      {kind === 'text' && status === 'too_large' ? (
        <Text variant="bodySm" color={palette.slate[600]}>
          Dosya önizleme için çok büyük. Paylaş ile gönderebilirsiniz.
        </Text>
      ) : null}

      {kind === 'text' && status === 'error' ? (
        <Text variant="bodySm" color={palette.danger[600]}>
          Metin önizlemesi yüklenemedi.
        </Text>
      ) : null}

      {kind === 'text' && status === 'ready' ? (
        <ScrollView style={{ maxHeight: 360 }}>
          <Text variant="bodySm" color={palette.slate[800]} style={{ fontFamily: 'monospace' }}>
            {text || '(boş)'}
          </Text>
        </ScrollView>
      ) : null}

      {kind === 'pdf' ? (
        <Text variant="bodySm" color={palette.slate[600]} style={{ marginBottom: spacing.md }}>
          PDF burada açılmaz. Paylaş ile başka bir uygulamaya gönderebilirsiniz.
        </Text>
      ) : null}

      {kind === 'download' ? (
        <Text variant="bodySm" color={palette.slate[600]} style={{ marginBottom: spacing.md }}>
          Bu dosya türü için satır içi önizleme yok. Paylaş ile gönderebilirsiniz.
        </Text>
      ) : null}

      <Button
        variant="primary"
        size="md"
        fullWidth
        disabled={sharing || !url}
        onPress={() => void runShare()}
        style={{ marginTop: spacing.md }}
      >
        {sharing ? 'Hazırlanıyor…' : 'Paylaş'}
      </Button>
    </CenterModal>
  )
}
