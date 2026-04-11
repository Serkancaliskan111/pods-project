import React, { useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import getSupabase from '../lib/supabaseClient'
import Theme from '../theme/theme'
import PremiumBackgroundPattern from '../components/PremiumBackgroundPattern'

const supabase = getSupabase()
const ThemeObj = Theme?.default ?? Theme
const { Typography } = ThemeObj

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const trimEmail = email.trim()
    if (!trimEmail || !password) {
      alert('E-posta ve şifre girin.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: trimEmail, password })
      if (error) {
        alert(error.message || 'Giriş yapılamadı')
        return
      }
    } catch (e) {
      alert(e?.message || 'Giriş yapılamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.wrapper} edges={['top', 'bottom']}>
      <PremiumBackgroundPattern />
      <KeyboardAvoidingView style={styles.wrapperInner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
        <Text style={styles.title}>PODS Mobil</Text>
        <Text style={styles.subtitle}>E-posta ve şifrenizle giriş yapın</Text>
        <TextInput
          style={styles.input}
          placeholder="E-posta"
          placeholderTextColor={ThemeObj.Colors.mutedText}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Şifre"
          placeholderTextColor={ThemeObj.Colors.mutedText}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />
        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator size={24} color={ThemeObj.Colors.text} /> : <Text style={styles.btnText}>Giriş Yap</Text>}
        </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: ThemeObj.Colors.background },
  wrapperInner: { flex: 1, justifyContent: 'center' },
  container: { padding: 24 },
  title: { fontSize: Typography.heading.fontSize, fontWeight: '700', color: ThemeObj.Colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: Typography.body.fontSize, color: ThemeObj.Colors.mutedText, textAlign: 'center', marginBottom: 24 },
  input: {
    backgroundColor: ThemeObj.Colors.inputBg,
    padding: 14,
    borderRadius: ThemeObj.Layout.borderRadius.md,
    marginBottom: 12,
    fontSize: Typography.body.fontSize,
    borderWidth: 1,
    borderColor: ThemeObj.Colors.inputBorder,
    color: ThemeObj.Colors.text,
  },
  btn: {
    backgroundColor: ThemeObj.Colors.accent,
    padding: 16,
    borderRadius: ThemeObj.Layout.borderRadius.md,
    marginTop: 8,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  btnText: { color: ThemeObj.Colors.surface, fontSize: Typography.body.fontSize, fontWeight: '600' },
})
