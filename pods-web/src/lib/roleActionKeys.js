/**
 * Rol ekranları: tek kaynak (yetki anahtarı → kullanıcı etiketi).
 * Anahtarlar JSON'da aynen saklanır; arka uç davranışı değişmez.
 */

/** Kategori kodu → Türkçe başlık */
export const ROLE_CATEGORY_LABELS = {
  OPERASYON: 'Operasyon (görevler)',
  DENETIM: 'Denetim',
  YONETIM: 'Yönetim',
  GUVENLIK: 'Güvenlik',
  SISTEM: 'Sistem',
}

/** Yetki anahtarı → kullanıcıya gösterilen metin */
export const ROLE_ACTION_LABELS = {
  'is.olustur': 'Görev oluşturma ve atama',
  'is.liste_gor': 'Görev listesini görüntüleme',
  'is.detay_gor': 'Görev detayını görüntüleme',
  'is.fotograf_yukle': 'Görev kanıtı / fotoğraf yükleme',
  'is.sil': 'Görev silme talebi oluşturma',
  'is.sil.onay': 'Görev silme onayı ve silinen görevler arşivi',
  'is.duzenle':
    'Görev düzenleme (onaylı/reddedilmemiş ve tekrar sürecinde olmayan görevler)',
  'is.birebir_gorev':
    'Birebir (özel) görev — yalnızca atayan ve sorumlu görür; işaretlemek için',
  'denetim.olustur': 'Denetim görevi oluşturma',
  'denetim.onayla': 'Görev onaylama',
  'denetim.reddet': 'Görev reddetme',
  'personel.yonet': 'Personel yönetimi',
  'puan.ver': 'Puan verme',
  'rapor.oku': 'Raporları görüntüleme',
  'musteri_puan.qr_olustur': 'Müşteri puan QR oluşturma',
  'musteri_puan.rapor_oku': 'Müşteri puan raporlarını görüntüleme',
  'ip.kisit_muaf': 'IP erişim kısıtından muafiyet',
  'rol.yonet': 'Rol tanımları ve yetkiler',
  'sube.yonet': 'Şube / birim yönetimi',
  'sirket.yonet': 'Şirket yönetimi',
  'is_turu.yonet': 'Görev türü ve şablon yönetimi',
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
    'is.birebir_gorev',
  ],
  DENETIM: ['denetim.olustur', 'denetim.onayla', 'denetim.reddet'],
  YONETIM: [
    'personel.yonet',
    'puan.ver',
    'rapor.oku',
    'musteri_puan.qr_olustur',
    'musteri_puan.rapor_oku',
  ],
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
