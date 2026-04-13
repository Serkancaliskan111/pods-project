import { useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Unauthorized from './pages/Unauthorized'
import AdminLayout from './components/AdminLayout'
import AdminCompanies from './pages/admin/companies/Index'
import CompanyForm from './pages/admin/companies/CompanyForm'
import AdminDashboard from './pages/admin/AdminDashboard'
import UnitsIndex from './pages/admin/units/Index'
import UnitForm from './pages/admin/units/UnitForm'
import StaffIndex from './pages/admin/staff/Index'
import NewStaff from './pages/admin/staff/New'
import EditStaff from './pages/admin/staff/Edit'
import RolesIndex from './pages/admin/roles/Index'
import NewRole from './pages/admin/roles/New'
import TaskTemplatesPage from './pages/admin/TaskTemplatesPage'
import TaskTemplatesIndex from './pages/admin/task-templates/Index'
import TemplateBuilder from './pages/admin/task-templates/Builder'
import TasksIndex from './pages/admin/tasks/Index'
import TaskShow from './pages/admin/tasks/Show'
import NewTask from './pages/admin/tasks/New'
import AssignTask from './pages/admin/AssignTask'
import PresenceIndex from './pages/admin/presence/Index'
import PresenceDetail from './pages/admin/presence/Detail'
import { AuthContext } from './contexts/AuthContext.jsx'
import Spinner from './components/ui/Spinner'
import { Toaster } from 'sonner'
import { hasWebPanelAccess } from './lib/permissions.js'

function AdminProtected() {
  const { profile, user, loading } = useContext(AuthContext)
  const perms = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin

  // loading iken asla Navigate: oturum çözülmeden /login flikker’ını engeller
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Spinner size={8} />
        <p className="text-sm text-slate-500">Oturum doğrulanıyor…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: 'admin' }} />
  }

  // Oturum var ama profil henüz yoksa (hydration yarışı) — yetkisiz sayfasına atlama.
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Spinner size={8} />
        <p className="text-sm text-slate-500">Hesap bilgileri yükleniyor…</p>
      </div>
    )
  }

  if (!hasWebPanelAccess(perms, isSystemAdmin)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <AdminLayout />
}

function App() {
  const { loading } = useContext(AuthContext)

  // Auth INITIAL_SESSION bitene kadar hiçbir route render edilmez (Safari/erken redirect yarışı)
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Toaster richColors position="top-right" />
        <Spinner size={8} />
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      </div>
    )
  }

  return (
    <>
      <Toaster richColors position="top-right" />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<AdminProtected />}>
        <Route index element={<AdminDashboard />} />
        <Route path="companies" element={<AdminCompanies />} />
        <Route path="companies/new" element={<CompanyForm />} />
        <Route path="companies/edit/:id" element={<CompanyForm />} />
        <Route path="units" element={<UnitsIndex />} />
        <Route path="units/new" element={<UnitForm />} />
        <Route path="units/edit/:id" element={<UnitForm />} />
        <Route path="staff" element={<StaffIndex />} />
        <Route path="staff/new" element={<NewStaff />} />
        <Route path="staff/edit/:id" element={<EditStaff />} />
        <Route path="roles" element={<RolesIndex />} />
        <Route path="roles/new" element={<NewRole />} />
        <Route path="templates" element={<TaskTemplatesPage />} />
        <Route path="task-templates" element={<TaskTemplatesIndex />} />
        <Route path="task-templates/new" element={<TemplateBuilder />} />
        <Route path="task-templates/builder/:id" element={<TemplateBuilder />} />
        <Route path="tasks" element={<TasksIndex />} />
        <Route path="tasks/:id" element={<TaskShow />} />
        <Route path="tasks/new" element={<NewTask />} />
        <Route path="assign-task" element={<AssignTask />} />
        <Route path="presence" element={<PresenceIndex />} />
        <Route path="presence/:personId" element={<PresenceDetail />} />
      </Route>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  )
}

export default App
