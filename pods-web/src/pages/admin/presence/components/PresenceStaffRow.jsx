import { Wifi, WifiOff } from 'lucide-react'
import { AdminDirectoryRow } from '../../../../components/admin/AdminDirectory.jsx'
import { StatusBadge } from '../../../../ui'
import { formatRelativeTime } from '../../../../lib/presenceUtils.js'

function staffDisplayName(p) {
  return p.ad && p.soyad ? `${p.ad} ${p.soyad}` : p.email || p.personel_kodu || 'Personel'
}

export default function PresenceStaffRow({ person, unitLabel }) {
  const online = !!person.mobil_online
  return (
    <AdminDirectoryRow
      title={staffDisplayName(person)}
      subtitle={unitLabel || '—'}
      meta={`Son görülme: ${formatRelativeTime(person.mobil_last_seen_at)}`}
      actions={
        <StatusBadge
          tone={online ? 'success' : 'soft'}
          size="md"
          icon={
            online ? (
              <Wifi size={14} strokeWidth={2.5} aria-hidden />
            ) : (
              <WifiOff size={14} strokeWidth={2.5} aria-hidden />
            )
          }
        >
          {online ? 'Online' : 'Offline'}
        </StatusBadge>
      }
    />
  )
}
