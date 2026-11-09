import type { CropRef } from '../types'
import { cropVisual } from '../cropIcons'

interface Props {
  crops: CropRef[]
  selected: string[]
  onToggle: (cropId: string) => void
  multi?: boolean         // true = checkbox mode, false = single select
  label?: string
}

/** Visual grid of crop cards with emoji. Tap to select. */
export default function CropPicker({ crops, selected, onToggle, multi = true, label }: Props) {
  return (
    <div className="crop-picker">
      {label && <div className="crop-picker-label">{label}</div>}
      <div className="crop-grid">
        {crops.map(c => {
          const v = cropVisual(c.id)
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              className={`crop-card ${on ? 'selected' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(c.id)}
            >
              <span className="crop-card-emoji" style={{ background: v.bg }} aria-hidden="true">{v.emoji}</span>
              <span className="crop-card-name">{c.name}</span>
              {on && <span className="crop-card-check">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
