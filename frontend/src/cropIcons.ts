/** Emoji + color for each crop, used throughout the UI. */

export interface CropVisual {
  emoji: string
  bg: string       // card background gradient
  label?: string   // override display name
}

const CROP_VISUALS: Record<string, CropVisual> = {
  tomato:       { emoji: '🍅', bg: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' },
  pepper:       { emoji: '🌶️', bg: 'linear-gradient(135deg, #ff9f43 0%, #e55039 100%)' },
  eggplant:     { emoji: '🍆', bg: 'linear-gradient(135deg, #a55eea 0%, #6c5ce7 100%)' },
  potato:       { emoji: '🥔', bg: 'linear-gradient(135deg, #dfe6e9 0%, #b2bec3 100%)' },
  cabbage:      { emoji: '🥬', bg: 'linear-gradient(135deg, #55efc4 0%, #00b894 100%)' },
  broccoli:     { emoji: '🥦', bg: 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)' },
  collards:     { emoji: '🥗', bg: 'linear-gradient(135deg, #26de81 0%, #20bf6b 100%)' },
  kale:         { emoji: '🌿', bg: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)' },
  squash:       { emoji: '🎃', bg: 'linear-gradient(135deg, #fdcb6e 0%, #f39c12 100%)' },
  cucumber:     { emoji: '🥒', bg: 'linear-gradient(135deg, #badc58 0%, #6ab04c 100%)' },
  watermelon:   { emoji: '🍉', bg: 'linear-gradient(135deg, #ff7675 0%, #d63031 100%)' },
  bush_bean:    { emoji: '🫘', bg: 'linear-gradient(135deg, #81ecec 0%, #00cec9 100%)' },
  southern_pea: { emoji: '🟤', bg: 'linear-gradient(135deg, #dfe6e9 0%, #636e72 100%)' },
  snap_pea:     { emoji: '🫛', bg: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)' },
  onion:        { emoji: '🧅', bg: 'linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%)' },
  garlic:       { emoji: '🧄', bg: 'linear-gradient(135deg, #f5f6fa 0%, #dcdde1 100%)' },
  sweet_corn:   { emoji: '🌽', bg: 'linear-gradient(135deg, #f9ca24 0%, #f0932b 100%)' },
  lettuce:      { emoji: '🥬', bg: 'linear-gradient(135deg, #7bed9f 0%, #2ed573 100%)' },
  carrot:       { emoji: '🥕', bg: 'linear-gradient(135deg, #ff9f43 0%, #ee5a24 100%)' },
  okra:         { emoji: '🌱', bg: 'linear-gradient(135deg, #26de81 0%, #20bf6b 100%)' },
  sweet_potato: { emoji: '🍠', bg: 'linear-gradient(135deg, #e17055 0%, #d63031 100%)' },
}

const DEFAULT: CropVisual = { emoji: '🌱', bg: 'linear-gradient(135deg, #dfe6e9 0%, #b2bec3 100%)' }

export function cropVisual(cropId: string): CropVisual {
  return CROP_VISUALS[cropId] || DEFAULT
}

export function cropEmoji(cropId: string): string {
  return (CROP_VISUALS[cropId] || DEFAULT).emoji
}
