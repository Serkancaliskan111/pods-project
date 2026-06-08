import { extractKanitPhotoUrls, extractKanitVideoUrls, getFirstVideoEvidenceUrlFromJob } from './liveFieldAuditFeed'
import { formatTaskTitleCase } from './formatTaskTitle'

export const LIVE_FLOW_LIMIT = 30

/** Web AdminDashboard ile aynı: en fazla 3 kanıt (foto + video). */
export function collectJobMediaForLiveFlow(job) {
  if (!job) return []

  const photoSet = new Set(extractKanitPhotoUrls(job).filter(Boolean))
  const checklistRows = Array.isArray(job?.checklist_cevaplari) ? job.checklist_cevaplari : []
  for (const ans of checklistRows) {
    const fromList = Array.isArray(ans?.fotograflar) ? ans.fotograflar.filter(Boolean) : []
    fromList.forEach((u) => photoSet.add(u))
    extractKanitPhotoUrls(ans).forEach((u) => photoSet.add(u))
  }

  const videoSet = new Set(extractKanitVideoUrls(job).filter(Boolean))
  const fallbackVideo = getFirstVideoEvidenceUrlFromJob(job)
  if (fallbackVideo) videoSet.add(fallbackVideo)

  if (job.thumb_url && job.thumb_kind === 'photo') photoSet.add(job.thumb_url)
  if (job.thumb_url && job.thumb_kind === 'video') videoSet.add(job.thumb_url)

  const media = [
    ...[...photoSet].map((url) => ({ type: 'photo', url })),
    ...[...videoSet].map((url) => ({ type: 'video', url })),
  ]

  return media.slice(0, 3)
}

export function buildLiveFlowItemsFromJobs(jobs = [], { companyName } = {}) {
  return (jobs || [])
    .slice()
    .sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at || 0).getTime()
      const db = new Date(b.updated_at || b.created_at || 0).getTime()
      return db - da
    })
    .map((job) => ({
      id: job.id,
      durum: job.durum,
      title: formatTaskTitleCase(job.baslik || 'Görev'),
      person: job.sorumlu_personel_adi || 'Personel',
      unit: job.birim_adi || null,
      company: companyName || null,
      media: collectJobMediaForLiveFlow(job),
    }))
    .filter((item) => item.media.length > 0)
    .slice(0, LIVE_FLOW_LIMIT)
}
