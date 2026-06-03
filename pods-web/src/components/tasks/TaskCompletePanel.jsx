import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, CheckCircle2, FileText, Video } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../lib/supabaseClient'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import {
  GOREV_TURU,
  buildKanitFotoDurumlari,
  isSiraliGorevTuru,
  isZincirGorevTuru,
} from '../../lib/zincirTasks.js'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../lib/taskStatus.js'
import { logTaskTimelineEvent } from '../../lib/taskTimeline.js'
import { resolveAdhocKanitRules } from '../../lib/taskEvidenceRules.js'
import { uploadTaskDocumentFiles, uploadTaskPhotoFiles, uploadTaskVideoFiles } from '../../lib/taskEvidenceUpload.js'
import { TASK_DOCUMENT_ACCEPT } from '../../lib/taskDocumentTypes.js'
import { hasManagementDashboardAccess } from '../../lib/permissions.js'
import { Button, Card, PageHeader, Spinner, Text } from '../../ui'
import TaskWorkStatusSelect from './TaskWorkStatusSelect.jsx'
import TaskWorkStatusBadge from './TaskWorkStatusBadge.jsx'

const supabase = getSupabase()

function isResubmissionStatus(durum) {
  const d = String(durum || '').toLowerCase()
  return d.includes('onaylanmad') || d.includes('revize') || d.includes('redd')
}

/**
 * @param {{ taskId: string, variant?: 'page' | 'modal', onClose?: () => void, onCompleted?: (task: object) => void }} props
 */
