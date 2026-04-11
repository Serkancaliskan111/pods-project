// @ts-nocheck
// Edge Function: admin-create-user — verify_jwt=false; çağrıyı JWT + yetki ile burada doğrula.
// Secrets: SUPABASE_URL (otomatik), service role: SUPABASE_SERVICE_ROLE_KEY (otomatik) veya
// CLI ile manuel: PODS_SERVICE_ROLE_KEY — SUPABASE_ ile başlayan isimler CLI'da secrets set ile YASAK.
//
// Yetki teşhisi (Supabase Dashboard → Edge Functions → admin-create-user → Logs):
// - Başarısız isteklerde her zaman console.warn ile [admin-create-user] JSON satırı (deny + neden).
// - Ayrıntılı başarı logu: secret PODS_AUTH_DEBUG_LOG=1 veya istek header x-pods-auth-debug: 1
//   (pods-web: .env içinde VITE_ADMIN_CREATE_USER_DEBUG=true)

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

/**
 * İç nesne sadece yaprak yetki değerleri mi (boolean / sayı / string / null)?
 * Böyle bloklar kategori adından bağımsız birleştirilir (Yönetim, yonetim, YONETIM vb.).
 */
function isFlatPermissionLeafMap(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const nested = v as Record<string, unknown>
  const keys = Object.keys(nested)
  if (keys.length === 0) return false
  for (const x of Object.values(nested)) {
    if (
      x === null ||
      typeof x === 'boolean' ||
      typeof x === 'string' ||
      typeof x === 'number'
    ) {
      continue
    }
    return false
  }
  return true
}

/** roller.yetkiler: düz + kategori içi (Türkçe/ küçük harf kategori anahtarları dahil) */
function normalizeYetkiler(raw: unknown): Record<string, unknown> {
  let obj: unknown = raw
  if (obj == null) return {}
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      return {}
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {}
  const o = obj as Record<string, unknown>
  const flat: Record<string, unknown> = { ...o }
  for (const [k, v] of Object.entries(o)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const legacyAsciiCategory = /^[A-Z][A-Z0-9_]*$/.test(k)
    const nested = v as Record<string, unknown>
    const nestedKeys = Object.keys(nested)
    const hasDottedActionKeys = nestedKeys.some((nk) => nk.includes('.'))
    const mergeNested =
      legacyAsciiCategory ||
      (isFlatPermissionLeafMap(v) &&
        (hasDottedActionKeys ||
          nestedKeys.includes('personel_yonet') ||
          nestedKeys.includes('personel.yonet')))
    if (mergeNested) {
      Object.assign(flat, nested)
    }
  }
  return flat
}

function permTruthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

const LOG = '[admin-create-user]'

/** Hassas veri yazmadan yetki teşhisi (Supabase Functions → Logs) */
function authDebugLog(
  phase: string,
  payload: Record<string, unknown>,
  level: 'log' | 'warn' = 'log',
) {
  const line = JSON.stringify({ phase, ...payload, ts: new Date().toISOString() })
  if (level === 'warn') console.warn(LOG, line)
  else console.log(LOG, line)
}

type CallerCreateAuth = {
  ok: boolean
  isSystemAdmin: boolean
  callerCompanyId: string | null
}

