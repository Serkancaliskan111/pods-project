import { Navigate } from 'react-router-dom'

/** Eski /admin/tasks adresi → bekleyen görevler */
export default function TasksIndex() {
  return <Navigate to="/admin/tasks/pending" replace />
}
