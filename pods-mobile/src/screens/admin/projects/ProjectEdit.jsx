import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Trash2 } from 'lucide-react-native'
import { useAuth } from '../../../contexts/AuthContext'
import { useUiTheme } from '../../../contexts/UiThemeContext'
import {
  PROJECT_COLOR_PRESETS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from '../../../lib/projectStatus'
import { canManageProjectRecord } from '../../../lib/projectAccess'
import {
  fetchProjectById,
  fetchProjectMembers,
  fetchProjectUnitLabel,
  createProject,
  updateProject,
  softDeleteProject,
  resolveDefaultProjectBirimId,
} from '../../../lib/projectApi'
import AdminScreenLayout from '../../../components/cubicle/AdminScreenLayout'
import ProjectTeamPanel from '../../../components/projects/ProjectTeamPanel'
import {
  Text,
  Card,
  Button,
  StatusBadge,
  palette,
  spacing,
  radii,
} from '../../../ui'
import { AdminTextField, adminStyles } from '../adminScreenUtils'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyForm(companyId) {
  return {
    baslik: '',
    aciklama: '',
    kod: '',
    durum: 'planlama',
    oncelik: 'normal',
    baslangic_tarihi: todayIso(),
    bitis_tarihi: '',
    renk: PROJECT_COLOR_PRESETS[0],
    ana_sirket_id: companyId || '',
  }
}

function projectToForm(p) {
  return {
    baslik: p.baslik || '',
    aciklama: p.aciklama || '',
    kod: p.kod || '',
    durum: p.durum || 'planlama',
    oncelik: p.oncelik || 'normal',
    baslangic_tarihi: p.baslangic_tarihi?.slice?.(0, 10) || '',
    bitis_tarihi: p.bitis_tarihi?.slice?.(0, 10) || '',
    renk: p.renk || PROJECT_COLOR_PRESETS[0],
    ana_sirket_id: p.ana_sirket_id || '',
  }
}

function ChipSelect({ options, value, onChange }) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(o.value)}
            activeOpacity={0.85}
          >
            <Text
              variant="caption"
              weight="SemiBold"
              color={active ? palette.primary[700] : palette.slate[600]}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function FormSection({ title, hint, children }) {
  return (
    <Card tone="surface" elevated style={styles.sectionCard}>
      <Text variant="bodyMd" weight="Bold" color={palette.slate[800]}>
        {title}
      </Text>
      {hint ? (
        <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 2, marginBottom: spacing.sm }}>
          {hint}
        </Text>
      ) : (
        <View style={{ height: spacing.sm }} />
      )}
      {children}
    </Card>
  )
}

