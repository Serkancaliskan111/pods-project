import getSupabase from './supabaseClient'
import { TASK_STATUS } from './taskStatus.js'
import { logTaskTimelineEvent } from './taskTimeline.js'
import {
  isMediaMaddeTip,
  maddeTipLabel,
  normalizeMaddeTip,
} from './personalTodoItemTypes.js'

const supabase = getSupabase()

const TEMPLATE_MADDE_SELECT_FULL = 'id, metin, sira, madde_tipi'
const TEMPLATE_MADDE_SELECT_LEGACY = 'id, metin, sira'

function isMissingSchemaColumn(error, columnName) {
  const msg = String(error?.message || error?.details || '').toLowerCase()
  const col = String(columnName || '').toLowerCase()
  return (
    msg.includes(col) &&
    (msg.includes('schema cache') ||
      msg.includes('could not find') ||
      msg.includes('does not exist') ||
      error?.code === 'PGRST204')
  )
}

async function fetchTemplateMaddelerRows(sablonId) {
  const full = await supabase
    .from('kisisel_todo_sablon_maddeleri')
    .select(TEMPLATE_MADDE_SELECT_FULL)
    .eq('sablon_id', sablonId)
    .order('sira', { ascending: true })
  if (!full.error) return full.data || []

  if (isMissingSchemaColumn(full.error, 'madde_tipi')) {
    const legacy = await supabase
      .from('kisisel_todo_sablon_maddeleri')
      .select(TEMPLATE_MADDE_SELECT_LEGACY)
      .eq('sablon_id', sablonId)
      .order('sira', { ascending: true })
    if (legacy.error) throw legacy.error
    return (legacy.data || []).map((m) => ({ ...m, madde_tipi: 'metin' }))
  }
  throw full.error
}

async function insertTemplateMaddelerRows(sablonId, rows) {
  if (!rows.length) return
  const payload = rows.map((m) => ({
    sablon_id: sablonId,
    metin: m.metin,
    sira: m.sira,
    madde_tipi: m.madde_tipi,
  }))
  const { error } = await supabase.from('kisisel_todo_sablon_maddeleri').insert(payload)
  if (!error) return
  if (isMissingSchemaColumn(error, 'madde_tipi')) {
    const { error: legacyErr } = await supabase.from('kisisel_todo_sablon_maddeleri').insert(
      rows.map((m) => ({
        sablon_id: sablonId,
        metin: m.metin,
        sira: m.sira,
      })),
    )
    if (legacyErr) throw legacyErr
    return
  }
  throw error
}

export function normalizeTodoItems(items) {
  return (items || []).map((m, idx) => ({
    id: m.id || crypto.randomUUID(),
    metin: String(m.metin || '').trim(),
    tamamlandi: !!m.tamamlandi,
    sira: Number(m.sira) || idx + 1,
    tip: normalizeMaddeTip(m.tip || m.madde_tipi),
    medyaYol: m.medyaYol || null,
  }))
}

function normalizeTemplateMaddeler(items) {
  return (items || [])
    .map((m, idx) => ({
      metin: String(m.metin || '').trim(),
      madde_tipi: normalizeMaddeTip(m.tip || m.madde_tipi),
      sira: idx + 1,
    }))
    .filter((m) => m.metin)
}