async function getCallerCreateAuth(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  opts: { verbose: boolean },
): Promise<CallerCreateAuth> {
  const { verbose } = opts

  const { data: ku } = await supabaseAdmin
    .from('kullanicilar')
    .select('is_system_admin')
    .eq('id', userId)
    .maybeSingle()

  if (verbose) {
    authDebugLog('kullanicilar', {
      userId,
      is_system_admin: ku?.is_system_admin ?? null,
      rowFound: !!ku,
    })
  }

  if (ku?.is_system_admin) {
    authDebugLog('allow', { reason: 'system_admin', userId }, 'log')
    return { ok: true, isSystemAdmin: true, callerCompanyId: null }
  }

  const { data: pe, error: peErr } = await supabaseAdmin
    .from('personeller')
    .select('id, rol_id, ana_sirket_id, birim_id')
    .eq('kullanici_id', userId)
    .is('silindi_at', null)
    .maybeSingle()

  if (peErr) {
    authDebugLog(
      'deny',
      {
        reason: 'personel_query_error',
        userId,
        message: peErr.message,
        code: peErr.code ?? null,
      },
      'warn',
    )
    return { ok: false, isSystemAdmin: false, callerCompanyId: null }
  }

  if (!pe) {
    authDebugLog(
      'deny',
      {
        reason: 'no_personel_row',
        userId,
        hint: 'kullanici_id ile silindi_at null personel kaydı yok',
      },
      'warn',
    )
    return { ok: false, isSystemAdmin: false, callerCompanyId: null }
  }

  if (!pe.rol_id) {
    authDebugLog(
      'deny',
      {
        reason: 'personel_no_rol_id',
        userId,
        personelId: pe.id,
        ana_sirket_id: pe.ana_sirket_id ?? null,
        birim_id: pe.birim_id ?? null,
      },
      'warn',
    )
    return { ok: false, isSystemAdmin: false, callerCompanyId: null }
  }

  const { data: ro, error: roErr } = await supabaseAdmin
    .from('roller')
    .select('id, rol_adi, yetkiler')
    .eq('id', pe.rol_id)
    .maybeSingle()

  if (roErr) {
    authDebugLog(
      'deny',
      {
        reason: 'rol_query_error',
        userId,
        rol_id: pe.rol_id,
        message: roErr.message,
      },
      'warn',
    )
    return { ok: false, isSystemAdmin: false, callerCompanyId: null }
  }

  if (!ro) {
    authDebugLog(
      'deny',
      {
        reason: 'no_rol_row',
        userId,
        rol_id: pe.rol_id,
      },
      'warn',
    )
    return { ok: false, isSystemAdmin: false, callerCompanyId: null }
  }

  const rawYetkiler = ro.yetkiler
  const flat = normalizeYetkiler(rawYetkiler)
  const py = flat.personel_yonet
  const pyd = flat['personel.yonet']
  const can = permTruthy(py) || permTruthy(pyd)

  const permSnapshot = {
    rol_id: ro.id,
    rol_adi: ro.rol_adi ?? null,
    yetkilerRawType: rawYetkiler === null || rawYetkiler === undefined
      ? 'nullish'
      : typeof rawYetkiler,
    yetkilerTopKeys:
      rawYetkiler && typeof rawYetkiler === 'object' && !Array.isArray(rawYetkiler)
        ? Object.keys(rawYetkiler as object)
        : [],
    flatKeys: Object.keys(flat),
    personel_yonet: py,
    'personel.yonet': pyd,
    personel_yonet_truthy: permTruthy(py),
    'personel.yonet_truthy': permTruthy(pyd),
    canCreatePersonel: can,
  }

  if (!can) {
    authDebugLog(
      'deny',
      {
        reason: 'missing_personel_yonet',
        userId,
        personel: {
          id: pe.id,
          ana_sirket_id: pe.ana_sirket_id ?? null,
          birim_id: pe.birim_id ?? null,
          rol_id: pe.rol_id,
        },
        ...permSnapshot,
      },
      'warn',
    )
    return { ok: false, isSystemAdmin: false, callerCompanyId: null }
  }

  if (verbose) {
    authDebugLog('rol_yetkiler_ok', {
      userId,
      personel: {
        id: pe.id,
        ana_sirket_id: pe.ana_sirket_id ?? null,
        birim_id: pe.birim_id ?? null,
        rol_id: pe.rol_id,
      },
      ...permSnapshot,
    })
  }

  const callerCompanyId =
    pe.ana_sirket_id != null ? String(pe.ana_sirket_id) : null

  if (verbose) {
    authDebugLog('allow', {
      reason: 'personel_yonet',
      userId,
      callerCompanyId,
      birim_id: pe.birim_id ?? null,
      ...permSnapshot,
    })
  }

  return { ok: true, isSystemAdmin: false, callerCompanyId }
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
            'Missing service role key: use hosted defaults or set secret PODS_SERVICE_ROLE_KEY (CLI cannot set SUPABASE_* names)',
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

    const debugAuth =
      (Deno.env.get('PODS_AUTH_DEBUG_LOG') || '').trim() === '1' ||
      (req.headers.get('x-pods-auth-debug') || '').trim() === '1'

    const caller = await getCallerCreateAuth(supabaseAdmin, userData.user.id, {
      verbose: debugAuth,
    })
    if (!caller.ok) {
      return withCors(
        JSON.stringify({ error: 'Personel oluşturma yetkiniz yok' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Şirket yöneticisi yalnızca kendi şirketi için kullanıcı oluşturabilir
    if (!caller.isSystemAdmin && caller.callerCompanyId) {
      const reqCid =
        company_id != null && String(company_id).trim() !== ''
          ? String(company_id).trim()
          : ''
      if (!reqCid || reqCid !== caller.callerCompanyId) {
        authDebugLog(
          'deny',
          {
            reason: 'company_mismatch',
            userId: userData.user.id,
            body_company_id: company_id,
            reqCid: reqCid || '(boş)',
            callerCompanyId: caller.callerCompanyId,
            match: reqCid === caller.callerCompanyId,
          },
          'warn',
        )
        return withCors(
          JSON.stringify({
            error: 'Bu işlem için yetkiniz yok.',
            hint: 'Yalnızca bağlı olduğunuz şirket için personel oluşturabilirsiniz.',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
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

    // GoTrue metadata: değerleri string yap (tip uyumsuzluğu 400 üretebilir)
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
