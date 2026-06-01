import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizeChatUuid } from '../../../lib/chatApi'
import { chatWa } from './chatTheme.js'
import { parseChatSearchParams } from './chatRouteUtils.js'
import { ChatShellContext } from './ChatShellContext.jsx'
import ChatWaShellFrame from './ChatWaShellFrame.jsx'
import { getChatWaCssVars } from './useChatSidebarResize.js'
import ChatEmpty from './ChatEmpty.jsx'
import ChatNewPage from './ChatNew.jsx'
import ChatRoomPage from './ChatRoom.jsx'
import './chat.css'

export default function ChatLayout() {
  const [searchParams, setSearchParams] = useSearchParams()
  const route = useMemo(() => parseChatSearchParams(searchParams), [searchParams])

  const [panel, setPanel] = useState(route.view)
  const [activeChannelId, setActiveChannelId] = useState(route.channelId)
  const [roomMounted, setRoomMounted] = useState(route.view === 'room' && !!route.channelId)

  useEffect(() => {
    setPanel(route.view)
    setActiveChannelId(route.channelId)
    if (route.view === 'room' && route.channelId) setRoomMounted(true)
  }, [route.view, route.channelId])

  const setChatSearch = useCallback(
    (params) => {
      setSearchParams(params, { replace: true, preventScrollReset: true })
    },
    [setSearchParams],
  )

  const openChannel = useCallback(
    (id) => {
      const cid = normalizeChatUuid(id)
      if (!cid) return
      setActiveChannelId(cid)
      setPanel('room')
      setRoomMounted(true)
      const next = new URLSearchParams()
      next.set('c', cid)
      if (searchParams.get('c') !== cid) {
        setChatSearch(next)
      }
    },
    [searchParams, setChatSearch],
  )

  const openNew = useCallback(() => {
    setPanel('new')
    if (searchParams.get('view') !== 'new') {
      setChatSearch(new URLSearchParams({ view: 'new' }))
    }
  }, [searchParams, setChatSearch])

  const openEmpty = useCallback(() => {
    setPanel('empty')
    if (searchParams.get('c') || searchParams.get('view')) {
      setChatSearch(new URLSearchParams())
    }
  }, [searchParams, setChatSearch])

  const shellValue = useMemo(
    () => ({
      panel,
      activeChannelId,
      openChannel,
      openNew,
      openEmpty,
    }),
    [panel, activeChannelId, openChannel, openNew, openEmpty],
  )

  const hasRoom = panel === 'room' || panel === 'new'

  return (
    <ChatShellContext.Provider value={shellValue}>
      <ChatWaShellFrame variant="page" hasRoom={hasRoom} style={getChatWaCssVars(chatWa)}>
        <div className={`chat-wa-panel${panel === 'empty' ? ' is-visible' : ''}`} aria-hidden={panel !== 'empty'}>
          <ChatEmpty />
        </div>
        <div className={`chat-wa-panel${panel === 'new' ? ' is-visible' : ''}`} aria-hidden={panel !== 'new'}>
          <ChatNewPage embedded />
        </div>
        {roomMounted && activeChannelId ? (
          <div className={`chat-wa-panel${panel === 'room' ? ' is-visible' : ''}`} aria-hidden={panel !== 'room'}>
            <ChatRoomPage key="wa-active-conversation" embedded channelId={activeChannelId} />
          </div>
        ) : null}
      </ChatWaShellFrame>
    </ChatShellContext.Provider>
  )
}