export async function fetchPersonalTodoTemplates(userId) {
  const { data, error } = await supabase
    .from('kisisel_todo_sablonlari')
    .select('id, baslik, aciklama, olusturulma_at, guncelleme_at')
    .eq('kullanici_id', userId)
    .is('silindi_at', null)
    .order('guncelleme_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchPersonalTodoTemplateWithItems(sablonId, userId) {
  const { data: tpl, error } = await supabase
    .from('kisisel_todo_sablonlari')
    .select('id, baslik, aciklama')
    .eq('id', sablonId)
    .eq('kullanici_id', userId)
    .is('silindi_at', null)
    .maybeSingle()
  if (error) throw error
  if (!tpl) return null
  const maddeler = await fetchTemplateMaddelerRows(sablonId)
  return {
    ...tpl,
    maddeler: (maddeler || []).map((m) => ({
      ...m,
      tip: normalizeMaddeTip(m.madde_tipi),
    })),
  }
}

export async function savePersonalTodoTemplate({ userId, id, baslik, aciklama, maddeler }) {
  const title = String(baslik || '').trim() || 'Şablon'
  const rows = normalizeTemplateMaddeler(maddeler)
  let sablonId = id
  if (!sablonId) {
    const { data, error } = await supabase
      .from('kisisel_todo_sablonlari')
      .insert([{ kullanici_id: userId, baslik: title, aciklama: aciklama || null }])
      .select('id')
      .single()
    if (error) throw error
    sablonId = data.id
  } else {
    const { error } = await supabase
      .from('kisisel_todo_sablonlari')
      .update({
        baslik: title,
        aciklama: aciklama || null,
        guncelleme_at: new Date().toISOString(),
      })
      .eq('id', sablonId)
      .eq('kullanici_id', userId)
    if (error) throw error
    await supabase.from('kisisel_todo_sablon_maddeleri').delete().eq('sablon_id', sablonId)
  }
  await insertTemplateMaddelerRows(sablonId, rows)
  return sablonId
}

export async function fetchPersonalTodos(userId) {
  const { data, error } = await supabase
    .from('kisisel_todo_gorevleri')
    .select(
      'id, baslik, notlar, durum, maddeler, sablon_id, is_id, olusturulma_at, tamamlanma_at, planlanan_tarih, planlanan_saat',
    )
    .eq('kullanici_id', userId)
    .is('silindi_at', null)
    .order('planlanan_tarih', { ascending: true, nullsFirst: false })
    .order('olusturulma_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function deletePersonalTodo(userId, id) {
  const { error } = await supabase
    .from('kisisel_todo_gorevleri')
    .update({ silindi_at: new Date().toISOString(), guncelleme_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kullanici_id', userId)
  if (error) throw error
}

export async function deletePersonalTodoTemplate(userId, id) {
  const { error } = await supabase
    .from('kisisel_todo_sablonlari')
    .update({ silindi_at: new Date().toISOString(), guncelleme_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kullanici_id', userId)
  if (error) throw error
}

/** YYYY-MM-DD (yerel) */
export function toDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayDateInputValue() {
  return toDateInputValue(new Date())
}

export function formatPlanLabel(planlananTarih, planlananSaat) {
  if (!planlananTarih) return null
  try {
    const [y, mo, d] = String(planlananTarih).slice(0, 10).split('-').map(Number)
    const dt = new Date(y, mo - 1, d)
    const dateStr = dt.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
    })
    if (!planlananSaat) return `${dateStr} · gün sonu`
    const [hh, mm] = String(planlananSaat).slice(0, 5).split(':')
    return `${dateStr} · ${hh}:${mm}`
  } catch {
    return String(planlananTarih)
  }
}

/** Son tarih + saat birleşimi (saat yoksa 23:59) */
export function getPersonalTodoDueAt(todo) {
  if (!todo?.planlanan_tarih) return null
  try {
    const [y, mo, d] = String(todo.planlanan_tarih).slice(0, 10).split('-').map(Number)
    let hh = 23
    let mm = 59
    let ss = 59
    if (todo.planlanan_saat) {
      const parts = String(todo.planlanan_saat).slice(0, 8).split(':').map(Number)
      hh = Number.isFinite(parts[0]) ? parts[0] : 23
      mm = Number.isFinite(parts[1]) ? parts[1] : 0
      ss = Number.isFinite(parts[2]) ? parts[2] : 0
    }
    const dt = new Date(y, mo - 1, d, hh, mm, ss)
    return Number.isNaN(dt.getTime()) ? null : dt
  } catch {
    return null
  }
}

export function isPlannedToday(planlananTarih) {
  if (!planlananTarih) return false
  return String(planlananTarih).slice(0, 10) === todayDateInputValue()
}

export function isPlannedOverdue(planlananTarih, durum) {
  if (!planlananTarih || durum === 'yapildi' || durum === 'denetimde') return false
  return String(planlananTarih).slice(0, 10) < todayDateInputValue()
}

export function buildPlanPatch({ planDate, planTime }) {
  const patch = {}
  if (planDate === '' || planDate == null) {
    patch.planlanan_tarih = null
    patch.planlanan_saat = null
  } else {
    patch.planlanan_tarih = planDate
    const t = String(planTime || '').trim()
    patch.planlanan_saat = t ? (t.length === 5 ? `${t}:00` : t).slice(0, 8) : null
  }
  return patch
}

export async function createPersonalTodoFromTemplate({ userId, sablonId, notlar }) {
  const tpl = await fetchPersonalTodoTemplateWithItems(sablonId, userId)
  if (!tpl) throw new Error('Şablon bulunamadı')
  const maddeler = (tpl.maddeler || []).map((m) => ({
    id: crypto.randomUUID(),
    metin: m.metin,
    tamamlandi: false,
    sira: m.sira,
    tip: normalizeMaddeTip(m.tip || m.madde_tipi),
    medyaYol: null,
  }))
  const { data, error } = await supabase
    .from('kisisel_todo_gorevleri')
    .insert([
      {
        kullanici_id: userId,
        sablon_id: sablonId,
        baslik: tpl.baslik,
        notlar: notlar || tpl.aciklama || null,
        durum: 'yapilacak',
        maddeler,
      },
    ])
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function createPersonalTodoBlank({ userId, baslik, notlar, maddeler, planDate, planTime }) {
  const planPatch = planDate ? buildPlanPatch({ planDate, planTime }) : {}
  const { data, error } = await supabase
    .from('kisisel_todo_gorevleri')
    .insert([
      {
        kullanici_id: userId,
        baslik: String(baslik || '').trim() || 'Yapılacak',
        notlar: notlar || null,
        durum: 'yapilacak',
        maddeler: normalizeTodoItems(maddeler),
        ...planPatch,
      },
    ])
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export function parseTodoItems(raw) {
  if (!raw) return []
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(raw)
    return normalizeTodoItems(arr)
  } catch {
    return []
  }
}

export async function updatePersonalTodo({ userId, id, patch }) {
  const body = { guncelleme_at: new Date().toISOString(), ...patch }
  if (patch.maddeler) body.maddeler = normalizeTodoItems(patch.maddeler)
  const { error } = await supabase
    .from('kisisel_todo_gorevleri')
    .update(body)
    .eq('id', id)
    .eq('kullanici_id', userId)
  if (error) throw error
}

export async function markPersonalTodoDone({ userId, id, maddeler }) {
  await updatePersonalTodo({
    userId,
    id,
    patch: {
      maddeler,
      durum: 'yapildi',
      tamamlanma_at: new Date().toISOString(),
    },
  })
}

export async function submitPersonalTodoToAudit({ userId, personel, todo }) {
  if (!personel?.ana_sirket_id || !personel?.id) {
    throw new Error('Denetime göndermek için personel kaydı gerekli')
  }
  const checklist = normalizeTodoItems(todo.maddeler)
  const ozet = checklist
    .map((m) => {
      let line = `${m.tamamlandi ? '✓' : '○'} ${m.metin}`
      if (isMediaMaddeTip(m.tip)) {
        line += m.medyaYol ? ` [${maddeTipLabel(m.tip)} yüklendi]` : ` [${maddeTipLabel(m.tip)} eksik]`
      }
      return line
    })
    .join('\n')
  const aciklama = [todo.notlar, ozet ? `Kişisel liste:\n${ozet}` : '']
    .filter(Boolean)
    .join('\n\n')

  const payload = {
    baslik: todo.baslik,
    aciklama: aciklama || null,
    ana_sirket_id: personel.ana_sirket_id,
    birim_id: personel.birim_id || null,
    sorumlu_personel_id: personel.id,
    atayan_personel_id: personel.id,
    durum: TASK_STATUS.PENDING_APPROVAL,
    puan: 0,
    foto_zorunlu: false,
    min_foto_sayisi: 0,
    video_zorunlu: false,
    min_video_sayisi: 0,
    max_video_suresi_sn: 60,
    gorev_turu: 'normal',
  }

  const { data: inserted, error } = await supabase.from('isler').insert([payload]).select('id').single()
  if (error) throw error

  await updatePersonalTodo({
    userId,
    id: todo.id,
    patch: {
      durum: 'denetimde',
      is_id: inserted.id,
      tamamlanma_at: todo.tamamlanma_at || new Date().toISOString(),
    },
  })

  await logTaskTimelineEvent(inserted.id, 'completion', userId, 'Kişisel yapılacaklar listesinden denetime gönderildi')

  return inserted.id
}
