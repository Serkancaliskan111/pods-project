import { useState, useContext, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, Globe } from 'lucide-react'
import getSupabase from '../lib/supabaseClient'
import { AuthContext } from '../contexts/AuthContext.jsx'
import { toast } from 'sonner'
import CubicleLogo from '../components/cubicle/CubicleLogo.jsx'
import LoginPattern from '../components/login/LoginPattern.jsx'
import LoginIllustration from '../components/login/LoginIllustration.jsx'
import { cubicle } from '../theme/cubicle.js'

const BRAND_BLUE = cubicle.sidebarBg

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
  const [forgotSending, setForgotSending] = useState(false)

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

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/admin', { replace: true })
    }
  }, [user, authLoading, navigate])

  const handleForgotPassword = useCallback(async () => {
    if (!supabase) {
      toast.error('Sunucu yapılandırması eksik.')
      return
    }
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error('Şifre sıfırlama için önce e-posta adresinizi girin.')
      return
    }
    setForgotSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) throw error
      toast.success('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.')
    } catch (err) {
      toast.error(err?.message || 'Şifre sıfırlama isteği gönderilemedi.')
    } finally {
      setForgotSending(false)
    }
  }, [supabase, email])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!supabase) {
      toast.error('Sunucu yapılandırması eksik (Supabase). Yöneticiye bildirin.')
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
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col text-slate-800"
      style={{ backgroundColor: BRAND_BLUE }}
    >
      <div className="text-white">
        <LoginPattern />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[920px] overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)]">
          <div className="grid min-h-[480px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="hidden items-center justify-center bg-[#F3F6FA] px-8 py-10 md:flex">
              <LoginIllustration />
            </div>

            <div className="flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12">
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="mb-3 flex items-center gap-2.5">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-[#2563EB]"
                    style={{ backgroundColor: '#EFF6FF' }}
                  >
                    <CubicleLogo className="h-7 w-7" />
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-slate-900">pods</span>
                </div>
                <p className="text-sm text-slate-500">Devam etmek için bilgilerinizi girin.</p>
              </div>

              <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm">
                <div className="mb-5">
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    E-posta
                  </label>
                  <input
                    id="login-email"
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-posta"
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>

                <div className="mb-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor="login-password"
                      className="text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Şifre
                    </label>
                    <button
                      type="button"
                      disabled={forgotSending}
                      onClick={() => void handleForgotPassword()}
                      className="text-xs text-slate-400 transition hover:text-[#2563EB] disabled:opacity-60"
                    >
                      {forgotSending ? 'Gönderiliyor…' : 'Şifrenizi mi unuttunuz?'}
                    </button>
                  </div>
                  <input
                    id="login-password"
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre"
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>

                <label className="mb-6 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]/30"
                  />
                  Beni hatırla
                </label>

                <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-center text-xs text-slate-500 sm:text-left">
                    Kullanıcı hesabınız yok mu?{' '}
                    <span className="font-semibold text-[#2563EB]">Yöneticinize başvurun</span>
                  </p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-center rounded-full px-7 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-70 sm:self-auto"
                    style={{ backgroundColor: BRAND_BLUE }}
                  >
                    {loading ? 'Giriş yapılıyor…' : 'Oturum Aç'}
                    {!loading ? <ArrowRight size={18} strokeWidth={2.5} /> : null}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-8 text-sm text-white/90">
        <a href="#" className="transition hover:text-white">
          Kullanım Şartları
        </a>
        <a href="#" className="transition hover:text-white">
          Gizlilik
        </a>
        <a href="#" className="transition hover:text-white">
          KVK
        </a>
        <span className="inline-flex items-center gap-1.5 text-white/95">
          <Globe size={16} strokeWidth={1.75} aria-hidden />
          Türkçe
          <ChevronDown size={16} strokeWidth={2} aria-hidden />
        </span>
      </footer>
    </div>
  )
}
