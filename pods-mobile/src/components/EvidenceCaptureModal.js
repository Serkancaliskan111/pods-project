import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions, useMicrophonePermissions, Camera } from 'expo-camera'
import { StatusBar } from 'expo-status-bar'
import {
  X,
  Zap,
  ZapOff,
  Sun,
  RefreshCw,
  Flashlight,
  FlashlightOff,
  Image as ImageIconLucide,
  Video as VideoIconLucide,
  Mic,
  Minus,
  Plus,
} from 'lucide-react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Theme from '../theme/theme'

const ICON_SIZE = 22
const ICON_STROKE = 2.25
/** expo-camera: zoom 0 = geniş açı, 1 = cihazın maksimumu */
const ZOOM_STEP = 0.1
/** Native önizleme çoğu zaman jestleri yutar; üstte ince bir katman gerekir (Android’de özellikle). */
const PINCH_OVERLAY_COLOR = 'rgba(255,255,255,0.02)'

function clampZoom(v) {
  return Math.min(1, Math.max(0, v))
}

/**
 * Görev kanıtı için tam ekran uygulama kamerası (sistem kamera uygulaması yerine).
 * Foto: deklanşör + flaş döngüsü + ön/arka kamera.
 * Video: kayıt başlat / durdur + süre göstergesi + max süre (recordAsync).
 */
