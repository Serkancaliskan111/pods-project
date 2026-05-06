import React from 'react'
import { VideoView, useVideoPlayer } from 'expo-video'

/** Yerel veya uzak URI için tek kanıt videosu (expo-video / VideoView). */
export default function EvidenceVideoPlayer({
  uri,
  style,
  /** iOS/Android yerel oynatma çubuğu (play/duraklat, süre, ses). */
  nativeControls = true,
  contentFit = 'contain',
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
  })
  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={nativeControls}
      contentFit={contentFit}
    />
  )
}
