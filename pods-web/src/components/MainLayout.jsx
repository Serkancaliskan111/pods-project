import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext.jsx'
import Sidebar from './Sidebar.jsx'

export default function MainLayout({ children }) {
  const { profile } = useContext(AuthContext)

  const displayName =
    profile?.ad && profile?.soyad
      ? `${profile.ad} ${profile.soyad}`
      : profile?.ad_soyad || 'Kullanıcı'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Sabit sidebar */}
      <Sidebar />

      {/* İçerik alanı - sidebar genişliği kadar sağa kaydırılmış */}
      <div
        className="flex flex-col min-h-screen"
        style={{ marginLeft: '260px' }}
      >
        {/* İsteğe bağlı header ileride eklenebilir; şu an sade */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}


