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

      // Üst-düzey: birim filtreleme yok.
      const query = !isTopCompanyScope && personel?.birim_id
        ? supabase
            .from('personeller')
            .select('id, ad, soyad, email, birim_id')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .eq('birim_id', personel.birim_id)
            .is('silindi_at', null)
        : supabase
            .from('personeller')
            .select('id, ad, soyad, email, birim_id')
            .eq('ana_sirket_id', personel.ana_sirket_id)
            .is('silindi_at', null)

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
  }, [canCreateTask, canAssignTask, personel?.ana_sirket_id, personel?.birim_id, personel?.id, personel?.ad, personel?.soyad, personel?.email, isTopCompanyScope])

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
      if (!isTopCompanyScope && personel?.birim_id) {
        q = q.or(`birim_id.eq.${personel.birim_id},birim_id.is.null`)
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
  }, [canCreateTask, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope])

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

      if (!isTopCompanyScope && personel?.birim_id) {
        q = q.eq('id', personel.birim_id)
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
      const initial = !isTopCompanyScope && personel?.birim_id ? [personel.birim_id] : list[0]?.id ? [list[0].id] : []
      setSelectedBirimIds(initial)
    }

    loadBirimler()
  }, [canAssignTask, personel?.ana_sirket_id, personel?.birim_id, isTopCompanyScope])

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
    if (!tpl) return
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
  }, [canAssignTask])

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

    const targetAssigneeIds = canAssignTask ? (selectedAssigneeIds || []) : [personel?.id]
    const filteredAssigneeIds = canAssignTask
      ? targetAssigneeIds.filter((id) => String(id) !== String(personel?.id))
      : targetAssigneeIds.filter(Boolean)

    if (!filteredAssigneeIds.length) {
      Alert.alert('Hata', 'Atanacak kişi seçilmedi.')
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

      const targetAssignees = (assignees || []).filter((x) => filteredAssigneeIds.some((id) => String(id) === String(x?.id)))

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
        is_sablon_id: canAssignTask && selectedTemplateId ? selectedTemplateId : null,
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
            {canAssignTask ? (
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
              </>
            ) : null}
            <Text style={styles.label}>İş başlığı *</Text>
            <TextInput
              style={styles.input}
              value={baslik}
              onChangeText={setBaslik}
              placeholder="Örn: Ek müşteri ziyareti"
              placeholderTextColor={MUTED}
            />

            {canAssignTask ? (
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
            ) : (
              <View style={styles.infoHintBox}>
                <Text style={styles.infoHintText}>
                  Puan, denetim onayı sırasında denetimci tarafından girilir.
                </Text>
              </View>
            )}
          </View>

          {canAssignTask ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Atama ve Zamanlama</Text>
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

              {assignmentTarget === 'personeller' ? (
                <>
                  <Text style={styles.label}>Atanacak personeller</Text>
                  <TouchableOpacity style={styles.pickerButton} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
                    <Text style={styles.pickerButtonText}>
                      {selectedAssigneeIds?.length ? `${selectedAssigneeIds.length} kişi seçildi` : 'Seçiniz'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {assignmentTarget === 'birimler' ? (
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

              {assignmentTarget === 'sirket' ? (
                <>
                  <Text style={styles.label}>Tüm şirket</Text>
                  <View style={styles.infoHintBox}>
                    <Text style={styles.infoHintText}>Seçili kullanıcı kapsamı tüm şirket personellerini kapsar.</Text>
                  </View>
                </>
              ) : null}

              <View style={styles.switchRow}>
                <Text style={styles.label}>Bireysel tamamlama</Text>
                <Switch
                  value={bireysel}
                  onValueChange={setBireysel}
                  trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                  thumbColor={Colors.surface}
                />
              </View>

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

          {canAssignTask ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Kanıt Kuralları</Text>
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

              <View style={styles.switchRow}>
                <Text style={styles.label}>Acil görev</Text>
                <Switch
                  value={acil}
                  onValueChange={setAcil}
                  trackColor={{ false: Colors.alpha.gray20, true: Colors.accent }}
                  thumbColor={Colors.surface}
                />
              </View>

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
            visible={canAssignTask && templatePickerOpen}
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
