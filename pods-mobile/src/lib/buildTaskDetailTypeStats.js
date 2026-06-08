import { Icon } from '../ui/icons'

export function buildChecklistTypeStats(templateQuestions, decisionsByQid = {}) {
  const total = templateQuestions?.length || 0
  if (!total) return null
  let accepted = 0
  let rejected = 0
  for (const q of templateQuestions) {
    const qid = String(q?.id ?? '')
    const d = decisionsByQid[qid]
    if (d === 'accept') accepted += 1
    else if (d === 'reject') rejected += 1
  }
  const pending = Math.max(0, total - accepted - rejected)
  return {
    items: [
      { label: 'Madde', value: total, Icon: Icon.Tasks, tone: 'accent' },
      { label: 'Kabul', value: accepted, Icon: Icon.TaskComplete, tone: 'success' },
      {
        label: 'Bekleyen',
        value: rejected + pending,
        Icon: Icon.TaskReject,
        tone: pending + rejected > 0 ? 'warn' : 'neutral',
      },
    ],
  }
}

export function buildChainTypeStats({ gorevSteps = [], onaySteps = [], aktifAdim, layout }) {
  const execTotal = gorevSteps.length
  const approveTotal = onaySteps.length
  if (!execTotal && !approveTotal) return null

  if (layout === 'chain-approve') {
    const done = onaySteps.filter((s) => {
      const d = String(s?.durum || s?.adim_durum || '').toLowerCase()
      return d === 'onaylandi' || d === 'tamamlandi'
    }).length
    return {
      items: [
        { label: 'Onay adımı', value: approveTotal, Icon: Icon.Chain, tone: 'accent' },
        { label: 'Tamamlanan', value: done, Icon: Icon.TaskComplete, tone: 'success' },
        {
          label: 'Kalan',
          value: Math.max(0, approveTotal - done),
          Icon: Icon.Clock,
          tone: approveTotal - done > 0 ? 'warn' : 'neutral',
        },
      ],
    }
  }

  if (layout === 'chain-hybrid') {
    const execDone = gorevSteps.filter((s) => {
      const d = String(s?.durum || s?.adim_durum || '').toLowerCase()
      return d === 'tamamlandi' || d === 'onaylandi'
    }).length
    const approveDone = onaySteps.filter((s) => {
      const d = String(s?.durum || s?.adim_durum || '').toLowerCase()
      return d === 'onaylandi' || d === 'tamamlandi'
    }).length
    return {
      items: [
        { label: 'Yürütme', value: `${execDone}/${execTotal || 0}`, Icon: Icon.Chain, tone: 'accent' },
        { label: 'Onay', value: `${approveDone}/${approveTotal || 0}`, Icon: Icon.Audit, tone: 'success' },
        {
          label: 'Aktif',
          value: aktifAdim ? `#${aktifAdim}` : '—',
          Icon: Icon.LiveFlow,
          tone: 'warn',
        },
      ],
    }
  }

  const steps = execTotal ? gorevSteps : onaySteps
  const total = steps.length
  const done = steps.filter((s) => {
    const d = String(s?.durum || s?.adim_durum || '').toLowerCase()
    return d === 'tamamlandi' || d === 'onaylandi'
  }).length

  return {
    items: [
      { label: 'Adım', value: total, Icon: Icon.Chain, tone: 'accent' },
      { label: 'Tamamlanan', value: done, Icon: Icon.TaskComplete, tone: 'success' },
      {
        label: layout === 'sequential' ? 'Aktif adım' : 'Sıradaki',
        value: aktifAdim ? `#${aktifAdim}` : '—',
        Icon: Icon.LiveFlow,
        tone: 'warn',
      },
    ],
  }
}

export function buildNormalTypeStats({ fotoZorunlu, minFoto, videoZorunlu, minVideo, belgeZorunlu, minBelge }) {
  const parts = []
  if (fotoZorunlu) parts.push(`Foto min ${minFoto || 1}`)
  if (videoZorunlu) parts.push(`Video min ${minVideo || 1}`)
  if (belgeZorunlu) parts.push(`Belge min ${minBelge || 1}`)
  if (!parts.length) return null
  return {
    items: [
      { label: 'Kanıt', value: parts.length, Icon: Icon.Photo, tone: 'accent' },
      { label: 'Gereksinim', value: parts[0], Icon: Icon.Warning, tone: 'neutral' },
      ...(parts[1]
        ? [{ label: 'Ek', value: parts.slice(1).join(' · '), Icon: Icon.TaskAssign, tone: 'neutral' }]
        : []),
    ],
  }
}

export function buildTaskDetailTypeStats({ design, task, templateQuestions, checklistDecisions, chainGorevSteps, chainOnaySteps }) {
  const layout = design?.layout || 'audit'
  if (layout === 'checklist') {
    return buildChecklistTypeStats(templateQuestions, checklistDecisions)
  }
  if (layout === 'audit') {
    return buildNormalTypeStats({
      fotoZorunlu: !!task?.foto_zorunlu,
      minFoto: task?.min_foto_sayisi,
      videoZorunlu: !!task?.video_zorunlu,
      minVideo: task?.min_video_sayisi,
      belgeZorunlu: !!task?.belge_zorunlu,
      minBelge: task?.min_belge_sayisi,
    })
  }
  const aktifAdim = Number(task?.zincir_aktif_adim || task?.zincir_onay_aktif_adim) || null
  return buildChainTypeStats({
    gorevSteps: chainGorevSteps,
    onaySteps: chainOnaySteps,
    aktifAdim,
    layout,
  })
}
