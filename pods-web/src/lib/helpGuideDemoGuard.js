import { toast } from 'sonner'
import { isHelpGuideDemoEntity } from './helpGuideDemoData.js'

const DEFAULT_MSG =
  'Kılavuz modu: Bu örnek kayıt gerçek değil; sayfa açılmaz. Turdaki talimatları uygulayın veya «İleri» ile devam edin.'

/**
 * @param {object | null | undefined} entity
 * @param {string} [message]
 * @returns {boolean} true = engellendi
 */
export function blockHelpGuideDemoAction(entity, message = DEFAULT_MSG) {
  if (!isHelpGuideDemoEntity(entity)) return false
  toast.message(message)
  return true
}

/**
 * @param {object} task
 * @param {(path: string) => void} navigate
 * @param {{ suffix?: string, message?: string }} [opts]
 * @returns {boolean} true = yönlendirildi
 */
import { getProjectTaskRoute, isProjectPlanningTask } from './projectTaskGlobalList.js'

export function navigateToTaskIfReal(task, navigate, opts = {}) {
  if (blockHelpGuideDemoAction(task, opts.message)) return false
  if (isProjectPlanningTask(task)) {
    const route = getProjectTaskRoute(task)
    if (route) {
      navigate(route)
      return true
    }
  }
  const suffix = opts.suffix || ''
  const taskId = task?._projectTaskId || task?.id
  navigate(`/admin/tasks/${taskId}${suffix}`)
  return true
}
