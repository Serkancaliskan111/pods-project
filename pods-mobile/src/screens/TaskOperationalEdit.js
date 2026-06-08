import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  FlatList,
  Switch,
  Alert,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import DateTimePicker from '@react-native-community/datetimepicker'
import getSupabase from '../lib/supabaseClient'
import { formatTaskTitleCase } from '../lib/formatTaskTitle'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import { taskOperationalEditEligible } from '../lib/taskStatus'
import { canOperationallyEditAssignedTask } from '../lib/taskPermissions'
import { palette as kitPalette, spacing as kitSpacing } from '../ui/tokens'
import { Icon } from '../ui'
import {
  GOREV_TURU,
  isZincirGorevTuru,
  isZincirOnayTuru,
  zincirGorevStepsReorderEligible,
  zincirOnayStepsReorderEligible,
} from '../lib/zincirTasks'
import { canMarkBirebirGorev } from '../lib/managementScope'

const ThemeObj = Theme?.default ?? Theme
const { Colors, Typography, Radii, Spacing } = ThemeObj

const supabase = getSupabase()

function toIso(d) {
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function parseIso(s) {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function combineDateAndTime(datePart, timePart) {
  const out = new Date(datePart)
  out.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0)
  return out
}

function personLabel(p) {
  if (!p) return ''
  const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
  return n || p.email || String(p.id)
}

export default function TaskOperationalEdit() {
  const navigation = useNavigation()
  const route = useRoute()
  const taskId = route.params?.taskId
  const { personel, permissions, profile } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = personel?.ana_sirket_id
  const accessibleUnitIds = Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []

  const mayEdit = isSystemAdmin || canOperationallyEditAssignedTask(permissions, false)
  const mayMarkBirebirGorev = useMemo(
    () => canMarkBirebirGorev(permissions, isSystemAdmin),
    [permissions, isSystemAdmin],
  )

  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState(null)
  const [blockedReason, setBlockedReason] = useState(null)
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [listModal, setListModal] = useState(null)
  const [datePick, setDatePick] = useState(null)
  const [androidDateStep, setAndroidDateStep] = useState(null)
  const [androidTempDate, setAndroidTempDate] = useState(null)

  const [form, setForm] = useState({
    baslik: '',
    aciklama: '',
    birim_id: '',
    sorumlu_personel_id: '',
    baslama_tarihi: '',
    son_tarih: '',
    puan: '',
    foto_zorunlu: false,
    min_foto_sayisi: 0,
    video_zorunlu: false,
    min_video_sayisi: 0,
    max_video_suresi_sn: 60,
    aciklama_zorunlu: false,
    ozel_gorev: false,
  })

  const baselineRef = useRef(null)
  const chainBaselineRef = useRef({ gorev: [], onay: [] })

  const [loadedGorevSteps, setLoadedGorevSteps] = useState([])
  const [loadedOnaySteps, setLoadedOnaySteps] = useState([])
  const [gorevOrderIds, setGorevOrderIds] = useState([])
  const [onayOrderIds, setOnayOrderIds] = useState([])

  const gorevReorderAllowed = useMemo(
    () => zincirGorevStepsReorderEligible(loadedGorevSteps),
    [loadedGorevSteps],
  )
  const onayReorderAllowed = useMemo(
    () => zincirOnayStepsReorderEligible(loadedOnaySteps),
    [loadedOnaySteps],
  )

  const strictNormalTask = useMemo(() => {
    const t = String(task?.gorev_turu || '').trim()
    return !t || t === GOREV_TURU.NORMAL
  }, [task?.gorev_turu])

  const chainWorkRestricted = useMemo(() => isZincirGorevTuru(task?.gorev_turu), [task?.gorev_turu])

  const canEditBirimField = strictNormalTask || isZincirOnayTuru(task?.gorev_turu)
  const canEditAssigneeField =
    strictNormalTask || isZincirOnayTuru(task?.gorev_turu) || chainWorkRestricted

  const loadLists = useCallback(
    async (companyId) => {
      if (!companyId) return
      let uq = supabase
        .from('birimler')
        .select('id,birim_adi')
        .eq('ana_sirket_id', companyId)
        .is('silindi_at', null)
      let pq = supabase
        .from('personeller')
        .select('id,ad,soyad,email,birim_id')
        .eq('ana_sirket_id', companyId)
        .is('silindi_at', null)
      if (accessibleUnitIds.length > 0) {
        uq = uq.in('id', accessibleUnitIds)
        pq = pq.in('birim_id', accessibleUnitIds)
      }
      const [{ data: u }, { data: s }] = await Promise.all([
        uq.order('birim_adi', { ascending: true }),
        pq.order('ad', { ascending: true }),
      ])
      setUnits(Array.isArray(u) ? u : [])
      setStaff(Array.isArray(s) ? s : [])
    },
    [accessibleUnitIds],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!mayEdit || !taskId || !currentCompanyId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setBlockedReason(null)
      setLoadedGorevSteps([])
      setLoadedOnaySteps([])
      setGorevOrderIds([])
      setOnayOrderIds([])
      chainBaselineRef.current = { gorev: [], onay: [] }
      try {
        const { data: job, error } = await supabase.from('isler').select('*').eq('id', taskId).maybeSingle()
        if (cancelled) return
        if (error || !job) {
          Alert.alert('Hata', 'Görev yüklenemedi')
          navigation.goBack()
          return
        }
        if (String(job.ana_sirket_id || '') !== String(currentCompanyId || '')) {
          Alert.alert('Yetki', 'Bu görev için düzenleme yapamazsınız')
          navigation.goBack()
          return
        }
        if (
          accessibleUnitIds.length > 0 &&
          job.birim_id &&
          !accessibleUnitIds.some((x) => String(x) === String(job.birim_id))
        ) {
          Alert.alert('Yetki', 'Bu görev için düzenleme yapamazsınız')
          navigation.goBack()
          return
        }

        const { data: pend } = await supabase
          .from('isler_silme_talepleri')
          .select('id')
          .eq('is_id', job.id)
          .eq('durum', 'bekliyor')
          .maybeSingle()

        if (pend?.id) {
          setBlockedReason('Bu görev için bekleyen silme talebi var; düzenlenemez.')
        } else if (!taskOperationalEditEligible(job)) {
          setBlockedReason(
            'Bu görev onay bekliyor, onaylı, reddedilmiş veya tekrar gönderilmiş; operasyonel düzenlenemez.',
          )
        }

        setTask(job)
        await loadLists(job.ana_sirket_id)

        let gorevRows = []
        let onayRows = []
        if (isZincirGorevTuru(job.gorev_turu)) {
          const { data: zr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select(
              'id,adim_no,personel_id,durum,kanit_resim_ler,tamamlandi_at',
            )
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          gorevRows = Array.isArray(zr) ? zr : []
        }
        if (isZincirOnayTuru(job.gorev_turu)) {
          const { data: orows } = await supabase
            .from('isler_zincir_onay_adimlari')
            .select('id,adim_no,onaylayici_personel_id,durum,onaylandi_at')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          onayRows = Array.isArray(orows) ? orows : []
        }

        if (cancelled) return

        setLoadedGorevSteps(gorevRows)
        setLoadedOnaySteps(onayRows)
        const gid = gorevRows.map((r) => String(r.personel_id))
        const oid = onayRows.map((r) => String(r.onaylayici_personel_id))
        chainBaselineRef.current = { gorev: gid.slice(), onay: oid.slice() }
        setGorevOrderIds(gid)
        setOnayOrderIds(oid)

        const rowFoto = !!job.foto_zorunlu
        let rowVideo = !!job.video_zorunlu
        if (rowFoto && rowVideo) rowVideo = false
        const baseline = {
          baslik: job.baslik || '',
          aciklama: job.aciklama ?? '',
          birim_id: job.birim_id ?? '',
          sorumlu_personel_id: job.sorumlu_personel_id ?? '',
          baslama_tarihi: job.baslama_tarihi || null,
          son_tarih: job.son_tarih || null,
          puan: job.puan != null ? Number(job.puan) : null,
          foto_zorunlu: rowFoto,
          min_foto_sayisi: Number(job.min_foto_sayisi || 0),
          video_zorunlu: rowVideo,
          min_video_sayisi: rowVideo ? Number(job.min_video_sayisi || 0) : 0,
          max_video_suresi_sn: Math.min(
            60,
            Math.max(5, Number(job.max_video_suresi_sn) || 60),
          ),
          aciklama_zorunlu: !!job.aciklama_zorunlu,
          ozel_gorev: !!job.ozel_gorev,
        }
        baselineRef.current = baseline

        setForm({
          baslik: baseline.baslik,
          aciklama: baseline.aciklama == null ? '' : String(baseline.aciklama),
          birim_id: baseline.birim_id ? String(baseline.birim_id) : '',
          sorumlu_personel_id: baseline.sorumlu_personel_id ? String(baseline.sorumlu_personel_id) : '',
          baslama_tarihi: baseline.baslama_tarihi || '',
          son_tarih: baseline.son_tarih || '',
          puan: baseline.puan != null && Number.isFinite(baseline.puan) ? String(baseline.puan) : '',
          foto_zorunlu: baseline.foto_zorunlu,
          min_foto_sayisi: baseline.min_foto_sayisi,
          video_zorunlu: baseline.video_zorunlu,
          min_video_sayisi: baseline.min_video_sayisi,
          max_video_suresi_sn: baseline.max_video_suresi_sn,
          aciklama_zorunlu: baseline.aciklama_zorunlu,
          ozel_gorev: baseline.ozel_gorev,
        })
      } catch (e) {
        if (!cancelled) Alert.alert('Hata', e?.message || 'Yükleme başarısız')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mayEdit, taskId, currentCompanyId, navigation, loadLists, accessibleUnitIds])

  const fieldDisabled = !!blockedReason || !task

  const staffNotInGorevChain = useMemo(
    () => staff.filter((p) => !gorevOrderIds.some((x) => String(x) === String(p.id))),
    [staff, gorevOrderIds],
  )
  const staffNotInOnayChain = useMemo(
    () => staff.filter((p) => !onayOrderIds.some((x) => String(x) === String(p.id))),
    [staff, onayOrderIds],
  )

  const moveGorevStep = (idx, delta) => {
    setGorevOrderIds((prev) => {
      const j = idx + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[idx]
      next[idx] = next[j]
      next[j] = t
      if (chainWorkRestricted && next.length) {
        setForm((f) => ({ ...f, sorumlu_personel_id: String(next[0]) }))
      }
      return next
    })
  }

  const moveOnayStep = (idx, delta) => {
    setOnayOrderIds((prev) => {
      const j = idx + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[idx]
      next[idx] = next[j]
      next[j] = t
      const k = Number(task?.zincir_onay_aktif_adim) || 0
      if (k >= 1 && next[k - 1]) {
        setForm((f) => ({ ...f, sorumlu_personel_id: String(next[k - 1]) }))
      }
      return next
    })
  }

  const submit = async () => {
    if (!task?.id || fieldDisabled || submitting) return
    const b = baselineRef.current
    if (!b) return

    const patch = {}
    if (form.baslik.trim() !== (b.baslik || '').trim()) patch.baslik = form.baslik.trim()

    const nextAciklama = form.aciklama.trim()
    const baseAciklama = b.aciklama == null || b.aciklama === '' ? '' : String(b.aciklama).trim()
    if (nextAciklama !== baseAciklama) {
      patch.aciklama = nextAciklama === '' ? null : nextAciklama
    }

    if (canEditBirimField) {
      const nextBirim = form.birim_id.trim() || null
      const baseBirim = b.birim_id ? String(b.birim_id) : ''
      if ((nextBirim || '') !== baseBirim) patch.birim_id = nextBirim
    }

    if (canEditAssigneeField) {
      const nextWorker = form.sorumlu_personel_id.trim() || null
      const baseWorker = b.sorumlu_personel_id ? String(b.sorumlu_personel_id) : ''
      if ((nextWorker || '') !== baseWorker) {
        if (!nextWorker) {
          Alert.alert('Eksik', 'Sorumlu personel seçin')
          return
        }
        patch.sorumlu_personel_id = nextWorker
      }
    }

    const nb = form.baslama_tarihi ? form.baslama_tarihi : null
    const sb = b.baslama_tarihi || null
    if (nb !== sb) patch.baslama_tarihi = nb

    const ns = form.son_tarih ? form.son_tarih : null
    const ss = b.son_tarih || null
    if (ns !== ss) patch.son_tarih = ns

    const pNum = form.puan === '' || form.puan == null ? null : Number(form.puan)
    const baseP = b.puan
    if (
      (pNum == null && baseP != null) ||
      (pNum != null && baseP == null) ||
      (pNum != null && baseP != null && Number(pNum) !== Number(baseP))
    ) {
      patch.puan = pNum
    }

    if (!!form.foto_zorunlu !== !!b.foto_zorunlu) patch.foto_zorunlu = !!form.foto_zorunlu

    const minF = Math.max(0, Math.min(99, Number(form.min_foto_sayisi) || 0))
    if (minF !== Number(b.min_foto_sayisi || 0)) patch.min_foto_sayisi = minF

    if (!!form.video_zorunlu !== !!b.video_zorunlu) patch.video_zorunlu = !!form.video_zorunlu
    const minV = Math.max(0, Math.min(3, Number(form.min_video_sayisi) || 0))
    if (minV !== Number(b.min_video_sayisi || 0)) patch.min_video_sayisi = minV
    const maxSn = Math.min(60, Math.max(5, Number(form.max_video_suresi_sn) || 60))
    if (maxSn !== Number(b.max_video_suresi_sn || 60)) patch.max_video_suresi_sn = maxSn

    if (!!form.aciklama_zorunlu !== !!b.aciklama_zorunlu) patch.aciklama_zorunlu = !!form.aciklama_zorunlu

    if (strictNormalTask && !!form.ozel_gorev !== !!b.ozel_gorev) patch.ozel_gorev = !!form.ozel_gorev

    const baseChain = chainBaselineRef.current || { gorev: [], onay: [] }
    const gChainChanged =
      isZincirGorevTuru(task.gorev_turu) &&
      gorevReorderAllowed &&
      JSON.stringify(gorevOrderIds) !== JSON.stringify(baseChain.gorev)
    const oChainChanged =
      isZincirOnayTuru(task.gorev_turu) &&
      onayReorderAllowed &&
      JSON.stringify(onayOrderIds) !== JSON.stringify(baseChain.onay)

    if (!Object.keys(patch).length && !gChainChanged && !oChainChanged) {
      Alert.alert('Bilgi', 'Değişiklik yok')
      return
    }

    setSubmitting(true)
    try {
      if (gChainChanged || oChainChanged) {
        const { error: reorderErr } = await supabase.rpc(
          'rpc_zincir_operasyon_adimlari_yeniden_sirala',
          {
            p_is_id: task.id,
            p_gorev_personel_ids: gChainChanged ? gorevOrderIds : null,
            p_onay_personel_ids: oChainChanged ? onayOrderIds : null,
          },
        )
        if (reorderErr) throw reorderErr
      }

      if (Object.keys(patch).length) {
        const { error } = await supabase.rpc('rpc_is_operasyonel_guncelle', {
          p_is_id: task.id,
          p_patch: patch,
        })
        if (error) throw error
      }

      Alert.alert('Tamam', 'Görev güncellendi')
      navigation.goBack()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Güncellenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const unitLabel =
    units.find((u) => String(u.id) === String(form.birim_id))?.birim_adi || 'Seçin'
  const staffLabel =
    personLabel(staff.find((p) => String(p.id) === String(form.sorumlu_personel_id))) || 'Seçin'

  const openDatePicker = useCallback(
    (key) => {
      if (fieldDisabled) return
      setDatePick(key)
      if (Platform.OS === 'android') {
        setAndroidDateStep('date')
        setAndroidTempDate(parseIso(form[key]) || new Date())
      }
    },
    [fieldDisabled, form],
  )

  const applyQuickStartTime = useCallback((hour, minute = 0) => {
    const base = parseIso(form.baslama_tarihi) || new Date()
    const next = new Date(base)
    next.setHours(hour, minute, 0, 0)
    setForm((f) => ({ ...f, baslama_tarihi: toIso(next) || '' }))
  }, [form.baslama_tarihi])

  const onAndroidDateChange = useCallback((event, selected) => {
    if (event?.type === 'dismissed') {
      setDatePick(null)
      setAndroidDateStep(null)
      setAndroidTempDate(null)
      return
    }
    if (!selected || !datePick || !androidDateStep) return

    if (androidDateStep === 'date') {
      setAndroidTempDate(selected)
      setAndroidDateStep('time')
      return
    }

    const baseDate = androidTempDate || parseIso(form[datePick]) || new Date()
    const merged = combineDateAndTime(baseDate, selected)
    const iso = toIso(merged)
    setForm((f) => ({ ...f, [datePick]: iso || '' }))
    setDatePick(null)
    setAndroidDateStep(null)
    setAndroidTempDate(null)
  }, [androidDateStep, androidTempDate, datePick, form])

  if (!mayEdit) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.blocked}>Bu ekran için yetkiniz yok.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon.Back size={18} color={kitPalette.primary[700]} strokeWidth={2.2} />
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Görevi düzenle</Text>
        <View style={{ width: 72 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size={36} />
        </View>
      ) : blockedReason ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>{blockedReason}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {chainWorkRestricted ? (
            <View style={styles.infoBlue}>
              <Text style={styles.infoBlueText}>
                Zincir görev: birim sabit. Sorumlu yalnızca aktif adım ({Number(task?.zincir_aktif_adim) || 1}) için
                güncellenir.
              </Text>
            </View>
          ) : null}
          {!strictNormalTask && !chainWorkRestricted ? (
            <View style={styles.infoPurple}>
              <Text style={styles.infoPurpleText}>
                Zincir onay: birim ve sorumlu güncellenebilir (onay sırası ayrı tabloda).
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>Başlık</Text>
          <TextInput
            style={styles.input}
            value={form.baslik}
            editable={!fieldDisabled}
            onChangeText={(v) =>
              setForm((f) => ({ ...f, baslik: formatTaskTitleCase(v) }))
            }
          />

          <Text style={styles.label}>Açıklama</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            value={form.aciklama}
            editable={!fieldDisabled}
            onChangeText={(v) => setForm((f) => ({ ...f, aciklama: v }))}
          />

          <Text style={styles.label}>Birim</Text>
          <TouchableOpacity
            style={[styles.selectBtn, (!canEditBirimField || fieldDisabled) && styles.selectDisabled]}
            disabled={!canEditBirimField || fieldDisabled}
            onPress={() => setListModal('birim')}
          >
            <Text style={styles.selectBtnText}>{unitLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Sorumlu personel</Text>
          <TouchableOpacity
            style={[styles.selectBtn, (!canEditAssigneeField || fieldDisabled) && styles.selectDisabled]}
            disabled={!canEditAssigneeField || fieldDisabled}
            onPress={() => setListModal('personel')}
          >
            <Text style={styles.selectBtnText}>{staffLabel}</Text>
          </TouchableOpacity>

          {gorevReorderAllowed && isZincirGorevTuru(task?.gorev_turu) && gorevOrderIds.length > 0 ? (
            <View style={styles.chainBoxBlue}>
              <Text style={styles.chainTitleBlue}>Zincir görev — sıra</Text>
              <Text style={styles.chainHint}>
                Sırayı değiştirebilir veya listeye yeni personel ekleyebilirsiniz (↑↓ ile konumu ayarlayın).
              </Text>
              <TouchableOpacity
                style={[
                  styles.chainAddBtn,
                  (fieldDisabled || staffNotInGorevChain.length === 0) && styles.chainAddBtnOff,
                ]}
                disabled={fieldDisabled || staffNotInGorevChain.length === 0}
                onPress={() => setListModal('chain_gorev_add')}
              >
                <Text style={styles.chainAddBtnText}>+ Zincire personel ekle</Text>
              </TouchableOpacity>
              {gorevOrderIds.map((pid, idx) => (
                <View key={`g-${pid}-${idx}`} style={styles.chainRow}>
                  <Text style={styles.chainRowText} numberOfLines={2}>
                    {idx + 1}. {personLabel(staff.find((p) => String(p.id) === String(pid))) || pid}
                  </Text>
                  <View style={styles.chainBtns}>
                    <TouchableOpacity
                      style={[
                        styles.chainArrow,
                        (fieldDisabled || idx === 0 || gorevOrderIds.length < 2) && styles.chainArrowOff,
                      ]}
                      disabled={fieldDisabled || idx === 0 || gorevOrderIds.length < 2}
                      onPress={() => moveGorevStep(idx, -1)}
                    >
                      <Icon.Up size={14} color={kitPalette.primary[700]} strokeWidth={2.4} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.chainArrow,
                        (fieldDisabled ||
                          idx >= gorevOrderIds.length - 1 ||
                          gorevOrderIds.length < 2) &&
                          styles.chainArrowOff,
                      ]}
                      disabled={
                        fieldDisabled ||
                        idx >= gorevOrderIds.length - 1 ||
                        gorevOrderIds.length < 2
                      }
                      onPress={() => moveGorevStep(idx, 1)}
                    >
                      <Icon.Down size={14} color={kitPalette.primary[700]} strokeWidth={2.4} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {onayReorderAllowed && isZincirOnayTuru(task?.gorev_turu) && onayOrderIds.length > 0 ? (
            <View style={styles.chainBoxPurple}>
              <Text style={styles.chainTitlePurple}>Zincir onay — sıra</Text>
              <Text style={styles.chainHintPurple}>
                Onay tamamlanmadan sırayı değiştirebilir veya yeni onaylayıcı ekleyebilirsiniz.
              </Text>
              <TouchableOpacity
                style={[
                  styles.chainAddBtnPurp,
                  (fieldDisabled || staffNotInOnayChain.length === 0) && styles.chainAddBtnOff,
                ]}
                disabled={fieldDisabled || staffNotInOnayChain.length === 0}
                onPress={() => setListModal('chain_onay_add')}
              >
                <Text style={styles.chainAddBtnTextPurp}>+ Onaylayıcı ekle</Text>
              </TouchableOpacity>
              {onayOrderIds.map((pid, idx) => (
                <View key={`o-${pid}-${idx}`} style={styles.chainRow}>
                  <Text style={styles.chainRowText} numberOfLines={2}>
                    {idx + 1}. {personLabel(staff.find((p) => String(p.id) === String(pid))) || pid}
                  </Text>
                  <View style={styles.chainBtns}>
                    <TouchableOpacity
                      style={[
                        styles.chainArrowPurp,
                        (fieldDisabled || idx === 0 || onayOrderIds.length < 2) && styles.chainArrowOff,
                      ]}
                      disabled={fieldDisabled || idx === 0 || onayOrderIds.length < 2}
                      onPress={() => moveOnayStep(idx, -1)}
                    >
                      <Icon.Up size={14} color={kitPalette.blurple[700]} strokeWidth={2.4} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.chainArrowPurp,
                        (fieldDisabled ||
                          idx >= onayOrderIds.length - 1 ||
                          onayOrderIds.length < 2) &&
                          styles.chainArrowOff,
                      ]}
                      disabled={
                        fieldDisabled ||
                        idx >= onayOrderIds.length - 1 ||
                        onayOrderIds.length < 2
                      }
                      onPress={() => moveOnayStep(idx, 1)}
                    >
                      <Icon.Down size={14} color={kitPalette.blurple[700]} strokeWidth={2.4} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {[
            ['baslama_tarihi', 'Başlangıç'],
            ['son_tarih', 'Bitiş'],
          ].map(([key, lbl]) => (
            <View key={key} style={{ marginBottom: 10 }}>
              <Text style={styles.label}>{lbl}</Text>
              <TouchableOpacity
                style={[styles.selectBtn, fieldDisabled && styles.selectDisabled]}
                disabled={fieldDisabled}
                onPress={() => openDatePicker(key)}
              >
                <Text style={styles.selectBtnText}>
                  {form[key]
                    ? new Date(form[key]).toLocaleString('tr-TR')
                    : 'Tarih seç…'}
                </Text>
              </TouchableOpacity>
              {key === 'baslama_tarihi' ? (
                <View style={styles.quickTimeRow}>
                  {[
                    ['Şimdi', null],
                    ['09:00', [9, 0]],
                    ['13:00', [13, 0]],
                    ['18:00', [18, 0]],
                  ].map(([label, hm]) => (
                    <TouchableOpacity
                      key={label}
                      style={[styles.quickTimeBtn, fieldDisabled && styles.selectDisabled]}
                      disabled={fieldDisabled}
                      onPress={() => {
                        if (!hm) {
                          const now = new Date()
                          setForm((f) => ({ ...f, baslama_tarihi: toIso(now) || '' }))
                          return
                        }
                        applyQuickStartTime(hm[0], hm[1])
                      }}
                    >
                      <Text style={styles.quickTimeBtnText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          <Text style={styles.label}>Puan</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.puan}
            editable={!fieldDisabled}
            onChangeText={(v) => setForm((f) => ({ ...f, puan: v }))}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Fotoğraf zorunlu</Text>
            <Switch
              value={form.foto_zorunlu}
              disabled={fieldDisabled}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  foto_zorunlu: v,
                  ...(v ? { video_zorunlu: false, min_video_sayisi: 0 } : {}),
                }))
              }
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Video kanıtı zorunlu</Text>
            <Switch
              value={form.video_zorunlu}
              disabled={fieldDisabled}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  video_zorunlu: v,
                  min_video_sayisi: v ? Math.max(1, Number(f.min_video_sayisi) || 1) : 0,
                  ...(v ? { foto_zorunlu: false, min_foto_sayisi: 0 } : {}),
                }))
              }
            />
          </View>

          <Text style={styles.label}>Min. foto sayısı</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(form.min_foto_sayisi)}
            editable={!fieldDisabled}
            onChangeText={(v) =>
              setForm((f) => ({
                ...f,
                min_foto_sayisi: Math.max(0, Math.min(99, Number(v) || 0)),
              }))
            }
          />

          <Text style={styles.label}>Min. video sayısı (0–3)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(form.min_video_sayisi)}
            editable={!fieldDisabled}
            onChangeText={(v) =>
              setForm((f) => ({
                ...f,
                min_video_sayisi: Math.max(0, Math.min(3, Number(v) || 0)),
              }))
            }
          />

          <Text style={styles.label}>Video üst süre (sn, 5–60)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(form.max_video_suresi_sn)}
            editable={!fieldDisabled}
            onChangeText={(v) =>
              setForm((f) => ({
                ...f,
                max_video_suresi_sn: Math.min(60, Math.max(5, Number(v) || 60)),
              }))
            }
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Açıklama zorunlu</Text>
            <Switch
              value={form.aciklama_zorunlu}
              disabled={fieldDisabled}
              onValueChange={(v) => setForm((f) => ({ ...f, aciklama_zorunlu: v }))}
            />
          </View>

          {strictNormalTask ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Özel görev</Text>
              <Switch
                value={form.ozel_gorev}
                disabled={
                  fieldDisabled ||
                  (!mayMarkBirebirGorev && !form.ozel_gorev)
                }
                onValueChange={(v) => setForm((f) => ({ ...f, ozel_gorev: v }))}
              />
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.saveBtn, (fieldDisabled || submitting) && styles.saveDisabled]}
            disabled={fieldDisabled || submitting}
            onPress={() => void submit()}
          >
            <Text style={styles.saveBtnText}>{submitting ? 'Kaydediliyor…' : 'Kaydet'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {datePick && Platform.OS === 'android' && androidDateStep ? (
        <DateTimePicker
          value={androidDateStep === 'date'
            ? androidTempDate || parseIso(form[datePick]) || new Date()
            : parseIso(form[datePick]) || new Date()}
          mode={androidDateStep}
          display="default"
          onChange={onAndroidDateChange}
        />
      ) : null}

      <Modal visible={!!datePick && Platform.OS === 'ios'} transparent animationType="slide">
        <Pressable style={styles.dateModalWrap} onPress={() => setDatePick(null)}>
          <Pressable style={styles.dateModalInner} onPress={() => {}}>
            <View style={styles.iosPickerBar}>
              <TouchableOpacity onPress={() => setDatePick(null)}>
                <Text style={styles.iosPickerDone}>Tamam</Text>
              </TouchableOpacity>
            </View>
            {datePick ? (
              <DateTimePicker
                value={parseIso(form[datePick]) || new Date()}
                mode="datetime"
                display="spinner"
                onChange={(_, d) => {
                  if (d) setForm((f) => ({ ...f, [datePick]: toIso(d) || '' }))
                }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!listModal} transparent animationType="slide" onRequestClose={() => setListModal(null)}>
        <Pressable style={styles.listBackdrop} onPress={() => setListModal(null)}>
          <Pressable style={styles.listSheet} onPress={() => {}}>
            <Text style={styles.listTitle}>
              {listModal === 'birim'
                ? 'Birim seç'
                : listModal === 'personel'
                  ? 'Personel seç'
                  : listModal === 'chain_gorev_add'
                    ? 'Zincire personel ekle'
                    : listModal === 'chain_onay_add'
                      ? 'Onay zincirine ekle'
                      : ''}
            </Text>
            <FlatList
              data={
                listModal === 'birim'
                  ? units
                  : listModal === 'personel'
                    ? staff
                    : listModal === 'chain_gorev_add'
                      ? staffNotInGorevChain
                      : listModal === 'chain_onay_add'
                        ? staffNotInOnayChain
                        : []
              }
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.listRow}
                  onPress={() => {
                    if (listModal === 'birim') {
                      setForm((f) => ({ ...f, birim_id: String(item.id) }))
                    } else if (listModal === 'personel') {
                      setForm((f) => ({ ...f, sorumlu_personel_id: String(item.id) }))
                    } else if (listModal === 'chain_gorev_add') {
                      setGorevOrderIds((prev) => [...prev, String(item.id)])
                    } else if (listModal === 'chain_onay_add') {
                      setOnayOrderIds((prev) => [...prev, String(item.id)])
                    }
                    setListModal(null)
                  }}
                >
                  <Text style={styles.listRowText}>
                    {listModal === 'birim' ? item.birim_adi : personLabel(item)}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyList}>Kayıt yok</Text>}
            />
            <TouchableOpacity style={styles.listClose} onPress={() => setListModal(null)}>
              <Text style={styles.listCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: kitSpacing.lg,
    paddingTop: kitSpacing.md,
    paddingBottom: 8,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnText: { fontSize: Typography.caption.fontSize, fontWeight: '700', color: Colors.primary },
  heading: { fontSize: Typography.heading.fontSize, fontWeight: '800', color: Colors.text },
  scrollContent: {
    paddingHorizontal: kitSpacing.lg,
    paddingTop: kitSpacing.md,
    paddingBottom: 48,
  },
  label: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    color: Colors.text,
    marginBottom: 4,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  selectBtn: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    marginBottom: 6,
  },
  selectDisabled: { opacity: 0.45 },
  selectBtnText: { fontSize: Typography.body.fontSize, color: Colors.text, fontWeight: '600' },
  quickTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  quickTimeBtn: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickTimeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
    paddingVertical: 4,
  },
  switchLabel: { fontSize: Typography.body.fontSize, color: Colors.text, fontWeight: '600', flex: 1 },
  saveBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.surface, fontWeight: '800', fontSize: Typography.body.fontSize },
  warnBox: {
    margin: Spacing.md,
    padding: 14,
    borderRadius: Radii.md,
    backgroundColor: kitPalette.warning[100],
    borderWidth: 1,
    borderColor: kitPalette.warning[100],
  },
  warnText: { color: kitPalette.warning[700], fontSize: Typography.caption.fontSize, fontWeight: '600' },
  blocked: { padding: Spacing.md, color: Colors.mutedText },
  infoBlue: {
    padding: 12,
    borderRadius: Radii.md,
    backgroundColor: kitPalette.info[100],
    borderWidth: 1,
    borderColor: kitPalette.info[100],
    marginBottom: 12,
  },
  infoBlueText: { color: kitPalette.info[700], fontSize: Typography.caption.fontSize, fontWeight: '600' },
  infoPurple: {
    padding: 12,
    borderRadius: Radii.md,
    backgroundColor: kitPalette.blurple[50],
    borderWidth: 1,
    borderColor: kitPalette.blurple[100],
    marginBottom: 12,
  },
  infoPurpleText: { color: kitPalette.blurple[700], fontSize: Typography.caption.fontSize, fontWeight: '600' },
  dateModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: kitPalette.overlay,
  },
  dateModalInner: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    paddingBottom: 16,
  },
  iosPickerBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.alpha.gray20,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iosPickerDone: { fontWeight: '800', color: Colors.primary, fontSize: Typography.body.fontSize },
  listBackdrop: {
    flex: 1,
    backgroundColor: kitPalette.overlay,
    justifyContent: 'flex-end',
  },
  listSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    maxHeight: '72%',
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  listTitle: { fontWeight: '800', fontSize: Typography.body.fontSize, marginVertical: 12, color: Colors.text },
  listRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.alpha.gray20,
  },
  listRowText: { fontSize: Typography.caption.fontSize, color: Colors.text, fontWeight: '600' },
  listClose: { marginTop: 12, alignItems: 'center', padding: 12 },
  listCloseText: { fontWeight: '800', color: Colors.primary },
  emptyList: { textAlign: 'center', color: Colors.mutedText, marginVertical: 20 },
  chainBoxBlue: {
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: kitPalette.info[100],
    backgroundColor: kitPalette.info[100],
    marginBottom: 12,
  },
  chainTitleBlue: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
    color: kitPalette.info[700],
    marginBottom: 6,
  },
  chainHint: { fontSize: 11, color: kitPalette.info[700], marginBottom: 10, lineHeight: 16 },
  chainBoxPurple: {
    padding: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: kitPalette.blurple[100],
    backgroundColor: kitPalette.blurple[50],
    marginBottom: 12,
  },
  chainTitlePurple: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
    color: kitPalette.blurple[700],
    marginBottom: 6,
  },
  chainHintPurple: { fontSize: 11, color: kitPalette.blurple[700], marginBottom: 10, lineHeight: 16 },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.alpha.gray20,
  },
  chainRowText: { flex: 1, fontSize: Typography.caption.fontSize, color: Colors.text, fontWeight: '600' },
  chainBtns: { flexDirection: 'row', gap: 6 },
  chainArrow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: kitPalette.info[500],
    backgroundColor: Colors.surface,
  },
  chainArrowPurp: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: kitPalette.blurple[300],
    backgroundColor: Colors.surface,
  },
  chainArrowOff: { opacity: 0.35 },
  chainArrowText: { fontWeight: '800', color: Colors.text, fontSize: Typography.caption.fontSize },
  chainAddBtn: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radii.md,
    backgroundColor: kitPalette.info[700],
  },
  chainAddBtnPurp: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radii.md,
    backgroundColor: kitPalette.blurple[600],
  },
  chainAddBtnOff: { opacity: 0.4 },
  chainAddBtnText: { color: kitPalette.surface, fontWeight: '800', fontSize: Typography.caption.fontSize },
  chainAddBtnTextPurp: { color: kitPalette.surface, fontWeight: '800', fontSize: Typography.caption.fontSize },
})
