import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ListOrdered } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import {
  extractKanitVideosFromJob,
  extractPhotoUrls,
} from '../../../../pages/admin/tasks/taskShow/taskShowUtils.js'
import StepSelectorChip from '../primitives/StepSelectorChip.jsx'
import StepStatusPill from '../primitives/StepStatusPill.jsx'
import TaskDetailSectionCard from '../primitives/TaskDetailSectionCard.jsx'

const ROLE_UI = {
  worker: {
    title: 'Sizin aktif adımınız',
    hint: 'Üstteki yeşil düğmeyle kanıt yükleyip tamamlayın.',
    border: '#06b6d4',
    bg: 'from-cyan-50 to-white',
  },
  auditor: {
    title: 'Denetim bekliyor',
    hint: 'Kanıtları inceleyip Onayla veya Reddet kullanın.',
    border: '#6366f1',
    bg: 'from-indigo-50 to-white',
  },
  pending: {
    title: 'Denetimde',
    hint: 'Denetimci kararı bekleniyor.',
    border: '#f59e0b',
    bg: 'from-amber-50 to-white',
  },
  approved: {
    title: 'Adım onaylandı',
    hint: 'Bu adım tamamlandı.',
    border: '#10b981',
    bg: 'from-emerald-50 to-white',
  },
  rejected: {
    title: 'Adım reddedildi',
    hint: 'Yeniden gönderim mobil uygulamadan yapılır.',
    border: '#ef4444',
    bg: 'from-red-50 to-white',
  },
  waiting: {
    title: 'Sıra bekleniyor',
    hint: 'Önceki adım onaylanınca sıra size geçer.',
    border: '#94a3b8',
    bg: 'from-slate-50 to-white',
  },
}