export default function TaskCompletePanel({
  taskId,
  variant = 'page',
  onClose,
  onCompleted,
}) {
  const isModal = variant === 'modal'
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const management = hasManagementDashboardAccess(permissions, isSystemAdmin)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState(null)
  const [siraliSteps, setSiraliSteps] = useState([])
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [videos, setVideos] = useState([])
  const [documents, setDocuments] = useState([])
  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const documentInputRef = useRef(null)

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setPhotos([])
    setVideos([])
    setDocuments([])
    try {
      const { data: job, error } = await supabase
        .from('isler')
        .select('*')
        .eq('id', taskId)
        .single()
      if (error || !job) {
        toast.error('Görev yüklenemedi')
        setTask(null)
        return
      }
      setTask(job)
      setNote(String(job.personel_tamamlama_notu || '').trim())

      if (isSiraliGorevTuru(job.gorev_turu)) {
        const { data: steps } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('*')
          .eq('is_id', taskId)
          .order('adim_no', { ascending: true })
        setSiraliSteps(steps || [])
      } else {
        setSiraliSteps([])
      }
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  const isOwner = useMemo(
    () => String(task?.sorumlu_personel_id || '') === String(personel?.id || ''),
    [task?.sorumlu_personel_id, personel?.id],
  )

  const activeSiraliStep = useMemo(() => {
    if (!isSiraliGorevTuru(task?.gorev_turu)) return null
    return (
      siraliSteps.find((s) => String(s?.adim_durum || '') === 'aktif') ||
      siraliSteps.find((s) => Number(s?.adim_no) === Number(task?.zincir_aktif_adim || 1)) ||
      null
    )
  }, [task, siraliSteps])

  const rules = useMemo(
    () => resolveAdhocKanitRules(task, activeSiraliStep),
    [task, activeSiraliStep],
  )

  useEffect(() => {
    if (!rules.showVideoSection) setVideos([])
  }, [rules.showVideoSection])

  const statusNorm = normalizeTaskStatus(task?.durum)
  const canSubmitSiraliWorker =
    isSiraliGorevTuru(task?.gorev_turu) &&
    activeSiraliStep &&
    String(activeSiraliStep?.adim_durum || '') === 'aktif' &&
    String(activeSiraliStep?.personel_id || '') === String(personel?.id || '')

  const canSubmit =
    (isOwner || canSubmitSiraliWorker) &&
    !submitting &&
    !isApprovedTaskStatus(statusNorm) &&
    !isPendingApprovalTaskStatus(statusNorm)

  const canEditWorkStatus = isOwner || canSubmitSiraliWorker

  const hasChecklist = !!task?.is_sablon_id
  const isZincir = isZincirGorevTuru(task?.gorev_turu)

  const cardClass = isModal ? 'mb-3 space-y-3' : 'mb-4 space-y-4'
  const cardPadding = isModal ? 'md' : 'lg'

  const onPickPhotos = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setPhotos((prev) => [...prev, ...files])
  }

  const onPickVideos = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setVideos((prev) => [...prev, ...files])
  }

  const onPickDocuments = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setDocuments((prev) => [...prev, ...files])
  }

  const validate = () => {
    if (!isOwner && !canSubmitSiraliWorker) {
      toast.error('Bu görevi yalnızca sorumlu personel tamamlayabilir.')
      return false
    }
    if (task?.son_tarih) {
      const due = new Date(task.son_tarih)
      if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
        toast.error('Gecikmiş görevler web üzerinden tamamlanamaz.')
        return false
      }
    }
    const trimmed = note.trim()
    if (rules.aciklamaZorunlu && !trimmed) {
      toast.error('Tamamlama açıklaması zorunludur.')
      return false
    }
    if (rules.fotoZorunlu && photos.length < rules.minFoto) {
      toast.error(`En az ${rules.minFoto} fotoğraf ekleyin.`)
      return false
    }
    if (rules.showVideoSection && rules.videoZorunlu && videos.length < rules.minVideo) {
      toast.error(`En az ${rules.minVideo} video ekleyin.`)
      return false
    }
    if (rules.belgeZorunlu && documents.length < rules.minBelge) {
      toast.error(`En az ${rules.minBelge} belge ekleyin (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX).`)
      return false
    }
    return true
  }

  const completeNormal = async (trimmedNote) => {
    const prefix = `task-${taskId}-adhoc`
    const [photoUrls, videoRows, documentRows] = await Promise.all([
      uploadTaskPhotoFiles(photos, prefix),
      rules.showVideoSection && videos.length
        ? uploadTaskVideoFiles(videos, `${prefix}-vid`)
        : Promise.resolve([]),
      documents.length
        ? uploadTaskDocumentFiles(documents, `${prefix}-doc`)
        : Promise.resolve([]),
    ])
    const resubmit = isResubmissionStatus(task?.durum)
    const payload = {
      durum: resubmit ? TASK_STATUS.RESUBMITTED : TASK_STATUS.PENDING_APPROVAL,
      kanit_resim_ler: photoUrls,
      kanit_videolar: videoRows,
      kanit_belgeler: documentRows,
      kanit_foto_durumlari: buildKanitFotoDurumlari(photoUrls),
    }
    if (trimmedNote) payload.personel_tamamlama_notu = trimmedNote

    let q = supabase
      .from('isler')
      .update(payload)
      .eq('id', taskId)
      .eq('sorumlu_personel_id', personel.id)
    if (personel?.ana_sirket_id) q = q.eq('ana_sirket_id', personel.ana_sirket_id)
    const { error } = await q
    if (error) throw error
    await logTaskTimelineEvent(
      taskId,
      'completion',
      personel?.id,
      resubmit ? 'resubmitted-completion' : 'completion',
    )
  }

  const completeSirali = async (trimmedNote) => {
    const step = activeSiraliStep
    if (!step || String(step.personel_id) !== String(personel?.id)) {
      throw new Error('Aktif sıralı adım size ait değil.')
    }
    const prefix = `task-${taskId}-sirali-${step.adim_no}`
    const [photoUrls, videoRows, documentRows] = await Promise.all([
      uploadTaskPhotoFiles(photos, prefix),
      rules.showVideoSection && videos.length
        ? uploadTaskVideoFiles(videos, `${prefix}-vid`)
        : Promise.resolve([]),
      documents.length
        ? uploadTaskDocumentFiles(documents, `${prefix}-doc`)
        : Promise.resolve([]),
    ])
    const { error: stepErr } = await supabase
      .from('isler_zincir_gorev_adimlari')
      .update({
        kanit_resim_ler: photoUrls,
        kanit_videolar: videoRows,
        kanit_belgeler: documentRows,
        kanit_foto_durumlari: buildKanitFotoDurumlari(photoUrls),
      })
      .eq('id', step.id)
    if (stepErr) throw stepErr

    const { error: rpcErr } = await supabase.rpc('rpc_sirali_adim_tamamla', {
      p_is_id: taskId,
      p_adim_no: Number(step.adim_no),
      p_aciklama: trimmedNote || null,
    })
    if (rpcErr) throw rpcErr
    await logTaskTimelineEvent(
      taskId,
      'completion',
      personel?.id,
      `sirali-step-complete:${step.adim_no}`,
    )
  }

  const onSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const trimmed = note.trim()
      if (hasChecklist) {
        toast.error('Şablonlu (checklist) görevler şimdilik mobil uygulamadan tamamlanmalıdır.')
        return
      }
      if (isZincir && task?.gorev_turu !== GOREV_TURU.SIRALI_GOREV) {
        toast.error('Zincir görevler için detay sayfasını kullanın veya mobil uygulamayı tercih edin.')
        if (isModal) onClose?.()
        else navigate(`/admin/tasks/${taskId}`)
        return
      }
      if (isSiraliGorevTuru(task?.gorev_turu)) {
        await completeSirali(trimmed)
      } else {
        await completeNormal(trimmed)
      }
      toast.success('Görev tamamlandı ve onaya gönderildi.')
      if (isModal) {
        onCompleted?.(task)
        onClose?.()
      } else {
        navigate(management ? `/admin/tasks/${taskId}` : '/admin', { replace: true })
      }
    } catch (e) {
      toast.error(e?.message || 'Görev tamamlanamadı')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className={`flex justify-center ${isModal ? 'py-10' : 'py-20'}`}>
        <Spinner />
      </div>
    )
  }

  if (!task) {
    return (
      <Card padding="lg">
        <Text>Görev bulunamadı.</Text>
        {!isModal ? (
          <Link to="/admin" className="mt-4 inline-block text-sm font-semibold text-blue-700">
            Ana sayfaya dön
          </Link>
        ) : null}
      </Card>
    )
  }

  const formBody = (
    <>
      <Card padding={cardPadding} radius="2xl" className={cardClass}>
        <div>
          <dt className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Görev durumu
          </dt>
          <dd className="mt-2">
            {canEditWorkStatus ? (
              <TaskWorkStatusSelect
                taskId={task.id}
                value={task.calisma_durumu}
                onUpdated={(next) =>
                  setTask((prev) =>
                    prev
                      ? {
                          ...prev,
                          calisma_durumu: next,
                          calisma_durumu_guncelleme_at: new Date().toISOString(),
                        }
                      : prev,
                  )
                }
              />
            ) : (
              <TaskWorkStatusBadge value={task.calisma_durumu} />
            )}
          </dd>
          <p className="mt-2 text-xs text-slate-500">
            Onay durumu: {statusNorm || task.durum || '—'}
          </p>
        </div>
        {task.aciklama ? (
          <div>
            <dt className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Açıklama
            </dt>
            <dd className="mt-1 block whitespace-pre-wrap text-sm text-slate-800">
              {task.aciklama}
            </dd>
          </div>
        ) : null}
        {task.son_tarih ? (
          <div>
            <dt className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Son tarih
            </dt>
            <dd className="mt-1 block text-sm text-slate-800">
              {new Date(task.son_tarih).toLocaleString('tr-TR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </div>
        ) : null}
        {!canSubmit && !canSubmitSiraliWorker && !isOwner ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Bu görevin sorumlusu siz değilsiniz; tamamlama yapılamaz.
          </p>
        ) : null}
        {hasChecklist ? (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Bu görevde checklist bulunuyor. Tamamlama için mobil uygulamayı kullanın.
          </p>
        ) : null}
        {isZincir && !isSiraliGorevTuru(task?.gorev_turu) ? (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Zincir görevler webde henüz bu ekrandan tamamlanamıyor.{' '}
            <Link to={`/admin/tasks/${taskId}`} className="font-semibold underline">
              Detay sayfasına git
            </Link>
          </p>
        ) : null}
      </Card>

      {!hasChecklist && !(isZincir && !isSiraliGorevTuru(task?.gorev_turu)) ? (
        <Card padding={cardPadding} radius="2xl" className="space-y-5">
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
              <FileText size={16} />
              Tamamlama notu
              {rules.aciklamaZorunlu ? <span className="text-red-600">*</span> : null}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={isModal ? 3 : 4}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Yapılan işlem, gözlem veya ek bilgi…"
              disabled={!canSubmit}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Camera size={16} />
                Fotoğraflar
                {rules.fotoZorunlu ? (
                  <span className="font-normal text-slate-500">(en az {rules.minFoto})</span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canSubmit}
                onClick={() => photoInputRef.current?.click()}
              >
                Fotoğraf ekle
              </Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickPhotos}
              />
            </div>
            {photos.length ? (
              <ul className="flex flex-wrap gap-2">
                {photos.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  >
                    {f.name}
                    <button
                      type="button"
                      className="text-red-600"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Henüz fotoğraf seçilmedi.</p>
            )}
          </div>

          {rules.showVideoSection ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Video size={16} />
                  Videolar
                  {rules.videoZorunlu ? (
                    <span className="font-normal text-slate-500">
                      (en az {rules.minVideo}, en fazla {rules.maxVideoSn} sn)
                    </span>
                  ) : (
                    <span className="font-normal text-slate-500">(isteğe bağlı)</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSubmit}
                  onClick={() => videoInputRef.current?.click()}
                >
                  Video ekle
                </Button>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={onPickVideos}
                />
              </div>
              {videos.length ? (
                <ul className="flex flex-wrap gap-2">
                  {videos.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {f.name}
                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() => setVideos((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  {rules.videoZorunlu ? 'En az bir video ekleyin.' : 'İsteğe bağlı video kanıtı.'}
                </p>
              )}
            </div>
          ) : null}

          {rules.showBelgeSection ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <FileText size={16} />
                  Belgeler
                  {rules.belgeZorunlu ? (
                    <span className="font-normal text-slate-500">(en az {rules.minBelge})</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSubmit}
                  onClick={() => documentInputRef.current?.click()}
                >
                  Belge ekle
                </Button>
                <input
                  ref={documentInputRef}
                  type="file"
                  accept={TASK_DOCUMENT_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={onPickDocuments}
                />
              </div>
              {documents.length ? (
                <ul className="flex flex-wrap gap-2">
                  {documents.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {f.name}
                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() => setDocuments((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  PDF, DOC, DOCX, XLS, XLSX, PPT veya PPTX (en fazla 25 MB).
                </p>
              )}
            </div>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            iconLeft={<CheckCircle2 size={18} />}
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {submitting ? 'Gönderiliyor…' : 'Görevi tamamla ve onaya gönder'}
          </Button>
        </Card>
      ) : null}
    </>
  )

  if (isModal) {
    return <div className="space-y-0">{formBody}</div>
  }

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <PageHeader
        title="Görevi tamamla"
        subtitle={task.baslik || 'Görev'}
        actions={
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<ArrowLeft size={16} />}
            onClick={() =>
              onClose?.() || navigate(management ? `/admin/tasks/${taskId}` : '/admin')
            }
          >
            Geri
          </Button>
        }
      />
      {formBody}
    </div>
  )
}
