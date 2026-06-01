import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, CheckCircle2, ImagePlus, Star, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../lib/supabaseClient'
import { compressCustomerRatingPhotoFile } from '../../lib/compressCustomerRatingPhoto'
import { compressCustomerRatingVideoFile } from '../../lib/compressCustomerRatingVideo'
import { uploadCustomerRatingMedia } from '../../lib/customerRatingMediaUpload'
import { cubicle } from '../../theme/cubicle'

const supabase = getSupabase()
const COMMENT_MAX = 1000
const BRAND = cubicle.sidebarBg

function MediaPreview({ kind, url, onRemove, disabled }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50">
      {kind === 'photo' ? (
        <img src={url} alt="" className="max-h-44 w-full object-cover" />
      ) : (
        <video src={url} controls className="max-h-44 w-full bg-black object-contain" />
      )}
      {!disabled ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 rounded-full bg-slate-900/75 p-1.5 text-white shadow-md transition hover:bg-slate-900"
          aria-label="Kaldır"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}

export default function CustomerRatingForm() {
  const { code } = useParams()
  const safeCode = useMemo(() => String(code || '').trim(), [code])
  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [videoPreview, setVideoPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const displayStars = hoverRating || rating

  const ratingLabel =
    displayStars === 0
      ? 'Deneyiminizi yıldızlarla paylaşın'
      : displayStars <= 2
        ? 'Geliştirebiliriz'
        : displayStars === 3
          ? 'Fena değil'
          : displayStars === 4
            ? 'Memnun kaldım'
            : 'Harika bir deneyim'

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      if (videoPreview) URL.revokeObjectURL(videoPreview)
    }
  }, [photoPreview, videoPreview])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!safeCode) {
        setLoading(false)
        return
      }
      try {
        const { data, error } = await supabase.rpc('rpc_get_customer_rating_form', {
          p_code: safeCode,
        })
        if (cancelled) return
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        setMeta(row || null)
      } catch (e) {
        console.error(e)
        setMeta(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [safeCode])

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview('')
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const clearVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(null)
    setVideoPreview('')
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  const onPhotoPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    clearPhoto()
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const onVideoPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    clearVideo()
    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
  }

  const submit = async () => {
    if (!safeCode || rating < 1 || rating > 5) {
      toast.error('Lütfen 1–5 yıldız seçin')
      return
    }
    const trimmedComment = comment.trim().slice(0, COMMENT_MAX)
    setSubmitting(true)
    try {
      const { data: ratingId, error } = await supabase.rpc('rpc_submit_customer_rating', {
        p_code: safeCode,
        p_rating: rating,
        p_yorum: trimmedComment ? trimmedComment : null,
      })
      if (error) throw error

      const id = Number(ratingId)
      if ((photoFile || videoFile) && Number.isFinite(id)) {
        try {
          const compressedPhoto = photoFile
            ? await compressCustomerRatingPhotoFile(photoFile)
            : null
          const compressedVideo = videoFile
            ? await compressCustomerRatingVideoFile(videoFile)
            : null
          const { fotoPath, videoPath } = await uploadCustomerRatingMedia(
            id,
            compressedPhoto,
            compressedVideo,
          )
          const { error: attachErr } = await supabase.rpc('rpc_attach_customer_rating_media', {
            p_code: safeCode,
            p_rating_id: id,
            p_foto_path: fotoPath,
            p_video_path: videoPath,
          })
          if (attachErr) throw attachErr
        } catch (mediaErr) {
          console.error(mediaErr)
          toast.warning(
            'Puanınız kaydedildi; fotoğraf veya video eklenemedi. İsterseniz işletmeyle paylaşabilirsiniz.',
          )
        }
      }

      setDone(true)
      toast.success('Teşekkürler, değerlendirmeniz alındı.')
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Gönderim başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen px-3 py-8 sm:px-4 sm:py-12"
      style={{
        background: `linear-gradient(165deg, ${BRAND} 0%, #0f2848 38%, #f4f6fa 38%, #eef1f7 100%)`,
      }}
    >
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
            Müşteri deneyimi
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Bizi değerlendirin</h1>
        </div>

        <div className="overflow-hidden rounded-[1.75rem] border border-white/20 bg-white shadow-[0_24px_60px_-28px_rgba(5,27,63,0.55)]">
          <div
            className="px-6 py-5 sm:px-8"
            style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #1a3d6b 100%)` }}
          >
            {loading ? (
              <div className="space-y-2">
                <div className="h-6 w-48 animate-pulse rounded-lg bg-white/20" />
                <div className="h-4 w-32 animate-pulse rounded bg-white/15" />
              </div>
            ) : !meta ? (
              <p className="text-sm font-semibold text-rose-200">Geçersiz veya pasif QR kodu</p>
            ) : (
              <>
                <p className="text-lg font-bold text-white sm:text-xl">
                  {meta.ana_sirket_adi || 'İşletme'}
                </p>
                <p className="mt-1 inline-flex rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium text-white/90">
                  {meta.birim_adi || 'Birim'}
                </p>
              </>
            )}
          </div>

          <div className="p-6 sm:p-8">
            {loading ? (
              <div className="space-y-4 py-6">
                <div className="mx-auto h-12 w-64 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ) : !meta ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-5 text-center">
                <p className="text-sm font-semibold text-rose-700">Bu bağlantı kullanılamıyor</p>
                <p className="mt-1 text-xs text-rose-600">
                  Lütfen işletmeden güncel QR kodu isteyin.
                </p>
              </div>
            ) : done ? (
              <div className="py-8 text-center">
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${cubicle.todayBar}22` }}
                >
                  <CheckCircle2 size={36} className="text-emerald-600" />
                </div>
                <p className="text-lg font-bold text-slate-900">Teşekkür ederiz</p>
                <p className="mt-2 text-sm text-slate-600">
                  Geri bildiriminiz kaydedildi. Görüşleriniz hizmetimizi geliştirmemize yardımcı olur.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-4 py-5">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Puanınız
                  </p>
                  <div
                    className="mt-3 flex justify-center gap-1 sm:gap-2"
                    onMouseLeave={() => setHoverRating(0)}
                  >
                    {[1, 2, 3, 4, 5].map((s) => {
                      const active = s <= displayStars
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={submitting}
                          onMouseEnter={() => setHoverRating(s)}
                          onClick={() => setRating(s)}
                          className="rounded-xl p-1 transition hover:scale-110 active:scale-95 disabled:opacity-50"
                          aria-label={`${s} yıldız`}
                        >
                          <Star
                            className={`h-10 w-10 sm:h-11 sm:w-11 ${
                              active
                                ? 'fill-amber-400 text-amber-500 drop-shadow-sm'
                                : 'text-slate-200'
                            }`}
                          />
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-center text-sm font-semibold text-slate-700">
                    {ratingLabel}
                  </p>
                </div>

                <div className="mt-5">
                  <label
                    htmlFor="customer-rating-comment"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Yorumunuz <span className="font-normal normal-case text-slate-400">(isteğe bağlı)</span>
                  </label>
                  <textarea
                    id="customer-rating-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
                    disabled={submitting}
                    placeholder="Deneyiminizi kısaca anlatın…"
                    rows={3}
                    maxLength={COMMENT_MAX}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1a3d6b] focus:ring-2 focus:ring-[#1a3d6b]/15 disabled:bg-slate-50"
                  />
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fotoğraf veya video <span className="font-normal normal-case text-slate-400">(isteğe bağlı)</span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={onPhotoPick}
                    />
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      capture="environment"
                      className="hidden"
                      onChange={onVideoPick}
                    />

                    {photoPreview ? (
                      <MediaPreview
                        kind="photo"
                        url={photoPreview}
                        onRemove={clearPhoto}
                        disabled={submitting}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => photoInputRef.current?.click()}
                        className="flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-slate-600 transition hover:border-[#1a3d6b]/40 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ImagePlus size={22} className="text-[#1a3d6b]" />
                        <span className="text-xs font-semibold">Fotoğraf ekle</span>
                      </button>
                    )}

                    {videoPreview ? (
                      <MediaPreview
                        kind="video"
                        url={videoPreview}
                        onRemove={clearVideo}
                        disabled={submitting}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => videoInputRef.current?.click()}
                        className="flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-slate-600 transition hover:border-[#1a3d6b]/40 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Video size={22} className="text-[#1a3d6b]" />
                        <span className="text-xs font-semibold">Video ekle</span>
                      </button>
                    )}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Camera size={12} />
                    İsteğe bağlı bir fotoğraf ve bir video ekleyebilirsiniz.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={submitting || rating < 1}
                  onClick={() => void submit()}
                  className="mt-6 w-full rounded-2xl px-4 py-3.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                  style={{ backgroundColor: BRAND }}
                >
                  {submitting ? 'Gönderiliyor…' : 'Değerlendirmeyi gönder'}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-white/50">
          Geri bildiriminiz yalnızca hizmet kalitesini iyileştirmek için kullanılır.
        </p>
      </div>
    </div>
  )
}
