import { useHelpGuideDemo } from '../../../hooks/useHelpGuideDemo.js'
import HelpGuideDemoBanner from '../HelpGuideDemoBanner.jsx'
import TaskDetailHeader from '../../tasks/detail/TaskDetailHeader.jsx'
import TaskDetailEvidence from '../../tasks/detail/TaskDetailEvidence.jsx'
import { DEMO_PHOTO_URLS, DEMO_TASK_DETAIL } from '../../../lib/helpGuideDemoData.js'
import { getTaskDetailDesign } from '../../tasks/detail/taskDetailDesign.js'

/** Görev detay kılavuzu — gerçek görev açılmadan örnek detay */
export default function HelpGuideDemoTaskDetail() {
  const { enabled } = useHelpGuideDemo('task-detail')
  if (!enabled) return null

  const design = getTaskDetailDesign(DEMO_TASK_DETAIL.gorev_turu)

  return (
    <div
      className="pointer-events-none relative z-[1] mx-auto mb-6 max-w-[1400px] px-4 sm:px-5"
      aria-hidden={false}
    >
      <HelpGuideDemoBanner className="mb-3" />
      <div className="pointer-events-auto opacity-[0.98]">
        <TaskDetailHeader
          task={DEMO_TASK_DETAIL}
          assigneeLabel={DEMO_TASK_DETAIL.assigneeLabel}
          normalizedStatus="Onay Bekliyor"
          isApproved={false}
          canEditWorkStatus={false}
          onWorkStatusUpdated={() => {}}
          onBack={() => {}}
          compact
          design={design}
        />
        <div className="mt-4">
          <TaskDetailEvidence
            photoUrls={DEMO_PHOTO_URLS}
            videos={[]}
            onPhotoClick={() => {}}
            accent={design?.barColor}
          />
        </div>
      </div>
    </div>
  )
}
