import { Navigate } from 'react-router-dom'

/** @deprecated — /admin/audit/pending kullanın */
export default function TasksAudit() {
  return <Navigate to="/admin/audit/pending" replace />
}
