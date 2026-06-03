import { Input, SettingSwitch } from '../../ui'
import { cn } from '../../lib/cn'
import { normalizeOperasyonelOpts } from '../../lib/projectTaskOperasyonel.js'

/**
 * Operasyonel görev kuralları — proje planlama modalı
 */
export default function TaskOperationalOptionsPanel({
  gorevTipi,
  value,
  onChange,
  mayMarkBirebirGorev = false,
  assigneeCount = 0,
  selectedTemplate = null,
  hasChecklistPhoto = false,
  hasChecklistVideo = false,
  hideCokluAssign = false,
}) {
  const opts = normalizeOperasyonelOpts(value)
  const patch = (p) => onChange({ ...opts, ...p })

  const chainMode = ['zincir_gorev', 'zincir_onay', 'zincir_gorev_ve_onay'].includes(gorevTipi)
  const siraliMode = gorevTipi === 'sirali_gorev'
  const sablonMode = gorevTipi === 'sablon_gorev'

  const fotoSablondan =
    sablonMode && selectedTemplate && (!!selectedTemplate.foto_zorunlu || hasChecklistPhoto)
  const videoSablondan =
    sablonMode && selectedTemplate && (!!selectedTemplate.video_zorunlu || hasChecklistVideo)

  const showCoklu = !hideCokluAssign && (gorevTipi === 'normal' || gorevTipi === 'sablon_gorev')
  const showBireysel = showCoklu && opts.coklu_atama && assigneeCount > 1

  const setFotoZorunlu = (on) => {
    patch({
      foto_zorunlu: on,
      min_foto_sayisi: on ? Math.max(1, opts.min_foto_sayisi) : 1,
      ...(on ? { video_zorunlu: false, min_video_sayisi: 1 } : {}),
    })
  }

  const setVideoZorunlu = (on) => {
    patch({
      video_zorunlu: on,
      min_video_sayisi: on ? Math.max(1, opts.min_video_sayisi) : 1,
      max_video_suresi_sn: on ? Math.max(5, opts.max_video_suresi_sn) : 60,
      ...(on ? { foto_zorunlu: false, min_foto_sayisi: 1 } : {}),
    })
  }

  if (siraliMode) {
    return (
      <p className="rounded-2xl border border-slate-200/90 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        Sıralı görevlerde kanıt ve aciliyet her adım için ayrı tanımlanır.
      </p>
    )
  }

  const rows = []

  if (showCoklu) {
    rows.push({
      key: 'coklu',
      el: (
        <SettingSwitch
          id="proje-sw-coklu"
          variant="row"
          checked={opts.coklu_atama}
          onChange={(v) => patch({ coklu_atama: v, ...(v ? {} : { bireysel: true }) })}
          label="Çoklu görev atama"
          description="Birden fazla kişiye aynı görev"
        />
      ),
    })
  }

  if (!chainMode && mayMarkBirebirGorev) {
    rows.push({
      key: 'ozel',
      el: (
        <SettingSwitch
          id="proje-sw-ozel"
          variant="row"
          checked={opts.ozel_gorev}
          onChange={(v) => patch({ ozel_gorev: v })}
          label="Bire bir görev"
          description="Yalnızca atananlar görür"
        />
      ),
    })
  }

  if (showBireysel) {
    rows.push({
      key: 'bireysel',
      el: (
        <SettingSwitch
          id="proje-sw-bireysel"
          variant="row"
          checked={opts.bireysel}
          onChange={(v) => patch({ bireysel: v })}
          label="Bireysel tamamlama"
          description="Kapalıysa havuz görevi oluşur"
        />
      ),
    })
  }

  rows.push(
    {
      key: 'acil',
      el: (
        <SettingSwitch
          id="proje-sw-acil"
          variant="row"
          checked={opts.acil}
          onChange={(v) => patch({ acil: v })}
          label="Acil görev"
          description="Operasyonel kayıtta acil işaret"
        />
      ),
    },
    {
      key: 'aciklama',
      el: (
        <SettingSwitch
          id="proje-sw-aciklama"
          variant="row"
          checked={opts.aciklama_zorunlu}
          onChange={(v) => patch({ aciklama_zorunlu: v })}
          label="Açıklama zorunlu"
          description="Tamamlarken not gerekli"
        />
      ),
    },
  )

  if (!fotoSablondan) {
    rows.push({
      key: 'foto',
      el: (
        <SettingSwitch
          id="proje-sw-foto"
          variant="row"
          checked={opts.foto_zorunlu}
          onChange={setFotoZorunlu}
          label="Fotoğraf zorunlu"
          description="Video ile birlikte seçilemez"
        />
      ),
    })
  }

  if (!videoSablondan) {
    rows.push({
      key: 'video',
      el: (
        <SettingSwitch
          id="proje-sw-video"
          variant="row"
          checked={opts.video_zorunlu}
          onChange={setVideoZorunlu}
          label="Video kanıtı zorunlu"
          description="Tamamlamada video gerekir"
        />
      ),
    })
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Görev kuralları
          </h4>
        </div>
        <div className="divide-y divide-slate-100">{rows.map((r) => r.el)}</div>
      </div>

      {fotoSablondan || videoSablondan ? (
        <p className="px-1 text-xs text-slate-500">
          {fotoSablondan && videoSablondan
            ? 'Fotoğraf ve video şablondan tanımlı.'
            : fotoSablondan
              ? 'Fotoğraf şablondan tanımlı.'
              : 'Video şablondan tanımlı.'}
        </p>
      ) : null}

      {!fotoSablondan && opts.foto_zorunlu ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3">
          <label className="text-xs font-semibold text-slate-600">Minimum fotoğraf (1–5)</label>
          <Input
            type="number"
            min={1}
            max={5}
            value={opts.min_foto_sayisi}
            onChange={(e) =>
              patch({
                min_foto_sayisi: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
              })
            }
            className="mt-2 max-w-[7rem]"
          />
        </div>
      ) : null}

      {!videoSablondan && opts.video_zorunlu ? (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Min. video (1–3)</label>
            <Input
              type="number"
              min={1}
              max={3}
              value={opts.min_video_sayisi}
              onChange={(e) =>
                patch({
                  min_video_sayisi: Math.min(3, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Maks. süre (sn)</label>
            <Input
              type="number"
              min={5}
              max={60}
              value={opts.max_video_suresi_sn}
              onChange={(e) =>
                patch({
                  max_video_suresi_sn: Math.min(60, Math.max(5, Number(e.target.value) || 60)),
                })
              }
              className="mt-2"
            />
          </div>
        </div>
      ) : null}

      {gorevTipi !== 'sirali_gorev' ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-3">
          <label className="text-xs font-semibold text-slate-600">Puan (opsiyonel)</label>
          <Input
            type="number"
            min={0}
            value={opts.puan}
            onChange={(e) => patch({ puan: Math.max(0, Number(e.target.value) || 0) })}
            className="mt-2 max-w-[7rem]"
          />
          {sablonMode && selectedTemplate ? (
            <p className="mt-1.5 text-xs text-slate-400">
              Şablon varsayılan: {selectedTemplate.varsayilan_puan ?? selectedTemplate.puan ?? 0}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
