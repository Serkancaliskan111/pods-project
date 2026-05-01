import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import getSupabase from '../lib/supabaseClient'
import {
  canBypassCompanyIpRestriction,
  hasWebPanelAccess,
  normalizeRolePermissions,
} from '../lib/permissions.js'
import { getClientPublicIp, isIpAllowed } from '../lib/ipAccess.js'

export const AuthContext = createContext({
  user: null,
  profile: null,
  personel: null,
  loading: true,
  scopeReady: false,
  signOut: async () => {},
})

function isPermTruthy(perms, key) {
  const v = perms?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

function hasCompanyWideManagementScope(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  return (
    isPermTruthy(perms, 'is_admin') ||
    isPermTruthy(perms, 'is_manager') ||
    isPermTruthy(perms, 'sirket.yonet') ||
    isPermTruthy(perms, 'rol.yonet') ||
    isPermTruthy(perms, 'sube.yonet') ||
    isPermTruthy(perms, 'personel.yonet') ||
    isPermTruthy(perms, 'personel_yonet')
  )
}

function shallowEqualObject(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function expandUnitsFromSeeds(allUnits, seedIds) {
  const list = Array.isArray(allUnits) ? allUnits : []
  const set = new Set((seedIds || []).filter(Boolean).map(String))
  const queue = Array.from(set)
  while (queue.length) {
    const currentId = queue.shift()
    list
      .filter((unit) => String(unit?.ust_birim_id || '') === String(currentId))
      .forEach((child) => {
        const cid = String(child.id)
        if (set.has(cid)) return
        set.add(cid)
        queue.push(cid)
      })
  }
  return Array.from(set)
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [personel, setPersonel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [configError, setConfigError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const supabaseRef = useRef(null)

  /** Ağ/SSL/Supabase takılırsa sonsuz “Yükleniyor”; kullanıcıya en azından login denemesi bırakır. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      setLoading((prev) => {
        if (!prev) return prev
        console.warn(
          '[Auth] Oturum başlatma 25 sn içinde bitmedi (sunucu, SSL, DNS veya Supabase). Yükleme durduruldu; sayfayı yenileyin.',
        )
        return false
      })
    }, 25000)
    return () => window.clearTimeout(id)
  }, [])

  const locationPathRef = useRef(location.pathname)
  const hydratedUserIdRef = useRef(null)
  const authReadyRef = useRef(false)
  /** Aynı kullanıcı için eşzamanlı profil yüklemelerini tekilleştir */
  const profileLoadByUserRef = useRef(new Map())
  const latestUserRef = useRef(null)
  const silentRefreshInFlightRef = useRef(false)
  const lastSilentRefreshAtRef = useRef(0)

  useEffect(() => {
    locationPathRef.current = location.pathname
  }, [location.pathname])

  const loadProfileFromSession = useCallback(
    async (u, { withSpinner = true } = {}) => {
      const supabase = supabaseRef.current
      if (!supabase || !u?.id) return
      const uid = String(u.id)
      const pathNow = () => locationPathRef.current

      const existing = profileLoadByUserRef.current.get(uid)
      if (existing) {
        if (withSpinner) setLoading(true)
        try {
          await existing
        } finally {
          if (withSpinner) setLoading(false)
        }
        return
      }

      const work = (async () => {
        setUser((prev) => (prev?.id === u?.id && prev?.email === u?.email ? prev : u))
        latestUserRef.current = u

        const [
          { data: profileData, error: profileError },
          { data: personelData, error: personelError },
        ] = await Promise.all([
          supabase
            .from('kullanicilar')
            .select('*')
            .eq('id', u.id)
            .is('silindi_at', null)
            .maybeSingle(),
          supabase
            .from('personeller')
            .select('id,rol_id,ana_sirket_id,birim_id')
            .eq('kullanici_id', u.id)
            .is('silindi_at', null)
            .maybeSingle(),
        ])

        if (!profileData) {
          await supabase.auth.signOut()
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          return
        }
        if (profileError) {
          console.error('Profile fetch error', profileError)
          await supabase.auth.signOut()
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          return
        }

        if (profileData.is_system_admin) {
          setProfile((prev) => {
            const next = {
              ...(prev || {}),
              ...profileData,
              yetkiler: normalizeRolePermissions(
                profileData?.yetkiler ?? prev?.yetkiler,
              ),
            }
            return shallowEqualObject(prev || {}, next) ? prev : next
          })
          setPersonel((prev) => (prev == null ? prev : null))
          hydratedUserIdRef.current = u.id
          authReadyRef.current = true
          if (withSpinner) setLoading(false)
          if (pathNow() === '/login' || pathNow() === '/') {
            navigate('/admin', { replace: true })
          }
          return
        }

        if (!personelData) {
          window.alert(
            'Personel kaydınız bulunamadı veya yetkiniz yok. Çıkış yapılıyor.',
          )
          await supabase.auth.signOut()
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          return
        }
        if (personelError) {
          console.error('Personel fetch error', personelError)
          await supabase.auth.signOut()
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          return
        }

        if (!personelData.rol_id) {
          window.alert(
            'Hesabınıza rol atanmamış. Yöneticiniz personel kaydınıza bir rol bağlamalıdır.',
          )
          await supabase.auth.signOut()
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          return
        }

        const { data: roleData, error: roleErr } = await supabase
          .from('roller')
          .select('rol_adi,yetkiler')
          .eq('id', personelData.rol_id)
          .maybeSingle()

        if (roleErr) {
          console.error('[Auth] roller okunamadı:', roleErr)
        }
        if (!roleData) {
          console.warn(
            '[Auth] rol satırı yok veya RLS engelliyor. rol_id:',
            personelData.rol_id,
          )
        }

        const roleName = roleData?.rol_adi ?? null
        const rolePerms = normalizeRolePermissions(
          roleData?.yetkiler ?? roleData?.permissions,
        )
        const hasCompanyWideScope = hasCompanyWideManagementScope(
          rolePerms,
          !!profileData.is_system_admin,
        )

        if (personelData.ana_sirket_id) {
          try {
            let { data: companyRow, error: companyErr } = await supabase
              .from('ana_sirketler')
              .select('id,sabit_ip_aktif,izinli_ipler')
              .eq('id', personelData.ana_sirket_id)
              .maybeSingle()
            if (
              companyErr &&
              (companyErr.code === '42703' ||
                String(companyErr.message || '').includes('sabit_ip_aktif') ||
                String(companyErr.message || '').includes('izinli_ipler'))
            ) {
              const fb = await supabase
                .from('ana_sirketler')
                .select('id')
                .eq('id', personelData.ana_sirket_id)
                .maybeSingle()
              companyRow = fb.data
              companyErr = fb.error
              if (companyRow) {
                companyRow = {
                  ...companyRow,
                  sabit_ip_aktif: false,
                  izinli_ipler: [],
                }
              }
            }
            if (companyErr) {
              console.error('[Auth] ana_sirketler okunamadı:', companyErr)
            }
            const fixedIpEnabled = !!companyRow?.sabit_ip_aktif
            const canBypass = canBypassCompanyIpRestriction(
              rolePerms,
              !!profileData.is_system_admin,
            )
            if (fixedIpEnabled && !canBypass) {
              const clientIp = await getClientPublicIp()
              const allowed = isIpAllowed(companyRow?.izinli_ipler || [], clientIp)
              if (!allowed) {
                window.alert(
                  `Bu şirket için sabit IP giriş kısıtı aktif. Mevcut IP (${clientIp || 'tespit edilemedi'}) izinli listede değil.`,
                )
                await supabase.auth.signOut()
                hydratedUserIdRef.current = null
                authReadyRef.current = false
                return
              }
            }
          } catch (ipErr) {
            console.error('[Auth] IP doğrulama hatası', ipErr)
          }
        }

        if (!hasWebPanelAccess(rolePerms, !!profileData.is_system_admin)) {
          window.alert(
            'Bu web paneline erişim yetkiniz yok. Rolünüzde en az bir eylem açık olmalı. Rol bilgisi veritabanından okunamıyorsa (RLS), yöneticiniz Supabase’de `roller` için SELECT izni eklemelidir.',
          )
          await supabase.auth.signOut()
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          return
        }

        let accessibleUnitIds =
          personelData.birim_id != null && String(personelData.birim_id) !== ''
            ? [personelData.birim_id]
            : []
        try {
          if (personelData.ana_sirket_id) {
            const { data: companyUnits, error: unitsErr } = await supabase
              .from('birimler')
              .select('id,ust_birim_id,ana_sirket_id')
              .eq('ana_sirket_id', personelData.ana_sirket_id)
              .is('silindi_at', null)

            if (unitsErr) {
              console.error('[Auth] birimler okunamadı:', unitsErr)
            }

            const list = Array.isArray(companyUnits) ? companyUnits : []
            if (list.length) {
              if (hasCompanyWideScope) {
                accessibleUnitIds = list.map((unit) => unit.id)
              } else if (personelData.birim_id) {
                const currentUnit = list.find(
                  (u) => String(u.id) === String(personelData.birim_id),
                )
                const parentId = currentUnit?.ust_birim_id
                const peerIds = list
                  .filter((u) => String(u?.ust_birim_id || '') === String(parentId || ''))
                  .map((u) => u.id)
                const seeds = Array.from(
                  new Set([personelData.birim_id, ...peerIds].filter(Boolean)),
                )
                accessibleUnitIds = expandUnitsFromSeeds(list, seeds)
                if (!accessibleUnitIds.length) {
                  accessibleUnitIds = [personelData.birim_id]
                }
              } else {
                accessibleUnitIds = list.map((unit) => unit.id)
              }
            }
          }
        } catch (e) {
          console.error('accessibleUnitIds hesaplanırken hata', e)
          accessibleUnitIds =
            personelData.birim_id != null && String(personelData.birim_id) !== ''
              ? [personelData.birim_id]
              : []
        }

        const nextPersonel = {
          ...personelData,
          roleName,
          accessibleUnitIds,
          scopeReady: true,
        }
        const nextProfile = {
          ...profileData,
          yetkiler: rolePerms,
          ana_sirket_id: personelData.ana_sirket_id,
          birim_id: personelData.birim_id,
          accessibleUnitIds,
          scopeReady: true,
        }
        setPersonel((prev) =>
          shallowEqualObject(prev || {}, nextPersonel) ? prev : nextPersonel,
        )
        setProfile((prev) =>
          shallowEqualObject(prev || {}, nextProfile) ? prev : nextProfile,
        )

        hydratedUserIdRef.current = u.id
        authReadyRef.current = true

        if (withSpinner) setLoading(false)
        if (pathNow() === '/login' || pathNow() === '/') {
          navigate('/admin', { replace: true })
        }
      })().catch((err) => {
        console.error('loadProfileFromSession error', err)
        authReadyRef.current = false
      })

      profileLoadByUserRef.current.set(uid, work)

      if (withSpinner) setLoading(true)
      try {
        await work
      } finally {
        profileLoadByUserRef.current.delete(uid)
        if (withSpinner) setLoading(false)
      }
    },
    [navigate],
  )

  useEffect(() => {
    let mounted = true
    let subscription = null

    let supabase
    try {
      supabase = getSupabase()
      supabaseRef.current = supabase
    } catch (e) {
      console.error('[Auth] Supabase başlatılamadı', e)
      setConfigError(
        e?.message ||
          'Supabase yapılandırması eksik. VITE_SUPABASE_URL ve anahtar .env ile derlenmeli.',
      )
      setLoading(false)
      return () => {
        mounted = false
      }
    }

    authReadyRef.current = false
    hydratedUserIdRef.current = null
    profileLoadByUserRef.current.clear()
    setLoading(true)

    const handleAuthEvent = async (event, session) => {
      try {
        const u = session?.user ?? null

        if (!u) {
          setUser(null)
          setProfile(null)
          setPersonel(null)
          latestUserRef.current = null
          hydratedUserIdRef.current = null
          authReadyRef.current = false
          if (mounted) {
            setLoading(false)
            // Oturum henüz çözülmeden /login’e itme: INITIAL_SESSION null’da yönlendirme yok;
            // korumalı rotalar loading false olduktan sonra Navigate ile login’e gider.
            if (event !== 'INITIAL_SESSION') {
              navigate('/login', { replace: true })
            }
          }
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          setUser(u)
          if (mounted) setLoading(false)
          return
        }

        if (
          event === 'INITIAL_SESSION' &&
          authReadyRef.current &&
          hydratedUserIdRef.current === u.id
        ) {
          setUser(u)
          if (mounted) setLoading(false)
          return
        }

        if (event === 'USER_UPDATED') {
          await loadProfileFromSession(u, { withSpinner: false })
          return
        }

        const firstHydrate =
          event === 'INITIAL_SESSION' ||
          !authReadyRef.current ||
          hydratedUserIdRef.current !== u.id

        await loadProfileFromSession(u, {
          withSpinner:
            firstHydrate ||
            event === 'SIGNED_IN' ||
            event === 'PASSWORD_RECOVERY',
        })
      } catch (e) {
        console.error('[Auth] onAuthStateChange handler', e)
        if (mounted) setLoading(false)
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        void handleAuthEvent(event, session)
      },
    )
    subscription = authListener?.subscription ?? null

    return () => {
      mounted = false
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
    }
  }, [navigate, loadProfileFromSession])

  useEffect(() => {
    const refreshSilently = () => {
      const u = latestUserRef.current
      if (!u?.id) return
      const now = Date.now()
      // focus + visibility ardışık tetiklenmelerinde ve kısa aralıklı çağrılarda
      // aynı sorgu selini engeller.
      if (silentRefreshInFlightRef.current) return
      if (now - lastSilentRefreshAtRef.current < 60_000) return
      silentRefreshInFlightRef.current = true
      lastSilentRefreshAtRef.current = now
      void loadProfileFromSession(u, { withSpinner: false })
        .catch((e) => {
          console.error('[Auth] silent refresh failed', e)
        })
        .finally(() => {
          silentRefreshInFlightRef.current = false
        })
    }
    const onFocus = () => refreshSilently()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshSilently()
    }
    const id = window.setInterval(refreshSilently, 600000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadProfileFromSession])

  const signOut = async () => {
    const supabase = supabaseRef.current
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setPersonel(null)
    latestUserRef.current = null
    hydratedUserIdRef.current = null
    authReadyRef.current = false
    navigate('/login', { replace: true })
  }

  if (configError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Yapılandırma hatası</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 12 }}>
          {configError}
        </p>
        <p style={{ fontSize: 13, color: '#475569' }}>
          Üretimde <code>VITE_SUPABASE_URL</code> ve{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (veya{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>) değerleri build
          sırasında gömülür; sunucuya sadece <code>dist/</code> atmak yetmez —
          ortam değişkenleri ile <code>npm run build</code> yeniden çalıştırın.
        </p>
      </div>
    )
  }

  const scopeReady = !!profile?.is_system_admin || !!personel?.scopeReady

  return (
    <AuthContext.Provider
      value={{ user, profile, personel, loading, scopeReady, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}
