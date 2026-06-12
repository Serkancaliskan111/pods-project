import { callPodsAiTaskAssign } from './callPodsAiTaskAssign'
import { mergeIntentPatch } from './mergeIntentPatch'
import { processUserMessage, applyTextToIntent } from './orchestrator'
import { validateIntent, gapQuestion, formatGapChecklist } from './validateIntent'
import { isConfirmIntent } from './parseMessage'

/**
 * LLM + kural hibrit: önce edge LLM, başarısızsa yerel kural motoru.
 * Doğrulama her zaman validateIntent ile (güvenli katman).
 */
export async function processUserMessageHybrid(messages, userText, context, intent) {
  const trimmed = String(userText || '').trim()
  if (!trimmed) {
    return { messages, intent, ready: false, usedLlm: false }
  }

  const llm = await callPodsAiTaskAssign({
    userText: trimmed,
    messages,
    intent,
    context,
  })

  if (!llm.fallback && llm.intentPatch) {
    let updated = mergeIntentPatch(intent, llm.intentPatch, context)
    updated = applyTextToIntent(updated, trimmed, context)
    const { gaps, ready } = validateIntent(updated, context)

    let replyText = String(llm.reply || '').trim()
    if (!replyText) {
      if (ready) {
        replyText = isConfirmIntent(trimmed)
          ? 'Önizleme hazır. **Atamayı tamamla** ile görevi oluşturabilirsiniz.'
          : 'Bilgiler tamam. Önizlemeyi kontrol edin.'
      } else {
        const checklist = formatGapChecklist(updated, context)
        replyText = gapQuestion(gaps[0], updated)
        if (checklist.length) replyText += `\n\nEksik: ${checklist.join(', ')}`
      }
    }

    const assistantMsg = { role: 'assistant', text: replyText, preview: ready, usedLlm: true }
    return {
      messages: [...messages, { role: 'user', text: trimmed }, assistantMsg],
      intent: updated,
      ready,
      gaps,
      usedLlm: true,
    }
  }

  const ruleResult = processUserMessage(messages, trimmed, context, intent)
  return { ...ruleResult, usedLlm: false, llmFallbackReason: llm.reason }
}
