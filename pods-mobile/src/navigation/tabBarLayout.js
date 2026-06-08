import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing } from '../ui/tokens'

/** Yaklaşık tab bar yüksekliği (pill + üst boşluk, safe area hariç). */
export const TAB_BAR_RESERVED_HEIGHT = 64 + spacing.sm + spacing.xs

/**
 * Tab ekranı scroll alt boşluğu — navigator zaten tab bar alanı ayırır.
 */
export function useTabBarScrollPadding(extra = 0) {
  return spacing.md + extra
}

/**
 * Tab ekranı içinde yüzen öğeler (bildirim çanı vb.).
 * Navigator içerik alanı zaten tab bar yüksekliğini ayırdığı için
 * ekran kökünden `bottom` yalnızca küçük bir boşluk olmalı.
 */
export function useTabScreenFloatBottom(gap = 10) {
  return gap
}

/** Tam ekran kökünden (tab bar dahil) konumlandırma — nadiren gerekir. */
export function useAboveTabBarOffset(gap = 12) {
  const insets = useSafeAreaInsets()
  return insets.bottom + TAB_BAR_RESERVED_HEIGHT + gap
}
