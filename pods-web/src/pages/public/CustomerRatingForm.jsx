import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../lib/supabaseClient'

const supabase = getSupabase()

const COMMENT_MAX = 1000

export default function CustomerRatingForm() {
  const { code } = useParams()
  const safeCode = useMemo(() => String(code || '').trim(), [code])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const ratingLabel =
    rating === 0
      ? 'Puan seçin'
      : rating <= 2
        ? 'Geliştirilebilir'
        : rating === 3
          ? 'Orta'
          : rating === 4
            ? 'İyi'
            : 'Mükemmel'

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

  const submit = async () => {
    if (!safeCode || rating < 1 || rating > 5) {
      toast.error('Lütfen 1-5 yıldız arası seçim yapın')
      return
    }
    const trimmedComment = comment.trim().slice(0, COMMENT_MAX)
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('rpc_submit_customer_rating', {
        p_code: safeCode,
        p_rating: rating,
        p_yorum: trimmedComment ? trimmedComment : null,
      })
      if (error) throw error
      setDone(true)
      toast.success('Değerlendirmeniz alındı. Teşekkürler.')
    } catch (e) {
      console.error(e)
      toast.error('Gönderim başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-indigo-50/40 to-slate-100 px-3 py-6 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-white px-5 py-4 sm:px-8 sm:py-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">Müşteri Değerlendirme</p>
          <h2 className="mt-1 text-base font-bold text-slate-900 sm:text-lg">Hizmet kalitesini puanlayın</h2>
        </div>
        <div className="p-5 sm:p-8">
        {loading ? (
          <div className="space-y-3">
            <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 h-14 animate-pulse rounded-xl bg-slate-200" />
          </div>
        ) : !meta ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-center">
            <p className="text-sm font-semibold text-rose-700">Geçersiz veya pasif QR</p>
            <p className="mt-1 text-xs text-rose-600">Lütfen işletmeden güncel QR kodu isteyin.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{meta.ana_sirket_adi || 'Firma'}</h1>
              <p className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {meta.birim_adi || 'Birim'}
              </p>
            </div>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-4 sm:px-5">
              <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                Yıldız seçin
              </div>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              {[1, 2, 3, 4, 5].map((s) => {
                const active = s <= rating
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={done}
                    onClick={() => setRating(s)}
                    className={`rounded-full p-1.5 transition ${done ? 'cursor-not-allowed opacity-60' : 'hover:scale-105 active:scale-95'}`}
                    aria-label={`${s} yıldız`}
                  >
                    <Star
                      className={`h-9 w-9 transition sm:h-10 sm:w-10 ${
                        active ? 'fill-amber-400 text-amber-500 drop-shadow-sm' : 'text-slate-300'
                      }`}
                    />
                  </button>
                )
              })}
              </div>
              <div className="mt-2 text-center text-xs font-medium text-slate-600">{ratingLabel}</div>
            </div>
            <div className="text-center text-xs text-slate-500">1 en düşük, 5 en yüksek puan</div>
            <div className="mt-5">
              <label
                htmlFor="customer-rating-comment"
                className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                <span>Geri bildiriminiz (opsiyonel)</span>
                <span className="font-normal normal-case tracking-normal text-slate-400">
                  {comment.length}/{COMMENT_MAX}
                </span>
              </label>
              <textarea
                id="customer-rating-comment"
                value={comment}
                onChange={(e) =>
                  setComment(e.target.value.slice(0, COMMENT_MAX))
                }
                disabled={done || submitting}
                placeholder="Deneyiminizi bizimle paylaşır mısınız? Övgü, eleştiri veya öneriniz olabilir."
                rows={3}
                maxLength={COMMENT_MAX}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </div>
            <button
              type="button"
              disabled={submitting || done || rating < 1}
              onClick={() => void submit()}
              className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {done ? 'Gönderildi' : submitting ? 'Gönderiliyor...' : 'Gönder'}
            </button>
            {done ? (
              <p className="mt-3 text-center text-xs font-medium text-emerald-600">
                Teşekkürler, değerlendirmeniz kaydedildi.
              </p>
            ) : null}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
