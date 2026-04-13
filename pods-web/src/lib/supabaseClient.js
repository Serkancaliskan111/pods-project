import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

const FETCH_TIMEOUT_MS = 30_000
const FETCH_RETRY_COUNT = 1

/**
 * Tarayıcıda `localStorage`; Safari gizli / kısıtlı depoda quota hatasında bellek fallback.
 * (createClient `storage: localStorage` ile aynı amaç, daha güvenli.)
 */
function getAuthStorage() {
  try {
    const k = '__pods_sb_storage_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return window.localStorage
  } catch {
    const mem = Object.create(null)
    return {
      getItem: (key) => (key in mem ? mem[key] : null),
      setItem: (key, value) => {
        mem[key] = String(value)
      },
      removeItem: (key) => {
        delete mem[key]
      },
      clear: () => {
        for (const k of Object.keys(mem)) delete mem[k]
      },
    }
  }
}

async function fetchWithAbortTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...(options || {}),
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Supabase timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function isRetryableFetchError(error) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('timeout') ||
    msg.includes('networkerror') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed')
  )
}

function createFetchWithTimeout(timeoutMs, retryCount) {
  return async (...args) => {
    const [url, options] = args
    let lastError
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        return await fetchWithAbortTimeout(url, options, timeoutMs)
      } catch (error) {
        lastError = error
        if (attempt >= retryCount || !isRetryableFetchError(error)) {
          throw error
        }
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
      }
    }
    throw lastError
  }
}

let supabase

export function getSupabase() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Eksik Supabase ortam değişkenleri: VITE_SUPABASE_URL ve (VITE_SUPABASE_ANON_KEY veya VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)',
      )
    }
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      String(SUPABASE_URL).startsWith('http://')
    ) {
      console.error(
        '[Supabase] VITE_SUPABASE_URL http:// ile tanımlı; HTTPS sitede tarayıcı isteği engeller (karışık içerik). URL’yi https:// olarak build edin.',
      )
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        storage: getAuthStorage(),
        detectSessionInUrl: true,
        autoRefreshToken: true,
        storageKey: 'pods-web-supabase-auth',
      },
      global: {
        fetch: createFetchWithTimeout(FETCH_TIMEOUT_MS, FETCH_RETRY_COUNT),
      },
      realtime: {
        timeout: FETCH_TIMEOUT_MS,
      },
    })
  }
  return supabase
}

export default getSupabase
