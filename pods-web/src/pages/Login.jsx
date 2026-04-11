import { useState, useContext, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import getSupabase from '../lib/supabaseClient'
import { AuthContext } from '../contexts/AuthContext.jsx'
import { toast } from 'sonner'

export default function Login() {
  const supabase = useMemo(() => {
    try {
      return getSupabase()
    } catch {
      return null
    }
  }, [])
  const { user, loading: authLoading } = useContext(AuthContext)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const savedRemember = localStorage.getItem('pods_remember_me')
      const savedEmail = localStorage.getItem('pods_saved_email') || ''
      if (savedRemember === 'true' && savedEmail) {
        setRememberMe(true)
        setEmail(savedEmail)
      }
    } catch {
      // localStorage erişimi zorunlu değil
    }
  }, [])

  // Profil + roller.yetkiler yüklenene kadar bekle; yoksa /admin'da boş yetki → Yetkisiz
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/admin', { replace: true })
    }
  }, [user, authLoading, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!supabase) {
      toast.error(
        'Sunucu yapılandırması eksik (Supabase). Yöneticiye bildirin.',
      )
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        const msg = String(error.message || '')
        if (msg.toLowerCase().includes('email not confirmed')) {
          toast.error(
            'E-posta doğrulanmamış. Lütfen gelen kutunuzu kontrol edin veya yöneticiden hesabınızı doğrulatmasını isteyin.',
          )
        } else {
          toast.error(error.message)
        }
      } else {
        try {
          if (rememberMe) {
            localStorage.setItem('pods_remember_me', 'true')
            localStorage.setItem('pods_saved_email', email)
          } else {
            localStorage.removeItem('pods_remember_me')
            localStorage.removeItem('pods_saved_email')
          }
        } catch {
          // ignore
        }
        toast.success('Giriş başarılı')
        // Yönlendirme: useEffect (user && !authLoading) — handleUser bitene kadar bekler
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        padding: 16,
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 24,
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 22px 45px -24px rgba(15,23,42,0.45)',
          padding: 24,
          color: '#0f172a',
        }}
      >
        {/* Logo + başlık */}
        <div
          style={{
            marginBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                background:
                  'linear-gradient(135deg, #0a1e42, #f97316)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 16,
                color: '#0b1120',
              }}
            >
              P
            </div>
            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                }}
              >
                PODS Yönetim Paneli
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#64748b',
                }}
              >
                Web paneline erişmek için giriş yapın.
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                E-posta
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  borderRadius: 9999,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontSize: 13,
                  padding: '10px 14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Parola
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  borderRadius: 9999,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontSize: 13,
                  padding: '10px 14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Beni hatırla + şifre unuttum */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#6b7280',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  border: '1px solid #4b5563',
                  backgroundColor: '#020617',
                  cursor: 'pointer',
                }}
              />
              <span>Beni hatırla</span>
            </label>
            <span
              style={{
                fontSize: 12,
                color: '#f97316',
                cursor: 'default',
              }}
            >
              Şifremi unuttum?
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              borderRadius: 9999,
              border: 'none',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              background:
                'linear-gradient(90deg, #0a1e42, #1e293b, #f97316)',
              color: '#f9fafb',
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  )
}
