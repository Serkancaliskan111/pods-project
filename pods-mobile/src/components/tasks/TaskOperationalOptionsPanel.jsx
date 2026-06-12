import React from 'react'
import { View, Switch, StyleSheet } from 'react-native'
import { normalizeOperasyonelOpts } from '../../lib/projectTaskOperasyonel.js'
import { Text, palette, spacing, radii } from '../../ui'
import { AdminTextField } from '../../screens/admin/adminScreenUtils'

function SettingRow({ label, description, value, onChange }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="bodySm" weight="SemiBold" color={palette.slate[800]}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={palette.slate[500]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: palette.slate[200], true: palette.primary[400] }}
        thumbColor="#fff"
      />
    </View>
  )
}

/**
 * Operasyonel görev kuralları — proje planlama (web parity).
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
  hidePoolRules = false,
  hideAcil = false,
  hidePuan = false,
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
      <View style={styles.infoBox}>
        <Text variant="caption" color={palette.slate[600]} style={{ lineHeight: 18 }}>
          Sıralı görevlerde kanıt ve aciliyet her adım için ayrı tanımlanır.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text variant="caption" weight="Bold" color={palette.slate[500]} style={styles.cardHeaderText}>
            GÖREV KURALLARI
          </Text>
        </View>

        {showCoklu && !hidePoolRules ? (
          <SettingRow
            label="Çoklu görev atama"
            description="Birden fazla kişiye aynı görev"
            value={opts.coklu_atama}
            onChange={(v) => patch({ coklu_atama: v, ...(v ? {} : { bireysel: true }) })}
          />
        ) : null}

        {!chainMode && mayMarkBirebirGorev ? (
          <SettingRow
            label="Bire bir görev"
            description="Yalnızca atananlar görür"
            value={opts.ozel_gorev}
            onChange={(v) => patch({ ozel_gorev: v })}
          />
        ) : null}

        {showBireysel && !hidePoolRules ? (
          <SettingRow
            label="Bireysel tamamlama"
            description="Kapalıysa havuz görevi oluşur"
            value={opts.bireysel}
            onChange={(v) => patch({ bireysel: v })}
          />
        ) : null}

        {!hideAcil ? (
          <SettingRow
            label="Acil görev"
            description="Operasyonel kayıtta acil işaret"
            value={opts.acil}
            onChange={(v) => patch({ acil: v })}
          />
        ) : null}
        <SettingRow
          label="Açıklama zorunlu"
          description="Tamamlarken not gerekli"
          value={opts.aciklama_zorunlu}
          onChange={(v) => patch({ aciklama_zorunlu: v })}
        />

        {!fotoSablondan ? (
          <SettingRow
            label="Fotoğraf zorunlu"
            description="Video ile birlikte seçilemez"
            value={opts.foto_zorunlu}
            onChange={setFotoZorunlu}
          />
        ) : null}

        {!videoSablondan ? (
          <SettingRow
            label="Video kanıtı zorunlu"
            description="Tamamlamada video gerekir"
            value={opts.video_zorunlu}
            onChange={setVideoZorunlu}
          />
        ) : null}

        <SettingRow
          label="Belge zorunlu"
          description="PDF, Word, Excel, PowerPoint"
          value={opts.belge_zorunlu}
          onChange={(on) =>
            patch({
              belge_zorunlu: on,
              min_belge_sayisi: on ? Math.max(1, opts.min_belge_sayisi) : 1,
            })
          }
        />
      </View>

      {fotoSablondan || videoSablondan ? (
        <Text variant="caption" color={palette.slate[500]} style={styles.hint}>
          {fotoSablondan && videoSablondan
            ? 'Fotoğraf ve video şablondan tanımlı.'
            : fotoSablondan
              ? 'Fotoğraf şablondan tanımlı.'
              : 'Video şablondan tanımlı.'}
        </Text>
      ) : null}

      {!fotoSablondan && opts.foto_zorunlu ? (
        <View style={styles.subCard}>
          <AdminTextField
            label="Minimum fotoğraf (1–5)"
            value={String(opts.min_foto_sayisi)}
            onChangeText={(v) =>
              patch({
                min_foto_sayisi: Math.min(5, Math.max(1, Number(v) || 1)),
              })
            }
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      {!videoSablondan && opts.video_zorunlu ? (
        <View style={styles.subCard}>
          <AdminTextField
            label="Min. video (1–3)"
            value={String(opts.min_video_sayisi)}
            onChangeText={(v) =>
              patch({
                min_video_sayisi: Math.min(3, Math.max(1, Number(v) || 1)),
              })
            }
            keyboardType="number-pad"
          />
          <AdminTextField
            label="Maks. süre (sn)"
            value={String(opts.max_video_suresi_sn)}
            onChangeText={(v) =>
              patch({
                max_video_suresi_sn: Math.min(60, Math.max(5, Number(v) || 60)),
              })
            }
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      {opts.belge_zorunlu ? (
        <View style={styles.subCard}>
          <AdminTextField
            label="Minimum belge (1–5)"
            value={String(opts.min_belge_sayisi)}
            onChangeText={(v) =>
              patch({
                min_belge_sayisi: Math.min(5, Math.max(1, Number(v) || 1)),
              })
            }
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      {!hidePuan && gorevTipi !== 'sirali_gorev' ? (
        <View style={styles.subCard}>
          <AdminTextField
            label="Puan (opsiyonel)"
            value={String(opts.puan)}
            onChangeText={(v) => patch({ puan: Math.max(0, Number(v) || 0) })}
            keyboardType="number-pad"
          />
          {sablonMode && selectedTemplate ? (
            <Text variant="caption" color={palette.slate[400]} style={{ marginTop: -8 }}>
              Şablon varsayılan: {selectedTemplate.varsayilan_puan ?? selectedTemplate.puan ?? 0}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  cardHeader: {
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  cardHeaderText: {
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate[100],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  infoBox: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    padding: spacing.md,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  subCard: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.surface,
    padding: spacing.md,
  },
})
