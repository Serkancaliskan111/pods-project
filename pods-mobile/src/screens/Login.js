import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native'
import getSupabase from '../lib/supabaseClient'
import { getStoredItem, setStoredItem, removeStoredItem } from '../lib/storage'
import { useUiTheme } from '../contexts/UiThemeContext'
import {
  Heading,
  Text,
  Button,
  palette,
  spacing,
  radii,
  shadows,
} from '../ui'

const supabase = getSupabase()

export default function Login() {
  const { theme } = useUiTheme()
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [forgotSending, setForgotSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const remembered = await getStoredItem('pods_remember_me')
      const savedEmail = await getStoredItem('pods_saved_email')
      if (cancelled) return
      if (remembered === 'true' && savedEmail) {
        setRememberMe(true)
        setEmail(savedEmail)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleForgotPassword = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      Alert.alert('E-posta gerekli', 'Şifre sıfırlama için önce e-posta adresinizi girin.')
      return
    }
    setForgotSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed)
      if (error) throw error
      Alert.alert('Başarılı', 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.')
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Şifre sıfırlama isteği gönderilemedi')
    } finally {
      setForgotSending(false)
    }
  }

  const handleLogin = async () => {
    const trimEmail = email.trim()
    if (!trimEmail || !password) {
      Alert.alert('Eksik bilgi', 'E-posta ve şifre girin.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: trimEmail, password })
      if (error) {
        Alert.alert('Giriş yapılamadı', error.message || 'Bilinmeyen hata')
        return
      }
      if (rememberMe) {
        await setStoredItem('pods_remember_me', 'true')
        await setStoredItem('pods_saved_email', trimEmail)
      } else {
        await removeStoredItem('pods_remember_me')
        await removeStoredItem('pods_saved_email')
      }
    } catch (e) {
      Alert.alert('Giriş yapılamadı', e?.message || 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }

  const heroColors = [theme.brandBlue, theme.brandBluePressed, palette.primary[800]]

  return (
    <SafeAreaView style={[styles.wrapper, { backgroundColor: theme.pageBg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.wrapperInner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={heroColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View pointerEvents="none" style={[styles.blob, styles.blobA]} />
            <View pointerEvents="none" style={[styles.blob, styles.blobB]} />
            <View style={styles.brandPill}>
              <View style={styles.brandDot} />
              <Text variant="overline" color={palette.surface}>
                PODS PLATFORM
              </Text>
            </View>
            <Heading variant="displayLg" color={palette.surface} style={styles.title}>
              Hoş geldin
            </Heading>
            <Text variant="body" color="rgba(255,255,255,0.78)" style={styles.subtitle}>
              Görevlerini yönet, ekibinle iletişim kur, sahadaki her şey tek elinde.
            </Text>
          </LinearGradient>
        </View>

        <View style={styles.formCard}>
          <Heading variant="h2" style={{ marginBottom: spacing.lg }}>
            Giriş Yap
          </Heading>

          <Pressable
            style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}
            onPress={() => emailRef.current?.focus()}
            disabled={loading}
            accessibilityRole="none"
          >
            <View pointerEvents="none" style={styles.inputIcon}>
              <Mail
                size={18}
                color={emailFocused ? palette.primary[700] : palette.slate[400]}
                strokeWidth={2}
              />
            </View>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="E-posta"
              placeholderTextColor={palette.slate[400]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              editable={!loading}
            />
          </Pressable>

          <Pressable
            style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}
            onPress={() => passwordRef.current?.focus()}
            disabled={loading}
            accessibilityRole="none"
          >
            <View pointerEvents="none" style={styles.inputIcon}>
              <Lock
                size={18}
                color={passwordFocused ? palette.primary[700] : palette.slate[400]}
                strokeWidth={2}
              />
            </View>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor={palette.slate[400]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityLabel={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            >
              {showPassword ? (
                <EyeOff size={18} color={palette.slate[400]} strokeWidth={2} />
              ) : (
                <Eye size={18} color={palette.slate[400]} strokeWidth={2} />
              )}
            </TouchableOpacity>
          </Pressable>

          <View style={styles.loginExtras}>
            <Pressable
              style={styles.rememberRow}
              onPress={() => setRememberMe((v) => !v)}
              disabled={loading}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                {rememberMe ? <Text variant="caption" color={palette.surface}>✓</Text> : null}
              </View>
              <Text variant="caption" color={palette.slate[600]}>
                Beni hatırla
              </Text>
            </Pressable>
            <TouchableOpacity
              onPress={() => void handleForgotPassword()}
              disabled={forgotSending || loading}
            >
              <Text variant="caption" color={palette.primary[700]} weight="SemiBold">
                {forgotSending ? 'Gönderiliyor…' : 'Şifrenizi mi unuttunuz?'}
              </Text>
            </TouchableOpacity>
          </View>

          <Button
            variant="accent"
            size="lg"
            fullWidth
            loading={loading}
            onPress={handleLogin}
            style={{ marginTop: spacing.lg }}
          >
            Giriş Yap
          </Button>

          <Text
            variant="caption"
            color={palette.slate[500]}
            align="center"
            style={styles.footnote}
          >
            Hesabınızla ilgili bir sorun yaşıyorsanız ekip yöneticinizle iletişime geçin.
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: palette.background,
  },
  wrapperInner: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  heroWrap: {},
  hero: {
    borderRadius: radii['3xl'],
    padding: spacing['2xl'],
    overflow: 'hidden',
    position: 'relative',
    ...shadows.primary,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobA: {
    width: 220,
    height: 220,
    top: -80,
    right: -60,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  blobB: {
    width: 160,
    height: 160,
    bottom: -60,
    left: -40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  brandPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    marginBottom: spacing.lg,
    gap: 6,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent[400],
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    maxWidth: 280,
  },
  formCard: {
    backgroundColor: palette.surface,
    borderRadius: radii['3xl'],
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.slate[100],
    ...shadows.md,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    backgroundColor: palette.slate[50],
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: palette.slate[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  inputIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapFocused: {
    borderColor: palette.primary[500],
    backgroundColor: palette.surface,
    ...shadows.sm,
  },
  input: {
    flex: 1,
    minHeight: 40,
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 15,
    color: palette.slate[800],
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  footnote: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  loginExtras: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: palette.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  checkboxOn: {
    backgroundColor: palette.primary[700],
    borderColor: palette.primary[700],
  },
})
