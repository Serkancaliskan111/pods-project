import React, { useState } from 'react'
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native'
import getSupabase from '../lib/supabaseClient'
import {
  Heading,
  Text,
  Button,
  palette,
  spacing,
  radii,
  shadows,
  gradients,
} from '../ui'

const supabase = getSupabase()

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

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
    } catch (e) {
      Alert.alert('Giriş yapılamadı', e?.message || 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.wrapper} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.wrapperInner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={gradients.hero}
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

          <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
            <Mail
              size={18}
              color={emailFocused ? palette.primary[700] : palette.slate[400]}
              strokeWidth={2}
            />
            <TextInput
              style={styles.input}
              placeholder="E-posta"
              placeholderTextColor={palette.slate[400]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          <View style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}>
            <Lock
              size={18}
              color={passwordFocused ? palette.primary[700] : palette.slate[400]}
              strokeWidth={2}
            />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor={palette.slate[400]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry={!showPassword}
              autoComplete="password"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              {showPassword ? (
                <EyeOff size={18} color={palette.slate[400]} strokeWidth={2} />
              ) : (
                <Eye size={18} color={palette.slate[400]} strokeWidth={2} />
              )}
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
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
    backgroundColor: palette.slate[50],
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: palette.slate[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  inputWrapFocused: {
    borderColor: palette.primary[500],
    backgroundColor: palette.surface,
    ...shadows.sm,
  },
  input: {
    flex: 1,
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 15,
    color: palette.slate[800],
    paddingVertical: 8,
  },
  footnote: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
})
