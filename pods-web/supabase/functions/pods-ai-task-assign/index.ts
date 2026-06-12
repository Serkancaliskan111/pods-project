// Pods AI — görev atama chatbot (OpenAI / Ollama)
// Secrets: PODS_OPENAI_API_KEY, PODS_AI_PROVIDER, PODS_OPENAI_MODEL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPodsAiSystemPrompt, PODS_AI_MODES } from './systemKnowledge.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function cors(body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v))
  return new Response(body, { ...init, headers })
}

function llmConfig() {
  const provider = (Deno.env.get('PODS_AI_PROVIDER') || 'openai').toLowerCase()
  const openaiKey = Deno.env.get('PODS_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY')
  const model =
    provider === 'ollama'
      ? Deno.env.get('PODS_OLLAMA_MODEL') || 'llama3.2'
      : Deno.env.get('PODS_OPENAI_MODEL') || 'gpt-4o-mini'
  const configured =
    provider === 'off'
      ? false
      : provider === 'ollama'
        ? true
        : !!openaiKey
  return { provider, openaiKey, model, configured }
}

async function chatCompletion(messages: { role: string; content: string }[]) {
  const { provider, openaiKey, model, configured } = llmConfig()
  if (!configured) return null

  const ollamaBase = Deno.env.get('PODS_OLLAMA_BASE_URL') || 'http://127.0.0.1:11434/v1'
  const url =
    provider === 'ollama'
      ? `${ollamaBase.replace(/\/$/, '')}/chat/completions`
      : 'https://api.openai.com/v1/chat/completions'
  const apiKey = provider === 'ollama' ? Deno.env.get('PODS_OLLAMA_API_KEY') || 'ollama' : openaiKey

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.warn('[pods-ai-task-assign] LLM HTTP', res.status, errText.slice(0, 400))
    return null
  }

  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}

function parseLlmJson(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
    throw new Error('invalid_json')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors(null, { status: 204 })

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return cors(JSON.stringify({ fallback: true, reason: 'unauthorized' }), { status: 401 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return cors(JSON.stringify({ fallback: true, reason: 'invalid_token' }), { status: 401 })
    }

    const body = await req.json()
    const { provider, model, configured } = llmConfig()

    if (body.ping) {
      return cors(
        JSON.stringify({
          ok: true,
          ping: true,
          llmConfigured: configured,
          provider,
          model: configured ? model : '',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const userText = String(body.userText || '').trim()
    if (!userText) {
      return cors(JSON.stringify({ fallback: true, reason: 'empty' }), { status: 400 })
    }

    if (!configured) {
      return cors(JSON.stringify({ fallback: true, reason: 'llm_not_configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const roster = Array.isArray(body.roster) ? body.roster : []
    const templates = Array.isArray(body.templates) ? body.templates : []
    const canAssign = !!body.canAssignTask
    const intent = body.intent && typeof body.intent === 'object' ? body.intent : {}
    const history = Array.isArray(body.messages) ? body.messages : []
    const gaps = Array.isArray(body.gaps) ? body.gaps.map(String) : []

    const llmMessages: { role: string; content: string }[] = [
      {
        role: 'system',
        content: buildPodsAiSystemPrompt(roster, templates, canAssign, gaps),
      },
    ]

    for (const h of history.slice(-8)) {
      if (h?.role && h?.text) {
        llmMessages.push({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.text),
        })
      }
    }

    llmMessages.push({
      role: 'user',
      content: `Mevcut intent:\n${JSON.stringify(intent, null, 0)}\n\nYeni kullanıcı mesajı: ${userText}`,
    })

    const raw = await chatCompletion(llmMessages)
    if (!raw) {
      return cors(JSON.stringify({ fallback: true, reason: 'llm_unavailable' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = parseLlmJson(raw)
    const patch = parsed.intentPatch && typeof parsed.intentPatch === 'object' ? parsed.intentPatch : {}
    if (patch.mode && !PODS_AI_MODES.includes(patch.mode)) delete patch.mode

    return cors(
      JSON.stringify({
        ok: true,
        usedLlm: true,
        provider,
        model,
        reply: String(parsed.reply || '').trim(),
        intentPatch: patch,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.warn('[pods-ai-task-assign]', e)
    return cors(JSON.stringify({ fallback: true, reason: 'server_error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
