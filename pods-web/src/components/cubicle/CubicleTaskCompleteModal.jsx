import Modal from '../../ui/Modal.jsx'
import TaskCompletePanel from '../tasks/TaskCompletePanel.jsx'

export default function CubicleTaskCompleteModal({ open, task, onClose, onCompleted }) {
  if (!task?.id) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task.baslik || 'Görev'}
      size="xl"
      className="max-h-[92vh]"
    >
      <div className="max-h-[calc(92vh-3.25rem)] overflow-y-auto overscroll-contain px-4 pb-5 pt-1">
        <TaskCompletePanel
          key={task.id}
          taskId={task.id}
          variant="modal"
          onClose={onClose}
          onCompleted={() => onCompleted?.(task)}
        />
      </div>
    </Modal>
  )
}