export default function SiraliStepsPanel({ ctx, design }) {
  const {
    chainGorevStepsForViewer,
    chainNameMap,
    siraliViewerStepInfo,
    openPhotoPreview,
    fullNameOrPersonelRef,
  } = ctx

  const accent = design?.accent || '#E11D48'
  const viewer = siraliViewerStepInfo
  const roleUi = viewer ? ROLE_UI[viewer.role] || ROLE_UI.waiting : null
  const steps = chainGorevStepsForViewer || []
  const [selectedStepId, setSelectedStepId] = useState(null)
  const didAutoExpand = useRef(false)

  const sorted = [...steps].sort((a, b) => (Number(a?.adim_no) || 0) - (Number(b?.adim_no) || 0))

  useEffect(() => {
    if (didAutoExpand.current || !sorted.length) return
    const active = sorted.find((r) => String(r?.adim_durum || r?.durum || '').toLowerCase() === 'aktif')
    const pick = active || sorted[0]
    if (pick?.id) {
      setSelectedStepId(pick.id)
      didAutoExpand.current = true
    }
  }, [sorted])

  if (!steps.length) return null

  const selectedRow = sorted.find((r) => r.id === selectedStepId) || null

  return (
    <div className="space-y-5">
      {roleUi && viewer?.step ? (
        <div
          className={cn(
            'overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-5 shadow-sm',
            roleUi.bg,
          )}
          style={{ borderColor: roleUi.border }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {roleUi.title}
          </p>
          <p className="mt-1 text-xl font-extrabold text-primary-900">
            {String(viewer.step.adim_baslik || '').trim() || `Adım ${viewer.step.adim_no}`}
          </p>
          <p className="mt-2 text-sm text-slate-600">{roleUi.hint}</p>
        </div>
      ) : null}

      <TaskDetailSectionCard
        title="Adım zaman çizelgesi"
        subtitle="Adımlara tıklayın · detay altta açılır"
        icon={ListOrdered}
        accent={accent}
        flushBody
        bodyClassName="p-0"
      >
        <p className="border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs font-medium text-slate-600">
          Her adım kartına tıklayarak yapan, denetimci ve kanıtları görüntüleyin.
        </p>
        <div className="flex gap-3 overflow-x-auto border-b border-slate-100 px-5 py-4 [-ms-overflow-style:none] [scrollbar-width:thin]">
          {sorted.map((row) => {
            const durumRaw = String(row?.adim_durum || row?.durum || '').toLowerCase()
            const isWorkflowActive = durumRaw === 'aktif'
            const isSelected = selectedStepId === row.id
            const rowTitle = String(row?.adim_baslik || '').trim() || `Adım ${row.adim_no}`
            return (
              <StepSelectorChip
                key={row.id}
                stepNo={row.adim_no}
                title={rowTitle}
                status={row.adim_durum || row.durum}
                isWorkflowActive={isWorkflowActive}
                isSelected={isSelected}
                accent={accent}
                onClick={() => setSelectedStepId(isSelected ? null : row.id)}
              />
            )
          })}
        </div>

        <div className="p-5">
          {selectedRow ? (
            <SiraliStepDetail
              row={selectedRow}
              accent={accent}
              chainNameMap={chainNameMap}
              fullNameOrPersonelRef={fullNameOrPersonelRef}
              openPhotoPreview={openPhotoPreview}
            />
          ) : (
            <div
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200',
                'bg-gradient-to-b from-slate-50 to-white px-6 py-10 text-center',
              )}
            >
              <p className="text-sm font-semibold text-slate-700">Adım seçin</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Yukarıdaki kartlardan birine tıklayın.
              </p>
            </div>
          )}

          <ol className="relative mt-6 space-y-2 border-t border-slate-100 pt-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tüm adımlar
            </p>
            {sorted.map((row) => {
              const isSelected = selectedStepId === row.id
              const rowTitle = String(row?.adim_baslik || '').trim() || `Adım ${row.adim_no}`
              const durumRaw = String(row?.adim_durum || row?.durum || '').toLowerCase()
              const isWorkflowActive = durumRaw === 'aktif'
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStepId(isSelected ? null : row.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all',
                      'cursor-pointer hover:bg-slate-50 hover:shadow-sm',
                      isSelected
                        ? 'border-current bg-white shadow-md ring-2 ring-offset-1'
                        : 'border-slate-200 bg-slate-50/50',
                    )}
                    style={isSelected ? { borderColor: accent, ringColor: `${accent}44` } : undefined}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white',
                        !isWorkflowActive && 'bg-slate-300',
                      )}
                      style={isWorkflowActive ? { backgroundColor: accent } : undefined}
                    >
                      {row.adim_no}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-primary-900">
                        {rowTitle}
                      </span>
                      <span className="mt-0.5 text-xs text-slate-500">
                        {isSelected ? 'Seçili · detay yukarıda' : 'Detayı göster'}
                      </span>
                    </span>
                    <StepStatusPill status={row.adim_durum || row.durum} />
                    <ChevronRight
                      size={18}
                      className={cn('shrink-0 text-slate-400', isSelected && 'text-slate-600')}
                    />
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </TaskDetailSectionCard>
    </div>
  )
}

function SiraliStepDetail({ row, accent, chainNameMap, fullNameOrPersonelRef, openPhotoPreview }) {
  const yapan =
    chainNameMap[String(row.personel_id)] || fullNameOrPersonelRef(null, row.personel_id)
  const denetimci = row.denetimci_personel_id
    ? chainNameMap[String(row.denetimci_personel_id)] ||
      fullNameOrPersonelRef(null, row.denetimci_personel_id)
    : '—'
  const stepPhotoUrls = extractPhotoUrls(row)
  const videos = extractKanitVideosFromJob(row)
  const rowTitle = String(row?.adim_baslik || '').trim() || `Adım ${row.adim_no}`

  return (
    <div
      className="rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        Adım {row.adim_no} · {rowTitle}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        <span className="font-semibold text-slate-800">Yapan:</span> {yapan}
        <span className="mx-2 text-slate-300">·</span>
        <span className="font-semibold text-slate-800">Denetim:</span> {denetimci}
      </p>
      {(stepPhotoUrls.length > 0 || videos.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {stepPhotoUrls.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => openPhotoPreview(url, stepPhotoUrls)}
              className="h-20 w-20 overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-2 hover:ring-blue-300"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          {videos.map((v, vi) => (
            <video
              key={vi}
              src={v.url}
              controls
              playsInline
              className="max-h-36 max-w-full rounded-lg border border-slate-200"
            />
          ))}
        </div>
      )}
      {stepPhotoUrls.length === 0 && videos.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Bu adımda kanıt yok</p>
      ) : null}
    </div>
  )
}
