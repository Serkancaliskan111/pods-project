import { createContext, useContext } from 'react'

/** WhatsApp Web: sol liste + sağ panel; kanal seçimi sayfa değil state ile */
export const ChatShellContext = createContext(null)

export function useChatShell() {
  const ctx = useContext(ChatShellContext)
  if (!ctx) {
    throw new Error('useChatShell yalnızca ChatLayout içinde kullanılabilir')
  }
  return ctx
}

export function useChatShellOptional() {
  return useContext(ChatShellContext)
}
