import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { normalizeChatUuid } from '../../lib/chatApi.js'
import { chatWa } from '../../pages/admin/chat/chatTheme.js'
import { ChatShellContext } from '../../pages/admin/chat/ChatShellContext.jsx'
import ChatWaShellFrame from '../../pages/admin/chat/ChatWaShellFrame.jsx'
import { getChatWaCssVars } from '../../pages/admin/chat/useChatSidebarResize.js'
import ChatEmpty from '../../pages/admin/chat/ChatEmpty.jsx'
import ChatNewPage from '../../pages/admin/chat/ChatNew.jsx'
import ChatRoomPage from '../../pages/admin/chat/ChatRoom.jsx'
import '../../pages/admin/chat/chat.css'

export default function QuickChatPanel({ onClose }) {
  const { user, personel } = useContext(AuthContext)
  const companyId = personel?.ana_sirket_id

  const [panel, setPanel] = useState('empty')
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [roomMounted, setRoomMounted] = useState(false)

  const openChannel = useCallback((id) => {
    const cid = normalizeChatUuid(id)
    if (!cid) return
    setActiveChannelId(cid)
    setPanel('room')
    setRoomMounted(true)
  }, [])

  const openNew = useCallback(() => {
    setPanel('new')
  }, [])

  const openEmpty = useCallback(() => {
    setPanel('empty')
  }, [])

  const shellValue = useMemo(
    () => ({
      panel,
      activeChannelId,
      openChannel,
      openNew,
      openEmpty,
      density: 'compact',
    }),
    [panel, activeChannelId, openChannel, openNew, openEmpty],
  )

  const hasRoom = panel === 'room' || panel === 'new'

  useEffect(() => {
    if (!user?.id || !companyId) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [user?.id, companyId, onClose])

  if (!user?.id || !companyId) return null

  return (
    <div className="quick-chat-popover" role="dialog" aria-label="Sohbetler">
      <button
        type="button"
        onClick={onClose}
        className="quick-chat-popover__close"
        aria-label="Kapat"
      >
        <X size={18} strokeWidth={2} />
      </button>

      <ChatShellContext.Provider value={shellValue}>
        <ChatWaShellFrame
          variant="quick"
          hasRoom={hasRoom}
          className="quick-chat-popover__shell"
          style={getChatWaCssVars(chatWa)}
        >
          <div className={`chat-wa-panel${panel === 'empty' ? ' is-visible' : ''}`} aria-hidden={panel !== 'empty'}>
            <ChatEmpty />
          </div>
          <div className={`chat-wa-panel${panel === 'new' ? ' is-visible' : ''}`} aria-hidden={panel !== 'new'}>
            <ChatNewPage embedded />
          </div>
          {roomMounted && activeChannelId ? (
            <div className={`chat-wa-panel${panel === 'room' ? ' is-visible' : ''}`} aria-hidden={panel !== 'room'}>
              <ChatRoomPage key={`quick-${activeChannelId}`} embedded channelId={activeChannelId} />
            </div>
          ) : null}
        </ChatWaShellFrame>
      </ChatShellContext.Provider>
    </div>
  )
}
