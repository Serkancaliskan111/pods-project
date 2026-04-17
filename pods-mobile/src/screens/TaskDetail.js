import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  TextInput,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import PhotoViewerModal from '../components/PhotoViewerModal'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import {
  GOREV_TURU,
  buildKanitFotoDurumlari,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from '../lib/zincirTasks'

const BUCKET = 'gorev_kanitlari'
const CHECKLIST_PROGRESS_PREFIX = 'pods_task_checklist_progress_v1:'
const supabase = getSupabase()
const ThemeObj = Theme?.default ?? Theme
const { Colors, Layout, Typography } = ThemeObj

function extractPhotoUrls(task) {
  if (!task) return []
  const raw = task.kanit_resim_ler ?? task.kanit_fotograflari ?? task.fotograflar ?? task.images
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const t = raw.trim()
    try {
      if (t.startsWith('[') && t.endsWith(']')) {
        const parsed = JSON.parse(t)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      }
    } catch {
      // ignore
    }
    return t.includes(',') ? t.split(',').map((x) => x.trim()).filter(Boolean) : [t]
  }
  return []
}

export default function TaskDetail({ taskId: taskIdProp, onBack: onBackProp }) {
  const route = useRoute()
  const navigation = useNavigation()
  const { personel, permissions } = useAuth()
  const taskId = route.params?.taskId ?? taskIdProp
  const handleBack = useCallback(() => {
    if (onBackProp) onBackProp()
    else navigation?.goBack?.()
  }, [onBackProp, navigation])
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState([])
  const [personelNotu, setPersonelNotu] = useState('')
  const [templateQuestions, setTemplateQuestions] = useState([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [questionAnswers, setQuestionAnswers] = useState({})
  const [questionPhotos, setQuestionPhotos] = useState({})
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [completing, setCompleting] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [chainGorevSteps, setChainGorevSteps] = useState([])
  const [chainOnaySteps, setChainOnaySteps] = useState([])
  const [chainPersonNameMap, setChainPersonNameMap] = useState({})

  const isPermTruthy = useCallback(
    (key) => {
      const v = permissions?.[key]
      return v === true || v === 'true' || v === 1 || v === '1'
    },
    [permissions]
  )
  const canApproveTask = isPermTruthy('gorev_onayla') || isPermTruthy('denetim.onayla')
  const isManager =
    isPermTruthy('is_admin') ||
    isPermTruthy('is_manager') ||
    isPermTruthy('personel.yonet') ||
    isPermTruthy('personel_yonet') ||
    isPermTruthy('sube.yonet') ||
    isPermTruthy('sirket.yonet') ||
    isPermTruthy('rol.yonet') ||
    canApproveTask

  const isTopCompanyScope =
    !personel?.birim_id &&
    (isPermTruthy('is_admin') ||
      isPermTruthy('is_manager') ||
      isPermTruthy('sirket.yonet') ||
      isPermTruthy('sube.yonet') ||
      isPermTruthy('rol.yonet') ||
      isPermTruthy('personel.yonet'))

  const load = useCallback(async () => {
    if (!taskId || !personel?.id || !personel?.ana_sirket_id) {
      setLoading(false)
      return
    }

    try {
      const selectWithManagerNote =
        'id, baslik, is_sablon_id, durum, grup_id, acil, aciklama, red_nedeni, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik, aciklama)'
      const selectWithoutManagerNote =
        'id, baslik, is_sablon_id, durum, grup_id, acil, aciklama, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik, aciklama)'

      const selectWithManagerNoteNoGroup =
        'id, baslik, is_sablon_id, durum, acil, aciklama, red_nedeni, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik, aciklama)'
      const selectWithoutManagerNoteNoGroup =
        'id, baslik, is_sablon_id, durum, acil, aciklama, checklist_cevaplari, kanit_resim_ler, aciklama_zorunlu, created_at, baslama_tarihi, son_tarih, foto_zorunlu, min_foto_sayisi, sorumlu_personel_id, atayan_personel_id, ana_sirket_id, birim_id, gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim, is_sablonlari(baslik, aciklama)'

      const buildScopedQuery = (selectClause) => {
        let q = supabase
          .from('isler')
          .select(selectClause)
          .eq('id', taskId)
          .eq('ana_sirket_id', personel.ana_sirket_id)
        if (isManager && !isTopCompanyScope && personel?.birim_id) {
          q = q.eq('birim_id', personel.birim_id)
        }
        if (!isManager) {
          q = q.eq('sorumlu_personel_id', personel.id)
        }
        return q
      }

      let selectMain = selectWithManagerNote
      let selectForFallback = selectWithoutManagerNote

      let { data, error } = await buildScopedQuery(selectMain).maybeSingle()

      if (
        error?.code === '42703' &&
        String(error?.message || '').toLowerCase().includes('grup_id')
      ) {
        selectMain = selectWithManagerNoteNoGroup
        selectForFallback = selectWithoutManagerNoteNoGroup
        ;({ data, error } = await buildScopedQuery(selectMain).maybeSingle())
      } else if (
        error?.code === '42703' &&
        (String(error?.message || '').toLowerCase().includes('gorev_turu') ||
          String(error?.message || '').toLowerCase().includes('zincir_'))
      ) {
        selectMain = selectWithManagerNote
          .replace(', gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim', '')
        selectForFallback = selectWithoutManagerNote
          .replace(', gorev_turu, zincir_aktif_adim, zincir_onay_aktif_adim', '')
        ;({ data, error } = await buildScopedQuery(selectMain).maybeSingle())
      } else if (error?.code === '42703') {
        ;({ data, error } = await buildScopedQuery(selectForFallback).maybeSingle())
      }

      let resolved = data
      if (error || !resolved) {
        if (__DEV__ && error) console.warn('TaskDetail load error', error)
        // Fallback: eski/eksik tenant alanlı kayıtlarda en azından görev sahibi kendi kaydını görebilsin.
        if (!isManager) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('isler')
            .select(selectForFallback)
            .eq('id', taskId)
            .eq('sorumlu_personel_id', personel.id)
            .maybeSingle()
          if (!fallbackError && fallbackData) {
            resolved = fallbackData
          }
        }
        if (!resolved) {
          // Son fallback: kayıt tutarsız tenant/birim/sorumlu alanlarına sahip olsa bile detay ekranı açılsın.
          const { data: lastFallbackData, error: lastFallbackError } = await supabase
            .from('isler')
            .select(selectForFallback)
            .eq('id', taskId)
            .maybeSingle()
          if (!lastFallbackError && lastFallbackData) {
            resolved = lastFallbackData
          }
        }
      }
      const safe = resolved ? JSON.parse(JSON.stringify(resolved)) : null
      setTask(safe)
      setChainGorevSteps([])
      setChainOnaySteps([])
      setChainPersonNameMap({})
      let gorevSteps = []
      let onaySteps = []
      if (safe?.id && (isZincirGorevTuru(safe.gorev_turu) || safe.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
        const { data: zg } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('id, adim_no, personel_id, durum, kanit_resim_ler, kanit_foto_durumlari')
          .eq('is_id', safe.id)
          .order('adim_no', { ascending: true })
        gorevSteps = zg || []
        if (gorevSteps.length) setChainGorevSteps(gorevSteps)
      }
      if (safe?.id && isZincirOnayTuru(safe.gorev_turu)) {
        const { data: zo } = await supabase
          .from('isler_zincir_onay_adimlari')
          .select('id, adim_no, onaylayici_personel_id, durum')
          .eq('is_id', safe.id)
          .order('adim_no', { ascending: true })
        onaySteps = zo || []
        if (onaySteps.length) setChainOnaySteps(onaySteps)
      }
      const chainPersonIds = Array.from(
        new Set([
          ...gorevSteps.map((s) => s?.personel_id).filter(Boolean),
          ...onaySteps.map((s) => s?.onaylayici_personel_id).filter(Boolean),
        ].map((x) => String(x))),
      )
      if (chainPersonIds.length) {
        const { data: people } = await supabase
          .from('personeller')
          .select('id,ad,soyad,email')
          .in('id', chainPersonIds)
        const map = {}
        for (const p of people || []) {
          const full = [p?.ad, p?.soyad].filter(Boolean).join(' ').trim()
          map[String(p.id)] = full || p?.email || String(p.id)
        }
        setChainPersonNameMap(map)
      }
      // Personel notu alanı ilk açıldığında her zaman boş olsun
      setPersonelNotu('')
    } catch (e) {
      if (__DEV__) console.warn('TaskDetail load error', e)
      setTask(null)
    } finally {
      setLoading(false)
    }
  }, [taskId, personel?.id, personel?.ana_sirket_id, personel?.birim_id, isManager, isTopCompanyScope])

  useEffect(() => {
    load()
  }, [load])

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('İzin gerekli', 'Kamera izni verin.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    })
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0]
      setPhotos((prev) => [...prev, {
        uri: asset.uri,
        base64: asset.base64 || null,
      }])
    }
  }, [])

  const removePhoto = useCallback((index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const checklistStorageKey = useMemo(() => `${CHECKLIST_PROGRESS_PREFIX}${String(taskId || '')}`, [taskId])

  const persistChecklistProgress = useCallback(
    async (nextIndex, nextAnswers, nextPhotos, nextNote = personelNotu) => {
      if (!taskId) return
      const payload = {
        questionIndex: Number.isFinite(nextIndex) ? nextIndex : 0,
        answers: nextAnswers || {},
        photos: nextPhotos || {},
        note: String(nextNote || ''),
      }
      setDraftSaving(true)
      try {
        await AsyncStorage.setItem(checklistStorageKey, JSON.stringify(payload))
        setDraftSavedAt(Date.now())
      } catch {
        // best-effort
      } finally {
        setDraftSaving(false)
      }
    },
    [checklistStorageKey, taskId, personelNotu],
  )

  useEffect(() => {
    const loadChecklist = async () => {
      const sablonId = task?.is_sablon_id
      if (!sablonId || !personel?.ana_sirket_id) {
        setTemplateQuestions([])
        setQuestionIndex(0)
        setQuestionAnswers({})
        setQuestionPhotos({})
        return
      }

      setChecklistLoading(true)
      try {
        const { data: qRows, error } = await supabase
          .from('is_sablon_sorulari')
          .select('id, sablon_id, soru_metni, soru_tipi, puan_degeri, foto_zorunlu, min_foto_sayisi, zorunlu_mu, sira')
          .eq('sablon_id', sablonId)
          .order('sira', { ascending: true })

        if (error) throw error

        const qs = (qRows || []).map((q, idx) => ({
          ...q,
          _idx: idx,
          soru_tipi: String(q?.soru_tipi || 'METIN').toUpperCase(),
        }))

        setTemplateQuestions(qs)

        // draft restore
        try {
          const raw = await AsyncStorage.getItem(checklistStorageKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            setQuestionIndex(Math.min(Number(parsed?.questionIndex) || 0, Math.max(qs.length - 1, 0)))
            setQuestionAnswers(parsed?.answers && typeof parsed.answers === 'object' ? parsed.answers : {})
            setQuestionPhotos(parsed?.photos && typeof parsed.photos === 'object' ? parsed.photos : {})
            setPersonelNotu(String(parsed?.note || ''))
          }
        } catch {
          // ignore
        }
      } catch (e) {
        if (__DEV__) console.warn('TaskDetail loadChecklist error', e)
        setTemplateQuestions([])
      } finally {
        setChecklistLoading(false)
      }
    }

    loadChecklist()
  }, [task?.is_sablon_id, personel?.ana_sirket_id, checklistStorageKey])

  const takePhotoForQuestion = useCallback(
    async (questionId) => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('İzin gerekli', 'Kamera izni verin.')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      })

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        const qid = String(questionId)
        setQuestionPhotos((prev) => ({
          ...prev,
          [qid]: [...(prev?.[qid] || []), { uri: asset.uri, base64: asset.base64 || null }],
        }))
      }
    },
    [],
  )

  const removeQuestionPhoto = useCallback(
    async (questionId, photoIndex) => {
      const qid = String(questionId)
      setQuestionPhotos((prev) => {
        const list = prev?.[qid] || []
        const nextForQuestion = list.filter((_, i) => i !== photoIndex)
        return { ...prev, [qid]: nextForQuestion }
      })
    },
    [],
  )

  const hasChecklist = !!task?.is_sablon_id

  const checklistDecisionsByQuestionId = useMemo(() => {
    const rows = Array.isArray(task?.checklist_cevaplari) ? task.checklist_cevaplari : []
    const map = {}
    for (const row of rows) {
      const qid = row?.soru_id != null ? String(row.soru_id) : null
      if (!qid) continue
      map[qid] = String(row?.denetim_karari || '').toLowerCase() // accept/reject
    }
    return map
  }, [task?.checklist_cevaplari])

  const isQuestionDone = useCallback(
    (q) => {
      const qid = String(q?.id || '')
      const qType = String(q?.soru_tipi || 'METIN').toUpperCase()
      const required = !!q?.zorunlu_mu
      const answer = questionAnswers?.[qid]
      const qPhotos = questionPhotos?.[qid] || []

      if (qType === 'EVET_HAYIR') return answer === 'EVET' || answer === 'HAYIR'
      if (qType === 'METIN') return required ? !!String(answer || '').trim() : !!String(answer || '').trim()
      if (qType === 'FOTOGRAF') {
        const qMin = Number(q?.min_foto_sayisi) || 0
        const need = !!q?.foto_zorunlu || required
        if (!need) return qPhotos.length > 0
        return qPhotos.length >= qMin
      }
      return false
    },
    [questionAnswers, questionPhotos],
  )

  useEffect(() => {
    if (!hasChecklist) return
    // lightweight autosave (debounced)
    const t = setTimeout(() => {
      persistChecklistProgress(questionIndex, questionAnswers, questionPhotos, personelNotu)
    }, 600)
    return () => clearTimeout(t)
  }, [hasChecklist, persistChecklistProgress, questionIndex, questionAnswers, questionPhotos, personelNotu])

  const completeTask = useCallback(async () => {
    if (!taskId || !task) return
    const isTaskOwner = String(task.sorumlu_personel_id || '') === String(personel?.id || '')
    if (!isTaskOwner && !isManager) {
      Alert.alert('Yetki yok', 'Bu görevi güncelleme yetkiniz bulunmuyor.')
      return
    }
    const minFoto = Number(task.min_foto_sayisi) || 0
    const fotoZorunlu = !!task.foto_zorunlu
    const aciklamaZorunlu = !!task.aciklama_zorunlu
    const trimmedNote = (personelNotu || '').trim()
    const dueDate = task?.son_tarih ? new Date(task.son_tarih) : null
    const isOverdue = !!(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now())

    if (isOverdue) {
      Alert.alert('Gecikmiş görev', 'Bu görev gecikmiş durumda olduğu için tamamlanamaz.')
      return
    }

    if (!hasChecklist) {
      if (aciklamaZorunlu && !trimmedNote) {
        Alert.alert('Açıklama gerekli', 'Bu görevi tamamlarken açıklama yazmanız gerekiyor.')
        return
      }

      if (fotoZorunlu && photos.length < minFoto) {
        Alert.alert('Eksik fotoğraf', `En az ${minFoto} fotoğraf eklemelisiniz.`)
        return
      }
    }

    if (hasChecklist && templateQuestions.length) {
      // Checklist validations
      for (const q of templateQuestions) {
        const qid = String(q?.id)
        const qType = String(q?.soru_tipi || 'METIN').toUpperCase()
        const isRequired = !!q?.zorunlu_mu
        const qPhotos = questionPhotos?.[qid] || []
        const answer = questionAnswers?.[qid]

        if (qType === 'EVET_HAYIR' && isRequired && answer !== 'EVET' && answer !== 'HAYIR') {
          Alert.alert('Eksik cevap', `Checklist sorusu cevaplanmalı: ${q?.soru_metni || ''}`)
          return
        }
        if (qType === 'METIN' && isRequired && !String(answer || '').trim()) {
          Alert.alert('Eksik cevap', `Checklist sorusu cevaplanmalı: ${q?.soru_metni || ''}`)
          return
        }
        if (qType === 'FOTOGRAF') {
          const qMin = Number(q?.min_foto_sayisi) || 0
          const need = !!q?.foto_zorunlu || isRequired
          if (need && qPhotos.length < qMin) {
            Alert.alert('Eksik fotoğraf', `En az ${qMin} fotoğraf ekleyin: ${q?.soru_metni || ''}`)
            return
          }
        }
      }
    }
    setCompleting(true)
    try {
      if (
        hasChecklist &&
        task?.gorev_turu &&
        task.gorev_turu !== GOREV_TURU.NORMAL &&
        task.gorev_turu !== 'normal'
      ) {
        Alert.alert(
          'Zincir modu',
          'Şablonlu (checklist) görevlerde zincir görev/onay henüz desteklenmiyor; şablonsuz görev oluşturun.',
        )
        setCompleting(false)
        return
      }

      const durumText = String(task?.durum || '').toLowerCase()
      const isResubmission =
        durumText.includes('onaylanmad') ||
        durumText.includes('revize') ||
        durumText.includes('redd')

      /** 🔗 Zincir görev: ara halkalar — sonraki personele devret veya onaya gönder */
      if (!hasChecklist && isZincirGorevTuru(task?.gorev_turu) && chainGorevSteps.length) {
        const uploadedUrls = []
        for (const photo of photos) {
          const uri = photo.uri
          let arrayBuffer
          if (photo.base64) {
            const raw = photo.base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
            arrayBuffer = decodeBase64(raw)
          } else {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
            const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
            arrayBuffer = decodeBase64(raw)
          }
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
          const { data, error: uploadError } = await supabase.storage.from(BUCKET).upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })
          if (uploadError) {
            Alert.alert('Yükleme hatası', uploadError.message || 'Fotoğraf yüklenemedi')
            setCompleting(false)
            return
          }
          const path = data?.path ?? data
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
          if (urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl)
        }
        const currentAdim = Number(task.zincir_aktif_adim) || 1
        const currentRow = chainGorevSteps.find((s) => Number(s.adim_no) === currentAdim)
        if (!currentRow || String(currentRow.personel_id) !== String(personel?.id)) {
          Alert.alert('Sıra hatası', 'Bu zincir adımı sizin sıranızda değil.')
          setCompleting(false)
          return
        }
        const kanitDurum = buildKanitFotoDurumlari(uploadedUrls)
        const { error: stepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .update({
            kanit_resim_ler: uploadedUrls,
            kanit_foto_durumlari: kanitDurum,
            durum: 'tamamlandi',
            tamamlandi_at: new Date().toISOString(),
            aciklama: trimmedNote || null,
          })
          .eq('id', currentRow.id)
        if (stepErr) {
          Alert.alert('Hata', stepErr.message || 'Zincir adımı kaydedilemedi')
          setCompleting(false)
          return
        }
        const total = chainGorevSteps.length
        if (currentAdim < total) {
          const nextRow = chainGorevSteps.find((s) => Number(s.adim_no) === currentAdim + 1)
          if (!nextRow) {
            Alert.alert('Hata', 'Sonraki adım bulunamadı')
            setCompleting(false)
            return
          }
          const { data: nextPerson } = await supabase
            .from('personeller')
            .select('id, birim_id')
            .eq('id', nextRow.personel_id)
            .maybeSingle()
          const { error: handoffErr } = await supabase
            .from('isler')
            .update({
              sorumlu_personel_id: nextRow.personel_id,
              birim_id: nextPerson?.birim_id || null,
              zincir_aktif_adim: currentAdim + 1,
              durum: 'ATANDI',
            })
            .eq('id', taskId)
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
          if (handoffErr) {
            Alert.alert('Hata', handoffErr.message || 'Devretme başarısız')
            setCompleting(false)
            return
          }
          Alert.alert('Tamam', 'Görev sıradaki personele iletildi.', [{ text: 'OK', onPress: handleBack }])
          setCompleting(false)
          load()
          return
        }
        const nextPayload = {
          durum: isResubmission ? 'Tekrar Gönderildi' : 'Onay Bekliyor',
          kanit_resim_ler: uploadedUrls,
        }
        if (trimmedNote) nextPayload.aciklama = trimmedNote
        if (
          chainOnaySteps.length &&
          (task.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY || task.gorev_turu === GOREV_TURU.ZINCIR_ONAY)
        ) {
          const firstOnayPersonId = chainOnaySteps[0]?.onaylayici_personel_id
          if (firstOnayPersonId) {
            const { data: firstOnayPerson } = await supabase
              .from('personeller')
              .select('id, birim_id')
              .eq('id', firstOnayPersonId)
              .maybeSingle()
            nextPayload.sorumlu_personel_id = firstOnayPersonId
            nextPayload.birim_id = firstOnayPerson?.birim_id || null
          }
          nextPayload.zincir_onay_aktif_adim = 1
        }
        let upd = supabase
          .from('isler')
          .update(nextPayload)
          .eq('id', taskId)
          .eq('ana_sirket_id', personel?.ana_sirket_id || '')
        if (!isTopCompanyScope && personel?.birim_id) {
          upd = upd.eq('birim_id', personel.birim_id)
        }
        if (!isManager) {
          upd = upd.eq('sorumlu_personel_id', personel?.id || '')
        }
        const { error: lastErr } = await upd
        if (lastErr) {
          Alert.alert('Güncelleme hatası', lastErr.message || 'Görev tamamlanamadı')
          setCompleting(false)
          return
        }
        Alert.alert('Başarılı', 'Son halka tamamlandı; görev onay sürecinde.', [{ text: 'Tamam', onPress: handleBack }])
        setCompleting(false)
        load()
        return
      }

      const updatePayload = {
        // İlk gönderim denetime düşer, red/revizyondan sonra tekrar gönderim işaretlenir.
        durum: isResubmission ? 'Tekrar Gönderildi' : 'Onay Bekliyor',
      }

      if (trimmedNote) updatePayload.aciklama = trimmedNote

      if (
        chainOnaySteps.length &&
        (task.gorev_turu === GOREV_TURU.ZINCIR_ONAY ||
          task.gorev_turu === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) &&
        !isZincirGorevTuru(task?.gorev_turu)
      ) {
        updatePayload.zincir_onay_aktif_adim = 1
      }

      if (hasChecklist && templateQuestions.length) {
        const checklistAnswersPayload = []
        const uploadedUrls = []

        for (let idx = 0; idx < templateQuestions.length; idx++) {
          const q = templateQuestions[idx]
          const qid = String(q?.id)
          const qType = String(q?.soru_tipi || 'METIN').toUpperCase()
          const qPhotos = questionPhotos?.[qid] || []
          const ans = questionAnswers?.[qid]

          if (qType === 'FOTOGRAF') {
            const qPhotoUrls = []
            for (const photo of qPhotos) {
              const uri = photo.uri
              let arrayBuffer
              if (photo.base64) {
                const raw = photo.base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
                arrayBuffer = decodeBase64(raw)
              } else {
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
                const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
                arrayBuffer = decodeBase64(raw)
              }

              const fileName = `${taskId}-${qid}-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
              const { data, error: uploadError } = await supabase.storage.from(BUCKET).upload(fileName, arrayBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: false,
              })
              if (uploadError) {
                Alert.alert('Yükleme hatası', uploadError.message || 'Fotoğraf yüklenemedi')
                setCompleting(false)
                return
              }
              const path = data?.path ?? data
              const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
              if (urlData?.publicUrl) {
                qPhotoUrls.push(urlData.publicUrl)
                uploadedUrls.push(urlData.publicUrl)
              }
            }

            checklistAnswersPayload.push({
              sira: idx + 1,
              soru_id: qid,
              soru_metni: q?.soru_metni || 'Fotoğraf sorusu',
              soru_tipi: qType,
              cevap: null,
              foto_sayisi: qPhotoUrls.length,
              fotograflar: qPhotoUrls,
            })
          } else if (qType === 'EVET_HAYIR') {
            checklistAnswersPayload.push({
              sira: idx + 1,
              soru_id: qid,
              soru_metni: q?.soru_metni || 'Evet/Hayır',
              soru_tipi: qType,
              cevap: ans || null,
              foto_sayisi: 0,
              fotograflar: [],
            })
          } else {
            checklistAnswersPayload.push({
              sira: idx + 1,
              soru_id: qid,
              soru_metni: q?.soru_metni || 'Metin',
              soru_tipi: qType,
              cevap: String(ans || ''),
              foto_sayisi: 0,
              fotograflar: [],
            })
          }
        }

        updatePayload.checklist_cevaplari = checklistAnswersPayload
        // compatibility: eski kanıt ekranları/raporlar için düz kanıt listesi
        if (uploadedUrls.length > 0) updatePayload.kanit_resim_ler = uploadedUrls
      } else {
        // Ad-hoc görev (standart)
        const uploadedUrls = []
        for (const photo of photos) {
          const uri = photo.uri
          let arrayBuffer
          if (photo.base64) {
            const raw = photo.base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
            arrayBuffer = decodeBase64(raw)
          } else {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
            const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
            arrayBuffer = decodeBase64(raw)
          }
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
          const { data, error: uploadError } = await supabase.storage.from(BUCKET).upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })
          if (uploadError) {
            Alert.alert('Yükleme hatası', uploadError.message || 'Fotoğraf yüklenemedi')
            setCompleting(false)
            return
          }
          const path = data?.path ?? data
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
          if (urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl)
        }
        if (uploadedUrls.length > 0) updatePayload.kanit_resim_ler = uploadedUrls
      }
      let updateQuery = supabase
        .from('isler')
        .update(updatePayload)
        .eq('id', taskId)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      if (!isTopCompanyScope && personel?.birim_id) {
        updateQuery = updateQuery.eq('birim_id', personel.birim_id)
      }
      if (!isManager) {
        updateQuery = updateQuery.eq('sorumlu_personel_id', personel?.id || '')
      }
      const { error: updateError } = await updateQuery
      if (updateError) {
        Alert.alert('Güncelleme hatası', updateError.message || 'Görev tamamlanamadı')
        setCompleting(false)
        return
      }

      // Grup (bireysel olmayan çoklu atama) modunda: bir kişi gönderdikten sonra aynı grup
      // içindeki diğer personellerin görevini sistemlerinden düşürmek için onları TAMAMLANDI yapıyoruz.
      if (task?.grup_id) {
        try {
          let otherUpdate = supabase
            .from('isler')
            .update({ durum: 'TAMAMLANDI', puan: 0 })
            .eq('ana_sirket_id', personel?.ana_sirket_id || '')
            .eq('grup_id', task.grup_id)
            .neq('id', taskId)

          if (!isTopCompanyScope && personel?.birim_id) {
            otherUpdate = otherUpdate.eq('birim_id', personel.birim_id)
          }

          await otherUpdate
        } catch {
          // best-effort suppression
        }
      }

      Alert.alert('Başarılı', 'Görev tamamlandı.', [{ text: 'Tamam', onPress: handleBack }])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Bir hata oluştu')
    } finally {
      setCompleting(false)
    }
  }, [
    taskId,
    task,
    photos,
    templateQuestions,
    questionIndex,
    questionAnswers,
    questionPhotos,
    hasChecklist,
    personelNotu,
    handleBack,
    personel?.id,
    personel?.ana_sirket_id,
    personel?.birim_id,
    isManager,
    isTopCompanyScope,
    chainGorevSteps,
    chainOnaySteps,
    load,
  ])

  const approveTask = useCallback(async () => {
    if (!taskId || !task) return
    if (!canApproveTask) return
    try {
      let approveQuery = supabase
        .from('isler')
        .update({ durum: 'Tamamlandı' })
        .eq('id', taskId)
        .eq('ana_sirket_id', personel?.ana_sirket_id || '')
      if (!isTopCompanyScope && personel?.birim_id) {
        approveQuery = approveQuery.eq('birim_id', personel.birim_id)
      }
      const { error } = await approveQuery
      if (error) {
        Alert.alert('Onay hatası', error.message || 'Görev onaylanamadı')
        return
      }
      Alert.alert('Başarılı', 'Görev onaylandı.', [{ text: 'Tamam', onPress: handleBack }])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Bir hata oluştu')
    }
  }, [
    canApproveTask,
    taskId,
    task,
    personel?.ana_sirket_id,
    personel?.birim_id,
    isManager,
    isTopCompanyScope,
    handleBack,
  ])

  const title = task?.baslik || task?.is_sablonlari?.baslik || 'Görev'
  const durum = String(task?.durum ?? 'Bekliyor')
  const isDone = durum.toUpperCase().includes('TAMAM') || durum.toUpperCase().includes('BITTI')
  const isTaskOwner = String(task?.sorumlu_personel_id || '') === String(personel?.id || '')
  const isTaskSender = String(task?.atayan_personel_id || '') === String(personel?.id || '')
  const canEditTask = isTaskOwner || isManager
  const durumLower = String(task?.durum || '').toLowerCase()
  const isApprovalPending =
    durumLower.includes('onay bekliyor') ||
    durumLower.includes('tekrar gönderildi') ||
    durumLower.includes('tekrar gonderildi')
  // Onay sürecindeki görevleri personel veya işi gönderen kişi tekrar açıp işlem yapamaz.
  const isLocked = isApprovalPending && !isManager && (isTaskOwner || isTaskSender)
  const minFoto = Number(task?.min_foto_sayisi) || 0
  const fotoZorunlu = !!task?.foto_zorunlu
  const aciklamaZorunlu = !!task?.aciklama_zorunlu
  const created = task?.created_at ? new Date(task.created_at).toLocaleString('tr-TR') : ''
  const sonTarih = task?.son_tarih ? new Date(task.son_tarih).toLocaleString('tr-TR') : ''
  const evidencePhotos = extractPhotoUrls(task)
  const acil = !!task?.acil
  const durumDisplay =
    acil && String(durum || '').toUpperCase().includes('ACIL') ? 'Bekliyor' : durum
  const chainStepPhotoUrls = useMemo(
    () =>
      (chainGorevSteps || [])
        .flatMap((s) => extractPhotoUrls(s))
        .filter(Boolean),
    [chainGorevSteps],
  )
  const allEvidencePhotos = useMemo(() => {
    const merged = [...evidencePhotos, ...chainStepPhotoUrls]
    return Array.from(new Set(merged.filter(Boolean)))
  }, [evidencePhotos, chainStepPhotoUrls])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={36} color={Colors.primary} />
      </View>
    )
  }

  if (!task) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Görev bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Onay sürecindeki görevleri personel/atayan tekrar açıp işlem yapamaz.
  if (isLocked) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockTitle}>Görev onay sürecinde</Text>
        <Text style={styles.lockText}>
          Onay bekleyen işler tekrar açılamaz. Reddedilirse veya tamamlanırsa tekrar görebilirsiniz.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <PremiumBackgroundPattern />
      <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
        <Text style={styles.backBtnText}>← Geri</Text>
      </TouchableOpacity>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
          <Text style={styles.title}>{title}</Text>
          {task?.gorev_turu && task.gorev_turu !== 'normal' ? (
            <Text style={{ fontSize: 12, color: '#6366f1', fontWeight: '600', marginBottom: 6 }}>
              {task.gorev_turu === 'zincir_gorev' && '🔗 Zincir görev'}
              {task.gorev_turu === 'zincir_onay' && '🔗 Zincir onay'}
              {task.gorev_turu === 'zincir_gorev_ve_onay' && '🔗 Zincir görev + onay'}
            </Text>
          ) : null}
          <View style={styles.badgeWrap}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{durumDisplay}</Text>
            </View>
            {acil ? (
              <View style={[styles.badge, styles.badgeAcil]}>
                <Text style={[styles.badgeText, styles.badgeAcilText]}>ACİL</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.label}>Atanma tarihi</Text>
          <Text style={styles.value}>{created}</Text>
          {sonTarih ? (
            <>
              <Text style={styles.label}>Son tarih</Text>
              <Text style={styles.value}>{sonTarih}</Text>
            </>
          ) : null}
          {(task?.is_sablonlari?.aciklama || task?.aciklama) ? (
            <>
              <Text style={styles.label}>Görev Açıklaması</Text>
              <Text style={styles.value}>{task?.is_sablonlari?.aciklama || task?.aciklama}</Text>
            </>
          ) : null}
          {task?.red_nedeni ? (
            <>
              <Text style={styles.label}>Yönetici Notu</Text>
              <Text style={styles.value}>({String(task.red_nedeni)})</Text>
            </>
          ) : String(task?.durum || '').toLowerCase().includes('onaylanmad') && task?.aciklama ? (
            <>
              <Text style={styles.label}>Yönetici Notu</Text>
              <Text style={styles.value}>{String(task.aciklama)}</Text>
            </>
          ) : null}
        </View>

        {isDone ? (
          <View style={styles.mediaCard}>
            <Text style={styles.sectionTitle}>Kanıt Fotoğrafları</Text>
            {allEvidencePhotos.length ? (
              <View style={styles.photoList}>
                {allEvidencePhotos.map((url, i) => (
                  <TouchableOpacity
                    key={`${url}-${i}`}
                    style={styles.photoThumb}
                    activeOpacity={0.85}
                    onPress={() => setLightboxIndex(i)}
                  >
                    <Image source={{ uri: url }} style={styles.thumbImg} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.value}>Kanıt fotoğrafı yok.</Text>
            )}
            {chainGorevSteps.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.sectionTitle}>Zincir adım detayları</Text>
                {chainGorevSteps.map((step) => {
                  const stepPhotos = extractPhotoUrls(step)
                  return (
                    <View key={`done-step-${step.id}`} style={styles.questionCardInline}>
                      <Text style={styles.questionTitle}>
                        {Number(step?.adim_no) || '-'}. adım • Personel:{' '}
                        {chainPersonNameMap[String(step?.personel_id)] || String(step?.personel_id || '-')}
                      </Text>
                      <Text style={styles.value}>Durum: {String(step?.durum || '-')}</Text>
                      {stepPhotos.length ? (
                        <View style={[styles.photoList, { marginTop: 8, marginBottom: 0 }]}>
                          {stepPhotos.map((url, idx) => {
                            const globalIdx = allEvidencePhotos.findIndex((x) => x === url)
                            return (
                              <TouchableOpacity
                                key={`${step.id}-${idx}`}
                                style={styles.photoThumb}
                                activeOpacity={0.85}
                                onPress={() => setLightboxIndex(globalIdx >= 0 ? globalIdx : 0)}
                              >
                                <Image source={{ uri: url }} style={styles.thumbImg} />
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      ) : (
                        <Text style={styles.hint}>Bu adımda fotoğraf yok.</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            ) : null}
            {chainOnaySteps.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.sectionTitle}>Zincir onay adımları</Text>
                {chainOnaySteps.map((step) => (
                  <View key={`done-onay-${step.id}`} style={styles.questionCardInline}>
                    <Text style={styles.questionTitle}>
                      {Number(step?.adim_no) || '-'}. onay adımı • Onaylayan:{' '}
                      {chainPersonNameMap[String(step?.onaylayici_personel_id)] ||
                        String(step?.onaylayici_personel_id || '-')}
                    </Text>
                    <Text style={styles.value}>Durum: {String(step?.durum || '-')}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {!isLocked && !isDone && canEditTask && (
          <View style={styles.actionCard}>
            {!hasChecklist ? (
              <>
                <Text style={styles.sectionTitle}>Personel Notu</Text>
                <Text style={styles.label}>
                  Açıklamanız {aciklamaZorunlu ? '(zorunlu)' : '(isteğe bağlı)'}
                </Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Yaptığınız işi kısaca açıklayın..."
                  multiline
                  value={personelNotu}
                  onChangeText={setPersonelNotu}
                />
                {fotoZorunlu && <Text style={styles.hint}>En az {minFoto} fotoğraf ekleyin</Text>}
                <TouchableOpacity style={[styles.photoBtn, styles.photoBtnSingle]} onPress={takePhoto}>
                  <Text style={styles.photoBtnText}>Fotoğraf Çek</Text>
                </TouchableOpacity>
                <View style={styles.photoList}>
                  {photos.map((p, i) => (
                    <View key={i} style={styles.photoThumb}>
                      <Image source={{ uri: p.uri }} style={styles.thumbImg} />
                      <TouchableOpacity style={styles.removeThumb} onPress={() => removePhoto(i)}>
                        <Text style={styles.removeThumbText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Checklist Soruları</Text>
                <View style={styles.checklistDraftRow}>
                  <Text style={styles.draftText}>
                    {draftSaving
                      ? 'Taslak kaydediliyor...'
                      : draftSavedAt
                        ? `Son kayıt: ${new Date(draftSavedAt).toLocaleTimeString('tr-TR')}`
                        : 'Taslak hazır'}
                  </Text>
                </View>

                {checklistLoading ? (
                  <View style={styles.centered}>
                    <ActivityIndicator size={36} color={Colors.primary} />
                  </View>
                ) : (
                  <>
                    <View style={styles.questionList}>
                      {templateQuestions.map((q, idx) => {
                        const qid = String(q?.id || idx)
                        const done = isQuestionDone(q)
                        const decision = checklistDecisionsByQuestionId[qid] || ''
                        const isActive = idx === questionIndex
                        const statusIcon = decision === 'reject' ? '✕' : decision === 'accept' ? '✓' : done ? '✓' : '•'
                        const statusColor =
                          decision === 'reject' ? Colors.error : decision === 'accept' ? Colors.success : done ? Colors.success : Colors.mutedText

                        return (
                          <View key={qid}>
                            <TouchableOpacity
                              style={[styles.questionListItem, isActive && styles.questionListItemActive]}
                              onPress={() => setQuestionIndex(idx)}
                              activeOpacity={0.85}
                            >
                              <Text style={[styles.questionListIndex, { color: Colors.text }]}>
                                {idx + 1}
                              </Text>
                              <View style={styles.questionListTextWrap}>
                                <Text style={styles.questionListTitle} numberOfLines={1}>
                                  {q?.soru_metni || 'Soru'}
                                </Text>
                                <Text style={styles.questionListMeta}>
                                  {String(q?.soru_tipi || '').toUpperCase()}
                                </Text>
                              </View>
                              <Text style={[styles.questionListStatus, { color: statusColor }]}>{statusIcon}</Text>
                            </TouchableOpacity>

                            {isActive ? (
                              <View style={styles.questionCardInline}>
                                <Text style={styles.questionTitle}>{q?.soru_metni || 'Soru'}</Text>

                                {String(q?.soru_tipi || '').toUpperCase() === 'EVET_HAYIR' ? (
                                  <View style={styles.yesNoRow}>
                                    <TouchableOpacity
                                      style={[styles.answerBtn, questionAnswers[String(q?.id)] === 'EVET' && styles.answerBtnActive]}
                                      onPress={() => setQuestionAnswers((prev) => ({ ...prev, [String(q?.id)]: 'EVET' }))}
                                      activeOpacity={0.85}
                                    >
                                      <Text style={styles.answerBtnText}>Evet</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[styles.answerBtn, questionAnswers[String(q?.id)] === 'HAYIR' && styles.answerBtnActive]}
                                      onPress={() => setQuestionAnswers((prev) => ({ ...prev, [String(q?.id)]: 'HAYIR' }))}
                                      activeOpacity={0.85}
                                    >
                                      <Text style={styles.answerBtnText}>Hayır</Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : null}

                                {String(q?.soru_tipi || '').toUpperCase() === 'METIN' ? (
                                  <TextInput
                                    style={styles.noteInput}
                                    placeholder="Cevabınızı yazın..."
                                    multiline
                                    value={String(questionAnswers[String(q?.id)] || '')}
                                    onChangeText={(txt) => setQuestionAnswers((prev) => ({ ...prev, [String(q?.id)]: txt }))}
                                  />
                                ) : null}

                                {String(q?.soru_tipi || '').toUpperCase() === 'FOTOGRAF' ? (
                                  <>
                                    {(!!q?.foto_zorunlu || !!q?.zorunlu_mu) ? (
                                      <Text style={styles.hint}>En az {Number(q?.min_foto_sayisi) || 0} fotoğraf ekleyin</Text>
                                    ) : null}

                                    <TouchableOpacity style={[styles.photoBtn, styles.photoBtnSingle]} onPress={() => takePhotoForQuestion(q?.id)}>
                                      <Text style={styles.photoBtnText}>Fotoğraf Çek</Text>
                                    </TouchableOpacity>
                                    <View style={styles.photoList}>
                                      {(questionPhotos?.[String(q?.id)] || []).map((p, i) => (
                                        <View key={i} style={styles.photoThumb}>
                                          <Image source={{ uri: p.uri }} style={styles.thumbImg} />
                                          <TouchableOpacity style={styles.removeThumb} onPress={() => removeQuestionPhoto(q?.id, i)}>
                                            <Text style={styles.removeThumbText}>×</Text>
                                          </TouchableOpacity>
                                        </View>
                                      ))}
                                    </View>
                                  </>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        )
                      })}
                    </View>
                  </>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
              onPress={completeTask}
              disabled={completing}
            >
              {completing ? (
                <View style={styles.completeInner}>
                  <ActivityIndicator size={20} color={Colors.text} />
                  <Text style={styles.completeBtnText}>Kaydediliyor...</Text>
                </View>
              ) : (
                <Text style={styles.completeBtnText}>Görevi Tamamla</Text>
              )}
            </TouchableOpacity>
            {canApproveTask ? (
              <TouchableOpacity style={styles.approveBtn} onPress={approveTask}>
                <Text style={styles.completeBtnText}>Onayla</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>

      <PhotoViewerModal
        visible={lightboxIndex != null}
        imageUrls={allEvidencePhotos}
        initialIndex={lightboxIndex ?? 0}
        onRequestClose={() => setLightboxIndex(null)}
        title="Görev Kanıtları"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  backBtn: { padding: 12, paddingTop: 48 },
  backBtnText: { fontSize: Typography.body.fontSize, color: Colors.text, fontWeight: '600' },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 16,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  title: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  badgeWrap: { marginBottom: 0, flexDirection: 'row', gap: 8, alignItems: 'center' },
  badge: { alignSelf: 'flex-start', backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Layout.borderRadius.full },
  badgeText: { color: Colors.surface, fontWeight: '700' },
  badgeAcil: { backgroundColor: Colors.alpha.gray10, borderWidth: 1, borderColor: Colors.primary },
  badgeAcilText: { color: Colors.primary, fontWeight: '900' },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 16,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  mediaCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 16,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  actionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    padding: 16,
    marginBottom: 12,
    ...ThemeObj.Shadows.card,
  },
  label: { fontSize: Typography.caption.fontSize, color: Colors.mutedText, marginTop: 12, marginBottom: 4, fontWeight: '600' },
  value: { fontSize: Typography.body.fontSize, color: Colors.text },
  empty: { color: Colors.mutedText, marginBottom: 16 },
  sectionTitle: { fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.text, marginTop: 0, marginBottom: 8 },
  hint: { fontSize: Typography.caption.fontSize, color: Colors.mutedText, marginBottom: 12 },
  noteInput: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: Typography.body.fontSize,
    color: Colors.text,
    backgroundColor: Colors.card,
    marginBottom: 12,
  },
  completeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  photoBtn: { backgroundColor: Colors.accent, paddingVertical: 12, paddingHorizontal: 20, borderRadius: Layout.borderRadius.lg },
  photoBtnSingle: { marginBottom: 12 },
  photoBtnText: { color: Colors.surface, fontWeight: '600' },
  photoList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  photoThumb: { width: 80, height: 80, position: 'relative' },
  thumbImg: { width: '100%', height: '100%', borderRadius: Layout.borderRadius.md },
  removeThumb: { position: 'absolute', top: -4, right: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center' },
  removeThumbText: { color: Colors.text, fontSize: Typography.body.fontSize, fontWeight: '700' },
  completeBtn: { backgroundColor: Colors.success, paddingVertical: 14, borderRadius: Layout.borderRadius.lg, alignItems: 'center' },
  approveBtn: { backgroundColor: Colors.accent, paddingVertical: 14, borderRadius: Layout.borderRadius.lg, alignItems: 'center', marginTop: 10 },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { color: Colors.surface, fontWeight: '700', fontSize: Typography.body.fontSize },

  checklistDraftRow: { marginBottom: 10 },
  draftText: { color: Colors.mutedText, fontWeight: '600' },

  questionList: { marginBottom: 12, gap: 8 },
  questionListItem: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: '#FCFCFA',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questionListItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alpha.indigo06,
  },
  questionListIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.alpha.gray10,
    textAlign: 'center',
    fontWeight: '800',
    paddingTop: 2,
  },
  questionListTextWrap: { flex: 1 },
  questionListTitle: { color: Colors.text, fontWeight: '700' },
  questionListMeta: { color: Colors.mutedText, fontWeight: '600', fontSize: Typography.caption.fontSize, marginTop: 2 },
  questionListStatus: { fontWeight: '900', fontSize: 18 },

  questionCard: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 14,
    marginBottom: 12,
  },
  questionCardInline: {
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 14,
    marginTop: 8,
    marginBottom: 2,
  },
  questionTypeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.alpha.indigo06,
    color: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Layout.borderRadius.full,
    fontWeight: '800',
  },
  questionTitle: { marginTop: 10, marginBottom: 10, fontWeight: '800', color: Colors.text, fontSize: Typography.body.fontSize },

  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  answerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  answerBtnActive: { backgroundColor: Colors.alpha.indigo10, borderColor: Colors.primary },
  answerBtnText: { fontWeight: '800', color: Colors.text },

  lockCard: {
    marginBottom: 12,
    backgroundColor: Colors.alpha.rose10,
    borderRadius: Layout.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.alpha.rose25,
    padding: 16,
  },
  lockTitle: {
    color: Colors.error,
    fontWeight: '900',
    fontSize: Typography.body.fontSize,
    marginBottom: 6,
  },
  lockText: {
    color: Colors.error,
    fontWeight: '600',
    fontSize: Typography.caption.fontSize,
  },
})
