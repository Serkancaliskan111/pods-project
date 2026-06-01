import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTaskAssign } from '../../../contexts/TaskAssignContext.jsx'

/** /admin/tasks/new — drawer açar, liste üzerinde kalır (mobil ExtraTask akışı) */
export default function NewTaskOpener() {
  const { openTaskAssign } = useTaskAssign()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    openTaskAssign(location.search || '')
    navigate('/admin/tasks', { replace: true })
  }, [location.search, navigate, openTaskAssign])

  return null
}
