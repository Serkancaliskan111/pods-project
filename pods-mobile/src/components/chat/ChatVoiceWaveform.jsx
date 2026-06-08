import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { padWaveformBars } from '../../lib/chatVoiceWaveformUtils'

/**
 * WhatsApp tarzı dikey çubuk dalga formu + oynatma scrubber noktası.
 */
export default function ChatVoiceWaveform({
  bars,
  barCount = 42,
  height = 28,
  progress = 0,
  showScrubber = false,
  activeColor = '#128C7E',
  inactiveColor = 'rgba(18,140,126,0.28)',
  scrubberColor = '#128C7E',
}) {
  const normalized = useMemo(() => padWaveformBars(bars, barCount), [bars, barCount])
  const prog = Math.max(0, Math.min(1, progress))
  const scrubberLeftPct = Math.max(2, Math.min(98, prog * 100))

  return (
    <View style={[styles.wrap, { height }]}>
      <View style={styles.barsRow}>
        {normalized.map((level, i) => {
          const barProgress = (i + 0.5) / normalized.length
          const played = barProgress <= prog
          const barH = Math.max(4, level * (height - 6))
          return (
            <View
              key={`b-${i}`}
              style={[
                styles.bar,
                {
                  height: barH,
                  backgroundColor: played ? activeColor : inactiveColor,
                  opacity: played ? 1 : 0.85,
                },
              ]}
            />
          )
        })}
      </View>
      {showScrubber ? (
        <View
          pointerEvents="none"
          style={[
            styles.scrubber,
            {
              left: `${scrubberLeftPct}%`,
              backgroundColor: scrubberColor,
              top: height / 2 - 6,
            },
          ]}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 96,
    position: 'relative',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 1.2,
    height: '100%',
    paddingHorizontal: 1,
  },
  bar: {
    flex: 1,
    maxWidth: 2.5,
    borderRadius: 1.5,
    minHeight: 4,
  },
  scrubber: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
})
