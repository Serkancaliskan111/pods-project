import { useEffect, useRef } from 'react'
import { CHAT_EMOJI_LIST } from './chatEmojiData.js'

export default function ChatEmojiPicker({ open, anchorRef, onPick, onClose }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      const t = e.target
      if (panelRef.current?.contains(t)) return
      if (anchorRef?.current?.contains(t)) return
      onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchorRef, onClose])

  if (!open) return null

  return (
    <div ref={panelRef} className="chat-wa-emoji-popover" role="dialog" aria-label="Emoji seç">
      <div className="chat-wa-emoji-popover__grid">
        {CHAT_EMOJI_LIST.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            className="chat-wa-emoji-popover__item"
            onClick={() => onPick(emoji)}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
