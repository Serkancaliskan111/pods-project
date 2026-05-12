import getSupabase from './supabaseClient'

const supabase = getSupabase()

function toNum(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export async function insertPointTransaction({
  personelId,
  delta,
  gorevId = null,
  gorevBaslik = null,
  islemTipi = null,
  aciklama = null,
  tarih = null,
}) {
  const base = {
    personel_id: personelId,
    tarih: tarih || new Date().toISOString(),
    puan_degisimi: toNum(delta),
  }

  const candidates = [
    { ...base, gorev_id: gorevId, gorev_baslik: gorevBaslik, islem_tipi: islemTipi, aciklama },
    { ...base, gorev_id: gorevId, aciklama },
    { ...base, aciklama },
    base,
  ]

  let lastError = null
  for (const payload of candidates) {
    const { error } = await supabase.from('puan_hareketleri').insert(payload)
    if (!error) return { ok: true }
    lastError = error
    if (error.code !== '42703') break
  }
  return { ok: false, error: lastError }
}

export async function loadPointRows({
  personelIds,
  startIso = null,
  endIso = null,
  offset = 0,
  limit = 20,
}) {
  if (!Array.isArray(personelIds) || personelIds.length === 0) {
    return { ok: true, rows: [] }
  }

  const uniqueIds = [...new Set(personelIds.map((x) => String(x || '').trim()).filter(Boolean))]
  if (!uniqueIds.length) return { ok: true, rows: [] }

  const selectCandidates = [
    'id, personel_id, tarih, puan_degisimi, gorev_id, gorev_baslik, islem_tipi, aciklama',
    'id, personel_id, tarih, puan_degisimi, gorev_id, aciklama',
    'id, personel_id, tarih, puan_degisimi, aciklama',
    'id, personel_id, tarih, puan_degisimi',
  ]

  let lastError = null
  for (const selectText of selectCandidates) {
    let q = supabase
      .from('puan_hareketleri')
      .select(selectText)
      .order('tarih', { ascending: false })
      .range(offset, offset + limit - 1)

    if (uniqueIds.length === 1) q = q.eq('personel_id', uniqueIds[0])
    else q = q.in('personel_id', uniqueIds)

    if (startIso && endIso) {
      q = q.gte('tarih', startIso).lte('tarih', endIso)
    }

    const { data, error } = await q
    if (!error) return { ok: true, rows: data || [] }
    lastError = error
    if (error.code !== '42703') break
  }

  return { ok: false, error: lastError, rows: [] }
}

export function normalizeTaskScore(value) {
  return toNum(value)
}

/**
 * Aynı (personel, görev, ceza türü) için kayıt zaten varsa yeni bir hareket
 * eklemez. "Gecikmiş görev cezası" / "Zaman aşımı cezası" gibi her ekran
 * açılışında tetiklenen tek seferlik penalty'ler için idempotent giriş.
 *
 * DB tarafında da `puan_hareketleri_task_penalty_unique` partial unique index
 * mevcuttur; bu fonksiyon birinci savunma katmanıdır (network ve hata loglarını
 * azaltır). DB index'ten gelen `23505` (unique_violation) durumunda da güvenli
 * şekilde {ok: true, skipped: true} döner.
 *
 * @param {Object} opts
 * @param {string} opts.personelId
 * @param {string} opts.gorevId
 * @param {('TASK_DELAY_PENALTY'|'TASK_TIMEOUT_PENALTY')} opts.islemTipi
 * @param {number} opts.delta - negatif değer
 * @param {string} [opts.gorevBaslik]
 * @param {string} [opts.aciklama]
 * @param {string} [opts.tarih] - ISO string
 */
export async function recordTaskPenaltyOnce({
  personelId,
  gorevId,
  islemTipi,
  delta,
  gorevBaslik = null,
  aciklama = null,
  tarih = null,
}) {
  if (!personelId || !gorevId || !islemTipi) {
    return { ok: false, error: new Error('eksik parametre'), skipped: false }
  }

  try {
    const { data: existing, error: lookupErr } = await supabase
      .from('puan_hareketleri')
      .select('id')
      .eq('personel_id', personelId)
      .eq('gorev_id', gorevId)
      .eq('islem_tipi', islemTipi)
      .limit(1)
      .maybeSingle()

    if (!lookupErr && existing?.id) {
      return { ok: true, skipped: true }
    }
    // `gorev_id` / `islem_tipi` kolonları çok eski şemalarda olmayabilir (42703);
    // o durumda fallback olarak normal insert'e düşeriz.
  } catch {
    // best-effort: arama başarısızsa insert'e devam et; DB unique index
    // duplicate'i yine de engeller.
  }

  const tx = await insertPointTransaction({
    personelId,
    delta,
    gorevId,
    gorevBaslik,
    islemTipi,
    aciklama,
    tarih,
  })

  if (!tx.ok && tx.error?.code === '23505') {
    return { ok: true, skipped: true }
  }
  return { ...tx, skipped: false }
}
