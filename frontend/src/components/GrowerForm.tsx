import type { Grower, CropRef } from '../types'

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
      <h2>Grower</h2>
      <label>
        Name
        <input
          value={grower.name}
          onChange={e => setGrower(g => ({ ...g, name: e.target.value }))}
        />
      </label>

      <fieldset>
        <legend>Crops needed</legend>
        <div className="crop-checkboxes">
          {crops.map(c => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={grower.crops_needed.includes(c.id)}
                onChange={() => toggleCrop(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-row">
        <label>
          Compost available (cu yd)
          <input
            type="number"
            min="0"
            step="0.5"
            value={grower.compost_available_cu_yd}
            onChange={e => setGrower(g => ({ ...g, compost_available_cu_yd: Number(e.target.value) }))}
          />
        </label>
        <label>
          Compost price ($/cu yd)
          <input
            type="number"
            min="0"
            step="1"
            value={grower.compost_price_usd_per_cu_yd}
            onChange={e => setGrower(g => ({ ...g, compost_price_usd_per_cu_yd: Number(e.target.value) }))}
          />
        </label>
      </div>
    </section>
  )
}
