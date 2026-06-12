import { callPodsAiTaskAssign } from './callPodsAiTaskAssign'
import { mergeIntentPatch } from './mergeIntentPatch'
import { applyTextToIntent, createEmptyIntent } from './orchestrator'
import { displayTaskTitle } from './inferIntentBaslikAciklama'
import { validateIntent, formatNextGapQuestion } from './validateIntent'
import { shouldAutoAssignWhenReady, isExplicitParallelAssignment, isExplicitSequentialChain } from './parseMessage'
import { isUnitWideAssignment, isTeamWideAssignment } from './unitAssignment.js'
import { isTaskAssignmentTopic, offTopicReply } from './taskTopicGate'
import { isHelpRequest, allModesHelp, explainMode } from './knowledge.js'
import { ensureFutureScheduleFlags } from './premiumOrchestratorUtils.js'
import { validateScheduleIntent } from './scheduleIntentUtils.js'

function noopTrace() {
  return { id: '', log: () => {}, intent: () => {} }
}

function buildHelpReply(userText, intent) {
  if (/mod|tür|tur|fark/.test(String(userText).toLocaleLowerCase('tr'))) {
    return `Görev türleri:\n${allModesHelp()}`
  }
  if (intent?.mode) return explainMode(intent.mode)
  return `Görev türleri:\n${allModesHelp()}\n\nKısaca görevinizi yazmanız yeterli; türü otomatik çıkarırım.`
}

function safeProcessIntent(intent, text, context, options) {
  try {
    return applyTextToIntent(intent, text, context, options)
  } catch (err) {
    console.error('[Pods AI] applyTextToIntent failed', err)
    return intent
  }
}

function safeValidate(intent, context) {
  try {
    return validateIntent(intent, context)
  } catch (err) {
    console.error('[Pods AI] validateIntent failed', err)
    return { gaps: ['mode'], ready: false, intent: intent || createEmptyIntent() }
  }
}

function buildResultMessages(messages, userText, replyText, usedLlm) {
  return [
    ...messages,
    { role: 'user', text: userText },
    { role: 'assistant', text: replyText, usedLlm: !!usedLlm },
  ]
}

/** Kural motoru — sessiz intent parse (kullanıcıya cevap üretmez) */
function silentRuleParse(intent, trimmed, context, activeGap, messages) {
  const parsed = safeProcessIntent(intent, trimmed, context, {
    expectedGap: activeGap,
    contextMessages: messages,
  })
  return safeValidate(ensureFutureScheduleFlags(parsed), {
    ...context,
    lastUserText: trimmed,
  })
}

function looksLikeAssignClaim(text) {
  const t = String(text || '')
  return /\b(başarıyla|basariyla|basarıyla|atandı|atandi|atadım|atadim|atıyorum|atiyorum|verildi|oluşturuldu|olusturuldu|kaydedildi|tamamlandı|tamamlandi)\b/i.test(
    t,
  )
}

function looksLikePrematureAssignReply(text) {
  return looksLikeAssignClaim(text)
}

/** LLM reply — atama iddiasını yalnızca validateIntent ready iken kabul et */
function finalizeReply({ llmReply, ready, gaps, intent, context, llmUsed }) {
  const custom = String(llmReply || '').trim()
  const title = displayTaskTitle(intent) || intent.baslik || 'görev'

  if (ready) {
    return `Tamam, **${title}** oluşturuluyor…`
  }

  if (custom && looksLikeAssignClaim(custom)) {
    if (gaps?.length) return formatNextGapQuestion(gaps, intent, context)
    const v = validateScheduleIntent(intent)
    if (v.issue) return v.issue
    return 'Birkaç detay daha lazım — devam edelim.'
  }

  if (llmUsed && custom) return custom

  if (gaps?.length) return formatNextGapQuestion(gaps, intent, context)

  return custom || 'Biraz daha detay verir misiniz?'
}

