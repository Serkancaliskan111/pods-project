import { useContext, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canOperationallyEditAssignedTask } from '../../../lib/permissions.js'
import {
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from '../../../lib/zincirTasks.js'
import TaskEditShell from './edit/TaskEditShell.jsx'
import { useTaskEditLoader } from './edit/hooks/useTaskEditLoader.js'
import NormalTaskEditForm from './edit/variants/NormalTaskEditForm.jsx'
import ChainTaskEditForm from './edit/variants/ChainTaskEditForm.jsx'
import SequentialTaskEditForm from './edit/variants/SequentialTaskEditForm.jsx'

/**
 * Görev düzenleme yönlendiricisi. Loader, görev tipini bulup uygun variantı render eder.
 * URL: `/admin/tasks/:id/edit`
 */
export default function TaskEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const mayEditRole =
    isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)

  useEffect(() => {
    if (!mayEditRole) navigate('/unauthorized', { replace: true })
  }, [mayEditRole, navigate])

  const loader = useTaskEditLoader(id)
  const {
    loading,
    task,
    blockedReason,
    units,
    staff,
    chainGorevSteps,
    chainOnaySteps,
    siraliSteps,
    setSiraliSteps,
  } = loader

  const variantInfo = useMemo(() => {
    if (!task) return { kind: 'normal', title: 'Görevi düzenle', subtitle: '', badge: '' }
    if (isSiraliGorevTuru(task.gorev_turu)) {
      return {
        kind: 'sirali',
        title: 'Sıralı Görevi düzenle',
        subtitle:
          'Üst bilgileri ve henüz yapılmamış adımları güncelleyebilirsiniz. Adım sırası değiştirilemez.',
        badge: 'Sıralı',
      }
    }
    if (isZincirGorevTuru(task.gorev_turu) && isZincirOnayTuru(task.gorev_turu)) {
      return {
        kind: 'chain',
        title: 'Zincir Görev + Zincir Onay düzenle',
        subtitle:
          'Yürütme zinciri ve onay zinciri ayrı listelerden yönetilir. Onaylı/tekrar adım varsa o liste salt-okunurdur.',
        badge: 'Zincir Görev + Zincir Onay',
      }
    }
    if (isZincirGorevTuru(task.gorev_turu)) {
      return {
        kind: 'chain',
        title: 'Zincir Görevi düzenle',
        subtitle:
          'Birim sabittir; sorumlu personel yalnızca aktif adım için güncellenir. Sıra henüz başlamadıysa yeniden sıralanabilir.',
        badge: 'Zincir',
      }
    }
    if (isZincirOnayTuru(task.gorev_turu)) {
      return {
        kind: 'chain',
        title: 'Zincir Onayı düzenle',
        subtitle:
          'Görev yürütmesi normal görev gibi düzenlenir. Onay sırası henüz başlamadıysa yeniden sıralanabilir.',
        badge: 'Zincir Onay',
      }
    }
    return {
      kind: 'normal',
      title: 'Görevi düzenle',
      subtitle:
        'Tüm alanlar düzenlenebilir. Bire bir görev seçeneği yalnızca normal görev tipinde geçerlidir.',
      badge: 'Normal',
    }
  }, [task])

  if (!mayEditRole) return null

  return (
    <TaskEditShell
      loading={loading}
      taskId={task?.id || id}
      title={variantInfo.title}
      subtitle={variantInfo.subtitle}
      blockedReason={blockedReason}
      badge={variantInfo.badge}
    >
      {variantInfo.kind === 'sirali' ? (
        <SequentialTaskEditForm
          task={task}
          staff={staff}
          disabled={!!blockedReason}
          siraliSteps={siraliSteps}
          setSiraliSteps={setSiraliSteps}
        />
      ) : variantInfo.kind === 'chain' ? (
        <ChainTaskEditForm
          task={task}
          units={units}
          staff={staff}
          disabled={!!blockedReason}
          gorevSteps={chainGorevSteps}
          onaySteps={chainOnaySteps}
        />
      ) : (
        <NormalTaskEditForm
          task={task}
          units={units}
          staff={staff}
          disabled={!!blockedReason}
        />
      )}
    </TaskEditShell>
  )
}
