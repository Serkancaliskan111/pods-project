export const MAX_AVATAR_COUNT = 20

const ALL_AVATARS = [
  { id: 'female_1', label: 'Kadın 1', emoji: '👩🏻' },
  { id: 'female_2', label: 'Kadın 2', emoji: '👩🏼' },
  { id: 'female_3', label: 'Kadın 3', emoji: '👩🏽' },
  { id: 'female_4', label: 'Kadın 4', emoji: '👩🏾' },
  { id: 'female_5', label: 'Kadın 5', emoji: '👩🏿' },
  { id: 'female_6', label: 'Kadın 6', emoji: '👱🏻‍♀️' },
  { id: 'female_7', label: 'Kadın 7', emoji: '👱🏽‍♀️' },
  { id: 'female_8', label: 'Kadın 8', emoji: '👩‍💼' },
  { id: 'female_9', label: 'Kadın 9', emoji: '👩‍🔧' },
  { id: 'female_10', label: 'Kadın 10', emoji: '👩‍⚕️' },
  { id: 'male_1', label: 'Erkek 1', emoji: '👨🏻' },
  { id: 'male_2', label: 'Erkek 2', emoji: '👨🏼' },
  { id: 'male_3', label: 'Erkek 3', emoji: '👨🏽' },
  { id: 'male_4', label: 'Erkek 4', emoji: '👨🏾' },
  { id: 'male_5', label: 'Erkek 5', emoji: '👨🏿' },
  { id: 'male_6', label: 'Erkek 6', emoji: '👱🏻‍♂️' },
  { id: 'male_7', label: 'Erkek 7', emoji: '👱🏽‍♂️' },
  { id: 'male_8', label: 'Erkek 8', emoji: '👨‍💼' },
  { id: 'male_9', label: 'Erkek 9', emoji: '👨‍🔧' },
  { id: 'male_10', label: 'Erkek 10', emoji: '👨‍⚕️' },
]

export const AVATAR_TEMPLATES = ALL_AVATARS.slice(0, MAX_AVATAR_COUNT)

export const DEFAULT_AVATAR_ID = 'male_1'

export function getAvatarById(id) {
  return AVATAR_TEMPLATES.find((item) => item.id === id) || AVATAR_TEMPLATES.find((item) => item.id === DEFAULT_AVATAR_ID)
}
