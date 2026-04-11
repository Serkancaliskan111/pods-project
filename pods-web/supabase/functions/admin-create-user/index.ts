// @ts-nocheck
// Kök dizindeki supabase/functions/admin-create-user/index.ts ile aynı içerik olmalı.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function withCors(
  body: BodyInit | null,
  init: ResponseInit & { headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers)
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v))
  return new Response(body, { ...init, headers })
}

async function callerMayCreateUsers(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data: ku } = await supabaseAdmin
    .from('kullanicilar')
    .select('is_system_admin')
    .eq('id', userId)
    .maybeSingle()

  if (ku?.is_system_admin) return true

  const { data: pe } = await supabaseAdmin
    .from('personeller')
    .select('rol_id')
    .eq('kullanici_id', userId)
    .is('silindi_at', null)
    .maybeSingle()

  if (!pe?.rol_id) return false

  const { data: ro } = await supabaseAdmin
    .from('roller')
    .select('yetkiler')
    .eq('id', pe.rol_id)
    .maybeSingle()

  const y = ro?.yetkiler
  if (!y || typeof y !== 'object') return false
  const p = y.personel_yonet
  const dot = y['personel.yonet']
  const okLegacy = p === true || p === 'true' || p === 1
  const okDot = dot === true || dot === 'true' || dot === 1
  return okLegacy || okDot
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return withCors(null, { status: 204 })
  }

  try {
    if (req.method !== 'POST') {
      return withCors('Method Not Allowed', { status: 405 })
    }

    let body: Record<string, unknown> = {}
    const raw = await req.text()
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as Record<string, unknown>
      } catch {
        return withCors(
          JSON.stringify({ error: 'Geçersiz JSON istek gövdesi' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }

    const email = String(body?.email || '').trim()
    const password = String(body?.password ?? '')
    const full_name = String(body?.full_name || '').trim()
    const role = String(body?.role || '').trim()
    const company_id = body?.company_id ?? null

    const url = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceKey = (
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('SUPABASE_SECRET_KEY') ||
      Deno.env.get('PODS_SERVICE_ROLE_KEY') ||
      ''
    ).trim()

    if (!url || !serviceKey) {
      return withCors(
        JSON.stringify({
          error:
            'Missing service role key: set PODS_SERVICE_ROLE_KEY secret (CLI cannot use SUPABASE_* names)',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    })

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return withCors(
        JSON.stringify({ error: 'Oturum gerekli (Authorization Bearer)' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt)
    if (userErr || !userData?.user?.id) {
      return withCors(
        JSON.stringify({
          error: 'Geçersiz veya süresi dolmuş oturum',
          details: userErr?.message,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const allowed = await callerMayCreateUsers(
      supabaseAdmin,
      userData.user.id,
    )
    if (!allowed) {
      return withCors(
        JSON.stringify({ error: 'Personel oluşturma yetkiniz yok' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    if (!email || !password) {
      return withCors(
        JSON.stringify({
          error: 'E-posta ve şifre zorunlu',
          hint: !password ? 'password boş' : 'email boş',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const meta: Record<string, string> = {}
    if (full_name) meta.full_name = String(full_name)
    if (role) meta.role = String(role)
    if (company_id != null && String(company_id).trim() !== '') {
      meta.company_id = String(company_id)
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: Object.keys(meta).length ? meta : undefined,
    })

    if (error) {
      const status =
        typeof error.status === 'number' && error.status >= 400 && error.status < 600
          ? error.status
          : 400
      return withCors(
        JSON.stringify({
          error: error.message || 'Auth kullanıcı oluşturma hatası',
          code: error.code ?? null,
          authStatus: error.status ?? null,
        }),
        {
          status: status === 401 || status === 403 ? status : 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    return withCors(
      JSON.stringify({ user: { id: data.user?.id }, userId: data.user?.id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (e) {
    return withCors(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
