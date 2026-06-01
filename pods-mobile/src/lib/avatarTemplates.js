/**
 * Kurumsal avatar sablonlari.
 *
 * Daha onceden emoji tabanli olan avatar paleti, "Dark Executive" kimligine
 * uygun hale getirildi: her sablon lucide ikon + paletten kalibre renkli
 * arkaplan + on plan rengi (`bg` / `fg`) tasiyor. ID'ler birebir korunuyor
 * (kadin/erkek varyantlari + meslek varyantlari) — DB'de kayitli mevcut
 * avatar id'leri kirilmadan render edilmeye devam eder.
 *
 * Bilesen tarafi `IconBubble`-benzeri bir kapsul ile render eder:
 *   <View style={{ backgroundColor: tpl.bg }}>
 *     <tpl.icon color={tpl.fg} size={...} />
 *   </View>
 */
import { Icon } from '../ui/icons'
import { palette } from '../ui/tokens'

export const MAX_AVATAR_COUNT = 20

const ALL_AVATARS = [
  // "Kadin" id'li serisi - yumusak / sicak tonlar
  { id: 'female_1', label: 'Profil 1', icon: Icon.AvatarPerson, bg: palette.accent[100], fg: palette.accent[700] },
  { id: 'female_2', label: 'Profil 2', icon: Icon.AvatarPersonAlt, bg: palette.blurple[100], fg: palette.blurple[700] },
  { id: 'female_3', label: 'Profil 3', icon: Icon.AvatarRetail, bg: palette.success[100], fg: palette.success[700] },
  { id: 'female_4', label: 'Profil 4', icon: Icon.AvatarBeauty, bg: palette.accent[100], fg: palette.accent[700] },
  { id: 'female_5', label: 'Profil 5', icon: Icon.AvatarCare, bg: palette.danger[100], fg: palette.danger[700] },
  { id: 'female_6', label: 'Profil 6', icon: Icon.AvatarEducation, bg: palette.info[100], fg: palette.info[700] },
  { id: 'female_7', label: 'Profil 7', icon: Icon.AvatarCleaning, bg: palette.blurple[100], fg: palette.blurple[700] },
  { id: 'female_8', label: 'Yonetici', icon: Icon.AvatarManager, bg: palette.primary[100], fg: palette.primary[700] },
  { id: 'female_9', label: 'Teknik', icon: Icon.AvatarTech, bg: palette.slate[100], fg: palette.slate[700] },
  { id: 'female_10', label: 'Saglik', icon: Icon.AvatarHealth, bg: palette.success[100], fg: palette.success[700] },

  // "Erkek" id'li serisi - daha doygun / koyu tonlar
  { id: 'male_1', label: 'Profil', icon: Icon.AvatarPerson, bg: palette.primary[100], fg: palette.primary[700] },
  { id: 'male_2', label: 'Ofis', icon: Icon.AvatarOffice, bg: palette.blurple[100], fg: palette.blurple[700] },
  { id: 'male_3', label: 'Lojistik', icon: Icon.AvatarLogistics, bg: palette.warning[100], fg: palette.warning[700] },
  { id: 'male_4', label: 'Saha', icon: Icon.AvatarField, bg: palette.accent[100], fg: palette.accent[700] },
  { id: 'male_5', label: 'Restoran', icon: Icon.AvatarRestaurant, bg: palette.danger[100], fg: palette.danger[700] },
  { id: 'male_6', label: 'Mutfak', icon: Icon.AvatarKitchen, bg: palette.warning[100], fg: palette.warning[700] },
  { id: 'male_7', label: 'Destek', icon: Icon.AvatarSupport, bg: palette.info[100], fg: palette.info[700] },
  { id: 'male_8', label: 'Yonetici', icon: Icon.AvatarManager, bg: palette.primary[100], fg: palette.primary[700] },
  { id: 'male_9', label: 'Teknik', icon: Icon.AvatarTech, bg: palette.slate[100], fg: palette.slate[700] },
  { id: 'male_10', label: 'Saglik', icon: Icon.AvatarHealth, bg: palette.success[100], fg: palette.success[700] },
]

export const AVATAR_TEMPLATES = ALL_AVATARS.slice(0, MAX_AVATAR_COUNT)

export const DEFAULT_AVATAR_ID = 'male_1'

/** Fallback default sablon — id eslesmezse buna duser. */
export const DEFAULT_AVATAR = AVATAR_TEMPLATES.find((a) => a.id === DEFAULT_AVATAR_ID) || AVATAR_TEMPLATES[0]

export function getAvatarById(id) {
  return AVATAR_TEMPLATES.find((item) => item.id === id) || DEFAULT_AVATAR
}
