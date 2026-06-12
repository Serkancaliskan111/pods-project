/** Görev oluşturma/güncelleme sonrası listeleri yenilemek için */
export const PODS_TASKS_CHANGED_EVENT = 'pods:tasks-changed'

export function notifyTasksChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PODS_TASKS_CHANGED_EVENT))
  }
}
