export const AVATAR_TEMPLATES = [
  { id: 'female_1', emoji: '👩🏻' },
  { id: 'female_2', emoji: '👩🏼' },
  { id: 'female_3', emoji: '👩🏽' },
  { id: 'female_4', emoji: '👩🏾' },
  { id: 'female_5', emoji: '👩🏿' },
  { id: 'female_6', emoji: '👱🏻‍♀️' },
  { id: 'female_7', emoji: '👱🏽‍♀️' },
  { id: 'female_8', emoji: '👩‍💼' },
  { id: 'female_9', emoji: '👩‍🔧' },
  { id: 'female_10', emoji: '👩‍⚕️' },
  { id: 'male_1', emoji: '👨🏻' },
  { id: 'male_2', emoji: '👨🏼' },
  { id: 'male_3', emoji: '👨🏽' },
  { id: 'male_4', emoji: '👨🏾' },
  { id: 'male_5', emoji: '👨🏿' },
  { id: 'male_6', emoji: '👱🏻‍♂️' },
  { id: 'male_7', emoji: '👱🏽‍♂️' },
  { id: 'male_8', emoji: '👨‍💼' },
  { id: 'male_9', emoji: '👨‍🔧' },
  { id: 'male_10', emoji: '👨‍⚕️' },
]

const MAP = Object.fromEntries(AVATAR_TEMPLATES.map((x) => [x.id, x.emoji]))

export function avatarEmojiById(id) {
  const key = String(id || '')
  return MAP[key] || null
}
