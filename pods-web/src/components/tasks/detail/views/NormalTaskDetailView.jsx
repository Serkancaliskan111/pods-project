import TaskDetailEvidence from '../TaskDetailEvidence.jsx'
import TaskReferenceMediaPanel from '../panels/TaskReferenceMediaPanel.jsx'

/** Standart görev: banner yok, kompakt kanıt galerisi */
export default function NormalTaskDetailView({ ctx }) {
  const { design, photoUrls, taskVideoEvidence, taskBelgeEvidence, openPhotoPreview, taskReferenceMedia } = ctx

  return (
    <div className="flex flex-col gap-4">
      <TaskDetailEvidence
        photoUrls={photoUrls}
        videos={taskVideoEvidence}
        documents={taskBelgeEvidence}
        onPhotoClick={(url) => openPhotoPreview(url, photoUrls)}
        accent={design.accent}
        variant="gallery"
      />
      <TaskReferenceMediaPanel
        taskReferenceMedia={taskReferenceMedia}
        onPreview={openPhotoPreview}
        accent={design.accent}
      />
    </div>
  )
}
