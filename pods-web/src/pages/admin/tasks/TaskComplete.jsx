import { useContext } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { hasManagementDashboardAccess } from '../../../lib/permissions.js'
import TaskCompletePanel from '../../../components/tasks/TaskCompletePanel.jsx'

export default function TaskComplete() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useContext(AuthContext)
  const management = hasManagementDashboardAccess(
    profile?.yetkiler,
    !!profile?.is_system_admin,
  )

  return (
    <TaskCompletePanel
      taskId={id}
      variant="page"
      onClose={() => navigate(management ? `/admin/tasks/${id}` : '/admin')}
    />
  )
}
