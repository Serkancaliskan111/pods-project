import React, { useEffect, useMemo, useState } from 'react'
import { View, ScrollView, ActivityIndicator, Linking } from 'react-native'
import {
  fetchTextAttachmentContent,
  getAttachmentPreviewKind,
  openAttachmentExternally,
} from '../lib/chatAttachmentPreviewUtils'
import { CenterModal, Text, Button, Heading, palette, spacing } from '../ui'

export default function ChatDocumentPreviewModal({ visible, onClose, url, fileName, mime }) {
  const kind = useMemo(() => getAttachmentPreviewKind({ mime, fileName }), [mime, fileName])
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle')

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
          Dosya önizleme için çok büyük. İndirerek açabilirsiniz.
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
          PDF önizlemesi mobilde harici uygulamada açılır.
        </Text>
      ) : null}

      {kind === 'download' ? (
        <Text variant="bodySm" color={palette.slate[600]} style={{ marginBottom: spacing.md }}>
          Bu dosya türü için satır içi önizleme yok.
        </Text>
      ) : null}

      <Button
        variant="primary"
        size="md"
        fullWidth
        onPress={() => {
          if (url) void openAttachmentExternally(url, fileName)
          else if (url) void Linking.openURL(url)
        }}
        style={{ marginTop: spacing.md }}
      >
        {kind === 'pdf' ? 'PDF aç' : 'Dosyayı aç / paylaş'}
      </Button>
    </CenterModal>
  )
}
