const FORWARD_MARKERS = ['↪ İletildi', 'İletildi']

/** @returns {{ forwarded: boolean, reply: { sender: string, preview: string } | null, body: string }} */
export function parseChatMessageContent(raw) {
  let text = String(raw ?? '')
  let forwarded = false

  for (const marker of FORWARD_MARKERS) {
    if (text === marker) {
      forwarded = true
      text = ''
      break
    }
    if (text.startsWith(`${marker}\n`)) {
      forwarded = true
      text = text.slice(marker.length + 1)
      break
    }
  }

  let reply = null
  if (text.startsWith('↩ ')) {
    const nl = text.indexOf('\n')
    const header = nl === -1 ? text : text.slice(0, nl)
    const rest = nl === -1 ? '' : text.slice(nl + 1)
    const colon = header.indexOf(': ')
    if (colon > 2) {
      reply = {
        sender: header.slice(2, colon).trim(),
        preview: header.slice(colon + 2).trim(),
      }
      text = rest
    }
  }

  return {
    forwarded,
    reply,
    body: text.trim(),
  }
}

export function formatReplyMessageBody({ sender, preview, body }) {
  const quote = `↩ ${sender}: ${preview}`
  const t = String(body || '').trim()
  return t ? `${quote}\n${t}` : quote
}

export function formatForwardedMessageBody(body) {
  const t = String(body || '').trim()
  return t ? `↪ İletildi\n${t}` : '↪ İletildi'
}
