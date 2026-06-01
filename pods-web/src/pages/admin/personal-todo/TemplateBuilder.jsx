import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

/** Eski URL'ler — ana sayfadaki şablon paneline yönlendir */
export default function PersonalTodoTemplateBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (id) {
      navigate(`/admin/personal-todo?editTemplate=${id}`, { replace: true })
    } else {
      navigate('/admin/personal-todo?newTemplate=1', { replace: true })
    }
  }, [id, navigate])

  return null
}
