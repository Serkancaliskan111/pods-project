import React, { useEffect, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native'
import { Pause, Play, Send, Trash2 } from 'lucide-react-native'
import ChatVoiceWaveform from './ChatVoiceWaveform'
import { formatVoiceDuration } from '../../hooks/useChatVoiceRecord'
import { padWaveformBars } from '../../lib/chatVoiceWaveformUtils'

export default function ChatVoiceRecordingBar({
  theme,
  durationMs,
  meterSamples,
  isPaused,
  sending,
  onCancel,
  onPauseToggle,
  onSend,
}) {
  const bars = useMemo(() => padWaveformBars(meterSamples, 56), [meterSamples])
  const accent = theme?.accent || '#2563eb'
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (isPaused) {
      pulse.setValue(1)
      return undefined
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 480, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [isPaused, pulse])

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.iconBtn} onPress={onCancel} disabled={sending} hitSlop={8}>
        <Trash2 size={21} color={theme?.textSecondary} strokeWidth={2} />
      </TouchableOpacity>

      <Animated.View style={[styles.recDot, { opacity: pulse, backgroundColor: '#ef4444' }]} />
      <Text style={[styles.timer, { color: theme?.textPrimary }]}>
        {formatVoiceDuration(durationMs)}
      </Text>

      <View style={styles.waveBox}>
        <ChatVoiceWaveform
          bars={bars}
          barCount={56}
          height={34}
          progress={0}
          showScrubber={false}
          activeColor={theme?.voiceWaveActive || accent}
          inactiveColor={theme?.voiceWaveInactive || 'rgba(100,116,139,0.35)'}
        />
      </View>

      <TouchableOpacity
        style={[styles.pauseBtn, isPaused && styles.pauseBtnActive]}
        onPress={onPauseToggle}
        disabled={sending}
      >
        {isPaused ? (
          <Play size={14} color="#fff" strokeWidth={2.4} fill="#fff" />
        ) : (
          <Pause size={14} color="#fff" strokeWidth={2.4} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.sendBtn, { backgroundColor: accent }]}
        onPress={onSend}
        disabled={sending || durationMs < 700}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Send size={19} color="#fff" strokeWidth={2.2} />
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 2,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timer: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
  },
  waveBox: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  pauseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnActive: {
    backgroundColor: '#dc2626',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
})
