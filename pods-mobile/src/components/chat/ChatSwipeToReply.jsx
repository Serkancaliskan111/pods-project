import React, { useMemo, useRef } from 'react'
import { View, StyleSheet, Animated, PanResponder } from 'react-native'
import { CornerUpLeft } from 'lucide-react-native'

const SWIPE_THRESHOLD = 24
const MAX_SWIPE = 36

function isHorizontalReplySwipe(g) {
  return g.dx > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.05
}

/**
 * WhatsApp tarzı: mesaj balonunu sağa çekince cevapla.
 * Shrink-wrap — flex:1 kullanılmaz, balon genişliği bozulmaz.
 */
export default function ChatSwipeToReply({ children, onReply, theme, mine = false, enabled = true }) {
  const translateX = useRef(new Animated.Value(0)).current
  const iconOpacity = useRef(new Animated.Value(0)).current
  const iconScale = useRef(new Animated.Value(0.55)).current
  const firedRef = useRef(false)
  const onReplyRef = useRef(onReply)
  const enabledRef = useRef(enabled)
  onReplyRef.current = onReply
  enabledRef.current = enabled

  const resetPosition = () => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
      }),
      Animated.timing(iconOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(iconScale, {
        toValue: 0.55,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => isHorizontalReplySwipe(g) && enabledRef.current,
        onMoveShouldSetPanResponderCapture: (_, g) => isHorizontalReplySwipe(g) && enabledRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          if (!enabledRef.current || g.dx <= 0) return
          const x = Math.min(g.dx, MAX_SWIPE)
          translateX.setValue(x)
          const p = Math.min(1, x / SWIPE_THRESHOLD)
          iconOpacity.setValue(p * 0.92)
          iconScale.setValue(0.6 + p * 0.4)
        },
        onPanResponderRelease: (_, g) => {
          if (!enabledRef.current) {
            resetPosition()
            return
          }
          const x = Math.max(0, Math.min(g.dx, MAX_SWIPE))
          const fastSwipe = g.vx > 0.35 && g.dx > 12
          if ((x >= SWIPE_THRESHOLD || fastSwipe) && !firedRef.current) {
            firedRef.current = true
            onReplyRef.current?.()
            setTimeout(() => {
              firedRef.current = false
            }, 400)
          }
          resetPosition()
        },
        onPanResponderTerminate: resetPosition,
      }),
    [iconOpacity, iconScale, translateX],
  )

  const accent = theme?.accent || '#128C7E'

  return (
    <View
      style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.replyIconWrap,
          {
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={[styles.replyIconBubble, { backgroundColor: `${accent}22` }]}>
          <CornerUpLeft size={16} color={accent} strokeWidth={2.4} />
        </View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }}>{children}</Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    maxWidth: '82%',
  },
  wrapMine: {
    alignSelf: 'flex-end',
  },
  wrapTheirs: {
    alignSelf: 'flex-start',
  },
  replyIconWrap: {
    position: 'absolute',
    left: -2,
    top: '50%',
    marginTop: -14,
    zIndex: 0,
  },
  replyIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
