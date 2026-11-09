import type { Grower, CropRef, Season } from '../types'
import CropPicker from './CropPicker'

const SEASONS: { value: Season; label: string; emoji: string }[] = [
  { value: 'spring', label: 'Spring', emoji: '🌸' },
  { value: 'summer', label: 'Summer', emoji: '☀️' },
  { value: 'fall',   label: 'Fall',   emoji: '🍂' },
  { value: 'winter', label: 'Winter', emoji: '❄️' },
]

interface Props {
  grower: Grower
  setGrower: React.Dispatch<React.SetStateAction<Grower>>
  crops: CropRef[]
}

export default function GrowerForm({ grower, setGrower, crops }: Props) {
  const toggleCrop = (cropId: string) => {
    setGrower(g => ({
      ...g,
      crops_needed: g.crops_needed.includes(cropId)
        ? g.crops_needed.filter(c => c !== cropId)
        : [...g.crops_needed, cropId],
    }))
  }

  return (
    <section className="grower-form">
      <div className="section-card">
        <h2>📅 Which season are you planning for?</h2>
        <div className="season-picker">
          {SEASONS.map(s => (
            <button
              key={s.value}
              type="button"
              className={`season-btn ${grower.season === s.value ? 'season-btn-active' : ''}`}
              aria-pressed={grower.season === s.value}
              onClick={() => setGrower(g => ({ ...g, season: s.value }))}
            >
              <span className="season-emoji">{s.emoji}</span>
              <span className="season-label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-card">
        <h2>👤 About You</h2>
        <label>
          Your name
          <input
            value={grower.name}
            onChange={e => setGrower(g => ({ ...g, name: e.target.value }))}
            placeholder="e.g. Jane's Garden"
          />
        </label>

        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <label>
            🧱 Compost available (cu yd)
            <input
              type="number"
              min="0"
              step="0.5"
              value={grower.compost_available_cu_yd}
              onChange={e => setGrower(g => ({ ...g, compost_available_cu_yd: Number(e.target.value) }))}
            />
          </label>
          <label>
            💰 Compost price ($/cu yd)
            <input
              type="number"
              min="0"
              step="1"
              value={grower.compost_price_usd_per_cu_yd}
              onChange={e => setGrower(g => ({ ...g, compost_price_usd_per_cu_yd: Number(e.target.value) }))}
            />
          </label>
        </div>
      </div>

      <div className="section-card">
        <h2>🌱 What do you want to grow?</h2>
        <p className="section-hint">Tap all the crops you need this season</p>
        <CropPicker
          crops={crops}
          selected={grower.crops_needed}
          onToggle={toggleCrop}
        />
      </div>
    </section>
  )
}
