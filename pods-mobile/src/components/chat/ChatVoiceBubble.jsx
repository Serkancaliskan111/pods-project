import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio'
import { Mic, Pause, Play } from 'lucide-react-native'
import { createChatAttachmentSignedUrl } from '../../lib/chatApi'
import { formatVoiceDuration } from '../../hooks/useChatVoiceRecord'
import { seedWaveformBars } from '../../lib/chatVoiceWaveformUtils'
import ChatVoiceWaveform from './ChatVoiceWaveform'
import ChatProfileAvatar from './ChatProfileAvatar'
import { Icon } from '../../ui'

export default function ChatVoiceBubble({
  row,
  mine,
  senderLabel,
  senderPhotoPath,
  theme,
  timeLabel,
  receipt,
  styles: msgStyles,
}) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  const player = useAudioPlayer(null, { updateInterval: 120 })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    player.loop = false
  }, [player])

  const bars = useMemo(
    () => seedWaveformBars(row?.id ?? row?.ek_yol ?? 'voice', 52),
    [row?.id, row?.ek_yol],
  )

  const fallbackDurationMs = (row?.ses_suresi_sn || 0) * 1000
  const durationMs =
    status.duration > 0 ? Math.round(status.duration * 1000) : fallbackDurationMs
  const positionMs = Math.round((status.currentTime || 0) * 1000)
  const playing = status.playing
  const progress = durationMs > 0 ? positionMs / durationMs : 0
  const durationLabel = formatVoiceDuration(durationMs || fallbackDurationMs)

  const waveActive = theme?.voiceWaveActive || theme?.brand || '#1d4ed8'
  const waveInactive = mine
    ? theme?.voiceWaveInactive || 'rgba(29,78,216,0.28)'
    : hexToRgba(theme?.textSecondary, 0.32)
  const playBg = mine ? `${waveActive}14` : `${waveActive}18`
  const playIcon = waveActive

  useEffect(() => {
    let alive = true
    const yol = row?.ek_yol
    if (!yol) return undefined
    createChatAttachmentSignedUrl(yol, 3600)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [row?.ek_yol])

  useEffect(() => {
    if (!url) return
    player.replace(url)
    player.loop = false
  }, [url, player])

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!status.didJustFinish) return
    player.pause()
    void player.seekTo(0)
  }, [status.didJustFinish, player])

  const togglePlay = useCallback(async () => {
    if (!url || loading) return
    try {
      if (playing) {
        player.pause()
        return
      }
      setLoading(true)
      if (
        status.didJustFinish ||
        (status.duration > 0 && status.currentTime >= status.duration - 0.05)
      ) {
        await player.seekTo(0)
      }
      player.play()
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [url, playing, loading, player, status.didJustFinish, status.duration, status.currentTime])

  if (failed) {
    return <Text style={msgStyles?.attFail}>Sesli mesaj açılamadı</Text>
  }

  return (
    <View style={voiceStyles.wrap}>
      <View style={voiceStyles.topRow}>
        <View style={voiceStyles.avatarWrap}>
          <ChatProfileAvatar name={senderLabel || '?'} photoPath={senderPhotoPath} size="sm" />
          <View style={[voiceStyles.micBadge, { backgroundColor: theme?.accent || '#2563eb', borderColor: mine ? (theme?.sentBubble || '#fff') : '#fff' }]}>
            <Mic size={9} color="#fff" strokeWidth={2.8} />
          </View>
        </View>

        <TouchableOpacity
          style={[voiceStyles.playBtn, { backgroundColor: playBg }]}
          activeOpacity={0.82}
          onPress={() => void togglePlay()}
          disabled={!url}
        >
          {loading || (url && !status.isLoaded && !playing) ? (
            <ActivityIndicator size="small" color={playIcon} />
          ) : playing ? (
            <Pause size={18} color={playIcon} strokeWidth={2.4} fill={playIcon} />
          ) : (
            <Play size={18} color={playIcon} strokeWidth={2.4} fill={playIcon} />
          )}
        </TouchableOpacity>

        <View style={voiceStyles.waveCol}>
          <ChatVoiceWaveform
            bars={bars}
            barCount={52}
            height={30}
            progress={playing || positionMs > 0 ? progress : 0}
            showScrubber={playing || positionMs > 0}
            activeColor={waveActive}
            inactiveColor={waveInactive}
            scrubberColor={waveActive}
          />
        </View>
      </View>

      <View style={voiceStyles.metaRow}>
        <Text style={[voiceStyles.duration, { color: theme?.textTime || theme?.textSecondary }]}>
          {durationLabel}
        </Text>
        <View style={voiceStyles.metaRight}>
          {timeLabel ? (
            <Text style={[voiceStyles.time, { color: theme?.textTime || theme?.textSecondary }]}>
              {timeLabel}
            </Text>
          ) : null}
          {receipt ? (
            <View style={voiceStyles.ticks}>
              {receipt.state === 'sent' ? (
                <Icon.Delivered
                  size={13}
                  color={receipt.read ? theme?.tickRead : theme?.tickDefault}
                  strokeWidth={2.4}
                />
              ) : (
                <Icon.Read
                  size={13}
                  color={receipt.read ? theme?.tickRead : theme?.tickDefault}
                  strokeWidth={2.4}
                />
              )}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(100,116,139,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const voiceStyles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingTop: 1,
    paddingBottom: 1,
    gap: 5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  avatarWrap: {
    width: 38,
    height: 38,
  },
  micBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 45,
    paddingRight: 1,
  },
  duration: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  time: {
    fontSize: 11,
    fontWeight: '400',
  },
  ticks: {
    marginLeft: 1,
  },
})
