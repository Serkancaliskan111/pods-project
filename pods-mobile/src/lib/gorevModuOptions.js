import {
  FileText,
  LayoutGrid,
  Link2,
  ListOrdered,
  ShieldCheck,
  UserCheck,
} from 'lucide-react-native'

/** Operasyonel görev atama — 6 mod (web + proje planlama) */
export const GOREV_MODU_OPTIONS = [
  {
    value: 'normal',
    label: 'Standart görev',
    sub: 'Tek veya çoklu atama',
    hint: 'Proje ekibinden bir veya birden fazla kişiye doğrudan görev.',
    color: '#2563EB',
  },
  {
    value: 'sablon_gorev',
    label: 'Şablon Görev',
    sub: 'Checklist / şablon',
    hint: 'Hazır şablondan checklist ile standart görev planı.',
    color: '#7C3AED',
  },
  {
    value: 'zincir_gorev',
    label: 'Zincir Görev',
    sub: 'Sırayla yürütme',
    hint: 'Ekip üyeleri sırayla görevi devralır.',
    color: '#0D9488',
  },
  {
    value: 'zincir_onay',
    label: 'Zincir Onay',
    sub: 'Sırayla onay',
    hint: 'Onaylayıcılar belirli sırada onay verir.',
    color: '#D97706',
  },
  {
    value: 'zincir_gorev_ve_onay',
    label: 'Zincir Görev + Zincir Onay',
    sub: 'İkisi birden',
    hint: 'Önce zincir görev, ardından zincir onay sırası.',
    color: '#4F46E5',
  },
  {
    value: 'sirali_gorev',
    label: 'Sıralı Görev',
    sub: 'Adım + denetim',
    hint: 'Her adımda yapan ve denetimci (proje ekibinden).',
    color: '#E11D48',
  },
]

export const GOREV_MODU_MODE_ICONS = {
  normal: UserCheck,
  sablon_gorev: FileText,
  zincir_gorev: Link2,
  zincir_onay: ShieldCheck,
  zincir_gorev_ve_onay: LayoutGrid,
  sirali_gorev: ListOrdered,
}

export const CHAIN_STEP_MODES = new Set([
  'zincir_gorev',
  'zincir_onay',
  'zincir_gorev_ve_onay',
  'sirali_gorev',
])

export function getGorevModuOption(value) {
  return GOREV_MODU_OPTIONS.find((o) => o.value === value) || GOREV_MODU_OPTIONS[0]
}
