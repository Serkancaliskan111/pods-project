import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useUiTheme } from '../contexts/UiThemeContext'
import { View, TouchableOpacity, Alert, ScrollView } from 'react-native'
import getSupabase from '../lib/supabaseClient'
import {
  ACCENT_COLOR_PRESETS,
  CORNER_OPTIONS,
  DEFAULT_UI_PREFS,
  DENSITY_OPTIONS,
  FONT_SCALE_OPTIONS,
  PAGE_BG_PRESETS,
  parseUiPreferences,
  saveUserUiPreferences,
  uiPreferencesEqual,
} from '../lib/userUiPreferences'
import { Text, Button, Section, palette, spacing, radii } from '../ui'

const supabase = getSupabase()

function prefsFingerprint(raw) {
  const p = parseUiPreferences(raw)
  return `${p.sidebarBg}|${p.accentColor}|${p.pageBg}|${p.density}|${p.fontScale}|${p.cornerStyle}`
}

function ColorSwatch({ color, selected, onPress, label }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', marginRight: spacing.sm, marginBottom: spacing.sm }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: color,
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? palette.primary[700] : palette.slate[200],
        }}
      />
      <Text variant="caption" color={palette.slate[500]} style={{ marginTop: 4, maxWidth: 56 }} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export default function ProfileAppearanceSettings({ userId, initialPrefs }) {
  const { refreshTheme } = useUiTheme()
  const initialPrefsKey = prefsFingerprint(initialPrefs)
  const initial = useMemo(() => parseUiPreferences(initialPrefs), [initialPrefsKey])
  const savedRef = useRef(initial)
  const dirtyRef = useRef(false)
  const [savedSnapshot, setSavedSnapshot] = useState(initial)
  const [prefs, setPrefs] = useState(initial)
  const [saving, setSaving] = useState(false)

  const dirty = !uiPreferencesEqual(prefs, savedSnapshot)
  dirtyRef.current = dirty

  useEffect(() => {
    if (dirtyRef.current) return
    if (uiPreferencesEqual(savedRef.current, initial)) return
    savedRef.current = initial
    setSavedSnapshot(initial)
    setPrefs(initial)
  }, [initial])

  useEffect(() => {
    return () => {
      void refreshTheme(savedRef.current)
    }
  }, [refreshTheme])

  const previewPrefs = (next) => {
    const normalized = parseUiPreferences(next)
    setPrefs(normalized)
    void refreshTheme(normalized)
  }

  const onSave = async () => {
    if (!userId || !dirty) return
    setSaving(true)
    try {
      const saved = await saveUserUiPreferences(supabase, userId, prefs)
      savedRef.current = saved
      setSavedSnapshot(saved)
      setPrefs(saved)
      await refreshTheme(saved)
      Alert.alert('Kaydedildi', 'Görünüm tercihleri güncellendi.')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi')
      previewPrefs(savedSnapshot)
    } finally {
      setSaving(false)
    }
  }

  const revertChanges = () => {
    previewPrefs(savedSnapshot)
  }

  const resetToDefaults = () => {
    previewPrefs(DEFAULT_UI_PREFS)
  }

  return (
    <Section title="Görünüm ve tema">
      <Text variant="bodySm" color={palette.slate[500]} style={{ marginBottom: spacing.md }}>
        Web paneli ile aynı renk ve düzen tercihleri hesabınıza kaydedilir.
      </Text>

      {dirty ? (
        <Text variant="caption" weight="SemiBold" color={palette.warning[700]} style={{ marginBottom: spacing.sm }}>
          Kaydedilmemiş değişiklikler var.
        </Text>
      ) : null}

      <Text variant="overline" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
        Vurgu rengi
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        {ACCENT_COLOR_PRESETS.map((p) => (
          <ColorSwatch
            key={p.id}
            color={p.color}
            label={p.label}
            selected={prefs.accentColor === p.color}
            onPress={() => previewPrefs({ ...prefs, accentColor: p.color })}
          />
        ))}
      </ScrollView>

      <Text variant="overline" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
        Sayfa arka planı
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        {PAGE_BG_PRESETS.map((p) => (
          <ColorSwatch
            key={p.id}
            color={p.color}
            label={p.label}
            selected={prefs.pageBg === p.color}
            onPress={() => previewPrefs({ ...prefs, pageBg: p.color })}
          />
        ))}
      </ScrollView>

      <Text variant="overline" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
        Yoğunluk
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        {DENSITY_OPTIONS.map((o) => (
          <Button
            key={o.id}
            variant={prefs.density === o.id ? 'primary' : 'outline'}
            size="sm"
            onPress={() => previewPrefs({ ...prefs, density: o.id })}
          >
            {o.label}
          </Button>
        ))}
      </View>

      <Text variant="overline" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
        Yazı boyutu
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        {FONT_SCALE_OPTIONS.map((o) => (
          <Button
            key={o.id}
            variant={prefs.fontScale === o.id ? 'primary' : 'outline'}
            size="sm"
            onPress={() => previewPrefs({ ...prefs, fontScale: o.id })}
          >
            {o.label}
          </Button>
        ))}
      </View>

      <Text variant="overline" color={palette.slate[600]} style={{ marginBottom: spacing.xs }}>
        Köşe stili
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        {CORNER_OPTIONS.map((o) => (
          <Button
            key={o.id}
            variant={prefs.cornerStyle === o.id ? 'primary' : 'outline'}
            size="sm"
            onPress={() => previewPrefs({ ...prefs, cornerStyle: o.id })}
          >
            {o.label}
          </Button>
        ))}
      </View>

      <View
        style={{
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: palette.slate[200],
          overflow: 'hidden',
          marginBottom: spacing.md,
        }}
      >
        <View style={{ height: 48, backgroundColor: prefs.pageBg }} />
        <View style={{ padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              backgroundColor: prefs.accentColor,
              borderRadius: prefs.cornerStyle === 'sharp' ? 8 : 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text variant="caption" weight="Bold" color={palette.surface}>
              Önizleme
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <Button variant="outline" size="md" onPress={revertChanges} disabled={!dirty || saving} style={{ flex: 1 }}>
          Vazgeç
        </Button>
        <Button variant="outline" size="md" onPress={resetToDefaults} disabled={saving} style={{ flex: 1 }}>
          Varsayılana dön
        </Button>
      </View>
      <Button variant="primary" size="md" onPress={onSave} disabled={!dirty || saving} fullWidth>
        {saving ? 'Kaydediliyor…' : 'Kaydet'}
      </Button>
    </Section>
  )
}
