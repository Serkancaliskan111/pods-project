import { getTaskDetailConfig } from './taskDetailConfig.js'
import { getTaskDetailTheme } from './taskDetailThemes.js'

/** Hook çıktısından view/frame için türetilmiş alanlar (ctx genişletilir). */
export function buildTaskDetailViewModel(ctx) {
  if (!ctx?.task) return ctx
  const gorevTuru = ctx.task.gorev_turu
  return {
    ...ctx,
    detailConfig: ctx.detailConfig ?? getTaskDetailConfig(gorevTuru),
    theme: getTaskDetailTheme(gorevTuru),
  }
}
