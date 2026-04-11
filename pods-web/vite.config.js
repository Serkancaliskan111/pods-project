import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Vite + React configuration with robust HMR for dev environment
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Kök domain (https://pods.com.tr): base '/' — Vite çıktısı /assets/... ile uyumlu.
  // base: './' paylaşımlı hostingde bazen önerilir; React Router kök yayında / ile daha öngörülebilir.
  // Alt klasörde yayın: .env → VITE_BASE=/alt/ (sonunda / olmalı)
  const base = env.VITE_BASE || '/'

  return {
  root: process.cwd(),
  base,
  plugins: [
    react(),
    {
      name: 'preconnect-supabase',
      transformIndexHtml(html) {
        const url = env.VITE_SUPABASE_URL
        if (!url || typeof url !== 'string') return html
        try {
          const origin = new URL(url).origin
          const tags = `    <link rel="dns-prefetch" href="${origin}" />\n    <link rel="preconnect" href="${origin}" crossorigin />\n`
          return html.replace('<head>', `<head>\n${tags}`)
        } catch {
          return html
        }
      },
    },
  ],
  define: {
    'process.env': {},
  },
  build: {
    // Safari / WebKit: modulepreload + fetch polyfill sorunları
    modulePreload: false,
    target: ['es2018', 'safari13', 'ios13'],
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
    rollupOptions: {
      output: {
        // İstenen ayrım; HTTP/1.1 paylaşımlı hostingde ek paralel istek riski — sorun olursa kaldırılabilir
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    watch: {
      // Dosya değişikliklerini daha agresif şekilde takip et
      usePolling: true,
      interval: 100,
    },
    hmr: {
      overlay: true,
    },
    host: true,
    strictPort: true,
  },
  }
})

