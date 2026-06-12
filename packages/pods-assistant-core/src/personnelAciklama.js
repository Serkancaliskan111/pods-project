function isModeLabelTitle(baslik) {
  return /^(standart|şablon|zincir|sıralı|sirali|operasyonel|zincir onay)(\s+görev|\s+gorev)?$/i.test(
    String(baslik || '').trim(),
  )
}

function pickDisplayTitle(intent) {
  for (const c of [intent?.gorevKonusu, intent?.baslik, intent?.sablonName]) {
    const t = String(c || '').trim()
    if (t && !isModeLabelTitle(t)) return t
  }
  return ''
}
export function looksLikeMetaSummary(text) {
  const t = String(text || '').trim()
  if (!t) return false
  return (
    /^Atanan:/i.test(t) ||
    (/Süre:/i.test(t) && /Acil/i.test(t)) ||
    /^En az \d+ fotoğraf kanıtı\.$/i.test(t) ||
    /gerekliliklerine göre tamamlanması beklenir/i.test(t) ||
    /^Sorumlu:/i.test(t) ||
    /^Son tarih:/i.test(t) ||
    /^Başlangıç /i.test(t) ||
    /^Tarih:/i.test(t) ||
    /birimindeki sorumlu ekip/i.test(t) ||
    /tarafından yürütülecek/i.test(t) ||
    /^Kanıt:/i.test(t) ||
    /^Acil öncelikli/i.test(t) ||
    /^Hemen başlayabilir/i.test(t)
  )
}

/** 3. tekil emir → 2. çoğul emir (personel talimatı) */
export function toPersonnelImperative(text) {
  let s = String(text || '').trim()
  if (!s) return ''

  s = s
    .replace(/\betsin(?:ler)?\b/gi, 'edin')
    .replace(/\byapsın(?:lar)?\b/gi, 'yapın')
    .replace(/\byapacak(?:lar)?\b/gi, 'yapın')
    .replace(/\byapmalı(?:lar)?\b/gi, 'yapın')
    .replace(/\btamamlasın(?:lar)?\b/gi, 'tamamlayın')
    .replace(/\btamamlamalı(?:lar)?\b/gi, 'tamamlayın')
    .replace(/\bkontrol\s+et(?:sin(?:ler)?|meli(?:ler)?)?\b/gi, 'kontrol edin')
    .replace(/\bsay(?:ım|im)\s+yap(?:sin(?:lar)?|malı(?:lar)?)?\b/gi, 'sayım yapın')
    .replace(/\btemizle(?:sin(?:ler)?|meli(?:ler)?)?\b/gi, 'temizleyin')
    .replace(/\bhazırl(?:a|asın|anmalı)(?:lar)?\b/gi, 'hazırlayın')
    .replace(/\bteslim\s+et(?:sin(?:ler)?|meli(?:ler)?)?\b/gi, 'teslim edin')

  if (!/[.!?]$/.test(s)) s = `${s}.`
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1)
}

const TITLE_INSTRUCTIONS = [
  {
    test: /skt\s*kontrol/i,
    build: () => 'Raflardaki ürünlerin son kullanma tarihlerini kontrol edin.',
  },
  {
    test: /depo\s*say/i,
    build: () => 'Depoda stok sayımını yapın; raflardaki ürünleri eksiksiz sayın.',
  },
  {
    test: /sayım|sayim/i,
    build: (title) => `${title} işlemini dikkatle yapın; eksik veya fazla stokları not edin.`,
  },
  {
    test: /hijyen|kontrol\s*listesi/i,
    build: () => 'Kontrol listesindeki maddeleri sırayla uygulayın; uygunsuzlukları kaydedin.',
  },
  {
    test: /temizlik|temizle/i,
    build: () => 'Belirtilen alanın temizliğini standart prosedüre uygun şekilde yapın.',
  },
  {
    test: /teslim/i,
    build: () => 'Teslimatı prosedüre uygun şekilde tamamlayın.',
  },
  {
    test: /kontrol/i,
    build: (title) => `${title} işlemini standart prosedüre göre yapın.`,
  },
]

/** Görev adından personelin ne yapacağını doğal dille üret */
export function instructionFromTaskTitle(title) {
  const t = String(title || '').trim()
  if (!t || isModeLabelTitle(t)) return ''

  for (const rule of TITLE_INSTRUCTIONS) {
    if (rule.test.test(t)) return rule.build(t)
  }

  if (/\b(görev|gorev)\b/i.test(t)) {
    return `${t.replace(/\s*(görev|gorev)\s*$/i, '').trim()} işlemini tamamlayın.`
  }

  if (/(?:ması|mesi|ımı|imi|sı|si)$/i.test(t)) {
    const stem = t.replace(/(ması|mesi)$/i, '').replace(/(ımı|imi)$/i, '').replace(/(sı|si)$/i, '')
    if (stem.length >= 3) return `${stem} işlemini tamamlayın.`
  }

  return `${t} görevini yerine getirin.`
}

/** Personelin okuyacağı doğal görev talimatı */
export function buildPersonnelAciklama(intent) {
  const existing = intent?.aciklama?.trim()
  if (existing && !looksLikeMetaSummary(existing)) return existing

  const detay = String(intent?.gorevDetay || '').trim()
  if (detay) return toPersonnelImperative(detay)

  const title = pickDisplayTitle(intent)
  if (title) {
    const fromTitle = instructionFromTaskTitle(title)
    if (fromTitle) return fromTitle
  }

  if (intent?.sablonName?.trim()) {
    return `${intent.sablonName} checklist'ine göre adımları tamamlayın.`
  }

  return null
}
