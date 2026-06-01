import { MessageCircle } from 'lucide-react'
import { useChatShellOptional } from './ChatShellContext.jsx'
import { chatWa } from './chatTheme.js'

export default function ChatEmpty() {
  const compact = useChatShellOptional()?.density === 'compact'
  return (
    <div className="chat-wa-empty">
      <MessageCircle
        className="chat-wa-empty__icon"
        size={compact ? 72 : 280}
        strokeWidth={0.5}
        color={chatWa.textMuted}
      />
      <p
        style={{
          margin: 0,
          fontSize: compact ? 12 : 14,
          textAlign: 'center',
          maxWidth: compact ? 260 : 420,
          lineHeight: 1.5,
        }}
      >
        Sohbetleriniz bilgisayarınızda görünür.
        <br />
        Soldan bir sohbet seçin veya yeni sohbet başlatın.
      </p>
    </div>
  )
}
