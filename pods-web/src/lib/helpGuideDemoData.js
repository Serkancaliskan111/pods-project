import { TASK_STATUS } from './taskStatus.js'

/** Kılavuz modunda gerçek API çağrıları yapılmaz */
export const HELP_GUIDE_DEMO_FLAG = '__helpGuideDemo'

const demoId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function mark(obj) {
  return { ...obj, [HELP_GUIDE_DEMO_FLAG]: true }
}

export const HELP_GUIDE_DEMO_LABEL = 'Örnek — kılavuz modu'

export const DEMO_AUDIT_PENDING_TASKS = [
  mark({
    id: demoId(1),
    baslik: 'Mağaza açılış kontrol listesi',
    durum: TASK_STATUS.PENDING_APPROVAL,
    son_tarih: new Date(Date.now() - 3 * 86400000).toISOString(),
    gorev_turu: 'sablon',
    sorumlu_personel_id: demoId(99),
    ana_sirket_id: demoId(10),
    acil: false,
  }),
  mark({
    id: demoId(2),
    baslik: 'Haftalık stok sayımı',
    durum: TASK_STATUS.RESUBMITTED,
    son_tarih: new Date(Date.now() - 86400000).toISOString(),
    gorev_turu: 'normal',
    sorumlu_personel_id: demoId(98),
    ana_sirket_id: demoId(10),
    acil: true,
  }),
]

export const DEMO_TASKS_PENDING = [
  mark({
    id: demoId(3),
    baslik: 'Raf düzeni fotoğraf kanıtı',
    durum: 'Devam Ediyor',
    son_tarih: new Date(Date.now() + 86400000).toISOString(),
    gorev_turu: 'normal',
    sorumlu_personel_id: demoId(99),
    ana_sirket_id: demoId(10),
    acil: false,
  }),
]

export const DEMO_HOME_SECTIONS = {
  overdue: [
    mark({
      id: demoId(4),
      baslik: 'Geciken: Depo çıkış kontrolü',
      durum: 'Devam Ediyor',
      son_tarih: new Date(Date.now() - 2 * 86400000).toISOString(),
      tone: 'overdue',
    }),
  ],
  today: [
    mark({
      id: demoId(5),
      baslik: 'Bugün: Müşteri alanı temizliği',
      durum: 'Devam Ediyor',
      son_tarih: new Date().toISOString(),
      tone: 'todo',
    }),
  ],
  tomorrow: [
    mark({
      id: demoId(6),
      baslik: 'Yarın: Ekip toplantısı hazırlığı',
      durum: 'Bekliyor',
      son_tarih: new Date(Date.now() + 86400000).toISOString(),
      tone: 'todo',
    }),
  ],
}

export const DEMO_TASK_DETAIL = mark({
  id: demoId(7),
  baslik: 'Örnek görev — kanıt inceleme',
  durum: TASK_STATUS.PENDING_APPROVAL,
  son_tarih: new Date(Date.now() + 3 * 86400000).toISOString(),
  gorev_turu: 'normal',
  sorumlu_personel_id: demoId(99),
  calisma_durumu: 'basladi',
  assigneeLabel: 'Ayşe Yılmaz (örnek)',
})

export const DEMO_PHOTO_URLS = [
  'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=400&fit=crop',
]

/** @typedef {'audit-pending'|'tasks-pending'|'home-board'|'task-detail'|'calendar'|'chat'} HelpDemoScene */

/** @type {Record<HelpDemoScene, { companyName?: string, assigneeName?: string, taskTypeLabel?: string }>} */
export const DEMO_SCENE_LABELS = {
  'audit-pending': {
    companyName: 'Örnek Şirket A.Ş.',
    assigneeName: 'Mehmet Demir',
    taskTypeLabel: 'Standart görev',
  },
  'tasks-pending': {
    companyName: 'Örnek Şirket A.Ş.',
    assigneeName: 'Siz',
    taskTypeLabel: 'Standart görev',
  },
}

/**
 * @param {string | null | undefined} scene
 * @returns {boolean}
 */
export function isHelpGuideDemoScene(scene) {
  return typeof scene === 'string' && scene.length > 0
}

/**
 * @param {object} task
 */
export function isHelpGuideDemoEntity(task) {
  return !!task?.[HELP_GUIDE_DEMO_FLAG]
}

/** Kılavuz örnek UUID — doğrudan URL ile açılırsa veri yoktur */
export function isHelpGuideDemoTaskId(id) {
  return String(id || '').startsWith('00000000-0000-4000-8000-')
}