export default function ProjectEdit() {
  const navigation = useNavigation()
  const route = useRoute()
  const { theme } = useUiTheme()
  const rawId = route.params?.projectId
  const isNew = rawId === 'new' || !rawId
  const projectId = isNew ? null : rawId

  const { profile, personel, permissions, user } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin

  const scopeCtx = useMemo(
    () => ({
      isSystemAdmin,
      currentCompanyId: personel?.ana_sirket_id || null,
      accessibleUnitIds: personel?.accessibleUnitIds,
      isTopCompanyScope: personel?.isTopCompanyScope,
      fallbackBirimId: personel?.birim_id,
      userId: profile?.id,
    }),
    [isSystemAdmin, personel, profile?.id],
  )

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => emptyForm(personel?.ana_sirket_id))
  const [birimLabel, setBirimLabel] = useState('')
  const [canEdit, setCanEdit] = useState(isNew)

  const load = useCallback(async () => {
    if (isNew) {
      setForm(emptyForm(personel?.ana_sirket_id))
      setCanEdit(true)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [p, members] = await Promise.all([
        fetchProjectById(projectId, scopeCtx, { personelId: personel?.id, userId: profile?.id }),
        fetchProjectMembers(projectId),
      ])
      if (!p) {
        Alert.alert('Hata', 'Proje bulunamadı')
        navigation.goBack()
        return
      }
      const canManage = canManageProjectRecord({
        isSystemAdmin,
        permissions,
        personelId: personel?.id,
        userId: profile?.id,
        project: p,
        members,
      })
      if (!canManage) {
        Alert.alert('Yetki', 'Bu projeyi düzenleme yetkiniz yok.')
        navigation.goBack()
        return
      }
      setCanEdit(true)
      setForm(projectToForm(p))
      const unitName = p.birim_id ? await fetchProjectUnitLabel(p.birim_id) : ''
      setBirimLabel(unitName || '')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Yüklenemedi')
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }, [isNew, projectId, scopeCtx, navigation, personel?.id, profile?.id, permissions, isSystemAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.baslik?.trim()) {
      Alert.alert('Uyarı', 'Proje adı zorunludur')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const created = await createProject(
          {
            ...form,
            birim_id: resolveDefaultProjectBirimId(scopeCtx, personel),
          },
          {
            userId: user?.id || profile?.id,
            companyId: form.ana_sirket_id || personel?.ana_sirket_id,
            memberIds: [],
            creatorPersonelId: personel?.id,
          },
        )
        Alert.alert('Başarılı', 'Proje oluşturuldu')
        navigation.replace('ProjectShow', { projectId: created.id })
        return
      }
      const { ana_sirket_id: _omit, ...patchBody } = form
      await updateProject(projectId, patchBody)
      Alert.alert('Başarılı', 'Proje kaydedildi')
      navigation.navigate('ProjectShow', { projectId })
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    Alert.alert('Projeyi sil', 'Proje arşivlenecek. Emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await softDeleteProject(projectId)
            Alert.alert('Başarılı', 'Proje silindi')
            navigation.navigate('ProjectsList')
          } catch (e) {
            Alert.alert('Hata', e?.message || 'Silinemedi')
          }
        },
      },
    ])
  }

  const screenTitle = isNew ? 'Yeni proje' : 'Projeyi düzenle'
  const accent = form.renk || palette.primary[600]
  const statusOpt = PROJECT_STATUS_OPTIONS.find((o) => o.value === form.durum)

  if (loading) {
    return (
      <AdminScreenLayout title={screenTitle}>
        <ActivityIndicator size="large" color={palette.primary[500]} style={{ marginTop: 40 }} />
      </AdminScreenLayout>
    )
  }

  return (
    <AdminScreenLayout title={screenTitle} scroll={false} padded={false}>
      <View style={{ flex: 1, backgroundColor: theme.pageBg }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!isNew && form.baslik ? (
            <View style={[styles.previewStrip, { backgroundColor: `${accent}12`, borderColor: `${accent}33` }]}>
              <View style={[styles.previewDot, { backgroundColor: accent }]} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMd" weight="Bold" color={palette.slate[900]} numberOfLines={1}>
                  {form.baslik}
                </Text>
                {statusOpt ? (
                  <StatusBadge tone={statusOpt.tone} size="sm" style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                    {statusOpt.label}
                  </StatusBadge>
                ) : null}
              </View>
            </View>
          ) : null}

          <FormSection title="Temel bilgiler" hint="Proje adı, kod ve tarihler">
            <AdminTextField label="Proje adı *" value={form.baslik} onChangeText={(v) => patch('baslik', v)} />
            <AdminTextField label="Kod" value={form.kod} onChangeText={(v) => patch('kod', v)} placeholder="PRJ-001" />
            <AdminTextField
              label="Açıklama"
              value={form.aciklama}
              onChangeText={(v) => patch('aciklama', v)}
              multiline
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <AdminTextField
                  label="Başlangıç"
                  value={form.baslangic_tarihi}
                  onChangeText={(v) => patch('baslangic_tarihi', v)}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={{ flex: 1 }}>
                <AdminTextField
                  label="Bitiş"
                  value={form.bitis_tarihi}
                  onChangeText={(v) => patch('bitis_tarihi', v)}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>
            {birimLabel ? (
              <Text variant="caption" color={palette.slate[500]} style={{ marginBottom: spacing.sm }}>
                Birim: {birimLabel}
              </Text>
            ) : null}
          </FormSection>

          <FormSection title="Durum ve öncelik">
            <Text variant="caption" weight="SemiBold" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
              Durum
            </Text>
            <ChipSelect
              options={PROJECT_STATUS_OPTIONS}
              value={form.durum}
              onChange={(v) => patch('durum', v)}
            />
            <Text variant="caption" weight="SemiBold" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
              Öncelik
            </Text>
            <ChipSelect
              options={PROJECT_PRIORITY_OPTIONS}
              value={form.oncelik}
              onChange={(v) => patch('oncelik', v)}
            />
          </FormSection>

          <FormSection title="Proje rengi" hint="Liste ve detay ekranında vurgu rengi">
            <View style={styles.colorRow}>
              {PROJECT_COLOR_PRESETS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => patch('renk', c)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    form.renk === c && styles.colorSwatchActive,
                  ]}
                />
              ))}
            </View>
          </FormSection>

          {!isNew && canEdit ? (
            <View style={styles.teamSection}>
              <Text variant="bodyMd" weight="Bold" color={palette.slate[800]}>
                Proje ekibi
              </Text>
              <Text variant="caption" color={palette.slate[500]} style={styles.teamHint}>
                Görev atamasında yalnızca ekip üyeleri seçilebilir. Çok kişi eklemek için «Ekip seç»
                kullanın.
              </Text>
              <ProjectTeamPanel projectId={projectId} scopeCtx={scopeCtx} />
            </View>
          ) : null}

          {!isNew ? (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.85}>
              <Trash2 size={18} color={palette.danger[600]} strokeWidth={2} />
              <Text variant="bodySm" weight="SemiBold" color={palette.danger[600]}>
                Projeyi sil
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.cardBg, borderTopColor: theme.border }]}>
          <Button variant="primary" size="md" fullWidth loading={saving} disabled={!canEdit} onPress={handleSave}>
            {isNew ? 'Oluştur' : 'Kaydet'}
          </Button>
        </View>
      </View>
    </AdminScreenLayout>
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  previewStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sectionCard: {
    padding: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.slate[200],
    backgroundColor: palette.slate[50],
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: palette.primary[50],
    borderColor: palette.primary[200],
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: palette.slate[800],
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  teamSection: {
    gap: spacing.sm,
  },
  teamHint: {
    lineHeight: 18,
  },
})
