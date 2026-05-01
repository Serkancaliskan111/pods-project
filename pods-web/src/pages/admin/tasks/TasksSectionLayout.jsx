import { useContext, useMemo } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canApproveTaskDeletion } from '../../../lib/permissions.js'

const tabBase = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 18px',
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
  border: '1px solid transparent',
  transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
}

export default function TasksSectionLayout() {
  const { profile } = useContext(AuthContext)
  const permissions = profile?.yetkiler || {}
  const showDeletionTab = canApproveTaskDeletion(permissions)

  const tabs = useMemo(
    () => [
      { to: '/admin/tasks', end: true, label: 'İşler' },
      ...(showDeletionTab
        ? [
            { to: '/admin/tasks/deletion-requests', end: false, label: 'İş silme onayı' },
            { to: '/admin/tasks/deleted-archive', end: false, label: 'Silinen işler' },
          ]
        : []),
    ],
    [showDeletionTab],
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      <div
        style={{
          padding: '24px 32px 0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            style={({ isActive }) => ({
              ...tabBase,
              ...(isActive
                ? {
                    backgroundColor: '#0a1e42',
                    color: '#ffffff',
                    borderColor: '#0a1e42',
                  }
                : {
                    backgroundColor: '#ffffff',
                    color: '#334155',
                    borderColor: '#dbe4ef',
                  }),
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
