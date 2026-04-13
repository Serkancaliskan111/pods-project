import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

const FETCH_TIMEOUT_MS = 10_000
const FETCH_MAX_ATTEMPTS = 3

function isRetryableNetworkError(err) {
  if (!err) return false
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    err?.name === 'TypeError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  )
}

async function fetchWithTimeoutAndRetry(url, options = {}) {
  const { signal: outerSignal, ...rest } = options
  let lastError
  for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const onOuterAbort = () => controller.abort()
    if (outerSignal) {
      if (outerSignal.aborted) {
        clearTimeout(timeoutId)
        throw new Error('Aborted')
      }
      outerSignal.addEventListener('abort', onOuterAbort, { once: true })
    }
    try {
      const res = await fetch(url, { ...rest, signal: controller.signal })
      clearTimeout(timeoutId)
      if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
      return res
    } catch (err) {
      clearTimeout(timeoutId)
      if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
      lastError = err
      if (!isRetryableNetworkError(err) || attempt === FETCH_MAX_ATTEMPTS - 1) {
        throw err
      }
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)))
    }
  }
  throw lastError
}

let supabase

export function getSupabase() {
  if (!supabase) {
    if ((!SUPABASE_URL || !SUPABASE_ANON_KEY) && __DEV__) {
      console.warn('Supabase env yok; .env dosyasında EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlayın.')
    }
    supabase = createClient(
      SUPABASE_URL || 'https://placeholder.supabase.co',
      SUPABASE_ANON_KEY || 'placeholder',
      {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: fetchWithTimeoutAndRetry,
        },
      }
    )
  }
  return supabase
}

export default getSupabase
