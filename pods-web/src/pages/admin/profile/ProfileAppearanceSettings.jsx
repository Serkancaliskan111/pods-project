import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  LayoutGrid,
  Maximize2,
  Palette,
  PanelLeft,
  RotateCcw,
  Sparkles,
  Type,
  Wallpaper,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { cn } from '../../../lib/cn'
import {
  ACCENT_COLOR_PRESETS,
  CORNER_OPTIONS,
  DEFAULT_UI_PREFS,
  DENSITY_OPTIONS,
  FONT_SCALE_OPTIONS,
  PAGE_BG_PRESETS,
  SIDEBAR_COLOR_PRESETS,
  applyDocumentUiTheme,
  normalizeHexColor,
  parseUiPreferences,
  resolveUiCssVars,
  saveUserUiPreferences,
  uiPreferencesEqual,
} from '../../../lib/userUiPreferences'
import { Button, Card, Chip, Section, Text } from '../../../ui'

const supabase = getSupabase()

const SECTION_KEYS = ['menu', 'accent', 'pageBg', 'layout']

function presetLabel(presets, color) {
  const hit = presets.find((p) => p.color.toUpperCase() === String(color || '').toUpperCase())
  return hit?.label || null
}

function isPresetColor(presets, color) {
  return presets.some((p) => p.color.toUpperCase() === String(color || '').toUpperCase())
}

function AppearancePreview({ vars }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      role="img"
      aria-label="Seçili renklerin küçük önizlemesi"
    >
      <div className="grid grid-cols-3 border-b border-slate-100 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="py-1.5">Menü</span>
        <span className="border-x border-slate-100 py-1.5">Sayfa</span>
        <span className="py-1.5">Düğme</span>
      </div>
      <div className="grid grid-cols-3">
        <div className="h-12" style={{ background: vars['--cubicle-sidebar-bg'] }} />
        <div className="h-12 border-x border-slate-100" style={{ background: vars['--cubicle-page-bg'] }} />
        <div
          className="flex h-12 items-center justify-center"
          style={{ background: vars['--cubicle-page-bg'] }}
        >
          <span
            className="rounded-full px-2.5 py-1 text-[9px] font-bold text-white"
            style={{
              background: vars['--pods-accent-500'],
              borderRadius: vars['--pods-radius-button'],
            }}
          >
            Kaydet
          </span>
        </div>
      </div>
    </div>
  )
}

function AppearanceAccordion({ icon: Icon, title, summary, open, onToggle, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/80"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-primary-700">
          <Icon size={17} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Text variant="body" className="!font-bold text-slate-900">
            {title}
          </Text>
          {!open && summary ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">{summary}</div>
          ) : null}
        </div>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-slate-100 px-4 pb-4 pt-3">{children}</div> : null}
    </div>
  )
}

function SummarySwatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
      <span
        className="h-5 w-5 shrink-0 rounded-full border border-white shadow-sm ring-1 ring-slate-200/80"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  )
}

function PresetSwatches({ presets, value, onSelect }) {
  const isCustom = !isPresetColor(presets, value)
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const selected = value.toUpperCase() === preset.color.toUpperCase()
        return (
          <button
            key={preset.id}
            type="button"
            title={preset.label}
            onClick={() => onSelect(preset.color)}
            className={cn(
              'h-9 w-9 rounded-lg border-2 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1',
              selected ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white shadow-md',
            )}
            style={{ backgroundColor: preset.color }}
            aria-label={preset.label}
            aria-pressed={selected}
          />
        )
      })}
      {isCustom ? (
        <span
          className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border-2 border-dashed border-slate-400 px-1 text-[9px] font-bold text-slate-600 ring-2 ring-slate-300"
          style={{ backgroundColor: value }}
          title="Özel renk"
        >
          Özel
        </span>
      ) : null}
    </div>
  )
}

function CustomColorField({ value, hexInput, onPick, onHexInput }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <Text variant="caption" className="shrink-0 font-medium text-slate-500">
        Renk kodu
      </Text>
      <input
        type="color"
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
        aria-label="Renk seçici"
      />
      <input
        type="text"
        value={hexInput}
        onChange={(e) => onHexInput(e.target.value)}
        className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        spellCheck={false}
        placeholder="#000000"
      />
    </div>
  )
}

