import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
  TASK_STATUS,
} from './taskStatus.js'

export function formatDurationTr(ms) {
  if (!ms || ms <= 0) return '—'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days} gün`
  if (hours >= 1) return `${hours} saat`
  const mins = Math.max(1, Math.round(ms / (1000 * 60)))
  return `${mins} dk`
}

function normalizeTimelineArray(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function getTimelineEventMs(event) {
  if (!event?.at) return null
  const ts = new Date(event.at).getTime()
  return Number.isNaN(ts) ? null : ts
}

function isApprovalReviewEvent(event) {
  const note = String(event?.note || '').toLowerCase()
  return note === 'approve' || note.includes('onayla')
}

export function getCompletionToApprovalDelayMs(job) {
  if (!isApprovedTaskStatus(job?.durum)) return null

  const completionTimes = normalizeTimelineArray(job?.tamamlama_gecmisi)
    .map(getTimelineEventMs)
    .filter((t) => t != null)
    .sort((a, b) => a - b)

  const approvalTimes = normalizeTimelineArray(job?.denetim_gecmisi)
    .filter(isApprovalReviewEvent)
    .map(getTimelineEventMs)
    .filter((t) => t != null)
    .sort((a, b) => a - b)

  if (!completionTimes.length || !approvalTimes.length) return null

  const lastApproval = approvalTimes[approvalTimes.length - 1]
  const completionBeforeApproval = completionTimes.filter((t) => t <= lastApproval).pop()

  if (completionBeforeApproval == null) return null
  const delta = lastApproval - completionBeforeApproval
  return delta > 0 ? delta : null
}

function getLastApprovalMs(job) {
  if (!isApprovedTaskStatus(job?.durum)) return null
  const approvalTimes = normalizeTimelineArray(job?.denetim_gecmisi)
    .filter(isApprovalReviewEvent)
    .map(getTimelineEventMs)
    .filter((t) => t != null)
  if (approvalTimes.length) return Math.max(...approvalTimes)
  const updated = new Date(job.updated_at || job.created_at || 0).getTime()
  return Number.isNaN(updated) ? null : updated
}

export function isOnTimeApproved(job) {
  if (!isApprovedTaskStatus(job?.durum) || !job?.son_tarih) return null
  const due = new Date(job.son_tarih)
  if (Number.isNaN(due.getTime())) return null
  const dueEnd = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999)
  const approvalMs = getLastApprovalMs(job)
  if (approvalMs == null) return null
  return approvalMs <= dueEnd.getTime()
}

function isRejectReviewEvent(event) {
  const note = String(event?.note || '').toLowerCase()
  return note.includes('reject') || note.includes('red')
}

function hadResubmission(job) {
  const status = normalizeTaskStatus(job?.durum)
  if (status === TASK_STATUS.RESUBMITTED) return true
  if (normalizeTimelineArray(job?.tamamlama_gecmisi).length > 1) return true
  if (normalizeTimelineArray(job?.denetim_gecmisi).some(isRejectReviewEvent)) return true
  return false
}

function enteredReviewPipeline(job) {
  const status = normalizeTaskStatus(job?.durum)
  if (isPendingApprovalTaskStatus(status)) return true
  if (isApprovedTaskStatus(status)) return true
  if (status === TASK_STATUS.RESUBMITTED) return true
  if (status === TASK_STATUS.REJECTED) return true
  if (normalizeTimelineArray(job?.tamamlama_gecmisi).length > 0) return true
  return false
}

/** Web AdminDashboard `reportSummary` ile aynı metrikler */
export function buildManagerReportSummary(jobs = []) {
  const base = jobs || []
  const total = base.length
  const completed = base.filter((j) => isApprovedTaskStatus(j.durum)).length
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const urgentJobs = base.filter((j) => j?.acil === true || j?.acil === 1)
  const urgentDone = urgentJobs.filter((j) => isApprovedTaskStatus(j.durum)).length
  const urgentCompletionRate =
    urgentJobs.length > 0 ? Math.round((urgentDone / urgentJobs.length) * 100) : 0

  const approvalDelays = base
    .map((j) => getCompletionToApprovalDelayMs(j))
    .filter((ms) => ms != null && ms > 0)
  const avgApprovalMs = approvalDelays.length
    ? approvalDelays.reduce((sum, ms) => sum + ms, 0) / approvalDelays.length
    : 0

  const totalPointsPossible = base.reduce(
    (sum, j) => sum + (Number(j.puan) > 0 ? Number(j.puan) : 0),
    0,
  )
  const earnedPoints = base
    .filter((j) => isApprovedTaskStatus(j.durum))
    .reduce((sum, j) => sum + (Number(j.puan) > 0 ? Number(j.puan) : 0), 0)
  const efficiencyScore =
    totalPointsPossible > 0 ? Math.round((earnedPoints / totalPointsPossible) * 100) : 0

  const onTimeSamples = base.map((j) => isOnTimeApproved(j)).filter((v) => v != null)
  const onTimeCompletionRate = onTimeSamples.length
    ? Math.round((onTimeSamples.filter(Boolean).length / onTimeSamples.length) * 100)
    : 0

  const reviewPipeline = base.filter(enteredReviewPipeline)
  const resubmissionCount = reviewPipeline.filter(hadResubmission).length
  const resubmissionRate =
    reviewPipeline.length > 0 ? Math.round((resubmissionCount / reviewPipeline.length) * 100) : 0

  return {
    completionRate,
    urgentCompletionRate,
    avgApprovalLabel: formatDurationTr(avgApprovalMs),
    efficiencyScore,
    onTimeCompletionRate,
    resubmissionRate,
    total,
  }
}

export const MANAGER_REPORT_STAT_CARDS = [
  {
    key: 'completion',
    label: 'Tamamlanan görev oranı',
    shortLabel: 'Tamamlanma',
    field: 'completionRate',
    suffix: '%',
    color: '#10b981',
    iconKey: 'TrendUp',
    showBar: true,
    hint: 'Seçili dönemde onaylanan görev payı',
    description:
      'Seçili tarih aralığındaki tüm görevler içinde denetimden geçmiş (onaylı) görevlerin yüzdesi. Operasyonun genel tamamlanma performansını gösterir.',
  },
  {
    key: 'urgent',
    label: 'Tamamlanan acil görev oranı',
    shortLabel: 'Acil tamamlama',
    field: 'urgentCompletionRate',
    suffix: '%',
    color: '#ef4444',
    iconKey: 'Urgent',
    showBar: true,
    hint: 'Acil işaretli görevlerde tamamlanma oranı',
    description:
      'Acil olarak işaretlenmiş görevlerde onaylanmış olanların oranı. Kritik iş yükünün ne kadarının zamanında kapatıldığını ölçer.',
  },
  {
    key: 'approval',
    label: 'Ortalama onay süresi',
    shortLabel: 'Onay süresi',
    field: 'avgApprovalLabel',
    suffix: '',
    color: '#6366f1',
    iconKey: 'Clock',
    showBar: false,
    hint: 'Tamamlanmadan onaya kadar (sistem geneli)',
    description:
      'Görev tamamlandıktan sonra denetim onayına kadar geçen ortalama süre. Süre kısaldıkça onay hattı daha hızlı işliyor demektir.',
  },
  {
    key: 'efficiency',
    label: 'Verimlilik skoru',
    shortLabel: 'Verimlilik',
    field: 'efficiencyScore',
    suffix: '%',
    color: '#f59e0b',
    iconKey: 'Focus',
    showBar: true,
    hint: 'Alınan puan / olası puan toplamı',
    description:
      'Onaylanan görevlerden kazanılan puanların, dönemdeki toplam atanabilir puanlara oranı. Ekip verimliliğinin sayısal özeti.',
  },
  {
    key: 'on-time',
    label: 'Zamanında tamamlama oranı',
    shortLabel: 'Zamanında',
    field: 'onTimeCompletionRate',
    suffix: '%',
    color: '#0ea5e9',
    iconKey: 'TaskComplete',
    showBar: true,
    hint: 'Son tarihli onaylı görevlerde zamanında onay',
    description:
      'Son teslim tarihi tanımlı ve onaylanmış görevlerde, onayın son tarihe kadar gerçekleşme oranı. Gecikme riskini azaltan disiplini yansıtır.',
  },
  {
    key: 'resubmission',
    label: 'Yeniden gönderim oranı',
    shortLabel: 'Yeniden gönderim',
    field: 'resubmissionRate',
    suffix: '%',
    color: '#8b5cf6',
    iconKey: 'Refresh',
    showBar: true,
    hint: 'Onay sürecine giren görevlerde revizyon payı',
    description:
      'Denetim sürecine girmiş görevler içinde yeniden gönderim veya red sonrası tekrar işleme girenlerin payı. Düşük oran kalite ve ilk seferde doğru tamamlamayı işaret eder.',
  },
]
