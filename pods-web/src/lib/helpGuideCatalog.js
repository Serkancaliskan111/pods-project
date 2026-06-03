import {
  canAssignTask,
  canApproveTask,
  canManageStaff,
  canSeeCompanies,
  canSeeRoles,
  canSeeTaskTemplates,
  canSeeTasks,
  canSeeUnits,
  hasManagementDashboardAccess,
  hasWebPanelAccess,
  canManageCustomerRatings,
} from './permissions.js'

/** @typedef {import('./helpGuides.js').HelpGuide} HelpGuide */

/** Öne çıkan konular (panel üstü) */
export const HELP_GUIDE_FEATURED_IDS = [
  'intro-platform',
  'task-assign',
  'audit-approve',
  'calendar-mine-team',
]

/**
 * @param {Partial<HelpGuide>} g
 * @returns {HelpGuide}
 */
function guide(g) {
  return /** @type {HelpGuide} */ ({
    keywords: [],
    estimatedMinutes: Math.max(1, Math.ceil((g.steps?.length || 1) * 0.75)),
    ...g,
  })
}

/** Uygulamalı eğitim adımı — yerleşim otomatik, taşma önlenir */
function T(/** @type {import('./helpGuides.js').HelpGuideStep} */ step) {
  return { placement: 'auto', ...step }
}

/** Atama modalı turları — tur başında modal açılır, bitince kapanır */
function assignGuide(/** @type {Partial<HelpGuide>} */ g) {
  return guide({
    startAction: 'openTaskAssign',
    startWaitMs: 600,
    stopAction: 'closeTaskAssign',
    ...g,
  })
}

/** Atama modalı adımları — geniş kart, köşe yerleşim */
function TA(/** @type {import('./helpGuides.js').HelpGuideStep} */ step) {
  return { placement: 'auto', cardLayout: 'corner', cardWide: true, ...step }
}