function ColorSection({ presets, value, hexInput, onSelect, onHexInput, hint, showCustom, onShowCustom }) {
  return (
    <>
      <Text variant="caption" className="mb-3 block text-slate-500">
        {hint}
      </Text>
      <PresetSwatches presets={presets} value={value} onSelect={onSelect} />
      {showCustom ? (
        <CustomColorField
          value={value}
          hexInput={hexInput}
          onPick={onSelect}
          onHexInput={onHexInput}
        />
      ) : (
        <button
          type="button"
          className="mt-3 text-xs font-semibold text-primary-600 hover:underline"
          onClick={onShowCustom}
        >
          Özel renk kodu gir…
        </button>
      )}
    </>
  )
}

export default function ProfileAppearanceSettings({ userId, initialPrefs, onSaved, embedded = false }) {
  const saved = useMemo(() => parseUiPreferences(initialPrefs), [initialPrefs])
  const [draft, setDraft] = useState(saved)
  const [sidebarHex, setSidebarHex] = useState(saved.sidebarBg)
  const [accentHex, setAccentHex] = useState(saved.accentColor)
  const [saving, setSaving] = useState(false)
  const [menuCustomOpen, setMenuCustomOpen] = useState(
    () => !isPresetColor(SIDEBAR_COLOR_PRESETS, saved.sidebarBg),
  )
  const [accentCustomOpen, setAccentCustomOpen] = useState(
    () => !isPresetColor(ACCENT_COLOR_PRESETS, saved.accentColor),
  )
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(SECTION_KEYS.map((k, i) => [k, i === 0])),
  )

  useEffect(() => {
    setDraft(saved)
    setSidebarHex(saved.sidebarBg)
    setAccentHex(saved.accentColor)
    setMenuCustomOpen(!isPresetColor(SIDEBAR_COLOR_PRESETS, saved.sidebarBg))
    setAccentCustomOpen(!isPresetColor(ACCENT_COLOR_PRESETS, saved.accentColor))
  }, [saved])

  useEffect(() => {
    applyDocumentUiTheme(draft)
    return () => applyDocumentUiTheme(saved)
  }, [draft, saved])

  const dirty = !uiPreferencesEqual(draft, saved)
  const previewVars = useMemo(() => resolveUiCssVars(draft), [draft])

  const patch = (partial) => setDraft((prev) => parseUiPreferences({ ...prev, ...partial }))

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const pickSidebar = (hex) => {
    const n = normalizeHexColor(hex)
    if (!n) return
    patch({ sidebarBg: n })
    setSidebarHex(n)
    setMenuCustomOpen(!isPresetColor(SIDEBAR_COLOR_PRESETS, n))
  }

  const pickAccent = (hex) => {
    const n = normalizeHexColor(hex)
    if (!n) return
    patch({ accentColor: n })
    setAccentHex(n)
    setAccentCustomOpen(!isPresetColor(ACCENT_COLOR_PRESETS, n))
  }

  const save = async () => {
    if (!userId) return
    setSaving(true)
    try {
      const next = await saveUserUiPreferences(supabase, userId, draft)
      await onSaved?.()
      setDraft(next)
      setSidebarHex(next.sidebarBg)
      setAccentHex(next.accentColor)
      toast.success('Görünüm tercihleri kaydedildi')
    } catch (e) {
      console.error(e)
      applyDocumentUiTheme(saved)
      setDraft(saved)
      toast.error(e?.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    const d = { ...DEFAULT_UI_PREFS }
    setDraft(d)
    setSidebarHex(d.sidebarBg)
    setAccentHex(d.accentColor)
    setMenuCustomOpen(false)
    setAccentCustomOpen(false)
  }

  const settingsCard = (
      <Card padding={embedded ? 'md' : 'lg'} radius="2xl" className={embedded ? 'border-slate-200 shadow-sm' : undefined}>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Text variant="body" className="font-semibold text-slate-900">
              Canlı önizleme
            </Text>
            <Text variant="caption" className="mt-1 block text-slate-500">
              Bölümleri açıp seçim yapın; panel anında güncellenir. Kaydetmeden önce tüm sayfada
              da deneyebilirsiniz.
            </Text>
            {dirty ? (
              <Text variant="caption" className="mt-2 block font-medium text-amber-700">
                Kaydedilmemiş değişiklikler var.
              </Text>
            ) : (
              <Text variant="caption" className="mt-2 block text-slate-400">
                Tüm ayarlar kayıtlı.
              </Text>
            )}
          </div>
          <div className="w-full shrink-0 sm:w-[220px]">
            <AppearancePreview vars={previewVars} />
          </div>
        </div>

        <div className="space-y-2">
          <AppearanceAccordion
            icon={PanelLeft}
            title="Sol menü rengi"
            summary={
              <SummarySwatch
                color={draft.sidebarBg}
                label={presetLabel(SIDEBAR_COLOR_PRESETS, draft.sidebarBg) || 'Özel'}
              />
            }
            open={openSections.menu}
            onToggle={() => toggleSection('menu')}
          >
            <ColorSection
              presets={SIDEBAR_COLOR_PRESETS}
              value={draft.sidebarBg}
              hexInput={sidebarHex}
              onSelect={pickSidebar}
              onHexInput={(v) => {
                setSidebarHex(v)
                const n = normalizeHexColor(v)
                if (n) patch({ sidebarBg: n })
              }}
              hint="Kenar çubuğunun arka plan rengi."
              showCustom={menuCustomOpen}
              onShowCustom={() => setMenuCustomOpen(true)}
            />
          </AppearanceAccordion>

          <AppearanceAccordion
            icon={Zap}
            title="Vurgu rengi (düğmeler)"
            summary={
              <SummarySwatch
                color={draft.accentColor}
                label={presetLabel(ACCENT_COLOR_PRESETS, draft.accentColor) || 'Özel'}
              />
            }
            open={openSections.accent}
            onToggle={() => toggleSection('accent')}
          >
            <ColorSection
              presets={ACCENT_COLOR_PRESETS}
              value={draft.accentColor}
              hexInput={accentHex}
              onSelect={pickAccent}
              onHexInput={(v) => {
                setAccentHex(v)
                const n = normalizeHexColor(v)
                if (n) patch({ accentColor: n })
              }}
              hint="Kaydet, onayla gibi aksiyon düğmelerinin rengi."
              showCustom={accentCustomOpen}
              onShowCustom={() => setAccentCustomOpen(true)}
            />
          </AppearanceAccordion>

          <AppearanceAccordion
            icon={Wallpaper}
            title="Sayfa arka planı"
            summary={
              <SummarySwatch
                color={draft.pageBg}
                label={presetLabel(PAGE_BG_PRESETS, draft.pageBg) || 'Özel ton'}
              />
            }
            open={openSections.pageBg}
            onToggle={() => toggleSection('pageBg')}
          >
            <Text variant="caption" className="mb-3 block text-slate-500">
              Liste ve detay sayfalarının arka plan tonu.
            </Text>
            <PresetSwatches
              presets={PAGE_BG_PRESETS}
              value={draft.pageBg}
              onSelect={(c) => patch({ pageBg: c })}
            />
          </AppearanceAccordion>

          <AppearanceAccordion
            icon={LayoutGrid}
            title="Düzen ve okunabilirlik"
            summary={layoutSummaryChips(draft)}
            open={openSections.layout}
            onToggle={() => toggleSection('layout')}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <LayoutOptionGroup
                icon={Maximize2}
                label="Yoğunluk"
                hint="Kompakt: daha dar boşluklar."
                options={DENSITY_OPTIONS}
                value={draft.density}
                onChange={(id) => patch({ density: id })}
              />
              <LayoutOptionGroup
                icon={Type}
                label="Yazı boyutu"
                options={FONT_SCALE_OPTIONS}
                value={draft.fontScale}
                onChange={(id) => patch({ fontScale: id })}
              />
              <LayoutOptionGroup
                icon={Sparkles}
                label="Köşe stili"
                options={CORNER_OPTIONS}
                value={draft.cornerStyle}
                onChange={(id) => patch({ cornerStyle: id })}
              />
            </div>
          </AppearanceAccordion>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
            Tercihleri kaydet
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<RotateCcw size={14} />}
            disabled={saving}
            onClick={reset}
          >
            Varsayılana dön
          </Button>
        </div>
      </Card>
  )

  if (embedded) {
    return settingsCard
  }

  return (
    <Section
      title="Görünüm ve düzen"
      subtitle="Panel renkleri ve düzen tercihleri yalnızca sizin hesabınızda geçerlidir."
      icon={<Palette size={20} />}
      tone="primary"
    >
      {settingsCard}
    </Section>
  )
}

function layoutSummaryChips(draft) {
  return (
    <>
      <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
        {DENSITY_OPTIONS.find((o) => o.id === draft.density)?.label}
      </span>
      <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
        {FONT_SCALE_OPTIONS.find((o) => o.id === draft.fontScale)?.label}
      </span>
      <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
        {CORNER_OPTIONS.find((o) => o.id === draft.cornerStyle)?.label}
      </span>
    </>
  )
}

function LayoutOptionGroup({ icon: Icon, label, hint, options, value, onChange }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-slate-600">
        <Icon size={14} aria-hidden />
        <Text variant="caption" className="!font-semibold">
          {label}
        </Text>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)}>
            {opt.label}
          </Chip>
        ))}
      </div>
      {hint ? (
        <Text variant="caption" className="mt-1.5 block text-slate-400">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}