async function runLlmTurn({ trimmed, messages, baseIntent, gaps, context, trace }) {
  trace.log('hybrid.llm.turn', { gaps })

  const llm = await callPodsAiTaskAssign({
    userText: trimmed,
    messages,
    intent: baseIntent,
    context: { ...context, gaps },
  })

  if (llm.fallback || (!llm.ok && !llm.usedLlm)) {
    trace.log('hybrid.llm.fallback', { reason: llm.reason })
    return { ok: false, reason: llm.reason, llmReply: '' }
  }

  const rawPatch = llm.intentPatch && typeof llm.intentPatch === 'object' ? llm.intentPatch : {}
  trace.log('hybrid.llm.ok', { patchKeys: Object.keys(rawPatch) })

  const parallel =
    !isExplicitSequentialChain(trimmed) &&
    (isExplicitParallelAssignment(trimmed) || isUnitWideAssignment(trimmed) || isTeamWideAssignment(trimmed))
  const patch = parallel
    ? {
        ...rawPatch,
        mode: 'normal',
        zincirGorevNames: undefined,
        zincirOnayNames: undefined,
        zincirOnayWorkerName: undefined,
        siraliSteps: undefined,
      }
    : rawPatch

  const activeGap = gaps[0] || ''
  const mergedBase = mergeIntentPatch(baseIntent, patch, { ...context, gaps }, trimmed, messages)
  const mergedIntent = ensureFutureScheduleFlags(
    safeProcessIntent(mergedBase, trimmed, context, {
      expectedGap: activeGap,
      contextMessages: messages,
    }),
  )

  const validated = safeValidate(mergedIntent, {
    ...context,
    lastUserText: trimmed,
  })

  return {
    ok: true,
    ...validated,
    llmReply: llm.reply,
  }
}

/**
 * Pods AI — LLM birincil (sorular + doğal dil), kural motoru sessiz parse/doğrulama.
 * Sistem bilgisi: supabase/functions/pods-ai-task-assign/SYSTEM_KNOWLEDGE.md
 */
export async function processUserMessageHybrid(messages, userText, context, intent, trace = noopTrace()) {
  const trimmed = String(userText || '').trim()
  if (!trimmed) {
    return { messages, intent, ready: false, usedLlm: false }
  }

  const { gaps: currentGaps } = safeValidate(intent, context)
  trace.log('hybrid.start', { activeGap: currentGaps[0] || null, allGaps: currentGaps })

  if (isHelpRequest(trimmed)) {
    return {
      messages: buildResultMessages(messages, trimmed, buildHelpReply(trimmed, intent), false),
      intent,
      ready: false,
      gaps: currentGaps,
      usedLlm: false,
      autoAssign: false,
    }
  }

  if (!isTaskAssignmentTopic(trimmed, { gaps: currentGaps, intent, personnel: context.personnel })) {
    return {
      messages: buildResultMessages(messages, trimmed, offTopicReply(), false),
      intent,
      ready: false,
      gaps: currentGaps,
      usedLlm: false,
      autoAssign: false,
    }
  }

  const ruleParsed = silentRuleParse(intent, trimmed, context, currentGaps[0] || '', messages)
  trace.log('hybrid.rule.silent', { gaps: ruleParsed.gaps, ready: ruleParsed.ready })

  let finalIntent = ruleParsed.intent
  let finalGaps = ruleParsed.gaps
  let finalReady = ruleParsed.ready
  let usedLlm = false
  let llmReply = ''
  let llmFallbackReason = null

  const llmTurn = await runLlmTurn({
    trimmed,
    messages,
    baseIntent: ruleParsed.intent,
    gaps: ruleParsed.gaps || currentGaps,
    context,
    trace,
  })

  if (llmTurn.ok) {
    usedLlm = true
    finalIntent = llmTurn.intent
    finalGaps = llmTurn.gaps
    finalReady = llmTurn.ready
    llmReply = llmTurn.llmReply || ''
    trace.log('hybrid.llm.done', { ready: finalReady, gaps: finalGaps })
  } else {
    llmFallbackReason = llmTurn.reason
    trace.log('hybrid.llm.off', { reason: llmFallbackReason })
  }

  let assistantText = finalizeReply({
    llmReply,
    ready: finalReady,
    gaps: finalGaps,
    intent: finalIntent,
    context,
    llmUsed: usedLlm,
  })

  if (llmFallbackReason === 'llm_unavailable' || llmFallbackReason === 'llm_not_configured') {
    assistantText += '\n\n_(AI geçici olarak kullanılamadı.)_'
  }

  const autoAssign = shouldAutoAssignWhenReady(trimmed, !!finalReady)
  trace.log('hybrid.done', { ready: finalReady, autoAssign, usedLlm })

  return {
    messages: buildResultMessages(messages, trimmed, assistantText, usedLlm),
    intent: finalIntent,
    ready: finalReady,
    gaps: finalGaps,
    usedLlm,
    autoAssign,
    llmFallbackReason,
  }
}
