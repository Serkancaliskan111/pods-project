import { Navigate } from 'react-router-dom'

export default function AuditIndex() {
  return <Navigate to="/admin/audit/pending" replace />
}
