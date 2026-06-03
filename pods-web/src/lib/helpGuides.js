import {
  HELP_GUIDE_CATALOG,
  HELP_GUIDE_FEATURED_IDS,
} from './helpGuideCatalog.js'

export { HELP_GUIDE_FEATURED_IDS }

export const HELP_GUIDE_CATEGORIES = [
  'Başlangıç',
  'Görevler',
  'Denetim',
  'Takvim & planlama',
  'İletişim',
  'Organizasyon',
  'Ayarlar',
]

/**
 * @typedef {'top'|'bottom'|'left'|'right'|'center'|'auto'|'corner'} HelpPlacement
 * @typedef {'openTaskAssign'|'closeTaskAssign'} HelpAction
 * @typedef {'anchor'|'center'|'corner'} HelpCardLayout
 *
 * @typedef {object} HelpGuideStep
 * @property {string} [route]
 * @property {string} [selector]
 * @property {HelpPlacement} [placement]
 * @property {HelpCardLayout} [cardLayout] - 'corner': sağ alt kompakt kart (geniş formlar)
 * @property {HelpAction} [action]
 * @property {number} [waitMs]
 * @property {string} title
 * @property {string} body
 * @property {string[]} [bullets]
 * @property {string} [tip]
 * @property {string} [doThis] - Uygulamalı eğitim talimatı
 * @property {string} [clickSelector] - Tıklama hedefi (varsayılan: selector)
 * @property {'click'|'hover'|'view'} [interaction] - click: hedef parlar; hover/view: yalnızca metin
 * @property {boolean} [cardWide] - Geniş kılavuz kartı (görev atama gibi metin ağırlıklı adımlar)
 * @property {import('./helpGuideDemoData.js').HelpDemoScene} [demoScene]
 *
 * @typedef {object} HelpGuide
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} [summary]
 * @property {string} category
 * @property {string[]} [keywords]
 * @property {number} [estimatedMinutes]
 * @property {boolean} [featured]
 * @property {HelpAction} [startAction] - Tur başlarken bir kez çalışır (örn. atama modalı)
 * @property {number} [startWaitMs]
 * @property {HelpAction} [stopAction] - Tur kapanırken (örn. modalı kapat)
 * @property {(ctx: HelpGuideContext) => boolean} isVisible
 * @property {HelpGuideStep[]} steps
 */

/** @typedef {{ permissions: object, isSystemAdmin: boolean, personel: object|null }} HelpGuideContext */

export const HELP_GUIDES = HELP_GUIDE_CATALOG

export function getVisibleHelpGuides(ctx) {
  return HELP_GUIDES.filter((g) => {
    try {
      return g.isVisible(ctx)
    } catch {
      return false
    }
  })
}

export function getHelpGuideById(id) {
  return HELP_GUIDES.find((g) => g.id === id) || null
}

export function getFeaturedHelpGuides(guides) {
  const byId = new Map(guides.map((g) => [g.id, g]))
  const featured = HELP_GUIDE_FEATURED_IDS.map((id) => byId.get(id)).filter(Boolean)
  const rest = guides.filter((g) => !HELP_GUIDE_FEATURED_IDS.includes(g.id))
  return { featured, rest }
}

export function guideMatchesSearch(guide, term) {
  const t = term.trim().toLowerCase()
  if (!t) return true
  const hay = [
    guide.title,
    guide.description,
    guide.summary || '',
    guide.category,
    ...(guide.keywords || []),
    ...(guide.steps || []).flatMap((s) => [
      s.title,
      s.body,
      s.doThis || '',
      s.tip || '',
      ...(s.bullets || []),
    ]),
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(t)
}

export function groupGuidesByCategory(guides) {
  const map = new Map()
  for (const cat of HELP_GUIDE_CATEGORIES) {
    map.set(cat, [])
  }
  for (const g of guides) {
    if (!map.has(g.category)) map.set(g.category, [])
    map.get(g.category).push(g)
  }
  return HELP_GUIDE_CATEGORIES.map((category) => ({
    category,
    guides: map.get(category) || [],
  })).filter((row) => row.guides.length > 0)
}
