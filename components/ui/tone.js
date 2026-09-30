import ui from '@/styles/ui.module.css'

// Colour classes shared by badges, stat icons and list icons
const TONE_CLASS = {
  success: ui.toneSuccess,
  warning: ui.toneWarning,
  danger: ui.toneDanger,
  info: ui.toneInfo,
  teal: ui.toneTeal,
  brand: ui.toneBrand,
  neutral: ui.toneNeutral,
}

export function toneClass(tone) {
  return TONE_CLASS[tone] ?? TONE_CLASS.neutral
}
