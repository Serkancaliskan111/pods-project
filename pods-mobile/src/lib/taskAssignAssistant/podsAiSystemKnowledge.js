/**
 * Pods AI sistem bilgisi — istemci tarafı yardım / kural motoru ile paylaşılır.
 * Edge function ile senkron tutulmalı (supabase/functions/pods-ai-task-assign/systemKnowledge.ts)
 */
import { GOREV_MODU_OPTIONS } from '../gorevModuOptions.js'

export const MODE_INFERENCE_HINTS = {
  normal: ['standart', 'normal görev', 'doğrudan ata', 'ekibe gönder'],
  sablon_gorev: ['şablon', 'sablon', 'checklist', 'kontrol listesi'],
  zincir_gorev: ['zincir görev', 'sırayla devret', 'sırayla yapsın', 'devret'],
  zincir_onay: ['zincir onay', 'onay zinciri', 'onaylayıcı', 'onaylasın'],
  zincir_gorev_ve_onay: ['hem zincir hem onay', 'görev ve onay zinciri'],
  sirali_gorev: ['sıralı görev', 'adım adım', 'denetlesin', 'denetimci'],
}

export function allModesSummary() {
  return GOREV_MODU_OPTIONS.map(
    (o) => `**${o.label}** (${o.value}): ${o.hint}`,
  ).join('\n')
}
