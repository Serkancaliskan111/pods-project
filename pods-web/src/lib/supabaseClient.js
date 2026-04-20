import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const AUTH_STORAGE_KEY = 'pods-web-supabase-auth-v2'
const LEGACY_AUTH_STORAGE_KEYS = [
  'pods-web-supabase-auth',
  'sb-uvsemkioahjrkryetltp-auth-token',
]

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

function cleanupLegacyAuthStorage(storage) {
  if (!storage) return
  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    if (key === AUTH_STORAGE_KEY) continue
    try {
      storage.removeItem(key)
    } catch {
      // ignore storage cleanup errors
    }
  }
}

let supabase

export function getSupabase() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Eksik Supabase ortam değişkenleri: VITE_SUPABASE_URL ve (VITE_SUPABASE_ANON_KEY veya VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY). ' +
          'pods-web/.env dosyasını oluşturun (şablon: .env.example), değerleri Supabase Dashboard → Settings → API’den alın; ardından dev sunucuyu yeniden başlatın.',
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

    const authStorage = getAuthStorage()
    cleanupLegacyAuthStorage(authStorage)

    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        storage: authStorage,
        detectSessionInUrl: true,
        autoRefreshToken: true,
        storageKey: AUTH_STORAGE_KEY,
      },
    })
  }
  return supabase
}

export default getSupabase
