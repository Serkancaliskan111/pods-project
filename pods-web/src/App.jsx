import { useContext } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
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
import PersonalTodoIndex from './pages/admin/personal-todo/Index.jsx'
import PersonalTodoTemplateBuilder from './pages/admin/personal-todo/TemplateBuilder.jsx'
import TasksSectionLayout from './pages/admin/tasks/TasksSectionLayout'
import TasksIndex from './pages/admin/tasks/Index'
import PendingTasks from './pages/admin/tasks/PendingTasks'
import CompletedTasks from './pages/admin/tasks/CompletedTasks'
import UpcomingTasks from './pages/admin/tasks/UpcomingTasks'
import TaskShow from './pages/admin/tasks/Show'
import TaskComplete from './pages/admin/tasks/TaskComplete'
import TaskEdit from './pages/admin/tasks/TaskEdit'
import TaskDeletionRequests from './pages/admin/tasks/TaskDeletionRequests'
import DeletedTasksArchive from './pages/admin/tasks/DeletedTasksArchive'
import AuditSectionLayout from './pages/admin/audit/AuditSectionLayout'
import AuditIndex from './pages/admin/audit/Index'
import AuditPending from './pages/admin/audit/AuditPending'
import AuditApproved from './pages/admin/audit/AuditApproved'
import NewTaskOpener from './pages/admin/tasks/NewTaskOpener'
import PresenceIndex from './pages/admin/presence/Index'
import PresenceDetail from './pages/admin/presence/Detail'
import AnnouncementsIndex from './pages/admin/announcements/Index'
import ChatLayout from './pages/admin/chat/ChatLayout'
import { normalizeChatUuid } from './lib/chatApi'

function ChatLegacyChannelRedirect() {
  const { channelId } = useParams()
  const id = normalizeChatUuid(channelId)
  return <Navigate to={id ? `/admin/chat?c=${encodeURIComponent(id)}` : '/admin/chat'} replace />
}
import CustomerRatingsPage from './pages/admin/customer-ratings/Index'
import CustomerRatingShowPage from './pages/admin/customer-ratings/Show'
import Profile from './pages/admin/Profile'
import CalendarPage from './pages/admin/calendar/Calendar.jsx'
import CustomerRatingForm from './pages/public/CustomerRatingForm'
import { AuthContext } from './contexts/AuthContext.jsx'
import Spinner from './components/ui/Spinner'
import { Toaster } from 'sonner'
import { hasWebPanelAccess } from './lib/permissions.js'

/** Eski /admin/assign-task bağlantıları — sorgu dizesi korunur */
function AssignTaskRedirectToNew() {
  const { search } = useLocation()
  return <Navigate to={`/admin/tasks/new${search}`} replace />
}

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
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            className: 'font-sans rounded-2xl',
            style: { borderRadius: '16px' },
          }}
        />
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
        <Route path="personal-todo" element={<PersonalTodoIndex />} />
        <Route path="personal-todo/templates/new" element={<PersonalTodoTemplateBuilder />} />
        <Route path="personal-todo/templates/:id" element={<PersonalTodoTemplateBuilder />} />
        <Route path="audit" element={<AuditSectionLayout />}>
          <Route index element={<AuditIndex />} />
          <Route path="pending" element={<AuditPending />} />
          <Route path="approved" element={<AuditApproved />} />
        </Route>
        <Route path="tasks" element={<TasksSectionLayout />}>
          <Route index element={<TasksIndex />} />
          <Route path="pending" element={<PendingTasks />} />
          <Route path="completed" element={<CompletedTasks />} />
          <Route path="upcoming" element={<UpcomingTasks />} />
          <Route path="deletion-requests" element={<TaskDeletionRequests />} />
          <Route path="deleted-archive" element={<DeletedTasksArchive />} />
          <Route path="new" element={<NewTaskOpener />} />
          <Route path=":id/edit" element={<TaskEdit />} />
          <Route path=":id/complete" element={<TaskComplete />} />
          <Route path=":id" element={<TaskShow />} />
        </Route>
        <Route path="assign-task" element={<AssignTaskRedirectToNew />} />
        <Route path="presence" element={<PresenceIndex />} />
        <Route path="presence/:personId" element={<PresenceDetail />} />
        <Route path="announcements" element={<AnnouncementsIndex />} />
        <Route path="chat/new" element={<Navigate to="/admin/chat?view=new" replace />} />
        <Route path="chat/:channelId" element={<ChatLegacyChannelRedirect />} />
        <Route path="chat" element={<ChatLayout />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="customer-ratings/:qrId" element={<CustomerRatingShowPage />} />
        <Route path="customer-ratings" element={<CustomerRatingsPage />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/rate/:code" element={<CustomerRatingForm />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  )
}

export default App
