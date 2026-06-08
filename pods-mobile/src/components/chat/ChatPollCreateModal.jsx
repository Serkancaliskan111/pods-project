import React, { useState } from 'react'
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native'
import { Plus, X } from 'lucide-react-native'

export default function ChatPollCreateModal({ visible, theme, onClose, onSubmit, submitting }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)

  const reset = () => {
    setQuestion('')
    setOptions(['', ''])
    setAllowMultiple(false)
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  const addOption = () => {
    if (options.length >= 10) return
    setOptions((prev) => [...prev, ''])
  }

  const updateOption = (idx, val) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)))
  }

  const removeOption = (idx) => {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  const canSubmit =
    question.trim().length > 0 &&
    options.filter((o) => o.trim().length > 0).length >= 2 &&
    !submitting

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: theme?.receivedBubble || '#fff' }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme?.textPrimary }]}>Anket oluştur</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={10}>
              <X size={22} color={theme?.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <TextInput
              style={[styles.input, { color: theme?.textPrimary, borderColor: theme?.receivedBubbleBorder }]}
              placeholder="Soru"
              placeholderTextColor={theme?.textSecondary}
              value={question}
              onChangeText={setQuestion}
              maxLength={500}
            />

            {options.map((opt, idx) => (
              <View key={`opt-${idx}`} style={styles.optionRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.optionInput,
                    { color: theme?.textPrimary, borderColor: theme?.receivedBubbleBorder },
                  ]}
                  placeholder={`Seçenek ${idx + 1}`}
                  placeholderTextColor={theme?.textSecondary}
                  value={opt}
                  onChangeText={(v) => updateOption(idx, v)}
                  maxLength={200}
                />
                {options.length > 2 ? (
                  <TouchableOpacity onPress={() => removeOption(idx)} style={styles.removeBtn}>
                    <X size={16} color={theme?.textSecondary} strokeWidth={2.4} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            {options.length < 10 ? (
              <TouchableOpacity style={styles.addBtn} onPress={addOption}>
                <Plus size={18} color={theme?.accent} strokeWidth={2.4} />
                <Text style={{ color: theme?.accent, fontWeight: '600' }}>Seçenek ekle</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.multiRow}
              onPress={() => setAllowMultiple((v) => !v)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: theme?.accent,
                    backgroundColor: allowMultiple ? theme?.accent : 'transparent',
                  },
                ]}
              />
              <Text style={{ color: theme?.textPrimary }}>Birden fazla seçenek işaretlenebilsin</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: theme?.accent, opacity: canSubmit ? 1 : 0.45 },
            ]}
            disabled={!canSubmit}
            onPress={() =>
              onSubmit?.({
                question: question.trim(),
                options: options.map((o) => o.trim()).filter(Boolean),
                allowMultiple,
              })
            }
          >
            <Text style={styles.submitText}>Anketi gönder</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: '82%',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
  },
  removeBtn: {
    padding: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  multiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
})
