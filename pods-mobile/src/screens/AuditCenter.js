import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Image,
  Alert,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import PhotoViewerModal from '../components/PhotoViewerModal'
import { insertPointTransaction, normalizeTaskScore } from '../lib/pointsLedger'
import { isZincirGorevTuru, isZincirOnayTuru } from '../lib/zincirTasks'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const supabase = getSupabase()

const ThemeObj = Theme?.default ?? Theme
const { Colors, Radii, Typography, Spacing, Card, Shadows } = ThemeObj
const Layout = { borderRadius: Radii }
const SLATE_950 = Colors.background
const INDIGO_600 = Colors.accent
const EMERALD_500 = Colors.success
const ROSE_500 = Colors.error
const MUTED = Colors.gray

function isPermTruthy(permissions, key) {
  const v = permissions?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

function extractPhotoUrls(task) {
  if (!task) return []
  const raw =
    task.kanit_resim_ler ??
    task.fotograflar ??
    task.gorseller ??
    task.resimler ??
    task.fotograf_url ??
    task.foto_url ??
    task.photo_url ??
    task.images ??
    task.image_urls ??
    task.media

  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    try {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      }
    } catch {
      // ignore
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return [trimmed]
  }
  return []
}

function getStatusVisual(durum) {
  const d = String(durum || '').toLowerCase()
  if (d.includes('tekrar')) {
    return { label: 'Tekrar Gönderildi', bg: Colors.alpha.indigo10, text: Colors.accent }
  }
  if (d.includes('onay bekliyor')) {
    return { label: 'Onay Bekliyor', bg: Colors.alpha.gray20, text: Colors.primary }
  }
  if (d.includes('tamam') || d === 'onaylandı') {
    return { label: 'Onaylandı', bg: Colors.alpha.emerald10, text: Colors.success }
  }
  if (d.includes('onaylanmad') || d.includes('redd')) {
    return { label: 'Onaylanmadı', bg: Colors.alpha.rose10, text: Colors.error }
  }
  if (d.includes('gecik')) {
    return { label: 'Gecikmiş', bg: Colors.alpha.rose10, text: Colors.error }
  }
  return { label: String(durum || 'Durum'), bg: Colors.alpha.gray20, text: MUTED }
}

function cleanPersonelNote(note) {
  const s = String(note || '')
  // Eski kayıtlarda checklist notu "CHECKLIST:" ile prefixlenebiliyordu.
  return s.replace(/^CHECKLIST:\s*/i, '').trim()
}

