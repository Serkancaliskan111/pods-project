import { useCallback, useEffect, useState } from 'react'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { normalizeAudioMeter, pushMeterSample } from '../lib/chatVoiceWaveformUtils'

const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
}

export function useChatVoiceRecord() {
  const audioRecorder = useAudioRecorder(RECORD_OPTIONS)
  const recorderState = useAudioRecorderState(audioRecorder, 120)
  const [sessionActive, setSessionActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [meterSamples, setMeterSamples] = useState([])

  useEffect(() => {
    if (!sessionActive || isPaused || !recorderState.isRecording) return
    const level =
      recorderState.metering != null
        ? normalizeAudioMeter(recorderState.metering)
        : 0.15 + Math.random() * 0.4
    setMeterSamples((prev) => pushMeterSample(prev, level))
  }, [
    recorderState.isRecording,
    recorderState.metering,
    recorderState.durationMillis,
    isPaused,
  ])

  const start = useCallback(async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync()
    if (!perm.granted) {
      throw new Error('Sesli mesaj için mikrofon izni gerekli.')
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    })
    await audioRecorder.prepareToRecordAsync()
    audioRecorder.record()
    setSessionActive(true)
    setIsPaused(false)
    setMeterSamples([0.12, 0.18, 0.14, 0.22])
  }, [audioRecorder])

  const stopInternal = useCallback(async () => {
    if (!sessionActive) return null
    setSessionActive(false)
    setIsPaused(false)
    setMeterSamples([])

    const duration = recorderState.durationMillis || 0
    let uri = null
    try {
      await audioRecorder.stop()
      uri = audioRecorder.uri
    } catch {
      return null
    }

    await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    if (!uri || duration < 700) return null

    const lower = String(uri).toLowerCase()
    let fileName = `ses_${Date.now()}.m4a`
    let mimeType = 'audio/mp4'
    if (lower.endsWith('.caf')) {
      fileName = `ses_${Date.now()}.caf`
      mimeType = 'audio/x-caf'
    } else if (lower.endsWith('.3gp')) {
      fileName = `ses_${Date.now()}.3gp`
      mimeType = 'audio/3gpp'
    }
    return {
      uri,
      mimeType,
      fileName,
      durationMs: duration,
      durationSec: Math.max(1, Math.round(duration / 1000)),
    }
  }, [audioRecorder, recorderState.durationMillis, sessionActive])

  const stop = useCallback(async () => stopInternal(), [stopInternal])

  const cancel = useCallback(async () => {
    setSessionActive(false)
    setIsPaused(false)
    setMeterSamples([])
    try {
      if (recorderState.isRecording) {
        await audioRecorder.stop()
      }
    } catch {
      /* ignore */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
  }, [audioRecorder, recorderState.isRecording])

  const togglePause = useCallback(async () => {
    if (!sessionActive) return
    try {
      if (recorderState.isRecording) {
        audioRecorder.pause()
        setIsPaused(true)
      } else if (isPaused) {
        audioRecorder.record()
        setIsPaused(false)
      }
    } catch {
      /* ignore */
    }
  }, [audioRecorder, recorderState.isRecording, isPaused, sessionActive])

  return {
    isRecording: sessionActive && (recorderState.isRecording || isPaused),
    isPaused,
    durationMs: recorderState.durationMillis || 0,
    meterSamples,
    start,
    stop,
    cancel,
    togglePause,
  }
}

export function formatVoiceDuration(ms) {
  const totalSec = Math.max(0, Math.round((ms || 0) / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