export default function EvidenceCaptureModal({
  visible,
  mode = 'photo',
  maxVideoDurationSec = 60,
  onClose,
  onPhotoComplete,
  onVideoComplete,
}) {
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [micPermission, requestMicPermission] = useMicrophonePermissions()
  const cameraRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [zoom, setZoom] = useState(0)
  const zoomRef = useRef(0)
  const pinchStartZoomRef = useRef(0)
  const pinchRafRef = useRef(null)
  const pinchPendingZoomRef = useRef(null)
  const [facing, setFacing] = useState('back')
  const [flash, setFlash] = useState('off')
  const [torch, setTorch] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const [capturingPhoto, setCapturingPhoto] = useState(false)
  const recordingStartedAt = useRef(null)
  const recordingTickRef = useRef(null)
  const recordingPromiseRef = useRef(null)

  const clearRecordingTick = () => {
    if (recordingTickRef.current) {
      clearInterval(recordingTickRef.current)
      recordingTickRef.current = null
    }
  }

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain !== false) {
      requestPermission()
    }
  }, [visible, permission, requestPermission])

  useEffect(() => {
    if (!visible || mode !== 'video') return
    if (!permission?.granted) return
    if (!micPermission) return
    if (micPermission.granted) return
    if (micPermission.canAskAgain === false) return
    requestMicPermission()
  }, [visible, mode, permission?.granted, micPermission, requestMicPermission])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    if (!visible) {
      setCameraReady(false)
      setIsRecording(false)
      setRecordingMs(0)
      setCapturingPhoto(false)
      recordingPromiseRef.current = null
      recordingStartedAt.current = null
      clearRecordingTick()
      setTorch(false)
      setZoom(0)
    }
  }, [visible])

  const flushPinchZoomFrame = useCallback(() => {
    pinchRafRef.current = null
    const v = pinchPendingZoomRef.current
    if (v != null) setZoom(v)
  }, [])

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .enabled(!isRecording && cameraReady)
        .onBegin(() => {
          pinchStartZoomRef.current = zoomRef.current
          pinchPendingZoomRef.current = null
          if (pinchRafRef.current != null) {
            cancelAnimationFrame(pinchRafRef.current)
            pinchRafRef.current = null
          }
        })
        .onUpdate((e) => {
          const next = clampZoom(pinchStartZoomRef.current + (e.scale - 1) * 0.65)
          pinchPendingZoomRef.current = next
          if (pinchRafRef.current == null) {
            pinchRafRef.current = requestAnimationFrame(flushPinchZoomFrame)
          }
        })
        .onEnd(() => {
          if (pinchPendingZoomRef.current != null) {
            setZoom(pinchPendingZoomRef.current)
          }
          pinchPendingZoomRef.current = null
          if (pinchRafRef.current != null) {
            cancelAnimationFrame(pinchRafRef.current)
            pinchRafRef.current = null
          }
        }),
    [isRecording, cameraReady, flushPinchZoomFrame],
  )

  const handleCameraReady = useCallback(() => {
    setCameraReady(true)
    // CameraX: zoomState bazen ilk karede 1x; prop yenilenmezse yakınlaştırma etkisiz kalır.
    if (Platform.OS === 'android') {
      const z = zoomRef.current
      requestAnimationFrame(() => {
        setZoom(clampZoom(z + 0.0002))
        requestAnimationFrame(() => setZoom(z))
      })
    }
  }, [])

  useEffect(() => {
    return () => {
      clearRecordingTick()
      if (pinchRafRef.current != null) {
        cancelAnimationFrame(pinchRafRef.current)
        pinchRafRef.current = null
      }
      try {
        cameraRef.current?.stopRecording?.()
      } catch {
        // ignore
      }
    }
  }, [])

  const cycleFlash = useCallback(() => {
    setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'))
  }, [])

  const formatDur = (sec) => {
    const s = Math.max(0, Math.floor(sec))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${String(r).padStart(2, '0')}`
  }

  const handleShutter = async () => {
    if (!cameraRef.current || !cameraReady || capturingPhoto || isRecording) return
    if (mode === 'photo') {
      setCapturingPhoto(true)
      try {
        const pic = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.85,
          shutterSound: true,
        })
        if (pic?.uri) {
          onPhotoComplete?.({ uri: pic.uri, base64: pic.base64 ?? null })
          onClose?.()
        }
      } catch (e) {
        Alert.alert('Fotoğraf', e?.message || 'Çekilemedi')
      } finally {
        setCapturingPhoto(false)
      }
      return
    }

    if (!isRecording) {
      try {
        let micStatus = (await Camera.getMicrophonePermissionsAsync()).status
        if (micStatus !== 'granted') {
          const req = await Camera.requestMicrophonePermissionsAsync()
          micStatus = req.status
        }
        if (micStatus !== 'granted') {
          Alert.alert(
            'Mikrofon izni',
            'Video kanıtında ses kaydı için mikrofon izni gerekir. Reddettiyseniz izni Ayarlar üzerinden açabilirsiniz.',
            [
              { text: 'Tamam', style: 'cancel' },
              ...(Platform.OS !== 'web'
                ? [{ text: 'Ayarlara git', onPress: () => Linking.openSettings() }]
                : []),
            ],
          )
          return
        }

        recordingStartedAt.current = Date.now()
        setRecordingMs(0)
        clearRecordingTick()
        recordingTickRef.current = setInterval(() => {
          if (!recordingStartedAt.current) return
          setRecordingMs(Date.now() - recordingStartedAt.current)
        }, 200)
        setIsRecording(true)
        const maxDur = Math.min(60, Math.max(5, Number(maxVideoDurationSec) || 60))
        const p = cameraRef.current.recordAsync({
          maxDuration: maxDur,
        })
        recordingPromiseRef.current = p
        const result = await p
        clearRecordingTick()
        recordingPromiseRef.current = null
        setIsRecording(false)
        const elapsedSec =
          recordingStartedAt.current != null
            ? (Date.now() - recordingStartedAt.current) / 1000
            : 0
        recordingStartedAt.current = null
        if (result?.uri) {
          const capped = Math.min(elapsedSec, maxDur)
          onVideoComplete?.({ uri: result.uri, durationSec: capped })
          onClose?.()
        }
      } catch (e) {
        clearRecordingTick()
        recordingPromiseRef.current = null
        setIsRecording(false)
        recordingStartedAt.current = null
        const msg = e?.message || String(e)
        if (!msg.toLowerCase().includes('cancel')) {
          Alert.alert('Video', msg || 'Kayıt tamamlanamadı')
        }
      }
    }
  }

  const handleStopRecording = () => {
    if (!isRecording || !cameraRef.current) return
    try {
      cameraRef.current.stopRecording()
    } catch {
      // ignore
    }
  }

  const flipFacing = () => {
    if (isRecording) return
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'))
    setTorch(false)
    setZoom(0)
  }

  const bumpZoom = (delta) => {
    if (!cameraReady || isRecording) return
    setZoom((z) => clampZoom(z + delta))
  }

  const camMode = mode === 'photo' ? 'picture' : 'video'
  const maxDurSafe = Math.min(60, Math.max(5, Number(maxVideoDurationSec) || 60))

  const flashAccessibilityLabel =
    mode === 'photo'
      ? flash === 'off'
        ? 'Flaş kapalı'
        : flash === 'on'
          ? 'Flaş açık'
          : 'Flaş otomatik'
      : torch
        ? 'Işık açık'
        : 'Işık kapalı'

  const flashIconProps = { size: ICON_SIZE, color: '#fff', strokeWidth: ICON_STROKE }

  if (!visible) return null

  const cameraDenied = Boolean(permission && !permission.granted)
  const micDenied =
    mode === 'video' && Boolean(permission?.granted && micPermission && !micPermission.granted)
  const denied = cameraDenied || micDenied

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <StatusBar style="light" />
      <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {denied ? (
          <View style={styles.deniedWrap}>
            <View style={styles.deniedCard}>
              <View style={styles.deniedIconCircle}>
                {cameraDenied ? (
                  <ImageIconLucide size={28} color={Theme.Colors.accent} strokeWidth={ICON_STROKE} />
                ) : (
                  <Mic size={28} color={Theme.Colors.accent} strokeWidth={ICON_STROKE} />
                )}
              </View>
              <Text style={styles.deniedTitle}>{cameraDenied ? 'Kamera izni' : 'Mikrofon izni'}</Text>
              <Text style={styles.deniedText}>
                {cameraDenied
                  ? 'Kanıt fotoğrafı veya videosu için kameraya erişime ihtiyacımız var. Ayarlardan da açabilirsiniz.'
                  : 'Video kanıtında ses kaydı için mikrofon izni gerekiyor. Ayarlardan da açabilirsiniz.'}
              </Text>
              <TouchableOpacity
                style={styles.deniedPrimary}
                onPress={cameraDenied ? requestPermission : requestMicPermission}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={cameraDenied ? 'Kamera izni iste' : 'Mikrofon izni iste'}
              >
                <Text style={styles.deniedPrimaryText}>İzin ver</Text>
              </TouchableOpacity>
              {!cameraDenied && micPermission?.canAskAgain === false ? (
                <TouchableOpacity
                  style={styles.deniedSecondary}
                  onPress={() => Linking.openSettings()}
                  accessibilityRole="button"
                  accessibilityLabel="Sistem ayarlarını aç"
                >
                  <Text style={styles.deniedSecondaryText}>Ayarlara git</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.deniedGhost}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Vazgeç"
              >
                <Text style={styles.deniedGhostText}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.previewWrap}>
              <View style={styles.cameraGestureHost} collapsable={false}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  mode={camMode}
                  flash={mode === 'photo' ? flash : 'off'}
                  enableTorch={mode === 'video' && torch}
                  mirror={facing === 'front'}
                  zoom={zoom}
                  videoQuality="720p"
                  mute={false}
                  onCameraReady={handleCameraReady}
                />
                <GestureDetector gesture={pinchGesture}>
                  <View
                    style={styles.pinchOverlay}
                    collapsable={false}
                    pointerEvents={cameraReady && !isRecording ? 'auto' : 'none'}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                </GestureDetector>
              </View>

              <View style={[styles.topScrim, { paddingTop: 10 }]} pointerEvents="box-none">
                <View style={[styles.topRow, { paddingLeft: Math.max(12, insets.left), paddingRight: Math.max(12, insets.right) }]}>
                  <TouchableOpacity
                    style={styles.roundBtn}
                    onPress={onClose}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel="Kapat"
                  >
                    <X size={ICON_SIZE} color="#fff" strokeWidth={ICON_STROKE} />
                  </TouchableOpacity>

                  <View style={styles.modeChip}>
                    {mode === 'photo' ? (
                      <ImageIconLucide size={14} color="rgba(255,255,255,0.9)" strokeWidth={2} />
                    ) : (
                      <VideoIconLucide size={14} color="rgba(255,255,255,0.9)" strokeWidth={2} />
                    )}
                    <Text style={styles.modeChipText}>
                      {mode === 'photo' ? 'Fotoğraf kanıtı' : `Video · ${maxDurSafe} sn`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.roundBtn, isRecording && styles.roundBtnDisabled]}
                    onPress={mode === 'photo' ? cycleFlash : () => setTorch((t) => !t)}
                    disabled={isRecording}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel={flashAccessibilityLabel}
                  >
                    {mode === 'photo' ? (
                      flash === 'off' ? (
                        <ZapOff {...flashIconProps} />
                      ) : flash === 'on' ? (
                        <Zap {...flashIconProps} />
                      ) : (
                        <Sun {...flashIconProps} />
                      )
                    ) : torch ? (
                      <Flashlight {...flashIconProps} />
                    ) : (
                      <FlashlightOff {...flashIconProps} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {mode === 'video' && isRecording ? (
                <View style={styles.recordingPill}>
                  <View style={styles.recPulse}>
                    <View style={styles.recDot} />
                  </View>
                  <Text style={styles.recText}>
                    {formatDur(recordingMs / 1000)}
                    <Text style={styles.recTextMuted}> / {formatDur(maxDurSafe)}</Text>
                  </Text>
                </View>
              ) : null}

              <View style={[styles.zoomBarWrap, { bottom: 12 }]} pointerEvents="box-none">
                <View style={styles.zoomBar}>
                  <TouchableOpacity
                    style={[styles.zoomBtn, (!cameraReady || isRecording || zoom <= 0) && styles.zoomBtnDisabled]}
                    onPress={() => bumpZoom(-ZOOM_STEP)}
                    disabled={!cameraReady || isRecording || zoom <= 0}
                    accessibilityRole="button"
                    accessibilityLabel="Uzaklaştır"
                  >
                    <Minus size={20} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                  <Text style={styles.zoomPct} accessibilityLiveRegion="polite">
                    {Math.round(zoom * 100)}%
                  </Text>
                  <TouchableOpacity
                    style={[styles.zoomBtn, (!cameraReady || isRecording || zoom >= 1) && styles.zoomBtnDisabled]}
                    onPress={() => bumpZoom(ZOOM_STEP)}
                    disabled={!cameraReady || isRecording || zoom >= 1}
                    accessibilityRole="button"
                    accessibilityLabel="Yakınlaştır"
                  >
                    <Plus size={20} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.zoomHint}>İki parmakla yakınlaştırabilirsiniz</Text>
              </View>

              {!cameraReady ? (
                <View style={styles.readyOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.readyText}>Kamera hazırlanıyor</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.bottomScrim, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              {mode !== 'photo' ? (
                <Text style={styles.hintText}>
                  {isRecording
                    ? 'Bitirdiğinizde kaydı durdurun'
                    : 'Kayıt süresi sınırı uygulanır'}
                </Text>
              ) : null}

              <View style={styles.bottomRow}>
                <TouchableOpacity
                  style={[styles.sideRoundBtn, isRecording && styles.sideRoundBtnDisabled]}
                  onPress={flipFacing}
                  disabled={isRecording}
                  accessibilityRole="button"
                  accessibilityLabel="Ön ve arka kamera arasında geç"
                >
                  <RefreshCw size={ICON_SIZE} color="#fff" strokeWidth={ICON_STROKE} />
                </TouchableOpacity>

                {mode === 'photo' ? (
                  <TouchableOpacity
                    style={[
                      styles.shutterRing,
                      (!cameraReady || capturingPhoto) && styles.shutterDisabled,
                    ]}
                    onPress={handleShutter}
                    disabled={!cameraReady || capturingPhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Fotoğraf çek"
                  >
                    {capturingPhoto ? (
                      <ActivityIndicator color="#0f172a" />
                    ) : (
                      <View style={styles.shutterDisc} />
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.videoCenter}>
                    {!isRecording ? (
                      <TouchableOpacity
                        style={[styles.recordStartBtn, !cameraReady && styles.shutterDisabled]}
                        onPress={handleShutter}
                        disabled={!cameraReady}
                        accessibilityRole="button"
                        accessibilityLabel="Kayda başla"
                      >
                        <View style={styles.recordStartInner} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.recordStopBtn}
                        onPress={handleStopRecording}
                        accessibilityRole="button"
                        accessibilityLabel="Kaydı durdur"
                      >
                        <View style={styles.recordStopSquare} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <View style={styles.sidePlaceholder} />
              </View>
            </View>
          </>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: '#050508',
  },
  previewWrap: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  cameraGestureHost: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  pinchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PINCH_OVERLAY_COLOR,
    zIndex: 2,
  },
  zoomBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: 'center',
    gap: 6,
  },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: Theme.Radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 14,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomBtnDisabled: {
    opacity: 0.35,
  },
  zoomPct: {
    minWidth: 44,
    textAlign: 'center',
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  zoomHint: {
    color: 'rgba(226,232,240,0.65)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roundBtnDisabled: {
    opacity: 0.35,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Theme.Radii.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  modeChipText: {
    color: 'rgba(248,250,252,0.95)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  recordingPill: {
    position: 'absolute',
    top: 118,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(220,38,38,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Theme.Radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  recPulse: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  recText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  recTextMuted: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
  },
  readyOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(5,5,8,0.55)',
    zIndex: 2,
  },
  readyText: {
    marginTop: 14,
    color: 'rgba(226,232,240,0.95)',
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  bottomScrim: {
    paddingTop: 18,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(5,5,8,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  hintText: {
    textAlign: 'center',
    color: 'rgba(148,163,184,0.95)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.25,
    marginBottom: 18,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideRoundBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideRoundBtnDisabled: {
    opacity: 0.35,
  },
  sidePlaceholder: {
    width: 52,
    height: 52,
  },
  shutterRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  shutterDisabled: {
    opacity: 0.42,
  },
  shutterDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  videoCenter: {
    width: 82,
    height: 82,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordStartBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.25)',
  },
  recordStartInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#dc2626',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  recordStopBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordStopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  deniedWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Theme.Spacing.md,
  },
  deniedCard: {
    borderRadius: 20,
    paddingVertical: Theme.Spacing.lg,
    paddingHorizontal: Theme.Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  deniedIconCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(233,84,34,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.Spacing.sm,
  },
  deniedTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  deniedText: {
    color: 'rgba(148,163,184,0.95)',
    marginBottom: 22,
    lineHeight: 22,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  deniedPrimary: {
    backgroundColor: Theme.Colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  deniedPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  deniedSecondary: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  deniedSecondaryText: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 15,
  },
  deniedGhost: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  deniedGhostText: {
    color: 'rgba(148,163,184,0.95)',
    fontWeight: '700',
    fontSize: 15,
  },
})