export default function AuditCenter() {
  const navigation = useNavigation()
  const route = useRoute()
  const { personel, permissions } = useAuth()
  const PAGE_SIZE = 20
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [items, setItems] = React.useState([])
  const [hasMore, setHasMore] = React.useState(true)
  const [pageOffset, setPageOffset] = React.useState(0)
  const [personNameMap, setPersonNameMap] = React.useState({})
  const [unitNameMap, setUnitNameMap] = React.useState({})

  const [activeTask, setActiveTask] = React.useState(null)
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  const [lightboxIndex, setLightboxIndex] = React.useState(null)
  const [rejectReason, setRejectReason] = React.useState('')
  const [approvePointInput, setApprovePointInput] = React.useState('')
  const [checkDecisions, setCheckDecisions] = React.useState({})
  const initialTaskId = route?.params?.taskId

  const canApprove =
    isPermTruthy(permissions, 'gorev_onayla') ||
    isPermTruthy(permissions, 'denetim.onayla') ||
    isPermTruthy(permissions, 'is_admin') ||
    isPermTruthy(permissions, 'is_manager')
  const canReject =
    isPermTruthy(permissions, 'denetim.reddet') ||
    isPermTruthy(permissions, 'gorev_onayla') ||
    isPermTruthy(permissions, 'denetim.onayla') ||
    isPermTruthy(permissions, 'is_admin') ||
    isPermTruthy(permissions, 'is_manager')
  // üst-düzey (birim_id null) şirket scope:
  const isTopCompanyScope = useMemo(() => {
    if (!personel?.ana_sirket_id) return false
    if (personel?.birim_id != null) return false
    // İstenen anahtarları önce dene, yoksa manager rol yetkilerinden fallback al.
    if (isPermTruthy(permissions, 'is_admin') || isPermTruthy(permissions, 'is_manager')) return true
    return (
      isPermTruthy(permissions, 'sirket.yonet') ||
      isPermTruthy(permissions, 'rol.yonet') ||
      isPermTruthy(permissions, 'sube.yonet') ||
      isPermTruthy(permissions, 'personel.yonet')
    )
  }, [personel?.ana_sirket_id, personel?.birim_id, permissions])

  const load = useCallback(
    async (nextOffset = 0, reset = false) => {
    if (!personel?.ana_sirket_id) {
      setItems([])
      setLoading(false)
      return
    }
    if (!isTopCompanyScope && !personel?.birim_id) {
      // Yetki olsa bile tenant scope için birim gerekli.
      setItems([])
      setLoading(false)
      return
    }
    if (reset) {
      setLoading(true)
      setRefreshing(true)
      setItems([])
      setHasMore(true)
      setPageOffset(0)
    } else {
      setLoadingMore(true)
    }
    try {
      const filterByOnaySirasi = async (rows) => {
        const list = Array.isArray(rows) ? rows : []
        const zincirOnayIds = list.filter((r) => isZincirOnayTuru(r?.gorev_turu)).map((r) => r?.id).filter(Boolean)
        const zincirGorevIds = list.filter((r) => isZincirGorevTuru(r?.gorev_turu)).map((r) => r?.id).filter(Boolean)

        const [onayRes, gorevRes] = await Promise.all([
          zincirOnayIds.length
            ? supabase
                .from('isler_zincir_onay_adimlari')
                .select('is_id, adim_no, onaylayici_personel_id')
                .in('is_id', zincirOnayIds)
            : Promise.resolve({ data: [] }),
          zincirGorevIds.length
            ? supabase
                .from('isler_zincir_gorev_adimlari')
                .select('is_id, adim_no, personel_id')
                .in('is_id', zincirGorevIds)
            : Promise.resolve({ data: [] }),
        ])

        const onayByTask = {}
        for (const s of onayRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!onayByTask[key]) onayByTask[key] = []
          onayByTask[key].push(s)
        }
        const gorevByTask = {}
        for (const s of gorevRes?.data || []) {
          const key = String(s?.is_id || '')
          if (!key) continue
          if (!gorevByTask[key]) gorevByTask[key] = []
          gorevByTask[key].push(s)
        }

        return list.filter((task) => {
          const taskType = task?.gorev_turu
          const taskId = String(task?.id || '')
          if (isZincirGorevTuru(taskType)) {
            const activeGorevAdim = Number(task?.zincir_aktif_adim) || 1
            const gorevStep = (gorevByTask[taskId] || []).find((s) => Number(s?.adim_no) === activeGorevAdim)
            if (gorevStep && String(gorevStep.personel_id || '') !== String(personel?.id || '')) return false
          }
          if (isZincirOnayTuru(taskType)) {
            const activeOnayAdim = Number(task?.zincir_onay_aktif_adim) || 1
            const onayStep = (onayByTask[taskId] || []).find((s) => Number(s?.adim_no) === activeOnayAdim)
            if (onayStep && String(onayStep.onaylayici_personel_id || '') !== String(personel?.id || '')) return false
          }
          return true
        })
      }

      const selectWithGroup =
        'id, baslik, is_sablon_id, durum, aciklama, puan, grup_id, sorumlu_personel_id, ana_sirket_id, birim_id, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, kanit_resim_ler, checklist_cevaplari, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim'
      const selectNoGroup =
        'id, baslik, is_sablon_id, durum, aciklama, puan, sorumlu_personel_id, ana_sirket_id, birim_id, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, kanit_resim_ler, checklist_cevaplari, updated_at, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim'

      let q = supabase
        .from('isler')
        .select(selectWithGroup)
        .in('durum', ['Onay Bekliyor', 'Tekrar Gönderildi'])
        .order('created_at', { ascending: false })

      q = q.eq('ana_sirket_id', personel.ana_sirket_id)
      if (!isTopCompanyScope) {
        q = q.eq('birim_id', personel.birim_id)
      }

      q = q.range(nextOffset, nextOffset + PAGE_SIZE - 1)
      const { data, error } = await q
      if (error) {
        const msg = String(error?.message || '').toLowerCase()
        if (error?.code === '42703' && msg.includes('grup_id')) {
          let q2 = supabase
            .from('isler')
            .select(selectNoGroup)
            .in('durum', ['Onay Bekliyor', 'Tekrar Gönderildi'])
            .eq('ana_sirket_id', personel.ana_sirket_id)

          if (!isTopCompanyScope) {
            q2 = q2.eq('birim_id', personel.birim_id)
          }

          q2 = q2.range(nextOffset, nextOffset + PAGE_SIZE - 1)
          const { data: data2, error: error2 } = await q2
          if (error2) {
            if (__DEV__) console.warn('AuditCenter load no-group error', error2)
            setItems([])
            return
          }

          const list = await filterByOnaySirasi(data2 || [])
          setHasMore((data2 || []).length === PAGE_SIZE)
          setItems((prev) => (reset ? list : [...prev, ...list]))
          setPageOffset(nextOffset + (data2 || []).length)
          return
        }

        if (__DEV__) console.warn('AuditCenter load error', error)
        setItems([])
        return
      }
      const list = await filterByOnaySirasi(data || [])
      const ids = [...new Set(list.map((x) => x?.sorumlu_personel_id).filter(Boolean))]
      const unitIds = [...new Set(list.map((x) => x?.birim_id).filter(Boolean))]
      let map = {}
      let unitsMap = {}
      if (ids.length) {
        let peopleQuery = supabase
          .from('personeller')
          .select('id, ad, soyad')
          .in('id', ids)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        if (!isTopCompanyScope) {
          peopleQuery = peopleQuery.eq('birim_id', personel.birim_id)
        }
        const { data: peopleData } = await peopleQuery
        ;(peopleData || []).forEach((p) => {
          map[String(p.id)] = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim() || 'Personel'
        })
      }
      if (unitIds.length) {
        let birimQuery = supabase
          .from('birimler')
          .select('id, birim_adi')
          .in('id', unitIds)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        if (!isTopCompanyScope) {
          birimQuery = birimQuery.eq('id', personel.birim_id)
        }
        const { data: unitData } = await birimQuery
        ;(unitData || []).forEach((u) => {
          unitsMap[String(u.id)] = u?.birim_adi || 'Birim'
        })
      }
      setPersonNameMap((prev) => ({ ...prev, ...map }))
      setUnitNameMap((prev) => ({ ...prev, ...unitsMap }))
      setHasMore(list.length === PAGE_SIZE)
      setItems((prev) => (reset ? list : [...prev, ...list]))
      setPageOffset(nextOffset + list.length)
    } catch (e) {
      if (__DEV__) console.warn('AuditCenter load exception', e)
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
    },
    [personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, PAGE_SIZE],
  )

  const onRefresh = useCallback(() => {
    load(0, true)
  }, [load])

  useEffect(() => {
    load(0, true)
  }, [load])

  useEffect(() => {
    if (!initialTaskId) return
    if (!items?.length) return
    const match = items.find((x) => String(x?.id) === String(initialTaskId))
    if (match) {
      openEvidence(match)
      navigation?.setParams?.({ taskId: undefined, openEvidence: undefined })
    }
  }, [initialTaskId, items, openEvidence, navigation])

  const openEvidence = useCallback((task) => {
    setActiveTask(task)
    setRejectReason('')
    const checklistRows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const nextDecisions = {}
    for (let i = 0; i < checklistRows.length; i++) {
      const row = checklistRows[i] || {}
      const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
      const raw = String(row?.denetim_karari || 'accept').toLowerCase()
      nextDecisions[qid] = raw.includes('reject') ? 'reject' : 'accept'
    }
    setCheckDecisions(nextDecisions)
    const initialPoint = Number(task?.puan)
    setApprovePointInput(Number.isFinite(initialPoint) && initialPoint > 0 ? String(initialPoint) : '')
    setEvidenceOpen(true)
  }, [])

  const closeEvidence = useCallback(() => {
    setEvidenceOpen(false)
    setActiveTask(null)
    setRejectReason('')
    setApprovePointInput('')
    setLightboxIndex(null)
    setCheckDecisions({})
  }, [])

  const approveTask = useCallback(async () => {
    if (!activeTask) return
    if (!canApprove) return

    try {
      const entered = Number.parseFloat(String(approvePointInput || '').replace(',', '.'))
      const puan = Math.round(normalizeTaskScore(Number.isFinite(entered) ? entered : activeTask.puan))
      if (!Number.isFinite(puan) || puan <= 0) {
        Alert.alert('Puan gerekli', 'Onaylamak için geçerli bir puan girin.')
        return
      }

      let chainOnayRows = []
      if (activeTask?.gorev_turu && isZincirOnayTuru(activeTask.gorev_turu)) {
        const { data: orows } = await supabase
          .from('isler_zincir_onay_adimlari')
          .select('id, adim_no, onaylayici_personel_id, durum')
          .eq('is_id', activeTask.id)
          .order('adim_no', { ascending: true })
        chainOnayRows = orows || []
      }
      const activeOnayAdim = Number(activeTask?.zincir_onay_aktif_adim) || 1
      const currentOnayStep = chainOnayRows.find((r) => Number(r.adim_no) === activeOnayAdim)
      if (chainOnayRows.length && currentOnayStep) {
        if (String(currentOnayStep.onaylayici_personel_id) !== String(personel?.id)) {
          Alert.alert('Sıra başka onaylayıcıda', 'Bu görevde sıradaki onay sizde değil.')
          return
        }
      }

      const isChecklist = !!activeTask?.is_sablon_id
      let checklistUpdate = null
      if (isChecklist) {
        const rows = Array.isArray(activeTask?.checklist_cevaplari) ? activeTask.checklist_cevaplari : []
        const anyRejected = rows.some((row, i) => {
          const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
          return checkDecisions?.[qid] === 'reject'
        })
        if (anyRejected) {
          Alert.alert('Onaylanmadı bulunan maddeler var', 'Lütfen “Reddet” ile işlemi tamamlayın.')
          return
        }
        checklistUpdate = rows.map((row, i) => {
          const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
          const decision = checkDecisions?.[qid] || 'accept'
          return { ...row, denetim_karari: decision }
        })
      }

      if (chainOnayRows.length && currentOnayStep) {
        const isLastOnay = activeOnayAdim >= chainOnayRows.length
        const { error: oErr } = await supabase
          .from('isler_zincir_onay_adimlari')
          .update({
            durum: 'onaylandi',
            onaylandi_at: new Date().toISOString(),
          })
          .eq('id', currentOnayStep.id)
        if (oErr) {
          Alert.alert('Onay hatası', oErr.message || 'Zincir onay kaydedilemedi')
          return
        }
        if (!isLastOnay) {
          const { error: advErr } = await supabase
            .from('isler')
            .update({ zincir_onay_aktif_adim: activeOnayAdim + 1 })
            .eq('id', activeTask.id)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          if (advErr) {
            Alert.alert('Hata', advErr.message || 'Sıra güncellenemedi')
            return
          }
          Alert.alert('Tamam', 'Onayınız kaydedildi; sıra bir sonraki onaylayıcıda.')
          closeEvidence()
          await load(0, true)
          return
        }
      }

      // Grup modunda: bir görev onaylanınca aynı grup içindeki herkese puan ver ve hepsini tamamla.
      if (activeTask?.grup_id) {
        let groupQ = supabase
          .from('isler')
          .select('id, sorumlu_personel_id, baslik')
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          .eq('grup_id', activeTask.grup_id)
        if (!isTopCompanyScope) {
          groupQ = groupQ.eq('birim_id', personel?.birim_id)
        }
        const { data: groupTasks } = await groupQ
        const groupList = (groupTasks || []).filter((t) => t?.sorumlu_personel_id)

        for (const t of groupList) {
          await insertPointTransaction({
            personelId: t.sorumlu_personel_id,
            delta: puan,
            gorevId: t.id,
            gorevBaslik: t?.baslik || activeTask?.baslik || 'Görev',
            islemTipi: 'TASK_APPROVED',
            aciklama: `Grup onayı: ${activeTask?.baslik || 'Görev'}`,
          })
        }

        let approveGroupQuery = supabase
          .from('isler')
          .update({ durum: 'TAMAMLANDI', puan })
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          .eq('grup_id', activeTask.grup_id)
        if (!isTopCompanyScope) {
          approveGroupQuery = approveGroupQuery.eq('birim_id', personel?.birim_id)
        }
        if (checklistUpdate) {
          let checklistUpd = supabase
            .from('isler')
            .update({ checklist_cevaplari: checklistUpdate })
            .eq('id', activeTask.id)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          if (!isTopCompanyScope) {
            checklistUpd = checklistUpd.eq('birim_id', personel?.birim_id)
          }
          await checklistUpd
        }
        await approveGroupQuery
      } else {
        const personelId = activeTask.sorumlu_personel_id
        const tx = await insertPointTransaction({
          personelId,
          delta: puan,
          gorevId: activeTask.id,
          gorevBaslik: activeTask?.baslik || 'Görev',
          islemTipi: 'TASK_APPROVED',
          aciklama: `Görev onayı: ${activeTask?.baslik || 'Görev'}`,
        })
        if (!tx.ok && __DEV__) {
          console.warn('Puan hareketi eklenemedi', tx.error)
        }

        let approveQuery = supabase
          .from('isler')
          .update({
            durum: 'TAMAMLANDI',
            puan,
            ...(checklistUpdate ? { checklist_cevaplari: checklistUpdate } : {}),
          })
          .eq('id', activeTask.id)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        if (!isTopCompanyScope) {
          approveQuery = approveQuery.eq('birim_id', personel?.birim_id)
        }
        await approveQuery
      }

      closeEvidence()
      await load(0, true)
    } catch (e) {
      if (__DEV__) console.warn('AuditCenter approve error', e)
    }
  }, [activeTask, canApprove, closeEvidence, load, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, approvePointInput, checkDecisions])

  const rejectTask = useCallback(async () => {
    if (!activeTask) return
    if (!canReject) {
      Alert.alert('Yetki yok', 'Bu işlemi yapma yetkiniz bulunmuyor.')
      return
    }

    const reason = (rejectReason || '').trim()
    if (!reason) {
      Alert.alert('Red nedeni gerekli', 'Lütfen görevi neden reddettiğinizi yazın.')
      return
    }

    try {
      const currentScore = Math.round(normalizeTaskScore(activeTask?.puan))
      const reducedScore = Math.max(0, Math.round(currentScore / 2))
      const isChecklist = !!activeTask?.is_sablon_id
      let checklistUpdate = null
      if (isChecklist) {
        const rows = Array.isArray(activeTask?.checklist_cevaplari) ? activeTask.checklist_cevaplari : []
        checklistUpdate = rows.map((row, i) => {
          const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
          const decision = checkDecisions?.[qid] || 'accept'
          return { ...row, denetim_karari: decision }
        })
      }
      let rejectQuery = supabase
        .from('isler')
        .update({
          durum: 'Onaylanmadı',
          red_nedeni: reason,
          puan: reducedScore,
          ...(checklistUpdate ? { checklist_cevaplari: checklistUpdate } : {}),
        })
        .eq('id', activeTask.id)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      if (!isTopCompanyScope) {
        rejectQuery = rejectQuery.eq('birim_id', personel?.birim_id)
      }
      const { error: rejectErr } = await rejectQuery
      if (rejectErr?.code === '42703') {
        // Kolon yoksa manager notunu mevcut aciklama alanına yaz.
        let fallbackRejectQuery = supabase
          .from('isler')
          .update({
            durum: 'Onaylanmadı',
            aciklama: reason,
            puan: reducedScore,
          })
          .eq('id', activeTask.id)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        if (!isTopCompanyScope) {
          fallbackRejectQuery = fallbackRejectQuery.eq('birim_id', personel?.birim_id)
        }
        const { error: fallbackErr } = await fallbackRejectQuery
        if (fallbackErr) {
          Alert.alert('Red hatası', fallbackErr.message || 'Görev reddedilemedi.')
          return
        }
      } else if (rejectErr) {
        Alert.alert('Red hatası', rejectErr.message || 'Görev reddedilemedi.')
        return
      }

      // Grup modunda: aynı grup içindeki diğer kişilerin görevini tekrar atama durumuna geri al.
      if (activeTask?.grup_id) {
        let otherRestore = supabase
          .from('isler')
          .update({ durum: 'ATANDI', puan: 0 })
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          .eq('grup_id', activeTask.grup_id)
          .neq('id', activeTask.id)
        if (!isTopCompanyScope) {
          otherRestore = otherRestore.eq('birim_id', personel?.birim_id)
        }
        await otherRestore
      }

      closeEvidence()
      await load(0, true)
      Alert.alert('Başarılı', 'Görev reddedildi ve personele geri gönderildi.')
    } catch (e) {
      if (__DEV__) console.warn('AuditCenter reject error', e)
      Alert.alert('Hata', e?.message || 'Reddetme işlemi sırasında hata oluştu.')
    }
  }, [activeTask, canReject, closeEvidence, load, rejectReason, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, checkDecisions])

  const renderItem = useCallback(({ item }) => {
    const birimText = item?.birim_id
      ? unitNameMap[String(item.birim_id)] || 'Birim'
      : 'Şirket Geneli'
    const statusVisual = getStatusVisual(item?.durum)
    return (
      <View style={styles.card}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.metaTopRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{birimText}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusVisual.bg }]}>
              <Text style={[styles.statusPillText, { color: statusVisual.text }]}>{statusVisual.label}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item?.baslik || 'Görev'}
          </Text>
          <Text style={styles.cardMeta}>
            {item?.created_at ? new Date(item.created_at).toLocaleDateString('tr-TR') : '-'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: INDIGO_600 }]}
          onPress={() => openEvidence(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Kanıtları Gör</Text>
        </TouchableOpacity>
      </View>
    )
  }, [openEvidence, unitNameMap])

  const isChecklistEvidence = !!activeTask?.is_sablon_id
  const checklistRows = useMemo(() => (Array.isArray(activeTask?.checklist_cevaplari) ? activeTask.checklist_cevaplari : []), [activeTask])
  const checklistFlatPhotos = useMemo(() => {
    if (!isChecklistEvidence) return []
    const out = []
    for (const row of checklistRows) {
      const urls = Array.isArray(row?.fotograflar) ? row.fotograflar.filter(Boolean) : []
      out.push(...urls)
    }
    return out
  }, [isChecklistEvidence, checklistRows])
  const checklistPhotoStartIndexByQuestionId = useMemo(() => {
    if (!isChecklistEvidence) return {}
    const map = {}
    let running = 0
    for (let i = 0; i < checklistRows.length; i++) {
      const row = checklistRows[i]
      const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
      map[qid] = running
      const urls = Array.isArray(row?.fotograflar) ? row.fotograflar.filter(Boolean) : []
      running += urls.length
    }
    return map
  }, [isChecklistEvidence, checklistRows])
  const evidencePhotos = useMemo(() => {
    if (isChecklistEvidence) return checklistFlatPhotos
    return extractPhotoUrls(activeTask)
  }, [activeTask, isChecklistEvidence, checklistFlatPhotos])

  const approveLabel = canApprove ? 'Onayla' : 'Onay yetkisi yok'
  const rejectLabel = canReject ? 'Reddet' : 'Red yetkisi yok'

  return (
    <View style={styles.page}>
      <PremiumBackgroundPattern />
      {loading && items.length === 0 ? (
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonCard} />
          ))}
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Denetim Merkezi</Text>
            <Text style={styles.subtitle}>
              Onay bekleyen işler için kanıt görüntüle ve karar ver
            </Text>
          </View>

          <FlatList
            data={items}
            keyExtractor={(item) => String(item?.id ?? '')}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onEndReachedThreshold={0.2}
            onEndReached={() => {
              if (!hasMore) return
              if (loadingMore || loading) return
              load(pageOffset, false)
            }}
            ListEmptyComponent={<Text style={styles.empty}>Onay bekleyen iş yok.</Text>}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator size={22} color={INDIGO_600} />
                </View>
              ) : null
            }
          />
        </>
      )}

      <Modal visible={evidenceOpen} transparent animationType="fade" onRequestClose={closeEvidence}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {activeTask?.baslik || 'Görev'}
              </Text>
              <Text style={styles.modalMeta}>
                {activeTask?.sorumlu_personel_id
                  ? `Personel: ${personNameMap[String(activeTask.sorumlu_personel_id)] || activeTask.sorumlu_personel_id}`
                  : 'Personel bilgisi yok'}
              </Text>
              <View style={styles.detailList}>
                <Text style={styles.detailRow}>Durum: {activeTask?.durum || '-'}</Text>
                <Text style={styles.detailRow}>Puan: {Number(activeTask?.puan) || 0}</Text>
                <Text style={styles.detailRow}>
                  Oluşturulma: {activeTask?.created_at ? new Date(activeTask.created_at).toLocaleString('tr-TR') : '-'}
                </Text>
                <Text style={styles.detailRow}>
                  Başlama: {activeTask?.baslama_tarihi ? new Date(activeTask.baslama_tarihi).toLocaleString('tr-TR') : '-'}
                </Text>
                <Text style={styles.detailRow}>
                  Son Tarih: {activeTask?.son_tarih ? new Date(activeTask.son_tarih).toLocaleString('tr-TR') : '-'}
                </Text>
                <Text style={styles.detailRow}>Foto Zorunlu: {activeTask?.foto_zorunlu ? 'Evet' : 'Hayır'}</Text>
                <Text style={styles.detailRow}>Min Foto: {Number(activeTask?.min_foto_sayisi) || 0}</Text>
              </View>

              {isChecklistEvidence ? (
                <View style={styles.checklistAuditHeader}>
                  <Text style={styles.checklistAuditHeaderTitle}>Checklist Denetimi</Text>
                  <Text style={styles.checklistAuditHeaderSub}>Soruları tek tek kabul veya reddedin.</Text>
                </View>
              ) : null}

              {!isChecklistEvidence ? (
                <>
                  <Text style={styles.sectionLabel}>Kanıtlar</Text>
                  {evidencePhotos.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      {evidencePhotos.map((url, idx) => (
                        <TouchableOpacity
                          key={`${url}-${idx}`}
                          onPress={() => setLightboxIndex(idx)}
                          activeOpacity={0.85}
                          style={styles.photoThumbWrap}
                        >
                          <Image source={{ uri: url }} style={styles.photoThumbImg} resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.muted}>Kanıt fotoğrafı yok.</Text>
                  )}
                </>
              ) : null}

              {isChecklistEvidence ? (
                <>
                  <Text style={styles.sectionLabel}>Sorular ve Cevaplar</Text>
                  <View style={styles.checklistAnswersBox}>
                    {checklistRows.length ? (
                      checklistRows.map((row, i) => {
                        const qid = row?.soru_id != null ? String(row.soru_id) : String(i)
                        const tip = String(row?.soru_tipi || '').toUpperCase()
                        const decision = checkDecisions?.[qid] || 'accept'
                        const rowPhotos = Array.isArray(row?.fotograflar) ? row.fotograflar.filter(Boolean) : []
                        const answerText =
                          tip === 'FOTOGRAF'
                            ? `${rowPhotos.length || 0} fotoğraf`
                            : String(row?.cevap || '-')

                        return (
                          <View key={qid} style={styles.checkItemRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.checkQuestionLine}>
                                {(row?.sira || i + 1)}. {row?.soru_metni || 'Soru'}
                              </Text>
                              <Text style={styles.checkAnswerText}>Cevap: {answerText}</Text>

                              {tip === 'FOTOGRAF' && rowPhotos.length ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                  {rowPhotos.map((url, pIdx) => {
                                    const start = checklistPhotoStartIndexByQuestionId?.[qid] ?? 0
                                    const globalIdx = start + pIdx
                                    return (
                                      <TouchableOpacity
                                        key={`${qid}-p-${pIdx}`}
                                        onPress={() => setLightboxIndex(globalIdx)}
                                        activeOpacity={0.85}
                                        style={styles.questionPhotoWrap}
                                      >
                                        <Image source={{ uri: url }} style={styles.questionPhotoImg} resizeMode="cover" />
                                      </TouchableOpacity>
                                    )
                                  })}
                                </ScrollView>
                              ) : null}
                            </View>

                            <View style={styles.checkDecisionRow}>
                              <TouchableOpacity
                                style={[styles.decideBtn, decision === 'accept' && styles.decideBtnAcceptActive]}
                                onPress={() => setCheckDecisions((prev) => ({ ...prev, [qid]: 'accept' }))}
                                activeOpacity={0.85}
                              >
                                <Text style={[styles.decideBtnText, decision === 'accept' && styles.decideBtnTextActive]}>Kabul</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.decideBtn, decision === 'reject' && styles.decideBtnRejectActive]}
                                onPress={() => setCheckDecisions((prev) => ({ ...prev, [qid]: 'reject' }))}
                                activeOpacity={0.85}
                              >
                                <Text style={[styles.decideBtnText, decision === 'reject' && styles.decideBtnTextActive]}>Reddet</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )
                      })
                    ) : (
                      <Text style={styles.muted}>Bu checklist için cevap kaydı bulunamadı.</Text>
                    )}
                  </View>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Personel Notu</Text>
              <Text style={styles.noteBox}>
                {activeTask?.aciklama ? (isChecklistEvidence ? cleanPersonelNote(activeTask?.aciklama) : String(activeTask.aciklama)) : '—'}
              </Text>

              {canReject ? (
                <>
                  <Text style={styles.sectionLabel}>Red nedeni</Text>
                  <TextInput
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Kısaca red nedeni yazın..."
                    placeholderTextColor={MUTED}
                    style={styles.textArea}
                    multiline
                  />
                </>
              ) : null}

              {canApprove ? (
                <>
                  <Text style={styles.sectionLabel}>Onay Puanı</Text>
                  <TextInput
                    value={approvePointInput}
                    onChangeText={(v) => setApprovePointInput(v.replace(/[^0-9.,]/g, ''))}
                    placeholder="Örn: 10"
                    placeholderTextColor={MUTED}
                    keyboardType="decimal-pad"
                    style={styles.textArea}
                  />
                </>
              ) : null}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: EMERALD_500, opacity: canApprove ? 1 : 0.5 }]}
                  onPress={approveTask}
                  disabled={!canApprove}
                >
                  <Text style={styles.actionBtnText}>{approveLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: ROSE_500, opacity: canReject ? 1 : 0.5 }]}
                  onPress={rejectTask}
                  disabled={!canReject}
                >
                  <Text style={styles.actionBtnText}>{rejectLabel}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={closeEvidence} activeOpacity={0.85}>
                <Text style={styles.closeBtnText}>Kapat</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PhotoViewerModal
        visible={lightboxIndex != null}
        imageUrls={evidencePhotos}
        initialIndex={lightboxIndex ?? 0}
        onRequestClose={() => setLightboxIndex(null)}
        title="Kanıt Görseli"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.sm,
    ...Shadows.card,
  },
  title: {
    color: Colors.primary,
    fontSize: Typography.heading.fontSize,
    fontWeight: Typography.heading.fontWeight,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: MUTED,
    fontSize: Typography.body.fontSize,
    fontWeight: Typography.body.fontWeight,
  },
  listContent: { paddingBottom: Spacing.md },
  empty: { color: MUTED, textAlign: 'center', marginTop: Spacing.md },
  skeletonWrap: { paddingHorizontal: 0, paddingVertical: 8 },
  skeletonCard: {
    height: 92,
    borderRadius: Layout.borderRadius.lg,
    backgroundColor: MUTED,
    opacity: 0.12,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: Card.padding,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  metaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  metaPill: {
    backgroundColor: Colors.alpha.indigo10,
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: Radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
  },
  cardTitle: { color: Colors.primary, fontSize: Typography.subheading.fontSize, fontWeight: Typography.subheading.fontWeight, marginBottom: Spacing.xs },
  cardMeta: { color: MUTED, fontSize: Typography.body.fontSize, fontWeight: Typography.body.fontWeight },
  primaryBtn: {
    backgroundColor: INDIGO_600,
    borderRadius: Radii.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  primaryBtnText: { color: Colors.surface, fontWeight: Typography.heading.fontWeight, fontSize: Typography.body.fontSize },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.alpha.black55,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    ...Shadows.card,
  },
  modalScroll: { padding: Spacing.sm },
  modalTitle: { color: Colors.primary, fontWeight: Typography.subheading.fontWeight, fontSize: Typography.subheading.fontSize, marginBottom: Spacing.xs },
  modalMeta: { color: MUTED, fontWeight: Typography.body.fontWeight, fontSize: Typography.body.fontSize, marginBottom: Spacing.sm },
  detailList: {
    backgroundColor: Colors.alpha.gray10,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: Typography.body.fontWeight,
    marginBottom: 4,
  },
  sectionLabel: { color: Colors.primary, fontWeight: Typography.heading.fontWeight, fontSize: Typography.body.fontSize, marginBottom: Spacing.xs, marginTop: Spacing.sm },
  noteBox: {
    backgroundColor: Colors.alpha.gray10,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    color: Colors.primary,
    minHeight: 56,
  },
  muted: { color: MUTED, fontWeight: Typography.body.fontWeight },
  textArea: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    minHeight: 80,
    marginBottom: Spacing.xs,
  },
  actionRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  actionBtn: { flex: 1, borderRadius: Radii.md, paddingVertical: Spacing.xs, alignItems: 'center' },
  actionBtnText: { color: Colors.surface, fontWeight: Typography.heading.fontWeight, fontSize: Typography.body.fontSize },
  closeBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.alpha.gray20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray30,
    borderRadius: Radii.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  closeBtnText: { color: Colors.text, fontWeight: Typography.heading.fontWeight },
  photoThumbWrap: {
    width: 110,
    height: 90,
    borderRadius: Radii.md,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  photoThumbImg: { width: '100%', height: '100%', borderRadius: Radii.md },

  checklistAnswersBox: {
    marginBottom: Spacing.sm,
  },
  checkItemRow: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    flexDirection: 'column',
    gap: Spacing.xs,
  },
  checkQuestionLine: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '800',
    marginBottom: 4,
  },
  checkAnswerText: {
    color: MUTED,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
    marginBottom: 6,
  },
  checkDecisionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  decideBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Radii.full,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  decideBtnAcceptActive: {
    backgroundColor: Colors.alpha.emerald10,
    borderColor: Colors.alpha.emerald25,
  },
  decideBtnRejectActive: {
    backgroundColor: Colors.alpha.rose10,
    borderColor: Colors.alpha.rose25,
  },
  decideBtnText: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  decideBtnTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  questionPhotoWrap: {
    width: 88,
    height: 72,
    borderRadius: Radii.md,
    overflow: 'hidden',
    backgroundColor: Colors.alpha.gray10,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionPhotoImg: { width: '100%', height: '100%' },

  checklistAuditHeader: {
    backgroundColor: Colors.alpha.indigo06,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo20,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  checklistAuditHeaderTitle: {
    color: Colors.primary,
    fontWeight: '900',
    fontSize: Typography.body.fontSize,
    marginBottom: 4,
  },
  checklistAuditHeaderSub: {
    color: MUTED,
    fontWeight: Typography.body.fontWeight,
    fontSize: Typography.caption.fontSize,
  },
})

