import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useContext } from 'react'
import MainLayout from './MainLayout'
import { AuthContext } from '../contexts/AuthContext.jsx'
import { canAccessAdminPath } from '../lib/permissions.js'

export default function AdminLayout() {
  const { profile, personel } = useContext(AuthContext)
  const location = useLocation()
  const perms = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin

  if (!canAccessAdminPath(location.pathname, perms, isSystemAdmin, personel)) {
    return <Navigate to="/unauthorized" replace />
  }

  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  )
}

