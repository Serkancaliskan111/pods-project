import ChatSidebar from './ChatSidebar.jsx'
import { useChatSidebarResize } from './useChatSidebarResize.js'

/**
 * Solda kişi listesi + sürüklenebilir ayırıcı + sağ panel.
 * @param {'page' | 'quick'} variant
 */
export default function ChatWaShellFrame({
  variant = 'page',
  hasRoom = false,
  className = '',
  style,
  children,
}) {
  const { shellRef, sidebarWidth, onSplitterPointerDown, nudgeSidebar } = useChatSidebarResize(variant)

  return (
    <div
      ref={shellRef}
      className={`chat-wa-shell${variant === 'quick' ? ' chat-wa-shell--compact' : ''}${hasRoom ? ' chat-wa-shell--room-open' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <div className="chat-wa-sidebar-slot" style={{ width: sidebarWidth }}>
        <ChatSidebar />
      </div>
      <div
        className="chat-wa-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(sidebarWidth)}
        tabIndex={0}
        title="Genişliği ayarla"
        onMouseDown={onSplitterPointerDown}
        onTouchStart={onSplitterPointerDown}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 40 : 16
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            nudgeSidebar(e.key === 'ArrowLeft' ? -step : step)
          }
        }}
      />
      <div className="chat-wa-main chat-wa-main--stack">{children}</div>
    </div>
  )
}
