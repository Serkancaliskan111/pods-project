/**
 * Rol oluşturma ekranlarındaki eylem anahtarları (New.jsx / roles/Index ile aynı olmalı)
 */
export const ROLE_ACTIONS_BY_CATEGORY = {
  OPERASYON: [
    'is.olustur',
    'is.liste_gor',
    'is.detay_gor',
    'is.fotograf_yukle',
  ],
  DENETIM: ['denetim.olustur', 'denetim.onayla', 'denetim.reddet'],
  YONETIM: ['personel.yonet', 'puan.ver', 'rapor.oku'],
  GUVENLIK: ['ip.kisit_muaf'],
  SISTEM: [
    'rol.yonet',
    'sube.yonet',
    'sirket.yonet',
    'is_turu.yonet',
    'sistem.ayar',
  ],
}

export const ALL_ROLE_ACTION_KEYS = Object.freeze(
  Object.values(ROLE_ACTIONS_BY_CATEGORY).flat(),
)
