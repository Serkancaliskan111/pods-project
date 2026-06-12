import { matchPersonnelInText } from './parseMessage.js'

const OFF_TOPIC_REPLY =
  'Yalnızca **görev atama** konusunda yardımcı olabilirim. Kime ne görev verileceğini yazın; eksik bilgileri tek seferde sorarım.'

const TASK_KEYWORDS =
  /\b(görev|gorev|ata|atama|atay|assign|şablon|sablon|zincir|onay|denetim|denetlesin|checklist|kontrol listesi|personel|ekip|acil|foto|video|belge|deadline|bitiş|bitis|başlangıç|baslangic|tarih|yapsın|yapsin|yapacak|devret|sıralı|sirali|operasyonel|puan|kanıt|kanit|hemen|bugün|bugun|yarın|yarin)\b/i

const GAP_ANSWER =
  /^(evet|hayır|hayir|normal|acil|foto|video|belge|yok|hiçbiri|hicbiri|hemen|bugün|bugun|yarın|yarin|tamam|ok|\d{1,2}[./]\d{1,2})/i

/** Aktif görev atama akışı veya görevle ilgili mesaj mı? */
export function isTaskAssignmentTopic(text, { gaps = [], intent = {}, personnel = [] } = {}) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false

  if (gaps?.length > 0) return true

  const hasIntent =
    intent?.personId ||
    intent?.assigneeIds?.length ||
    intent?.zincirGorevIds?.length ||
    intent?.zincirOnayIds?.length ||
    intent?.siraliSteps?.length ||
    intent?.sablonId ||
    intent?.gorevKonusu ||
    intent?.pendingAmbiguities?.length

  if (hasIntent) return true

  if (GAP_ANSWER.test(trimmed)) return true
  if (TASK_KEYWORDS.test(trimmed)) return true
  if (matchPersonnelInText(trimmed, personnel).length > 0) return true

  return false
}

export function offTopicReply() {
  return OFF_TOPIC_REPLY
}
