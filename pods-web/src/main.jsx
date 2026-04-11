import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

/** Projede PWA yok; eski deneme / başka sürümden kalan SW bazen boş sayfa veya eski bundle’a kilitler. */
if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      for (const r of regs) {
        r.unregister().catch(() => {})
      }
    })
    .catch(() => {})
}

const rootEl = document.getElementById('root')

/** Vite `base` (örn. /pods/) ile aynı olmalı; yoksa alt klasörde ilk girişte boş sayfa / sürekli yenileme ihtiyacı oluşur. */
const routerBasename = (() => {
  const b = import.meta.env.BASE_URL || '/'
  if (b === '/') return undefined
  return b.endsWith('/') ? b.slice(0, -1) : b
})()

function showFatal(message) {
  if (!rootEl) return
  rootEl.innerHTML = `
    <div style="min-height:100vh;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a">
      <h1 style="font-size:18px;margin-bottom:8px">Panel başlatılamadı</h1>
      <p style="color:#64748b;font-size:14px;margin-bottom:12px">${String(message).replace(/</g, '&lt;')}</p>
      <p style="font-size:13px;color:#475569">Safari’de Gizlilik → Siteler arası izlemeyi kapatmayı veya farklı ağ deneyin. Geliştirici konsolunda kırmızı hata varsa ekran görüntüsü alın.</p>
    </div>
  `
}

try {
  if (!rootEl) {
    throw new Error('index.html içinde #root yok')
  }
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter basename={routerBasename}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
} catch (e) {
  console.error('[main]', e)
  showFatal(e?.message || e)
}
