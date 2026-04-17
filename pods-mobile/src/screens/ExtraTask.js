import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { decode as decodeBase64 } from 'base64-arraybuffer'
import DateTimePicker from '@react-native-community/datetimepicker'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import Theme from '../theme/theme'
import {
  canAssignTasks,
  canCreateTasks,
  isTopCompanyScope as isTopCompanyScopeShared,
} from '../lib/managementScope'
import { formatFullName } from '../lib/nameFormat'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'
import { GOREV_TURU } from '../lib/zincirTasks'

const BUCKET = 'gorev_kanitlari'
const supabase = getSupabase()

const ThemeObj = Theme?.default ?? Theme
const { Colors, Layout, Typography } = ThemeObj
const CORPORATE_BLUE = Colors.text
const INDIGO_600 = Colors.primary
const MUTED = Colors.mutedText

export default function ExtraTask() {
  const navigation = useNavigation()
  const { personel, permissions } = useAuth()
  const [baslik, setBaslik] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [puan, setPuan] = useState('')
  const [photo, setPhoto] = useState(null)
  const [fotoZorunlu, setFotoZorunlu] = useState(false)
  const [minFotoSayisi, setMinFotoSayisi] = useState('1')
  const [saving, setSaving] = useState(false)
  const [assignees, setAssignees] = useState([])
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([])
  const [manualSelectedAssigneeIds, setManualSelectedAssigneeIds] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [minFotoPickerOpen, setMinFotoPickerOpen] = useState(false)
  const [acil, setAcil] = useState(false)
  const [bireysel, setBireysel] = useState(true)
  const [assignmentTarget, setAssignmentTarget] = useState('personeller') // personeller | birimler | sirket
  const [birimler, setBirimler] = useState([])
  const [selectedBirimIds, setSelectedBirimIds] = useState([])
  const [birimPickerOpen, setBirimPickerOpen] = useState(false)
  const [baslamaTarihiInput, setBaslamaTarihiInput] = useState('')
  const [sonTarihInput, setSonTarihInput] = useState('')
  const [datePickerVisible, setDatePickerVisible] = useState(false)
  const [datePickerField, setDatePickerField] = useState('start')
  const [datePickerStep, setDatePickerStep] = useState('date')
  const [pickerDate, setPickerDate] = useState(new Date())
  const [templates, setTemplates] = useState([])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [repeatDaily, setRepeatDaily] = useState(false)
  const [repeatDays, setRepeatDays] = useState('30')
  /** 'normal' | 'zincir_gorev' | 'zincir_onay' | 'zincir_gorev_ve_onay' */
  const [gorevModu, setGorevModu] = useState('normal')
  const templateAllowedInMode = gorevModu === 'normal'
  const [zincirGorevSira, setZincirGorevSira] = useState([])
  const [zincirOnaySira, setZincirOnaySira] = useState([])
  /** Sadece zincir onay modunda: görevi yapacak tek personel */
  const [zincirOnayWorkerId, setZincirOnayWorkerId] = useState(null)
  const [zincirGorevPickerOpen, setZincirGorevPickerOpen] = useState(false)
  const [zincirOnayPickerOpen, setZincirOnayPickerOpen] = useState(false)
  const [zincirWorkerPickerOpen, setZincirWorkerPickerOpen] = useState(false)
  const [karmaBirimler, setKarmaBirimler] = useState(false)

  const canAssignTask = useMemo(
    () => canAssignTasks(permissions, personel),
    [permissions, personel],
  )
  const canCreateTask = useMemo(
    () => canCreateTasks(permissions),
    [permissions],
  )

  const isTopCompanyScope = useMemo(
    () => isTopCompanyScopeShared(personel, permissions),
    [personel, permissions],
  )
  const accessibleUnitIds = useMemo(
    () => (Array.isArray(personel?.accessibleUnitIds) ? personel.accessibleUnitIds : []),
    [personel?.accessibleUnitIds],
  )

  const handleBack = useCallback(() => {
    navigation?.goBack?.()
  }, [navigation])

  const formatName = useCallback(
    (p) => {
      const full = formatFullName(p?.ad, p?.soyad, '')
      return full || p?.email || '-'
    },
    [],
  )

  useEffect(() => {
    const loadAssignees = async () => {
      if (!canCreateTask) {
        setAssignees([])
        setSelectedAssigneeIds([])
        setManualSelectedAssigneeIds([])
        return
      }
      if (!personel?.ana_sirket_id) return

      // Personel modunda sadece kendine giriş yapabilir.
      if (!canAssignTask) {
        setAssignees([
          {
            id: personel?.id,
            ad: personel?.ad,
            soyad: personel?.soyad,
            email: personel?.email,
            birim_id: personel?.birim_id ?? null,
          },
        ])
        setManualSelectedAssigneeIds([personel?.id].filter(Boolean))
        setSelectedAssigneeIds([personel?.id].filter(Boolean))
        return
      }

      // Zincirde "karma birimler" açıkken şirket genelinden seçime izin ver.
      if (chainModeActive && karmaBirimler) {
        const result = await supabase
          .from('personeller')
          .select('id, ad, soyad, email, birim_id')
          .eq('ana_sirket_id', personel.ana_sirket_id)
          .is('silindi_at', null)
        const list = (result?.data || []).filter((p) => String(p?.id) !== String(personel?.id))
        setAssignees(list)
        const nextDefault = list[0]?.id ? [list[0]?.id] : []
        setManualSelectedAssigneeIds(nextDefault)
        setSelectedAssigneeIds(nextDefault)
        return
      }

      // Üst-düzey: birim filtreleme yok.
      let query = supabase
        .from('personeller')
        .select('id, ad, soyad, email, birim_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)
      if (!isTopCompanyScope && accessibleUnitIds.length) {
        query = query.in('birim_id', accessibleUnitIds)
      }

      const result = await query
      const resultData = result?.data
      const resultError = result?.error

      if (resultError) {
        if (__DEV__) console.warn('ExtraTask assignees load error', resultError)
        setAssignees([])
        setSelectedAssigneeIds([])
        setManualSelectedAssigneeIds([])
        return
      }

      const list = (resultData || []).filter((p) => String(p?.id) !== String(personel?.id))
      setAssignees(list)
      const nextDefault = list[0]?.id ? [list[0]?.id] : []
      setManualSelectedAssigneeIds(nextDefault)
      setSelectedAssigneeIds(nextDefault)
    }

    loadAssignees()
  }, [canCreateTask, canAssignTask, personel?.ana_sirket_id, personel?.birim_id, personel?.id, personel?.ad, personel?.soyad, personel?.email, isTopCompanyScope, accessibleUnitIds, chainModeActive, karmaBirimler])

  useEffect(() => {
    const loadTemplates = async () => {
      if (!canCreateTask || !personel?.ana_sirket_id) {
        setTemplates([])
        setSelectedTemplateId(null)
        return
      }
      let q = supabase
        .from('is_sablonlari')
        .select('id, baslik, aciklama, varsayilan_puan, puan, foto_zorunlu, min_foto_sayisi, birim_id')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)
      if (!isTopCompanyScope && accessibleUnitIds.length) {
        q = q.or(`birim_id.in.(${accessibleUnitIds.join(',')}),birim_id.is.null`)
      }
      const { data, error } = await q.order('baslik', { ascending: true })
      if (error?.code === '42703') {
        const fallback = await supabase
          .from('is_sablonlari')
          .select('id, baslik, aciklama')
          .eq('ana_sirket_id', personel.ana_sirket_id)
        setTemplates(fallback?.data || [])
        return
      }
      if (error) {
        setTemplates([])
        return
      }
      setTemplates(data || [])
    }
    loadTemplates()
  }, [canCreateTask, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, accessibleUnitIds])

  useEffect(() => {
    const loadBirimler = async () => {
      if (!canAssignTask || !personel?.ana_sirket_id) {
        setBirimler([])
        setSelectedBirimIds([])
        return
      }

      let q = supabase
        .from('birimler')
        .select('id, birim_adi')
        .eq('ana_sirket_id', personel.ana_sirket_id)
        .is('silindi_at', null)

      if (!isTopCompanyScope && accessibleUnitIds.length) {
        q = q.in('id', accessibleUnitIds)
      }

      const { data, error } = await q.order('birim_adi', { ascending: true })
      if (error) {
        if (__DEV__) console.warn('ExtraTask birimler load error', error)
        setBirimler([])
        setSelectedBirimIds(personel?.birim_id ? [personel.birim_id] : [])
        return
      }

      const list = data || []
      setBirimler(list)
      const initial =
        !isTopCompanyScope && accessibleUnitIds.length
          ? [accessibleUnitIds[0]]
          : list[0]?.id
            ? [list[0].id]
            : []
      setSelectedBirimIds(initial)
    }

    loadBirimler()
  }, [canAssignTask, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope, accessibleUnitIds])

  useEffect(() => {
    if (!canAssignTask) return
    if (assignmentTarget === 'personeller') return

    if (assignmentTarget === 'birimler') {
      const allowed = new Set((selectedBirimIds || []).map((x) => String(x)))
      const derivedIds = (assignees || [])
        .filter((p) => p?.birim_id && allowed.has(String(p.birim_id)))
        .map((p) => p.id)
      setSelectedAssigneeIds(derivedIds)
      return
    }

    if (assignmentTarget === 'sirket') {
      setSelectedAssigneeIds((assignees || []).map((p) => p.id))
    }
  }, [assignmentTarget, selectedBirimIds, assignees, canAssignTask])

  useEffect(() => {
    if (!canAssignTask) return
    if (assignmentTarget !== 'personeller') return
    const fallback = manualSelectedAssigneeIds?.length ? manualSelectedAssigneeIds : assignees?.[0]?.id ? [assignees[0].id] : []
    setSelectedAssigneeIds(fallback)
  }, [assignmentTarget, manualSelectedAssigneeIds, assignees, canAssignTask])

  useEffect(() => {
    if (!canAssignTask) return
    if (gorevModu === 'normal') return
    setAssignmentTarget('personeller')
    setRepeatDaily(false)
  }, [gorevModu, canAssignTask])

  useEffect(() => {
    if (!chainModeActive) setKarmaBirimler(false)
  }, [chainModeActive])

  useEffect(() => {
    if (templateAllowedInMode) return
    setSelectedTemplateId(null)
    // Şablon yalnızca normal modda geçerli: zincire geçince şablon kaynaklı kanıt kısıtları temizlenir.
    setFotoZorunlu(false)
    setMinFotoSayisi('1')
    setTemplatePickerOpen(false)
  }, [templateAllowedInMode])

  const chainModeActive = canAssignTask && gorevModu !== 'normal'
  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId],
  )
  const templateDrivenFieldsHidden =
    !!(canAssignTask && templateAllowedInMode && selectedTemplateId && selectedTemplate)
  const approverCandidates = useMemo(() => {
    const list = [...(assignees || [])]
    if (!personel?.id) return list
    const exists = list.some((p) => String(p?.id) === String(personel.id))
    if (!exists) {
      list.push({
        id: personel.id,
        ad: personel.ad,
        soyad: personel.soyad,
        email: personel.email,
        birim_id: personel.birim_id ?? null,
      })
    }
    return list
  }, [assignees, personel?.id, personel?.ad, personel?.soyad, personel?.email, personel?.birim_id])

  const resolvedGorevTuru = useCallback(() => {
    if (gorevModu === 'normal') return GOREV_TURU.NORMAL
    if (gorevModu === 'zincir_gorev') return GOREV_TURU.ZINCIR_GOREV
    if (gorevModu === 'zincir_onay') return GOREV_TURU.ZINCIR_ONAY
    return GOREV_TURU.ZINCIR_GOREV_VE_ONAY
  }, [gorevModu])

  const addZincirGorevId = useCallback((pid) => {
    if (!pid) return
    setZincirGorevSira((prev) => {
      if (prev.some((id) => String(id) === String(pid))) return prev
      return [...prev, pid]
    })
    setZincirGorevPickerOpen(false)
  }, [])

  const addZincirOnayId = useCallback((pid) => {
    if (!pid) return
    setZincirOnaySira((prev) => {
      if (prev.some((id) => String(id) === String(pid))) return prev
      return [...prev, pid]
    })
    setZincirOnayPickerOpen(false)
  }, [])

  const moveZincirGorev = useCallback((index, dir) => {
    setZincirGorevSira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }, [])

  const moveZincirOnay = useCallback((index, dir) => {
    setZincirOnaySira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }, [])

  const removeZincirGorevAt = useCallback((index) => {
    setZincirGorevSira((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const removeZincirOnayAt = useCallback((index) => {
    setZincirOnaySira((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('İzin gerekli', 'Galeri izni verin.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    })
    if (!result.canceled && result.assets?.[0]) {
      setPhoto({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64 || null,
      })
    }
  }, [])

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
      setPhoto({
        uri: result.assets[0].uri,
        base64: result.assets[0].base64 || null,
      })
    }
  }, [])

  const removePhoto = useCallback(() => setPhoto(null), [])

  const formatDateTimeInput = useCallback((date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  }, [])

  const applyQuickRange = useCallback((type) => {
    const now = new Date()
    if (type === 'today_shift') {
      const start = new Date(now)
      start.setHours(9, 0, 0, 0)
      const end = new Date(now)
      end.setHours(18, 0, 0, 0)
      setBaslamaTarihiInput(formatDateTimeInput(start))
      setSonTarihInput(formatDateTimeInput(end))
      return
    }
    if (type === 'tomorrow_shift') {
      const start = new Date(now)
      start.setDate(start.getDate() + 1)
      start.setHours(9, 0, 0, 0)
      const end = new Date(start)
      end.setHours(18, 0, 0, 0)
      setBaslamaTarihiInput(formatDateTimeInput(start))
      setSonTarihInput(formatDateTimeInput(end))
      return
    }
    const start = new Date(now)
    const end = new Date(now)
    end.setHours(end.getHours() + 24)
    setBaslamaTarihiInput(formatDateTimeInput(start))
    setSonTarihInput(formatDateTimeInput(end))
  }, [formatDateTimeInput])

  const applyTimeRange = useCallback((startHour, startMin, endHour, endMin) => {
    const baseStart = parseInputToDate(baslamaTarihiInput)
    const baseEnd = parseInputToDate(sonTarihInput || baslamaTarihiInput)
    baseStart.setHours(startHour, startMin, 0, 0)
    baseEnd.setHours(endHour, endMin, 0, 0)
    if (baseEnd <= baseStart) {
      baseEnd.setDate(baseEnd.getDate() + 1)
    }
    setBaslamaTarihiInput(formatDateTimeInput(baseStart))
    setSonTarihInput(formatDateTimeInput(baseEnd))
  }, [parseInputToDate, baslamaTarihiInput, sonTarihInput, formatDateTimeInput])

  const parseDateTimeInput = useCallback((value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const normalized = raw.replace('T', ' ')
    const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    const day = Number(m[3])
    const hour = Number(m[4])
    const minute = Number(m[5])
    const date = new Date(year, month, day, hour, minute, 0, 0)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
  }, [])

  const parseInputToDate = useCallback((value) => {
    const iso = parseDateTimeInput(value)
    if (!iso) return new Date()
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [parseDateTimeInput])

  const openDateTimePicker = useCallback((field) => {
    setDatePickerField(field)
    setDatePickerStep('date')
    setPickerDate(parseInputToDate(field === 'start' ? baslamaTarihiInput : sonTarihInput))
    setDatePickerVisible(true)
  }, [parseInputToDate, baslamaTarihiInput, sonTarihInput])

  const handleDateTimeChange = useCallback((event, selectedDate) => {
    if (event?.type === 'dismissed') {
      setDatePickerVisible(false)
      return
    }
    const next = selectedDate || pickerDate
    setPickerDate(next)
    if (Platform.OS === 'android' && datePickerStep === 'date') {
      setDatePickerStep('time')
      return
    }
    const formatted = formatDateTimeInput(next)
    if (datePickerField === 'start') setBaslamaTarihiInput(formatted)
    else setSonTarihInput(formatted)
    setDatePickerVisible(false)
    setDatePickerStep('date')
  }, [datePickerField, datePickerStep, formatDateTimeInput, pickerDate])

  const applyTemplate = useCallback((tpl) => {
    if (!tpl || !templateAllowedInMode) return
    setSelectedTemplateId(tpl.id || null)
    if (tpl.baslik) setBaslik(String(tpl.baslik))
    if (tpl.aciklama) setAciklama(String(tpl.aciklama))
    const templatePuan = Number(tpl.varsayilan_puan ?? tpl.puan)
    if (Number.isFinite(templatePuan) && templatePuan > 0 && canAssignTask) {
      setPuan(String(Math.round(templatePuan)))
    }
    if (typeof tpl.foto_zorunlu === 'boolean') setFotoZorunlu(tpl.foto_zorunlu)
    const min = Number(tpl.min_foto_sayisi)
    if (Number.isFinite(min) && min > 0) setMinFotoSayisi(String(Math.min(5, Math.max(1, min))))
  }, [canAssignTask, templateAllowedInMode])

  if (!canCreateTask) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.page}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>Geri</Text>
          </TouchableOpacity>
          <View style={styles.unauthorizedCard}>
            <Text style={styles.unauthorizedTitle}>Yetkiniz Yok</Text>
            <Text style={styles.unauthorizedText}>
              Bu hesapla görev atama ekranını kullanamazsınız.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const save = useCallback(async () => {
    if (!canCreateTask) {
      Alert.alert('Yetki yok', 'Yeni görev oluşturma yetkiniz bulunmuyor.')
      return
    }
    const titleTrim = (baslik || '').trim()
    if (!titleTrim) {
      Alert.alert('Başlık gerekli', 'İş başlığını girin.')
      return
    }

    const atayanPersonelId = personel?.id
    if (
      !atayanPersonelId ||
      !personel?.ana_sirket_id ||
      (!personel?.birim_id && !isTopCompanyScope)
    ) {
      Alert.alert('Hata', 'Personel bilgisi bulunamadı.')
      return
    }

    const parsedBaslama = canAssignTask ? parseDateTimeInput(baslamaTarihiInput) : null
    const parsedSon = canAssignTask ? parseDateTimeInput(sonTarihInput) : null
    if (canAssignTask && baslamaTarihiInput && !parsedBaslama) {
      Alert.alert('Tarih formatı hatalı', 'Başlangıç için YYYY-MM-DD HH:mm formatını kullanın.')
      return
    }
    if (canAssignTask && sonTarihInput && !parsedSon) {
      Alert.alert('Tarih formatı hatalı', 'Bitiş için YYYY-MM-DD HH:mm formatını kullanın.')
      return
    }
    if (canAssignTask && parsedBaslama && parsedSon && parsedSon <= parsedBaslama) {
      Alert.alert('Tarih hatası', 'Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.')
      return
    }

    const isChainTask = !!(canAssignTask && gorevModu !== 'normal')

    let filteredAssigneeIds = []
    if (!isChainTask) {
      const targetAssigneeIds = canAssignTask ? (selectedAssigneeIds || []) : [personel?.id]
      filteredAssigneeIds = canAssignTask
        ? targetAssigneeIds.filter((id) => String(id) !== String(personel?.id))
        : targetAssigneeIds.filter(Boolean)

      if (!filteredAssigneeIds.length) {
        Alert.alert('Hata', 'Atanacak kişi seçilmedi.')
        return
      }
    } else {
      const tur = resolvedGorevTuru()
      if (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) {
        if (zincirGorevSira.length < 2) {
          Alert.alert('Zincir görev', 'En az 2 kişi sırayla ekleyin.')
          return
        }
      }
      if (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) {
        if (zincirOnaySira.length < 2) {
          Alert.alert('Zincir onay', 'En az 2 onaylayıcı sırayla ekleyin.')
          return
        }
      }
      if (tur === GOREV_TURU.ZINCIR_ONAY && !zincirOnayWorkerId) {
        Alert.alert('Zincir onay', 'Görevi yapacak personeli seçin.')
        return
      }
    }

    setSaving(true)
    try {
      let kanitResimler = []

      if (!canAssignTask && photo) {
        let arrayBuffer
        if (photo.base64) {
          const raw = photo.base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
          arrayBuffer = decodeBase64(raw)
        } else {
          const base64 = await FileSystem.readAsStringAsync(photo.uri, {
            encoding: FileSystem.EncodingType.Base64,
          })
          const raw = base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '')
          arrayBuffer = decodeBase64(raw)
        }
        const fileName = `extra-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })
        if (uploadError) {
          Alert.alert('Yükleme hatası', uploadError.message || 'Fotoğraf yüklenemedi')
          setSaving(false)
          return
        }
        const path = uploadData?.path ?? uploadData
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        if (urlData?.publicUrl) kanitResimler = [urlData.publicUrl]
      }

      const minFoto = Number.parseInt(String(minFotoSayisi || '1').replace(/\D/g, ''), 10)
      const normalizedMinFoto = Number.isNaN(minFoto) ? 1 : Math.min(5, Math.max(1, minFoto))

      const normalizedPuan = Number.parseInt(String(puan || '0').replace(/\D/g, ''), 10)
      const safePuan = Number.isNaN(normalizedPuan) ? 0 : Math.max(0, normalizedPuan)

      const makeUuid = () => {
        // RFC4122 v4-ish uuid generator (client-side). DB column expects uuid format.
        // Good enough for grouping.
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return String(v.toString(16))
        })
      }

      const payloadCommon = {
        atayan_personel_id: atayanPersonelId,
        ana_sirket_id: personel.ana_sirket_id,
        baslik: titleTrim,
        aciklama: (aciklama || '').trim() || null,
        is_sablon_id: canAssignTask && templateAllowedInMode && selectedTemplateId ? selectedTemplateId : null,
        puan: canAssignTask ? safePuan : 0,
        durum: canAssignTask && acil ? 'ACIL' : 'ATANDI',
        acil: !!(canAssignTask && acil),
        foto_zorunlu: !!fotoZorunlu,
        min_foto_sayisi: fotoZorunlu ? normalizedMinFoto : 0,
      }

      const sendUrgentPush = async (recipientIds, taskTitle) => {
        if (!canAssignTask) return
        if (!acil) return
        const uniqueIds = [...new Set((recipientIds || []).map((x) => String(x || '').trim()).filter(Boolean))]
        if (!uniqueIds.length) return
        try {
          // Push token kolon isimleri ortama göre değişebilir.
          let tokenRows = []
          for (const tokenCol of ['expo_push_token', 'push_token', 'bildirim_tokeni']) {
            try {
              const { data } = await supabase
                .from('personeller')
                .select(`id, ${tokenCol}`)
                .in('id', uniqueIds)
              if (Array.isArray(data) && data.length) {
                tokenRows = data
                  .map((r) => ({ id: r?.id, token: r?.[tokenCol] }))
                  .filter((r) => typeof r.token === 'string' && r.token.startsWith('ExponentPushToken'))
                if (tokenRows.length) break
              }
            } catch {
              // continue
            }
          }

          if (!tokenRows.length) return

          const pushPayload = tokenRows.map((r) => ({
            to: r.token,
            sound: 'default',
            title: 'Acil Görev',
            body: taskTitle || titleTrim || 'Acil görev',
            data: { type: 'urgent_task', title: taskTitle || '' },
          }))

          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushPayload),
          })
        } catch {
          // best-effort
        }
      }

      if (isChainTask) {
        const tur = resolvedGorevTuru()
        const firstWorkerId =
          tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
            ? zincirGorevSira[0]
            : zincirOnayWorkerId

        const firstRow = (assignees || []).find((p) => String(p?.id) === String(firstWorkerId))
        const birimForInsert = firstRow?.birim_id ?? personel?.birim_id ?? null
        if (
          (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) &&
          !birimForInsert
        ) {
          Alert.alert(
            'Birim gerekli',
            'Zincir görev için ilk personelin birimi tanımlı olmalı veya yönetici birim bilgisi bulunmalı.',
          )
          setSaving(false)
          return
        }

        const insertRow = {
          ...payloadCommon,
          sorumlu_personel_id: firstWorkerId,
          birim_id: birimForInsert,
          ...(parsedBaslama ? { baslama_tarihi: parsedBaslama } : { baslama_tarihi: new Date().toISOString() }),
          ...(parsedSon ? { son_tarih: parsedSon } : {}),
          ...(kanitResimler.length > 0 ? { kanit_resim_ler: kanitResimler } : {}),
          gorev_turu: tur,
          zincir_aktif_adim: 1,
          zincir_onay_aktif_adim: 0,
        }

        const { data: inserted, error: insertErr } = await supabase.from('isler').insert([insertRow]).select()
        if (insertErr) {
          const msg = String(insertErr?.message || '').toLowerCase()
          if (
            insertErr?.code === '42703' &&
            (msg.includes('gorev_turu') || msg.includes('zincir') || msg.includes('column'))
          ) {
            Alert.alert(
              'Veritabanı güncellemesi',
              'Zincir görev için migration 014 (gorev_turu ve zincir kolonları) gerekli.',
            )
          } else {
            Alert.alert('Kayıt hatası', insertErr.message || 'İş eklenemedi.')
          }
          setSaving(false)
          return
        }

        const row = Array.isArray(inserted) ? inserted[0] : inserted
        const isId = row?.id

        if (isId && (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
          const gorevRows = zincirGorevSira.map((pid, i) => ({
            is_id: isId,
            adim_no: i + 1,
            personel_id: pid,
            durum: i === 0 ? 'aktif' : 'sira_bekliyor',
          }))
          const { error: zgErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(gorevRows)
          if (zgErr) {
            Alert.alert(
              'Zincir görev',
              'Görev adımları kaydedilemedi. Migration 014 uygulandı mı?',
            )
            setSaving(false)
            return
          }
        }

        if (isId && (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
          const onayRows = zincirOnaySira.map((pid, i) => ({
            is_id: isId,
            adim_no: i + 1,
            onaylayici_personel_id: pid,
            durum: 'bekliyor',
          }))
          const { error: zoErr } = await supabase.from('isler_zincir_onay_adimlari').insert(onayRows)
          if (zoErr) {
            Alert.alert(
              'Zincir onay',
              'Onay adımları kaydedilemedi. Migration 014 uygulandı mı?',
            )
            setSaving(false)
            return
          }
        }

        if (canAssignTask && acil) {
          await sendUrgentPush([firstWorkerId], titleTrim)
        }

        Alert.alert('Başarılı', 'Zincir görev oluşturuldu.', [{ text: 'Tamam', onPress: handleBack }])
        setSaving(false)
        return
      }

      const targetAssignees = (assignees || []).filter((x) =>
        filteredAssigneeIds.some((id) => String(id) === String(x?.id)),
      )

      const urgentRecipientIds = targetAssignees.map((x) => x?.id).filter(Boolean)

      const repeatCountRaw = Number.parseInt(String(repeatDays || '30').replace(/\D/g, ''), 10)
      const repeatCount = Number.isNaN(repeatCountRaw) ? 30 : Math.min(90, Math.max(2, repeatCountRaw))
      const shouldRepeat = !!(canAssignTask && repeatDaily && parsedBaslama && parsedSon)

      const addDaysIso = (iso, days) => {
        const d = new Date(iso)
        d.setDate(d.getDate() + days)
        return d.toISOString()
      }

      const dayOffsets = shouldRepeat ? Array.from({ length: repeatCount }).map((_, i) => i) : [0]

      const insertPayloads = []
      for (const offset of dayOffsets) {
        const grupId = canAssignTask && !bireysel ? makeUuid() : null
        for (const selectedAssignee of targetAssignees) {
          insertPayloads.push({
            ...payloadCommon,
            sorumlu_personel_id: selectedAssignee?.id,
            birim_id: selectedAssignee?.birim_id ?? personel?.birim_id ?? null,
            ...(parsedBaslama ? { baslama_tarihi: addDaysIso(parsedBaslama, offset) } : {}),
            ...(parsedSon ? { son_tarih: addDaysIso(parsedSon, offset) } : {}),
            ...(kanitResimler.length > 0 ? { kanit_resim_ler: kanitResimler } : {}),
            ...(grupId ? { grup_id: grupId } : {}),
          })
        }
      }

      const { error: insertError } = await supabase.from('isler').insert(insertPayloads)

      if (insertError) {
        const msg = String(insertError?.message || '').toLowerCase()
        if (insertError?.code === '42703' && msg.includes('grup_id')) {
          const insertPayloadsNoGroup = insertPayloads.map((p) => {
            const { grup_id, ...rest } = p || {}
            return rest
          })
          const { error: insertError2 } = await supabase.from('isler').insert(insertPayloadsNoGroup)
          if (!insertError2) {
            await sendUrgentPush(urgentRecipientIds, titleTrim)
            Alert.alert('Başarılı', shouldRepeat ? `Görev ${repeatCount} gün için otomatik planlandı.` : 'Görev atandı.')
            setSaving(false)
            return
          }
          Alert.alert('Kayıt hatası', insertError2.message || 'İş eklenemedi.')
          setSaving(false)
          return
        }

        Alert.alert('Kayıt hatası', insertError.message || 'İş eklenemedi.')
        setSaving(false)
        return
      }

      if (canAssignTask && acil) {
        await sendUrgentPush(urgentRecipientIds, titleTrim)
      }

      Alert.alert('Başarılı', shouldRepeat ? `Görev ${repeatCount} gün için otomatik planlandı.` : 'Görev atandı.', [
        { text: 'Tamam', onPress: handleBack },
      ])
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }, [
    canCreateTask,
    canAssignTask,
    baslik,
    aciklama,
    puan,
    photo,
    fotoZorunlu,
    minFotoSayisi,
    baslamaTarihiInput,
    sonTarihInput,
    selectedAssigneeIds,
    assignees,
    acil,
    bireysel,
    personel?.id,
    personel?.ana_sirket_id,
    personel?.birim_id,
    handleBack,
    parseDateTimeInput,
    canAssignTask,
    repeatDaily,
    repeatDays,
    gorevModu,
    zincirGorevSira,
    zincirOnaySira,
    zincirOnayWorkerId,
    resolvedGorevTuru,
  ])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.page}>
        <PremiumBackgroundPattern />
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>← Geri</Text>
        </TouchableOpacity>

        <Text style={styles.screenTitle}>{canAssignTask ? 'Yönetici Görev Atama' : 'Ekstra Görev Girişi'}</Text>
        <Text style={styles.screenSubtitle}>
          {canAssignTask
            ? 'Başlık ve açıklama ile aynı birimdeki personele görev atayın.'
            : 'Ekstra görevinizi başlık ve açıklama ile kaydedin.'}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Görev Bilgileri</Text>
            {canAssignTask && templateAllowedInMode ? (
              <>
                <Text style={styles.label}>Görev Şablonu (isteğe bağlı)</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setTemplatePickerOpen(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pickerButtonText}>
                    {selectedTemplateId
                      ? (templates.find((t) => String(t.id) === String(selectedTemplateId))?.baslik || 'Şablon')
                      : 'Şablon seç'}
                  </Text>
                </TouchableOpacity>
                {templateDrivenFieldsHidden ? (
                  <View style={[styles.infoHintBox, { marginBottom: 12 }]}>
                    <Text style={styles.infoHintText}>
                      Şablon seçildi: başlık, açıklama, puan ve fotoğraf kuralları şablondan uygulanır.
                    </Text>
                  </View>
                ) : null}
              </>
            ) : canAssignTask ? (
              <View style={styles.infoHintBox}>
                <Text style={styles.infoHintText}>
                  Zincir modlarda şablon kullanılmaz; görev detaylarını manuel girin.
                </Text>
              </View>
            ) : null}
            {!templateDrivenFieldsHidden ? (
              <>
                <Text style={styles.label}>İş başlığı *</Text>
                <TextInput
                  style={styles.input}
                  value={baslik}
                  onChangeText={setBaslik}
                  placeholder="Örn: Ek müşteri ziyareti"
                  placeholderTextColor={MUTED}
                />
              </>
            ) : null}

            {canAssignTask && !templateDrivenFieldsHidden ? (
              <>
                <Text style={styles.label}>Puan</Text>
                <TextInput
                  style={styles.input}
                  value={puan}
                  onChangeText={(v) => setPuan(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder="Örn: 20"
                  placeholderTextColor={MUTED}
                />
              </>
            ) : !canAssignTask ? (
              <View style={styles.infoHintBox}>
                <Text style={styles.infoHintText}>
                  Puan, denetim onayı sırasında denetimci tarafından girilir.
                </Text>
              </View>
            ) : null}
          </View>

          {canAssignTask ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Atama ve Zamanlama</Text>
              <Text style={styles.label}>Görev türü</Text>
              <View style={styles.modeChipsWrap}>
                {[
                  { key: 'normal', label: 'Normal' },
                  { key: 'zincir_gorev', label: 'Zincir görev' },
                  { key: 'zincir_onay', label: 'Zincir onay' },
                  { key: 'zincir_gorev_ve_onay', label: 'Görev + onay' },
                ].map((x) => {
                  const active = gorevModu === x.key
                  return (
                    <TouchableOpacity
                      key={x.key}
                      style={[styles.modeChip, active && styles.modeChipActive]}
                      activeOpacity={0.85}
                      onPress={() => setGorevModu(x.key)}
                    >
                      <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{x.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              {chainModeActive ? (
                <View style={[styles.infoHintBox, { marginBottom: 12 }]}>
                  <Text style={styles.infoHintText}>
                    Zincir modunda sıra aşağıda oluşturulur; birim veya şirket geneli atama kullanılamaz.
                  </Text>
                </View>
              ) : null}
              {chainModeActive ? (
                <View style={[styles.switchRow, { marginBottom: 12 }]}>
                  <Text style={styles.switchLabel}>Karma birimler (şirket geneli personel)</Text>
                  <Switch value={karmaBirimler} onValueChange={setKarmaBirimler} />
                </View>
              ) : null}

              {!chainModeActive ? (
                <View style={styles.targetChipsRow}>
                  {[
                    { key: 'personeller', label: 'Personeller' },
                    { key: 'birimler', label: 'Birimler' },
                    { key: 'sirket', label: 'Şirket' },
                  ].map((x) => {
                    const active = assignmentTarget === x.key
                    return (
                      <TouchableOpacity
                        key={x.key}
                        style={[styles.targetChip, active && styles.targetChipActive]}
                        activeOpacity={0.85}
                        onPress={() => {
                          setAssignmentTarget(x.key)
                          if (x.key === 'sirket') {
                            const allIds = (assignees || []).map((p) => p?.id).filter(Boolean)
                            setSelectedBirimIds([])
                            setManualSelectedAssigneeIds(allIds)
                            setSelectedAssigneeIds(allIds)
                          }
                          if (x.key === 'personeller') {
                            if (manualSelectedAssigneeIds?.length) setSelectedAssigneeIds(manualSelectedAssigneeIds)
                            else {
                              const first = (assignees || [])[0]?.id
                              setSelectedAssigneeIds(first ? [first] : [])
                              setManualSelectedAssigneeIds(first ? [first] : [])
                            }
                          }
                        }}
                      >
                        <Text style={[styles.targetChipText, active && styles.targetChipTextActive]}>{x.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ) : null}

              {!chainModeActive && assignmentTarget === 'personeller' ? (
                <>
                  <Text style={styles.label}>Atanacak personeller</Text>
                  <TouchableOpacity style={styles.pickerButton} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
                    <Text style={styles.pickerButtonText}>
                      {selectedAssigneeIds?.length ? `${selectedAssigneeIds.length} kişi seçildi` : 'Seçiniz'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {!chainModeActive && assignmentTarget === 'birimler' ? (
                <>
                  <Text style={styles.label}>Atanacak birimler</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setBirimPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pickerButtonText}>
                      {selectedBirimIds?.length ? `${selectedBirimIds.length} birim seçildi` : 'Seçiniz'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {!chainModeActive && assignmentTarget === 'sirket' ? (
                <>
                  <Text style={styles.label}>Tüm şirket</Text>
                  <View style={styles.infoHintBox}>
                    <Text style={styles.infoHintText}>Seçili kullanıcı kapsamı tüm şirket personellerini kapsar.</Text>
                  </View>
                </>
              ) : null}

              {chainModeActive && (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.label}>Zincir görev sırası (en az 2)</Text>
                  {zincirGorevSira.map((pid, i) => {
                    const p = assignees.find((a) => String(a?.id) === String(pid))
                    return (
                      <View key={`zg-${String(pid)}-${i}`} style={styles.chainRow}>
                        <Text style={styles.chainOrder}>{i + 1}</Text>
                        <Text style={styles.chainName} numberOfLines={1}>
                          {formatName(p)}
                        </Text>
                        <TouchableOpacity style={styles.chainIconBtn} onPress={() => moveZincirGorev(i, -1)}>
                          <Text style={styles.chainIconBtnText}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.chainIconBtn} onPress={() => moveZincirGorev(i, 1)}>
                          <Text style={styles.chainIconBtnText}>↓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.chainIconBtn} onPress={() => removeZincirGorevAt(i)}>
                          <Text style={[styles.chainIconBtnText, { color: Colors.error }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                  <TouchableOpacity
                    style={styles.chainAddBtn}
                    onPress={() => setZincirGorevPickerOpen(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.chainAddBtnText}>Sıraya personel ekle</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {chainModeActive && gorevModu === 'zincir_onay' ? (
                <>
                  <Text style={styles.label}>Görevi yapacak personel</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setZincirWorkerPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pickerButtonText}>
                      {zincirOnayWorkerId
                        ? formatName(assignees.find((a) => String(a?.id) === String(zincirOnayWorkerId)))
                        : 'Seçiniz'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {chainModeActive && (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.label}>Zincir onay sırası (en az 2)</Text>
                  {zincirOnaySira.map((pid, i) => {
                    const p = approverCandidates.find((a) => String(a?.id) === String(pid))
                    return (
                      <View key={`zo-${String(pid)}-${i}`} style={styles.chainRow}>
                        <Text style={styles.chainOrder}>{i + 1}</Text>
                        <Text style={styles.chainName} numberOfLines={1}>
                          {formatName(p)}
                        </Text>
                        <TouchableOpacity style={styles.chainIconBtn} onPress={() => moveZincirOnay(i, -1)}>
                          <Text style={styles.chainIconBtnText}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.chainIconBtn} onPress={() => moveZincirOnay(i, 1)}>
                          <Text style={styles.chainIconBtnText}>↓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.chainIconBtn} onPress={() => removeZincirOnayAt(i)}>
                          <Text style={[styles.chainIconBtnText, { color: Colors.error }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                  <TouchableOpacity
                    style={styles.chainAddBtn}
                    onPress={() => setZincirOnayPickerOpen(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.chainAddBtnText}>Onay sırasına personel ekle</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!chainModeActive ? (
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Bireysel tamamlama</Text>
                  <Switch
                    value={bireysel}
                    onValueChange={setBireysel}
                    trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                    thumbColor={Colors.surface}
                  />
                </View>
              ) : null}

              <Text style={styles.label}>Hızlı tarih ve saat aralığı</Text>
              <View style={styles.quickRangeRow}>
                <TouchableOpacity
                  style={styles.quickRangeBtn}
                  onPress={() => applyQuickRange('today_shift')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickRangeText}>Bugün 09-18</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickRangeBtn}
                  onPress={() => applyQuickRange('tomorrow_shift')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickRangeText}>Yarın 09-18</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickRangeBtn}
                  onPress={() => applyQuickRange('next_24h')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickRangeText}>+24 Saat</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.quickRangeRow}>
                <TouchableOpacity style={styles.quickRangeBtn} onPress={() => applyTimeRange(9, 0, 18, 0)} activeOpacity={0.8}>
                  <Text style={styles.quickRangeText}>09:00 - 18:00</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickRangeBtn} onPress={() => applyTimeRange(8, 0, 17, 0)} activeOpacity={0.8}>
                  <Text style={styles.quickRangeText}>08:00 - 17:00</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Başlangıç Tarih/Saat</Text>
              <TouchableOpacity style={styles.dateBox} onPress={() => openDateTimePicker('start')} activeOpacity={0.8}>
                <Text style={styles.dateBoxText}>{baslamaTarihiInput || 'Tarih ve saat seç'}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Bitiş Tarih/Saat</Text>
              <TouchableOpacity style={styles.dateBox} onPress={() => openDateTimePicker('end')} activeOpacity={0.8}>
                <Text style={styles.dateBoxText}>{sonTarihInput || 'Tarih ve saat seç'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!templateDrivenFieldsHidden ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Açıklama</Text>
              <Text style={styles.label}>Açıklama (isteğe bağlı)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={aciklama}
                onChangeText={setAciklama}
                placeholder="Yapılan işi kısaca açıklayın"
                placeholderTextColor={MUTED}
                multiline
                numberOfLines={4}
              />
            </View>
          ) : null}

          {canAssignTask ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Görev Seçenekleri</Text>
              {!templateDrivenFieldsHidden ? (
                <>
                  <View style={styles.switchRow}>
                    <Text style={styles.label}>Fotoğraf zorunlu mu?</Text>
                    <Switch
                      value={fotoZorunlu}
                      onValueChange={setFotoZorunlu}
                      trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                      thumbColor={Colors.surface}
                    />
                  </View>

                  {fotoZorunlu ? (
                    <>
                      <Text style={styles.label}>Min fotoğraf sayısı</Text>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => setMinFotoPickerOpen(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pickerButtonText}>
                          {Number.parseInt(minFotoSayisi || '1', 10) || 1}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </>
              ) : null}

              <View style={styles.switchRow}>
                <Text style={styles.label}>Acil görev</Text>
                <Switch
                  value={acil}
                  onValueChange={setAcil}
                  trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                  thumbColor={Colors.surface}
                />
              </View>

              {!chainModeActive ? (
                <>
                  <View style={styles.switchRow}>
                    <Text style={styles.label}>Tekrar eden görev</Text>
                    <Switch
                      value={repeatDaily}
                      onValueChange={setRepeatDaily}
                      trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                      thumbColor={Colors.surface}
                    />
                  </View>
                  {repeatDaily ? (
                    <>
                      <Text style={styles.label}>Kaç gün tekrar etsin?</Text>
                      <TextInput
                        style={styles.input}
                        value={repeatDays}
                        onChangeText={(v) => setRepeatDays(v.replace(/\D/g, ''))}
                        keyboardType="number-pad"
                        placeholder="Örn: 30"
                        placeholderTextColor={MUTED}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Fotoğraf</Text>
              <Text style={styles.label}>Fotoğraf (isteğe bağlı)</Text>
              {photo ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto}>
                    <Text style={styles.removePhotoText}>Kaldır</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoButtons}>
                  <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                    <Text style={styles.photoBtnText}>Kamera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                    <Text style={styles.photoBtnText}>Galeri</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <Modal
            visible={canAssignTask && pickerOpen && assignmentTarget === 'personeller'}
            transparent
            animationType="fade"
            onRequestClose={() => setPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Atanacak personelleri seçin</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {assignees.map((p) => {
                    const active = (selectedAssigneeIds || []).some((id) => String(id) === String(p?.id))
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => {
                          setManualSelectedAssigneeIds((prev) => {
                            const prevArr = Array.isArray(prev) ? prev : []
                            const exists = prevArr.some((id) => String(id) === String(p?.id))
                            const next = exists ? prevArr.filter((id) => String(id) !== String(p?.id)) : [...prevArr, p?.id]
                            return next
                          })
                          setSelectedAssigneeIds((prev) => {
                            const prevArr = Array.isArray(prev) ? prev : []
                            const exists = prevArr.some((id) => String(id) === String(p?.id))
                            const next = exists ? prevArr.filter((id) => String(id) !== String(p?.id)) : [...prevArr, p?.id]
                            return next
                          })
                        }}
                      >
                        <Text style={styles.pickerRowText}>
                          {formatName(p)}
                        </Text>
                        {active ? <Text style={styles.pickerRowCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                  {!assignees.length ? (
                    <Text style={styles.pickerEmpty}>Personel bulunamadı.</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && birimPickerOpen && assignmentTarget === 'birimler'}
            transparent
            animationType="fade"
            onRequestClose={() => setBirimPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setBirimPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Birim seçin (çoklu)</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {(birimler || []).map((b) => {
                    const active = (selectedBirimIds || []).some((id) => String(id) === String(b?.id))
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => {
                          setSelectedBirimIds((prev) => {
                            const prevArr = Array.isArray(prev) ? prev : []
                            const exists = prevArr.some((id) => String(id) === String(b?.id))
                            const next = exists ? prevArr.filter((id) => String(id) !== String(b?.id)) : [...prevArr, b?.id]
                            return next
                          })
                        }}
                      >
                        <Text style={styles.pickerRowText}>{b?.birim_adi || `Birim ${b?.id}`}</Text>
                        {active ? <Text style={styles.pickerRowCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                  {!birimler.length ? <Text style={styles.pickerEmpty}>Birim bulunamadı.</Text> : null}
                </ScrollView>
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setBirimPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && minFotoPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setMinFotoPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setMinFotoPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Min fotoğraf sayısı seçin</Text>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = String(n) === String(minFotoSayisi || '1')
                  return (
                    <TouchableOpacity
                      key={String(n)}
                      style={[styles.pickerRow, active && styles.pickerRowActive]}
                      onPress={() => {
                        setMinFotoSayisi(String(n))
                        setMinFotoPickerOpen(false)
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.pickerRowText}>{n}</Text>
                      {active ? <Text style={styles.pickerRowCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && templateAllowedInMode && templatePickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setTemplatePickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setTemplatePickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Görev şablonu seçin</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {templates.map((tpl) => {
                    const active = String(tpl?.id) === String(selectedTemplateId)
                    return (
                      <TouchableOpacity
                        key={tpl.id}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => {
                          applyTemplate(tpl)
                          setTemplatePickerOpen(false)
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pickerRowText}>{tpl?.baslik || 'Şablon'}</Text>
                        {active ? <Text style={styles.pickerRowCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                  {!templates.length ? <Text style={styles.pickerEmpty}>Şablon bulunamadı.</Text> : null}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && zincirGorevPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setZincirGorevPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setZincirGorevPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Zincir göreve ekle</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {(assignees || [])
                    .filter((p) => !zincirGorevSira.some((id) => String(id) === String(p?.id)))
                    .map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.pickerRow}
                        onPress={() => addZincirGorevId(p?.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pickerRowText}>{formatName(p)}</Text>
                      </TouchableOpacity>
                    ))}
                  {!assignees.length ? (
                    <Text style={styles.pickerEmpty}>Personel bulunamadı.</Text>
                  ) : null}
                  {assignees.length > 0 &&
                  !(assignees || []).some((p) => !zincirGorevSira.some((id) => String(id) === String(p?.id))) ? (
                    <Text style={styles.pickerEmpty}>Tüm personel sıraya eklendi.</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setZincirGorevPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && zincirOnayPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setZincirOnayPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setZincirOnayPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Onay sırasına ekle</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {(approverCandidates || [])
                    .filter((p) => !zincirOnaySira.some((id) => String(id) === String(p?.id)))
                    .map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.pickerRow}
                        onPress={() => addZincirOnayId(p?.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pickerRowText}>{formatName(p)}</Text>
                      </TouchableOpacity>
                    ))}
                  {!approverCandidates.length ? (
                    <Text style={styles.pickerEmpty}>Personel bulunamadı.</Text>
                  ) : null}
                  {approverCandidates.length > 0 &&
                  !(approverCandidates || []).some((p) => !zincirOnaySira.some((id) => String(id) === String(p?.id))) ? (
                    <Text style={styles.pickerEmpty}>Tüm personel sıraya eklendi.</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setZincirOnayPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={canAssignTask && zincirWorkerPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setZincirWorkerPickerOpen(false)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setZincirWorkerPickerOpen(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Görevi yapacak personel</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {(assignees || []).map((p) => {
                    const active = String(zincirOnayWorkerId) === String(p?.id)
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => {
                          setZincirOnayWorkerId(p?.id)
                          setZincirWorkerPickerOpen(false)
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.pickerRowText}>{formatName(p)}</Text>
                        {active ? <Text style={styles.pickerRowCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                  {!assignees.length ? <Text style={styles.pickerEmpty}>Personel bulunamadı.</Text> : null}
                </ScrollView>
                <View style={styles.pickerActionsRow}>
                  <TouchableOpacity
                    style={styles.pickerDoneBtn}
                    onPress={() => setZincirWorkerPickerOpen(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pickerDoneText}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Modal>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size={24} color={Colors.text} />
            ) : (
              <Text style={styles.saveBtnText}>Kaydet</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {datePickerVisible ? (
          <Modal visible={datePickerVisible} transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setDatePickerVisible(false)}>
              <View style={styles.datePickerSheet}>
                <Text style={styles.pickerTitle}>
                  {datePickerField === 'start' ? 'Başlangıç' : 'Bitiş'} - {datePickerStep === 'date' ? 'Tarih' : 'Saat'}
                </Text>
                <DateTimePicker
                  value={pickerDate}
                  mode={datePickerStep}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={handleDateTimeChange}
                />
                {Platform.OS === 'ios' && datePickerStep === 'date' ? (
                  <TouchableOpacity
                    style={styles.nextStepBtn}
                    onPress={() => setDatePickerStep('time')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextStepBtnText}>Saat Seçimine Geç</Text>
                  </TouchableOpacity>
                ) : null}
                {Platform.OS === 'ios' && datePickerStep === 'time' ? (
                  <TouchableOpacity
                    style={styles.nextStepBtn}
                    onPress={() => {
                      const formatted = formatDateTimeInput(pickerDate)
                      if (datePickerField === 'start') setBaslamaTarihiInput(formatted)
                      else setSonTarihInput(formatted)
                      setDatePickerVisible(false)
                      setDatePickerStep('date')
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextStepBtnText}>Tamam</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Pressable>
          </Modal>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  backBtn: { marginBottom: 16 },
  backBtnText: { fontSize: Typography.body.fontSize, color: CORPORATE_BLUE, fontWeight: '600' },
  screenTitle: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: CORPORATE_BLUE, marginBottom: 8 },
  screenSubtitle: { fontSize: Typography.body.fontSize, color: MUTED, marginBottom: 24 },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  sectionCard: {
    backgroundColor: Colors.inputBg,
    borderRadius: Layout.borderRadius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.alpha.gray22,
    ...ThemeObj.Shadows.card,
  },
  sectionTitle: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
    marginBottom: 8,
  },
  label: { fontSize: Typography.body.fontSize, fontWeight: '600', color: CORPORATE_BLUE, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: Typography.body.fontSize,
    color: CORPORATE_BLUE,
    marginBottom: 14,
  },
  infoHintBox: {
    backgroundColor: Colors.alpha.indigo10,
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo15,
    padding: 10,
  },
  infoHintText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  photoWrap: { marginBottom: 20 },
  photoPreview: { width: '100%', height: 200, borderRadius: Layout.borderRadius.lg, backgroundColor: Colors.surface },
  removePhotoBtn: { marginTop: 8 },
  removePhotoText: { fontSize: Typography.body.fontSize, color: Colors.error, fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  photoBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Layout.borderRadius.lg,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  photoBtnText: { fontSize: Typography.body.fontSize, fontWeight: '600', color: CORPORATE_BLUE },
  saveBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: Layout.borderRadius.lg,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: Typography.body.fontSize, fontWeight: '700', color: Colors.surface },

  pickerButton: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    marginBottom: 14,
  },
  quickRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickRangeBtn: {
    flex: 1,
    backgroundColor: Colors.alpha.indigo10,
    borderRadius: Layout.borderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.alpha.indigo15,
  },
  quickRangeText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '700',
  },
  dateBox: {
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  dateBoxText: {
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
  },
  datePickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  nextStepBtn: {
    marginTop: 10,
    backgroundColor: Colors.accent,
    borderRadius: Layout.borderRadius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  nextStepBtnText: {
    color: Colors.surface,
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  pickerButtonText: { color: CORPORATE_BLUE, fontWeight: '600', fontSize: Typography.body.fontSize },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: Colors.alpha.black45,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  pickerTitle: { fontSize: Typography.body.fontSize, fontWeight: '900', color: CORPORATE_BLUE, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    marginBottom: 10,
  },
  pickerRowActive: { borderColor: INDIGO_600, backgroundColor: Colors.alpha.indigo10 },
  pickerRowText: { color: CORPORATE_BLUE, fontWeight: '700', fontSize: Typography.body.fontSize, flex: 1, marginRight: 10 },
  pickerRowCheck: { color: INDIGO_600, fontWeight: '900' },
  pickerEmpty: { color: MUTED, textAlign: 'center', paddingVertical: 16 },
  targetChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  targetChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    borderRadius: Layout.borderRadius.full,
    paddingVertical: 8,
  },
  targetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  targetChipText: {
    color: Colors.mutedText,
    fontWeight: '700',
    fontSize: Typography.caption.fontSize,
  },
  targetChipTextActive: {
    color: Colors.surface,
  },
  targetChipDisabled: {
    opacity: 0.42,
  },
  modeChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.alpha.gray20,
    backgroundColor: Colors.surface,
    minWidth: '47%',
    flexGrow: 1,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modeChipText: {
    color: Colors.mutedText,
    fontWeight: '700',
    fontSize: Typography.caption.fontSize,
    textAlign: 'center',
  },
  modeChipTextActive: {
    color: Colors.surface,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Layout.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  chainOrder: {
    fontWeight: '900',
    color: INDIGO_600,
    minWidth: 22,
    fontSize: Typography.caption.fontSize,
  },
  chainName: {
    flex: 1,
    fontWeight: '700',
    color: CORPORATE_BLUE,
    fontSize: Typography.body.fontSize,
  },
  chainIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  chainIconBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: CORPORATE_BLUE,
  },
  chainAddBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: Layout.borderRadius.md,
    backgroundColor: Colors.alpha.indigo10,
    borderWidth: 1,
    borderColor: Colors.alpha.indigo15,
    alignItems: 'center',
  },
  chainAddBtnText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: Typography.body.fontSize,
  },
  pickerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 10,
  },
  pickerDoneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pickerDoneText: {
    color: Colors.surface,
    fontWeight: '900',
    fontSize: Typography.body.fontSize,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  unauthorizedCard: {
    marginTop: 24,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius.lg,
    padding: 16,
    ...ThemeObj.Shadows.card,
  },
  unauthorizedTitle: {
    color: Colors.text,
    fontSize: Typography.subheading.fontSize,
    fontWeight: '700',
    marginBottom: 8,
  },
  unauthorizedText: {
    color: Colors.mutedText,
    fontSize: Typography.body.fontSize,
  },
})