/** @type {HelpGuide[]} */
export const HELP_GUIDE_CATALOG = [
  guide({
    id: 'intro-platform',
    title: 'Platforma hızlı giriş',
    description: 'Menü, üst çubuk ve günlük gezinme.',
    summary:
      'PODS arayüzü, bildirimler ve adım adım yardım sistemine kısa bir giriş.',
    category: 'Başlangıç',
    keywords: ['menü', 'sidebar', 'gezinme', 'başlangıç', 'üst çubuk'],
    featured: true,
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin',
        selector: '[data-help="nav-sidebar"]',
        interaction: 'hover',
        title: 'Sol menü',
        doThis: 'Sol kenar çubuğunun üzerine gelin; menünün genişleyip etiketleri göstermesini izleyin.',
        body: 'Modüller burada gruplanır. Günlük iş akışınız çoğunlukla Görevler, Denetim ve Takvim üzerinden ilerler.',
        bullets: [
          'Dar görünümde yalnızca simgeler, geniş görünümde metin etiketleri görünür.',
          'Listede olmayan bir modül, rolünüzde yetki bulunmadığı anlamına gelir.',
        ],
      }),
      T({
        selector: '[data-help="help-launcher"]',
        clickSelector: '[data-help="help-launcher"]',
        title: 'Yardım merkezi',
        doThis: 'Üst çubuktaki kitap simgesine tıklayın; konu listesini açın.',
        body: 'Her konu ekranda ilgili alanı vurgulayarak adım adım ilerler. Tur boyunca sayfa değiştirseniz kaldığınız adımdan devam edersiniz.',
        tip: 'Kapatmak için Esc tuşuna basabilir veya simgeye tekrar tıklayabilirsiniz.',
      }),
      T({
        selector: '[data-help="notifications-bell"]',
        clickSelector: '[data-help="notifications-bell"]',
        title: 'Bildirimler',
        doThis: 'Bildirimler düğmesine tıklayın; listeden bir kayıt seçerek ilgili göreve gidin.',
        body: 'Geciken görev, yaklaşan son tarih ve onay uyarıları burada toplanır.',
        bullets: [
          'Kırmızı rozet okunmamış bildirim sayısını gösterir.',
          'Liste boşsa bekleyen sistem uyarısı yoktur.',
        ],
      }),
      T({
        selector: '[data-help="announcements"]',
        clickSelector: '[data-help="announcements"]',
        title: 'Duyurular',
        doThis: 'Megafon simgesine tıklayın ve güncel duyuruları okuyun.',
        body: 'Kurumsal duyurular üst çubuktan erişilir; yeni içerikler burada listelenir.',
      }),
      T({
        selector: '[data-help="task-create-btn"]',
        interaction: 'view',
        title: 'Görev oluşturma',
        doThis: 'Yeşil «Görev Oluştur» düğmesinin konumunu not edin.',
        body: 'Yetkiniz varsa çoğu ekrandan yeni görev atayabilirsiniz. Atama adımları için «Görev nasıl atanır?» konusunu açın.',
      }),
    ],
  }),
  assignGuide({
    id: 'task-assign',
    title: 'Görev nasıl atanır?',
    description: 'Sihirbaz: tür, bilgi, atama, dosyalar, kanıt kuralları ve kayıt.',
    summary:
      'Standart görev atama akışının baştan sona uygulamalı anlatımı — en çok kullanılan PODS işlemi.',
    category: 'Görevler',
    keywords: ['atama', 'oluştur', 'yeni görev', 'sihirbaz', 'zincir', 'şablon', 'devam et'],
    featured: true,
    estimatedMinutes: 10,
    isVisible: ({ permissions, isSystemAdmin, personel }) =>
      canAssignTask(permissions, isSystemAdmin, personel),
    steps: [
      TA({
        selector: '[data-help="task-assign-tabs"]',
        interaction: 'view',
        title: '1 — Sekme akışı',
        doThis: 'Üstteki sekmeleri soldan sağa okuyun: Tür → Bilgi → Atama → Dosyalar → Zamanlama → Diğer.',
        body: 'Atama sihirbazı açıldı. Gerçek kayıt zorunlu değil; son adımda iptal edebilirsiniz.',
        bullets: [
          'Mavi sekme = şu an buradasınız.',
          'Gri tik = tamamlanmış; tıklayarak geri gidebilirsiniz.',
          'Alttaki «Devam et» bir sonraki sekmeye geçirir.',
        ],
      }),
      TA({
        selector: '[data-help="task-assign-mode"]',
        clickSelector: '[data-help="task-assign-mode-normal"]',
        interaction: 'click',
        title: '2 — Görev türü',
        doThis: '«Standart görev» kartına tıklayın (mavi çerçeve). Sonra alttaki yeşil «Devam et»e basın — kılavuz otomatik ilerler.',
        body: 'Tür; onay modeli ve hangi sekmelerin görüneceğini belirler. İlk atamalarda standart görev yeterlidir.',
        bullets: [
          'Standart: tek sorumlu, tek tamamlama, tek onay.',
          'Şablon / zincir / sıralı: «Görev türleri ne anlama gelir?» konusuna bakın.',
        ],
        tip: 'Kartın sağ üstündeki ℹ kısa açıklama verir.',
      }),
      TA({
        selector: '[data-help="task-assign-temel"]',
        interaction: 'view',
        title: '3 — Başlık ve açıklama',
        doThis: '«Görev başlığı» alanına örnek bir metin yazın (ör. «Raf düzeni kontrolü»). Gerekirse açıklama ekleyin, alttaki «Devam et» ile Atama sekmesine geçin.',
        body: 'Başlık listelerde ve bildirimlerde görünür; net ve eylem odaklı yazın.',
        bullets: [
          'Şablon görevde önce şablon seçilir, başlık şablondan gelebilir.',
          'Referans fotoğraf eklemek isteğe bağlıdır.',
        ],
      }),
      TA({
        selector: '[data-help="task-assign-atama"]',
        interaction: 'view',
        title: '4 — Şirket, birim, sorumlu',
        doThis: 'Sırayla: Ana şirket → Birim → Sorumlu personel seçin. Çoklu atama kapalıysa tek kişi işaretleyin.',
        body: 'Sorumlu görevi ana sayfasında görür; yanlış birim seçimi listede görevi gizleyebilir.',
        bullets: [
          'Birim seçilmeden personel listesi boş kalır.',
          'Zincir/sıralı türde bu adımdan sonra «Adımlar» sekmesi açılır.',
          'Acil işareti «Zamanlama» veya «Diğer» adımında da yapılabilir.',
        ],
      }),
      TA({
        selector: '[data-help="task-assign-zamanlama"]',
        interaction: 'view',
        title: '5 — Zamanlama',
        doThis: 'Üst sekmelerden «Zamanlama»ya geçin (veya «Devam et» ile gelin). Başlangıç ve bitiş tarih/saatini seçin.',
        body: 'Son tarih gecikme uyarılarını tetikler. Başlangıç, görevin ne zaman listelerde görüneceğini etkiler.',
        bullets: [
          '«Acil görev» açılırsa hızlı süre (+30dk vb.) kullanılabilir.',
          'Sıralı görev türünde zamanlama adımı farklı işler; tür seçimine dikkat edin.',
        ],
      }),
      TA({
        selector: '[data-help="task-assign-dosyalar"]',
        interaction: 'view',
        title: '6 — Referans dosyalar',
        doThis: '«Dosyalar» sekmesine geçin. İsterseniz «Medya ekle» ile örnek fotoğraf/video yükleyin (zorunlu değil).',
        body: 'Referans medya, sorumluya «böyle görünmeli» diye gösterilir; tamamlama kanıtı değildir. Kanıt kuralları «Diğer» sekmesinde ayrıca tanımlanır.',
        bullets: [
          'Atama sırasında yüklenen dosyalar görev detayında referans olarak kalır.',
          'Şablon görevlerde checklist maddeleri kendi kanıt kurallarını taşıyabilir.',
        ],
      }),
      TA({
        selector: '[data-help="task-assign-diger-kanit"]',
        interaction: 'view',
        title: '7 — Fotoğraf, video ve belge kanıtı',
        doThis: '«Diğer» sekmesine gidin. «Fotoğraf zorunlu», «Video kanıtı zorunlu» ve «Belge zorunlu» anahtarlarını inceleyin.',
        body: 'Tamamlama sırasında personelden istenecek kanıt türünü burada belirlersiniz. Fotoğraf ve video aynı anda zorunlu tutulamaz; belge (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX) foto veya video ile birlikte kullanılabilir.',
        bullets: [
          'Fotoğraf zorunlu: minimum 1–5 adet; görev tamamlanırken galeriden yüklenir.',
          'Video zorunlu: minimum 1–3 klip; klip başına üst süre (5–60 sn) sınırı konabilir.',
          'Belge zorunlu: PDF ve Office dosyaları; en fazla 5 dosya, dosya başına 25 MB.',
          'Şablon veya checklistte kanıt tanımlıysa bu anahtarlar gizlenebilir.',
          'Denetimde kanıtlar madde/görev bazında incelenir; eksik kanıt onayı engeller.',
        ],
        tip: 'Saha fotoğrafı için genelde 1–2 adet yeterlidir; belge gerektiren işlerde PDF tercih edin.',
      }),
      TA({
        selector: '[data-help="task-assign-diger-tamamlama"]',
        interaction: 'view',
        title: '8 — Tamamlama seçenekleri',
        doThis: 'Aynı «Diğer» sekmesinde «Bireysel tamamlama», «Bire bir görev» ve «Açıklama zorunlu» anahtarlarını okuyun.',
        body: 'Bu ayarlar kimin nasıl tamamlayacağını ve tamamlarken ne yazması gerektiğini belirler.',
        bullets: [
          'Bireysel tamamlama (çoklu atamada): Açık → her sorumluya ayrı görev; kapalı → havuz görev, biri bitirince diğerleri kapanır.',
          'Bire bir görev: Yalnızca atanan kişi görür; liste/pano paylaşımı kısıtlanır (yetkiniz varsa).',
          'Açıklama zorunlu: Tamamlarken metin alanı boş bırakılamaz; kısa not veya özet isteyebilirsiniz.',
          'Zincir ve sıralı türlerde sıra mantığı farklı çalışır; bireysel anahtarı görünmeyebilir.',
        ],
      }),
      TA({
        selector: '[data-help="task-assign-continue"]',
        interaction: 'view',
        title: '9 — İlerleme düğmesi',
        doThis: 'Formun altındaki yeşil «Devam et» / son adımda «Görevi oluştur» düğmesinin yerini öğrenin.',
        body: 'Zorunlu alan eksikse kırmızı uyarı hangi sekmeye dönmeniz gerektiğini söyler.',
        tip: 'Eğitim turunda son adımda kaydetmek yerine kılavuzu «Bitir» ile kapatabilirsiniz.',
      }),
      TA({
        selector: '[data-help="task-assign-submit"]',
        clickSelector: '[data-help="task-assign-cancel"]',
        interaction: 'click',
        title: '10 — Kayıt veya iptal',
        doThis: 'Sol alttaki «İptal» ile formu kapatın VEYA tüm alanları doldurup «Görevi oluştur»a basın.',
        body: 'Kayıt sonrası sorumluya bildirim gider; görev Bekleyen listesinde ve kişinin ana sayfasında görünür.',
        bullets: [
          'Proje bağlamından açıldıysa görev projeye de bağlanır.',
          'Oluşturduktan sonra detaydan kanıt kurallarını kontrol edebilirsiniz.',
        ],
      }),
    ],
  }),
  assignGuide({
    id: 'task-types-overview',
    title: 'Görev türleri ne anlama gelir?',
    description: 'Standart, şablon, zincir, sıralı ve hibrit.',
    summary: 'Atama sırasında seçilen görev türlerinin iş akışı farkları.',
    category: 'Görevler',
    keywords: ['gorev türü', 'zincir', 'sıralı', 'şablon', 'hibrit', 'standart'],
    isVisible: ({ permissions, isSystemAdmin, personel }) =>
      canAssignTask(permissions, isSystemAdmin, personel),
    steps: [
      TA({
        selector: '[data-help="task-assign-mode"]',
        clickSelector: '[data-help="task-assign-mode-normal"]',
        interaction: 'click',
        title: '1 — Tür kartları',
        doThis: '«Standart görev» kartına tıklayın; seçili olduğunu (çerçeve/vurgu) doğrulayın.',
        body: 'Her kart farklı onay ve devretme modeli sunar.',
      }),
      TA({
        selector: '[data-help="task-assign-mode"]',
        clickSelector: '[data-help="task-assign-mode-sablon_gorev"]',
        interaction: 'click',
        title: '2 — Diğer türleri inceleyin',
        doThis: 'Sırayla «Şablon», «Zincir» ve «Sıralı» kartlarına tıklayın; her birinde ℹ simgesine basıp açıklamayı okuyun.',
        body: 'Şablon = checklist maddeleri. Zincir/sıralı = adımlar sırayla devredilir. Hibrit = ikisini birleştirir.',
        bullets: [
          'Standart: tek sorumlu, günlük işler.',
          'Şablon: madde başına kanıt kuralı.',
          'Zincir: her adım ayrı sorumlu ve kanıt.',
        ],
        tip: 'Seçimden sonra alttaki «Devam et» ile ilerlersiniz.',
      }),
      TA({
        selector: '[data-help="task-assign-cancel"]',
        clickSelector: '[data-help="task-assign-cancel"]',
        interaction: 'click',
        title: '3 — Turu kapatın',
        doThis: '«İptal»e basın veya kılavuzda «Bitir» deyin.',
        body: 'Gerçek görev oluşturmak için «Görev nasıl atanır?» kılavuzunu tamamlayın.',
      }),
    ],
  }),
  guide({
    id: 'task-home',
    title: 'Ana sayfa görev panosu',
    description: 'Geciken, bugün ve yaklaşan gruplar.',
    summary: 'PODS ana sayfasında görev kartlarının okunması ve hızlı aksiyonlar.',
    category: 'Görevler',
    keywords: ['ana sayfa', 'geciken', 'bugün', 'pano', 'kart'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin',
        selector: '[data-help="home-task-board"]',
        demoScene: 'home-board',
        interaction: 'view',
        title: '1 — Görev panosu',
        doThis: '«Gecikmiş» veya «Bugün» başlığına tıklayıp grubu açın/kapatın; örnek kartları okuyun (tıklamayın).',
        body: 'Size atanan görevler önceliğe göre gruplanır. Renkli şerit gecikme durumunu gösterir.',
        bullets: [
          'Karta tıklayınca görev detayına gidersiniz.',
          'Çalışma durumunu detay sayfasından güncellersiniz.',
        ],
      }),
      T({
        selector: '[data-help="task-create-btn"]',
        interaction: 'view',
        title: '2 — Yeni görev',
        doThis: 'Yeşil «Görev Oluştur» düğmesinin yerini bulun; bu turda tıklamayın.',
        body: 'Ana sayfadan doğrudan atama başlatabilirsiniz.',
      }),
      T({
        selector: '[data-help="hidden-tasks-btn"]',
        title: '3 — Gizlenmiş görevler',
        doThis: '«Gizlenmiş Görevlerim»e tıklayıp paneli açın, sonra kapatın.',
        body: 'Ana sayfadan gizlediğiniz görevler burada geri alınır; silinmez.',
        tip: 'Gizleme yalnızca sizin panonuzu etkiler.',
      }),
      T({
        selector: '[data-help="customize-appearance"]',
        title: '4 — Özelleştir',
        doThis: '«Özelleştir»e tıklayın; bir renk seçip kaydedin veya iptal edin.',
        body: 'Kenar çubuğu rengi ve düzen tercihleri hesabınıza kaydedilir.',
      }),
    ],
  }),
  guide({
    id: 'task-pending-list',
    title: 'Bekleyen görevler listesi',
    description: 'Filtreleme, arama ve detaya geçiş.',
    summary: 'Devam eden ve henüz onaylanmamış görevlerin liste ekranı.',
    category: 'Görevler',
    keywords: ['bekleyen', 'liste', 'filtre', 'devam eden'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeTasks(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/tasks/pending',
        waitMs: 400,
        title: '1 — Bekleyen görevler',
        doThis: 'Sayfa başlığının «Bekleyen görevler» olduğunu kontrol edin.',
        body: 'Devam eden operasyonel işler burada; Denetim › Onay bekleyenler farklı bir kuyruktur.',
      }),
      T({
        selector: '[data-help="nav-tasks"]',
        title: '2 — Görevler menüsü',
        doThis: 'Sol menüde «Görevler» grubunu ve alt bağlantıları inceleyin.',
        body: 'Bekleyen, Tamamlanan ve diğer listeler buradan açılır.',
      }),
      T({
        selector: '[data-help="nav-tasks-pending"]',
        title: '3 — Listeye giriş',
        doThis: '«Bekleyen görevler» alt menüsüne tıklayın.',
        body: 'Doğrudan bu listeyi açar.',
      }),
      T({
        selector: '[data-help="tasks-list-filters"]',
        title: '4 — Filtre ve arama',
        doThis: 'Arama kutusuna bir harf yazıp silin; bir birim filtresi seçin.',
        body: 'Filtreler kalabalık listelerde doğru görevi bulmanızı sağlar.',
      }),
      T({
        demoScene: 'tasks-pending',
        title: '5 — Görev kartı',
        doThis: 'Örnek kartta durum rozetini, son tarihi ve atanan kişiyi okuyun.',
        body: 'Karta tıklayınca detay açılır. Sorumlu iseniz «Görevi yap» ile tamamlama ekranına gidebilirsiniz.',
        tip: 'Bugün / Yarın / 7 Gün grupları zamanlamayı gösterir.',
      }),
    ],
  }),
  guide({
    id: 'task-completed-list',
    title: 'Tamamlanan ve onaylanan görevler',
    description: 'Arşiv listesi ve salt okunur kanıtlar.',
    summary: 'Bitmiş görevlerin tarih gruplarıyla incelenmesi.',
    category: 'Görevler',
    keywords: ['tamamlanan', 'onaylandı', 'arşiv', 'geçmiş'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeTasks(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/tasks/completed',
        waitMs: 400,
        title: '1 — Tamamlananlar sayfası',
        doThis: 'Sayfa başlığının tamamlanan/onaylanan görevler listesi olduğunu doğrulayın.',
        body: 'Bitmiş ve onaylanmış işlerin arşivi burada.',
      }),
      T({
        selector: '[data-help="nav-tasks-completed"]',
        title: '2 — Menüden giriş',
        doThis: 'Sol menü › Görevler › «Tamamlanan görevler»e tıklayın.',
        body: 'Bekleyen listesinden farklı bir kuyruktur.',
      }),
      T({
        selector: '[data-help="tasks-list-filters"]',
        title: '3 — Filtreler',
        doThis: 'Tarih aralığı veya birim filtresinden bir seçim yapın.',
        body: 'Arşivde kanıtlar salt okunurdur; düzenleme yapılmaz.',
      }),
      T({
        title: '4 — Kart ve detay',
        doThis: 'Listeden bir göreve tıklayın; detayda onay geçmişi ve kanıt galerisini inceleyin.',
        body: 'Liste bugün / dün / daha eski gruplar halinde olabilir.',
      }),
    ],
  }),
  guide({
    id: 'task-detail-review',
    title: 'Görev detayı ve kanıt inceleme',
    description: 'Başlık, kanıt galerisi ve lightbox.',
    summary: 'Denetçi ve yöneticiler için detay sayfası ve fotoğraf lightbox kullanımı.',
    category: 'Görevler',
    keywords: ['detay', 'kanıt', 'fotoğraf', 'lightbox', 'galeri', 'inceleme'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeTasks(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/tasks/pending',
        title: '1 — Detay sayfasına gitme',
        doThis: 'Sol menü › Görevler › Bekleyen görevler; listeden bir göreve tıklayın VEYA aşağıdaki örnek detayı kullanın.',
        body: 'Kanıt inceleme ve durum bilgisi detay sayfasındadır. Kılavuzda örnek detay paneli de gösterilir.',
      }),
      T({
        selector: '[data-help="task-detail-header"]',
        demoScene: 'task-detail',
        title: '2 — Başlık ve durum',
        doThis: 'Görev başlığını, durum rozetini ve sorumlu satırını okuyun.',
        body: 'Çalışma durumu (başladım vb.) yetkiniz varsa buradan güncellenir.',
      }),
      T({
        selector: '[data-help="task-detail-evidence"]',
        demoScene: 'task-detail',
        title: '3 — Kanıt galerisi',
        doThis: 'Bir kanıt fotoğrafının üzerine gelin; büyüteç simgesini görün.',
        body: 'Fotoğraf ve videolar kare ızgara halinde listelenir.',
        bullets: [
          'Zincir görevde yalnızca ilgili adımın kanıtları görünür.',
          'Çok medya varsa galeriyi kaydırın.',
        ],
      }),
      T({
        demoScene: 'task-detail',
        title: '4 — Lightbox kullanımı',
        doThis: 'Bir fotoğrafa tıklayın; açılan ekranda Esc ile kapatın.',
        body: 'Tam ekran önizleme denetim için kullanılır.',
        bullets: [
          '← → önceki/sonraki fotoğraf',
          '+ − yakınlaştırma',
          'Esc kapat',
        ],
      }),
    ],
  }),
  guide({
    id: 'task-work-status',
    title: 'Çalışma durumu güncelleme',
    description: 'Başladım, duraklattım, tamamladım.',
    summary: 'Sorumlunun görev üzerindeki anlık çalışma durumunu işaretlemesi.',
    category: 'Görevler',
    keywords: ['çalışma durumu', 'başladım', 'duraklat', 'ilerleme'],
    isVisible: ({ permissions, isSystemAdmin, personel }) =>
      hasWebPanelAccess(permissions, isSystemAdmin) && !!personel?.id,
    steps: [
      T({
        route: '/admin/tasks/pending',
        title: '1 — Görev açın',
        doThis: 'Bekleyen görevlerden size atanan bir göreve tıklayın (yoksa kılavuzda «İleri» ile devam edin).',
        body: 'Çalışma durumu yalnızca sorumlu olduğunuz devam eden görevlerde güncellenir.',
        bullets: [
          'Değişiklikler geçmişe kaydedilir.',
          'Onay bekleyen veya tamamlanmış görevlerde kilitlenir.',
        ],
      }),
      T({
        selector: '[data-help="task-detail-header"]',
        demoScene: 'task-detail',
        title: '2 — Durumu değiştirin',
        doThis: 'Başlık satırındaki çalışma durumu listesinden «Başladım» veya «Devam ediyorum» seçin (örnek görevde işlem yapılmaz).',
        body: 'Yöneticiler bu bilgiyi detayda ve bildirimlerde görür.',
        tip: 'Mobil uygulamada aynı durumlar kullanılır.',
      }),
    ],
  }),
  guide({
    id: 'audit-approve',
    title: 'Görev onaylama ve reddetme',
    description: 'Denetim listesi ve gerekçeli red.',
    summary: 'Onay bekleyen görevlerin öncelik sırasıyla incelenmesi ve karar verme.',
    category: 'Denetim',
    keywords: ['onay', 'red', 'denetim', 'bekleyen onay'],
    featured: true,
    isVisible: ({ permissions, isSystemAdmin }) =>
      isSystemAdmin || canApproveTask(permissions),
    steps: [
      T({
        route: '/admin/audit/pending',
        waitMs: 450,
        title: '1 — Onay kuyruğu sayfası',
        doThis: 'Sayfa başlığının «Onay bekleyenler» olduğunu doğrulayın (Görevler › Bekleyen değil).',
        body: 'Denetim modülü, tamamlanıp onaya gönderilmiş işleri burada gösterir. Listeniz boşsa örnek kartlar eğitim için eklenir.',
      }),
      T({
        selector: '[data-help="nav-audit"]',
        title: '2 — Denetim menüsü',
        doThis: 'Sol menüde «Denetim» grubunu bulun; altında Onay bekleyenler / Onaylananlar olduğunu görün.',
        body: 'Görevler menüsü operasyonel devam eden işler içindir; karıştırmayın.',
      }),
      T({
        selector: '[data-help="nav-audit-pending"]',
        title: '3 — Menüden giriş',
        doThis: '«Onay bekleyenler» alt bağlantısına tıklayın.',
        body: 'Bu kısayol doğrudan onay kuyruğunu açar.',
      }),
      T({
        selector: '[data-help="tasks-list-filters"]',
        title: '4 — Filtreler',
        doThis: 'Şirket veya birim filtresinden bir seçim yapıp listenin daraldığını gözlemleyin.',
        body: 'Yoğun günlerde önce kapsamı daraltmak işinizi hızlandırır.',
      }),
      T({
        selector: '[data-help="audit-pending-list"]',
        demoScene: 'audit-pending',
        title: '5 — Onay listesi',
        doThis: 'En üstteki kartın başlığını ve son tarihini okuyun — en uzun bekleyen üsttedir.',
        body: 'Tek liste; gün filtresi yoktur. Her bekleyen kayıt sıraya girer.',
      }),
      T({
        selector: '[data-help="audit-card-actions"]',
        clickSelector: '[data-help="audit-approve-btn"]',
        demoScene: 'audit-pending',
        title: '6 — Onayla / Reddet',
        doThis: 'Mavi oka veya yeşil «Görevi Onayla» düğmesine tıklayın (örnek kartta işlem yapılmaz). Kırmızı «Görevi Reddet»i de bulun.',
        body: 'Onayda onay kutusu çıkar. Redde gerekçe yazmak zorunludur; sorumlu düzeltip yeniden gönderir.',
        tip: '«Detay gör» örnek kartta sayfa açmaz. Kendi atadığınız görevde Onayla kapalıdır.',
      }),
      T({
        title: '7 — Red sonrası',
        doThis: 'Bir sonraki gerçek onayınızda reddetmeyi seçerseniz gerekçeyi net ve yapıcı yazın.',
        body: 'Onaylanan görev tamamlanan arşive taşınır; red sorumlunun düzeltme listesine düşer.',
      }),
    ],
  }),
  guide({
    id: 'calendar-mine-team',
    title: 'Takvim: görevlerim ve ekip',
    description: 'Görünüm modları ve çoklu personel seçimi.',
    summary: 'Kişisel ve ekip takviminde planlama ile çakışma kontrolü.',
    category: 'Takvim & planlama',
    keywords: ['takvim', 'ekip', 'hafta', 'ay', 'gantt'],
    featured: true,
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/calendar',
        selector: '[data-help="nav-calendar"]',
        title: '1 — Takvime girin',
        doThis: 'Sol menüden «Takvim»e tıklayın.',
        body: 'Görevlerinizi zaman çizelgesinde görürsünüz.',
      }),
      T({
        selector: '[data-help="calendar-filter"]',
        title: '2 — Görevlerim / Ekip',
        doThis: '«Ekip görevleri» moduna geçin, sonra tekrar «Görevlerim»e dönün.',
        body: 'Görevlerim = yalnızca sizin işleriniz. Ekip = seçtiğiniz personelin takvimi.',
      }),
      T({
        selector: '[data-help="calendar-team-picker"]',
        title: '3 — Ekip seçimi',
        doThis: '«Ekip seç»e tıklayın, arama kutusunu kullanın, bir personel işaretleyip paneli kapatın.',
        body: 'Birden fazla kişi seçebilirsiniz; takvim yalnızca seçilenleri gösterir.',
      }),
      T({
        selector: '[data-help="calendar-view-modes"]',
        title: '4 — Görünüm modu',
        doThis: '«Hafta» ve «Liste» sekmelerine sırayla tıklayın; yan oklarla önceki haftaya gidin.',
        body: 'Ay / Hafta / Gün / Liste farklı planlama ihtiyaçları için kullanılır.',
      }),
    ],
  }),
  guide({
    id: 'chat-full',
    title: 'Kurumsal sohbet',
    description: 'Kanallar, mesajlar ve hızlı erişim.',
    summary: 'Sohbet modülü, dosya ekleri ve yüzen sohbet kısayolu.',
    category: 'İletişim',
    keywords: ['sohbet', 'mesaj', 'kanal', 'dosya', 'chat'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/chat',
        selector: '[data-help="nav-chat"]',
        title: '1 — Sohbet sayfası',
        doThis: 'Sol menüden «Sohbet»e tıklayın.',
        body: 'Sol liste kanallar, sağ alan mesajlar.',
      }),
      T({
        selector: '[data-help="chat-channel-list"]',
        title: '2 — Kanal seçin',
        doThis: 'Listeden bir kanala tıklayın; sağda mesaj geçmişi açılsın.',
        body: 'Arama kutusu kanal adında ve son mesaj özetinde arar.',
        bullets: ['Okunmamış kanallar belirgindir.', 'Yeni sohbet için üstteki + simgesini kullanın.'],
      }),
      T({
        selector: '[data-help="chat-composer"]',
        title: '3 — Mesaj yazın',
        doThis: 'Alttaki kutuya test mesajı yazın; göndermek için Enter (yeni satır: Shift+Enter).',
        body: 'Ataç ile dosya veya görsel ekleyebilirsiniz.',
        tip: 'Göndermeden önce doğru kanalda olduğunuzu kontrol edin.',
      }),
      T({
        route: '/admin',
        selector: '[data-help="floating-chat-fab"]',
        title: '4 — Hızlı sohbet',
        doThis: 'Ana sayfaya dönün (sol menü › ana sayfa), sağ alttaki yüzen sohbet düğmesine tıklayın.',
        body: 'Başka modüldeyken hızlı mesaj için kullanılır.',
      }),
    ],
  }),
  guide({
    id: 'task-templates',
    title: 'Görev şablonu yönetimi',
    description: 'Checklist şablonları ve madde kuralları.',
    summary: 'Tekrarlayan işler için şablon oluşturma ve göreve bağlama.',
    category: 'Görevler',
    keywords: ['şablon', 'checklist', 'madde', 'kanıt kuralı'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeTaskTemplates(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/task-templates',
        selector: '[data-help="nav-templates"]',
        waitMs: 400,
        title: '1 — Şablon listesi',
        doThis: 'Sol menüden «Görev Şablonları»na tıklayın; listede en az bir satır bulun.',
        body: 'Her şablon checklist maddeleri ve kanıt kurallarını içerir.',
      }),
      T({
        title: '2 — Şablon detayı',
        doThis: 'Bir şablona tıklayın; madde listesini ve kanıt kurallarını okuyun.',
        body: 'Yeni şablon için «Yeni şablon» düğmesini kullanırsınız.',
      }),
      TA({
        action: 'openTaskAssign',
        waitMs: 500,
        selector: '[data-help="task-assign-mode"]',
        clickSelector: '[data-help="task-assign-mode-sablon_gorev"]',
        interaction: 'click',
        title: '3 — Göreve bağlama',
        doThis: '«Şablon görev» kartına tıklayın; atama adımlarında şablon seçim alanını bulun.',
        body: 'Sorumlu her maddeyi ayrı tamamlar; denetçi madde bazında onaylayabilir.',
        tip: 'Şablon güncellemeleri yeni atamalara yansır; açık görevler etkilenmez.',
      }),
      TA({
        selector: '[data-help="task-assign-cancel"]',
        clickSelector: '[data-help="task-assign-cancel"]',
        interaction: 'click',
        title: '4 — Formu kapatın',
        doThis: '«İptal» ile atama formunu kapatın.',
        body: 'Gerçek şablonlu görev için «Görev nasıl atanır?» kılavuzunu kullanın.',
      }),
    ],
  }),
  guide({
    id: 'staff-manage',
    title: 'Personel kaydı',
    description: 'Yeni personel, birim ve rol.',
    summary: 'Organizasyon ağacına personel ekleme ve erişim atama.',
    category: 'Organizasyon',
    keywords: ['personel', 'çalışan', 'birim', 'rol', 'ekle'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canManageStaff(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/staff',
        selector: '[data-help="nav-organization-staff"]',
        waitMs: 400,
        title: '1 — Personel listesi',
        doThis: 'Sol menü › Organizasyon › «Personeller»e tıklayın.',
        body: 'Tüm personel kayıtları burada listelenir.',
      }),
      T({
        title: '2 — Kayıt arama',
        doThis: 'Arama kutusuna bir isim harfi yazıp listeyi daraltın.',
        body: 'Filtreler kalabalık organizasyonlarda hız kazandırır.',
      }),
      T({
        title: '3 — Yeni personel',
        doThis: '«Yeni personel» düğmesine tıklayın; formu açıp zorunlu alanları okuyun, kaydetmeden kapatın.',
        body: 'Rol seçimi menü görünürlüğü ve işlem yetkilerini belirler.',
        tip: 'Kayıt sonrası mobil davet e-postası gönderilebilir.',
      }),
    ],
  }),
  guide({
    id: 'presence-staff',
    title: 'Personel canlı durumu',
    description: 'Çevrimiçi / çevrimdışı ve son görülme.',
    summary: 'Mobil heartbeat ile personel erişilebilirlik takibi.',
    category: 'Organizasyon',
    keywords: ['canlı', 'çevrimiçi', 'presence', 'konum', 'heartbeat'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canManageStaff(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/presence',
        selector: '[data-help="nav-presence"]',
        title: '1 — Canlı durum',
        doThis: 'Sol menüden «Canlı Durum»a tıklayın.',
        body: 'Mobil uygulamadan gelen çevrimiçi/çevrimdışı ve son görülme bilgisi listelenir.',
      }),
      T({
        title: '2 — Satır inceleme',
        doThis: 'Bir personel satırına tıklayıp detay/geçmiş ekranını açın, sonra geri dönün.',
        body: 'Uzun süre çevrimdışı kalanlar için uyarı eşikleri tanımlı olabilir.',
        tip: 'Durum mobil uygulamanın açık ve izinli olmasına bağlıdır.',
      }),
    ],
  }),
  guide({
    id: 'roles-permissions',
    title: 'Rol ve yetki yönetimi',
    description: 'İnce taneli izin matrisi.',
    summary: 'Rol bazlı görev, onay, personel ve modül erişimleri.',
    category: 'Organizasyon',
    keywords: ['rol', 'yetki', 'izin', 'matris'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeRoles(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/roles',
        selector: '[data-help="nav-organization-roles"]',
        waitMs: 400,
        title: '1 — Roller sayfası',
        doThis: 'Organizasyon › «Roller»e gidin; listeden bir role tıklayın.',
        body: 'Görev atama, onay, personel, şablon ve denetim izinleri matris halinde yönetilir.',
        bullets: [
          'Değişiklikler o role sahip herkese yansır.',
          'Sistem yöneticisi tüm modüllere erişir.',
        ],
      }),
      T({
        title: '2 — İzin değiştirme (deneme)',
        doThis: 'Bir izin anahtarını geçici açıp kapatın; kaydetmeden önce iptal edin veya değişikliği geri alın.',
        body: 'Canlı ortamda kaydetmeden önce etkisini düşünün.',
        tip: 'Test için ayrı «deneme» rolü oluşturmak güvenlidir.',
      }),
    ],
  }),
  guide({
    id: 'companies-units',
    title: 'Şirket ve birim yapısı',
    description: 'Çok şirketli organizasyon.',
    summary: 'Şirket, birim hiyerarşisi ve görev görünürlük kapsamı.',
    category: 'Organizasyon',
    keywords: ['şirket', 'birim', 'hiyerarşi', 'organizasyon'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeCompanies(permissions, isSystemAdmin) ||
      canSeeUnits(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/companies',
        selector: '[data-help="nav-organization-companies"]',
        title: '1 — Şirketler',
        doThis: 'Organizasyon › «Şirketler»e tıklayın; listede şirketleri görün.',
        body: 'Çok şirketli yapıda kullanıcı birden fazla şirkette yetkili olabilir.',
      }),
      T({
        route: '/admin/units',
        selector: '[data-help="nav-organization-units"]',
        title: '2 — Birim ağacı',
        doThis: 'Organizasyon › «Birimler»e geçin; ağaçta bir birimi genişletin.',
        body: 'Personel birime bağlanır; görevler ve listeler birim kapsamında filtrelenir.',
        tip: 'Atama ekranında birim seçimi çoğu zaman zorunludur.',
      }),
    ],
  }),
  guide({
    id: 'projects-plan',
    title: 'Proje planlama',
    description: 'Ekip, yetkili ve planlama görevleri.',
    summary: 'Proje oluşturma, ekip atama ve operasyonel görev eşleştirme.',
    category: 'Takvim & planlama',
    keywords: ['proje', 'gantt', 'planlama', 'ekip'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/projects',
        selector: '[data-help="nav-projects"]',
        title: '1 — Proje listesi',
        doThis: 'Sol menüden «Projeler»e tıklayın; varsa bir projeye tıklayın.',
        body: 'Proje düzenlemede ekip ve yetkililer tanımlanır.',
      }),
      T({
        title: '2 — Planlama görevleri',
        doThis: 'Proje detayında planlama görevleri sekmesini veya Gantt/liste görünümünü açın.',
        body: 'Planlama görevleri operasyonel PODS görevleriyle ilişkilendirilebilir.',
      }),
    ],
  }),
  guide({
    id: 'personal-todo',
    title: 'Kişisel yapılacaklar',
    description: 'Resmi görevden bağımsız notlar.',
    summary: 'Kişisel liste ve şablonlarla günlük planlama.',
    category: 'Görevler',
    keywords: ['yapılacak', 'todo', 'kişisel', 'not'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/personal-todo',
        selector: '[data-help="nav-personal-todo"]',
        title: '1 — Kişisel liste',
        doThis: '«To-Do List» menüsüne tıklayın; yeni bir madde ekleyip tamamlandı işaretleyin.',
        body: 'Resmi görevlerden bağımsızdır; onay veya puanlama yoktur.',
        tip: 'Operasyonel işler için Görevler modülünü kullanın.',
      }),
    ],
  }),
  guide({
    id: 'notifications',
    title: 'Bildirim merkezi',
    description: 'Okundu işaretleme ve göreve git.',
    summary: 'Üst çubuk bildirim zili ve bildirim türleri.',
    category: 'Ayarlar',
    keywords: ['bildirim', 'zil', 'uyarı', 'geciken'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin',
        selector: '[data-help="notifications-bell"]',
        title: '1 — Bildirim zili',
        doThis: 'Zile tıklayın; listeden bir satıra tıklayıp ilgili göreve gidin, sonra geri dönün.',
        body: 'Geciken, yaklaşan son tarih ve onay uyarıları burada toplanır.',
        bullets: [
          'Kırmızı rozet okunmamış sayısıdır.',
          'Çalışma durumu değişiklikleri yöneticilere düşebilir.',
        ],
      }),
    ],
  }),
  guide({
    id: 'announcements',
    title: 'Kurumsal duyurular',
    description: 'Okuma ve arşiv.',
    summary: 'Şirket içi duyuruların üst çubuktan takibi.',
    category: 'İletişim',
    keywords: ['duyuru', 'megafon', 'şirket'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin',
        selector: '[data-help="announcements"]',
        title: '1 — Duyurular',
        doThis: 'Megafon simgesine tıklayın; en az bir duyurunun tam metnini okuyun.',
        body: 'Şirket içi duyurular üst çubuktan erişilir.',
        tip: 'Yeni duyuru yayınlama yetkiye bağlıdır.',
      }),
    ],
  }),
  guide({
    id: 'profile-customize',
    title: 'Profil ve görünüm',
    description: 'Avatar, tema ve ana sayfa.',
    summary: 'Profil fotoğrafı ve PODS görünüm tercihleri.',
    category: 'Ayarlar',
    keywords: ['profil', 'avatar', 'tema', 'özelleştir'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasWebPanelAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/profile',
        selector: '[data-help="nav-profile"]',
        title: '1 — Profil',
        doThis: 'Sol alttaki avatara tıklayın; profil fotoğrafı alanını bulun (değiştirmek zorunlu değil).',
        body: 'İletişim bilgileri ve şifre işlemleri bu sayfadadır.',
      }),
      T({
        route: '/admin',
        selector: '[data-help="customize-appearance"]',
        title: '2 — Görünüm',
        doThis: 'Ana sayfada «Özelleştir»e tıklayıp kenar çubuğu rengini değiştirin ve kaydedin.',
        body: 'Tercihler hesabınıza bağlıdır; başka cihazda da uygulanır.',
      }),
    ],
  }),
  guide({
    id: 'hidden-tasks',
    title: 'Ana sayfadan görev gizleme',
    description: 'Geçici gizleme ve geri getirme.',
    summary: 'Pano düzenleme için görevleri gizleme — silme değildir.',
    category: 'Görevler',
    keywords: ['gizle', 'gizlenmiş', 'pano'],
    isVisible: ({ permissions, isSystemAdmin, personel }) =>
      hasWebPanelAccess(permissions, isSystemAdmin) && !!personel?.id,
    steps: [
      T({
        route: '/admin',
        selector: '[data-help="home-task-board"]',
        demoScene: 'home-board',
        title: '1 — Görevi gizleme',
        doThis: 'Ana sayfada bir kartın «Gizle» seçeneğini bulun (gerçek kartınızda deneyebilirsiniz).',
        body: 'Gizleme panodan kaldırır; görevi silmez.',
      }),
      T({
        selector: '[data-help="hidden-tasks-btn"]',
        title: '2 — Geri getirme',
        doThis: '«Gizlenmiş Görevlerim» panelini açıp gizlediğiniz görevi «Göster» ile geri alın.',
        body: 'Liste yalnızca sizin gizlediklerinizi içerir.',
      }),
    ],
  }),
  guide({
    id: 'task-deletion-request',
    title: 'Görev silme talebi',
    description: 'Talep, onay ve arşiv.',
    summary: 'Yanlış veya iptal edilen görevler için kontrollü silme süreci.',
    category: 'Görevler',
    keywords: ['silme', 'talep', 'arşiv', 'iptal'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canSeeTasks(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/tasks/pending',
        title: '1 — Talep başlatma',
        doThis: 'Bir görev detayına gidin; «Silme talebi gönder» düğmesini bulun (göndermek zorunlu değil).',
        body: 'Talep onaylanana kadar görev kilitlenir ve listede işaretlenir.',
      }),
      T({
        route: '/admin/tasks/deletion-requests',
        title: '2 — Onay kuyruğu',
        doThis: 'Adres çubuğundan veya menüden silme talepleri sayfasına gidin; bekleyen satırları inceleyin.',
        body: 'Onay arşive taşır; red görevi aktif bırakır ve gerekçe talep sahibine görünür.',
        bullets: ['Onaylanan kayıtlar silinen arşivde saklanır.'],
      }),
    ],
  }),
  guide({
    id: 'customer-ratings',
    title: 'Müşteri değerlendirmeleri',
    description: 'QR kod ve puan kayıtları.',
    summary: 'Müşteri geri bildirim modülü ve QR yönetimi.',
    category: 'Organizasyon',
    keywords: ['müşteri', 'puan', 'qr', 'değerlendirme'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      canManageCustomerRatings(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin/customer-ratings',
        selector: '[data-help="nav-customer-ratings"]',
        title: '1 — Müşteri anketi',
        doThis: 'Sol menüden «Müşteri Anketi»ne tıklayın; listede bir kaydı açın.',
        body: 'QR ile gelen puanlar burada listelenir ve raporlanır.',
        tip: 'Birim/lokasyon bazlı QR ayrımı yapılandırmaya bağlıdır.',
      }),
    ],
  }),
  guide({
    id: 'management-dashboard',
    title: 'Yönetici ana sayfa görünümü',
    description: 'Ekip özeti ve KPI kartları.',
    summary: 'Yönetim yetkisi olan kullanıcılar için farklı ana sayfa düzeni.',
    category: 'Başlangıç',
    keywords: ['yönetim', 'kpi', 'özet', 'dashboard'],
    isVisible: ({ permissions, isSystemAdmin }) =>
      hasManagementDashboardAccess(permissions, isSystemAdmin),
    steps: [
      T({
        route: '/admin',
        selector: '[data-help="home-task-board"]',
        title: '1 — Yönetim ana sayfası',
        doThis: 'Üstteki kapsam seçicisinde «Bugün / Bu Hafta / Genel» arasında geçiş yapın.',
        body: 'Ekip metrikleri, geciken özet ve hızlı bağlantılar operatör panosundan farklıdır.',
        bullets: [
          'Metrikler şirket kapsamına göre filtrelenir.',
          'Detay için Görevler veya Denetim listelerine gidin.',
        ],
      }),
    ],
  }),
]
