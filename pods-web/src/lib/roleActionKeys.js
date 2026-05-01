/**
 * Rol ekranları: tek kaynak (yetki anahtarı → kullanıcı etiketi).
 * Anahtarlar JSON'da aynen saklanır; arka uç davranışı değişmez.
 */

/** Kategori kodu → Türkçe başlık */
export const ROLE_CATEGORY_LABELS = {
  OPERASYON: 'Operasyon (işler)',
  DENETIM: 'Denetim',
  YONETIM: 'Yönetim',
  GUVENLIK: 'Güvenlik',
  SISTEM: 'Sistem',
}

/** Yetki anahtarı → kullanıcıya gösterilen metin */
export const ROLE_ACTION_LABELS = {
  'is.olustur': 'İş oluşturma ve atama',
  'is.liste_gor': 'İş listesini görüntüleme',
  'is.detay_gor': 'İş detayını görüntüleme',
  'is.fotograf_yukle': 'İş kanıtı / fotoğraf yükleme',
  'is.sil': 'İş silme talebi oluşturma',
  'is.sil.onay': 'İş silme onayı ve silinen işler arşivi',
  'is.duzenle':
    'İş düzenleme (onaylı/reddedilmemiş ve tekrar sürecinde olmayan görevler)',
  'denetim.olustur': 'Denetim görevi oluşturma',
  'denetim.onayla': 'Görev / iş onaylama',
  'denetim.reddet': 'Görev / iş reddetme',
  'personel.yonet': 'Personel yönetimi',
  'puan.ver': 'Puan verme',
  'rapor.oku': 'Raporları görüntüleme',
  'ip.kisit_muaf': 'IP erişim kısıtından muafiyet',
  'rol.yonet': 'Rol tanımları ve yetkiler',
  'sube.yonet': 'Şube / birim yönetimi',
  'sirket.yonet': 'Şirket yönetimi',
  'is_turu.yonet': 'İş türü ve şablon yönetimi',
  'sistem.ayar': 'Sistem ayarları',
}

export const ROLE_ACTIONS_BY_CATEGORY = {
  OPERASYON: [
    'is.olustur',
    'is.liste_gor',
    'is.detay_gor',
    'is.fotograf_yukle',
    'is.sil',
    'is.sil.onay',
    'is.duzenle',
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
