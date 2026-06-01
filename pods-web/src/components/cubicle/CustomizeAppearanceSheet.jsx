import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import ProfileAppearanceSettings from '../../pages/admin/profile/ProfileAppearanceSettings.jsx'
import { Sheet, Text } from '../../ui'

export default function CustomizeAppearanceSheet({ open, onClose }) {
  const { user, profile, refreshProfile } = useContext(AuthContext)

  if (!user?.id) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title="Panel özelleştirme"
      className="px-4 py-4"
      panelClassName="max-w-[min(480px,100vw)]"
    >
      <Text variant="caption" className="mb-4 block text-slate-500">
        Sol menü, sayfa zemini, vurgu rengi ve yazı boyutu gibi tercihler anında uygulanır; kaydettiğinizde
        tüm cihazlarda hesabınıza yazılır.
      </Text>

      <ProfileAppearanceSettings
        embedded
        userId={user.id}
        initialPrefs={profile?.arayuz_tercihleri}
        onSaved={refreshProfile}
      />

      <div className="mt-6 border-t border-slate-100 pt-4">
        <Link
          to="/admin/profile"
          onClick={onClose}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 transition hover:text-primary-900"
        >
          <User size={16} strokeWidth={1.75} aria-hidden />
          Profil ve hesap bilgileri
        </Link>
        <Text variant="caption" className="mt-2 block text-slate-400">
          Fotoğraf, e-posta ve personel bilgileri profil sayfasında.
        </Text>
      </div>
    </Sheet>
  )
}
