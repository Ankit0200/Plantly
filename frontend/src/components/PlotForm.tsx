import { useState } from 'react'
import type { Plot, CropRef, ProblemRef, ProductRef } from '../types'
import CropSelect from './CropSelect'

interface Props {
  plot: Plot
  index: number
  crops: CropRef[]
  problems: ProblemRef[]
  products: ProductRef[]
  useAcres: boolean
  areaUnit: string
  displayArea: (sqft: number) => string
  onChange: (plot: Plot) => void
  onRemove: () => void
  canRemove: boolean
}

const SQFT_PER_ACRE = 43_560

const TEXTURE_OPTIONS = [
  { value: 'sandy', label: '🏖️ Sandy', desc: 'drains fast' },
  { value: 'loam', label: '🌿 Loam', desc: 'balanced' },
  { value: 'clay', label: '🧱 Clay', desc: 'holds water' },
]

export default function PlotForm({
  plot, crops, problems, products,
  useAcres, areaUnit, displayArea,
  onChange, onRemove, canRemove,
}: Props) {
  const [open, setOpen] = useState(true)

  const update = (partial: Partial<Plot>) => onChange({ ...plot, ...partial })
  const updateSoil = (field: string, value: number) =>
    onChange({ ...plot, soil_test: { ...plot.soil_test, [field]: value } })

  const setArea = (val: string) => {
    const num = Number(val)
    update({ area_sqft: useAcres ? num * SQFT_PER_ACRE : num })
  }

  const toggleProblem = (pid: string) => {
    const next = plot.problems.includes(pid)
      ? plot.problems.filter(p => p !== pid)
      : [...plot.problems, pid]
    update({ problems: next })
  }

  const addBaselineInput = () => {
    update({
      baseline: {
        ...plot.baseline,
        inputs: [...plot.baseline.inputs, { product_id: '', amount_lb: 0 }],
      },
    })
  }

  const removeBaselineInput = (i: number) => {
    update({
      baseline: {
        ...plot.baseline,
        inputs: plot.baseline.inputs.filter((_, idx) => idx !== i),
      },
    })
  }

  const updateBaselineInput = (i: number, field: string, value: string | number) => {
    const inputs = plot.baseline.inputs.map((inp, idx) =>
      idx === i ? { ...inp, [field]: value } : inp
    )
    update({ baseline: { ...plot.baseline, inputs } })
  }

  return (
    <div className="plot-form">
      <div className="plot-header">
        <button
          type="button"
          className="plot-header-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <h3>{open ? '▼' : '▶'} {plot.name}</h3>
        </button>
        {canRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={`Remove ${plot.name}`}>Remove</button>
        )}
      </div>

      {open && (
        <div className="plot-fields">
          <div className="form-row">
            <label>
              Plot name
              <input value={plot.name} onChange={e => update({ name: e.target.value })} />
            </label>
            <label>
              Area ({areaUnit})
              <input
                type="number"
                min="0"
                value={displayArea(plot.area_sqft)}
                onChange={e => setArea(e.target.value)}
              />
            </label>
          </div>

          {/* Soil texture as visual pills */}
          <div className="texture-picker">
            <span className="texture-label">Soil type</span>
            <div className="texture-options">
              {TEXTURE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`texture-pill ${plot.soil_texture === t.value ? 'selected' : ''}`}
                  aria-pressed={plot.soil_texture === t.value}
                  onClick={() => update({ soil_texture: t.value as Plot['soil_texture'] })}
                >
                  {t.label}
                  <span className="texture-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <fieldset className="soil-test-card">
            <legend>🧪 Soil test results</legend>
            <div className="form-row">
              <label>pH <input type="number" step="0.1" value={plot.soil_test.ph} onChange={e => updateSoil('ph', Number(e.target.value))} /></label>
              <label>P (ppm) <input type="number" value={plot.soil_test.p_ppm} onChange={e => updateSoil('p_ppm', Number(e.target.value))} /></label>
              <label>K (ppm) <input type="number" value={plot.soil_test.k_ppm} onChange={e => updateSoil('k_ppm', Number(e.target.value))} /></label>
              <label>OM % <input type="number" step="0.1" value={plot.soil_test.organic_matter_pct} onChange={e => updateSoil('organic_matter_pct', Number(e.target.value))} /></label>
            </div>
          </fieldset>

          {/* Crop history as visual selectors */}
          <div className="section-card crop-history">
            <h4>🕐 Crop history</h4>
            <div className="crop-history-row">
              <div className="crop-history-item">
                <span className="crop-history-label">2 years ago</span>
                <CropSelect
                  crops={crops}
                  value={plot.crop_two_years_ago ?? ''}
                  onChange={v => update({ crop_two_years_ago: v || null })}
                  placeholder="— none —"
                  allowEmpty
                />
              </div>
              <div className="crop-history-item">
                <span className="crop-history-label">Last year</span>
                <CropSelect
                  crops={crops}
                  value={plot.crop_last_year}
                  onChange={v => update({ crop_last_year: v })}
                />
              </div>
              <div className="crop-history-item">
                <span className="crop-history-label">This season</span>
                <CropSelect
                  crops={crops}
                  value={plot.crop_planned}
                  onChange={v => update({ crop_planned: v })}
                />
              </div>
            </div>
          </div>

          {/* Problems as visual toggles */}
          <fieldset>
            <legend>🐛 Pest & disease problems</legend>
            <div className="problem-chips">
              {problems.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`problem-chip ${plot.problems.includes(p.id) ? 'selected' : ''}`}
                  aria-pressed={plot.problems.includes(p.id)}
                  onClick={() => toggleProblem(p.id)}
                >
                  {plot.problems.includes(p.id) ? '✓ ' : ''}{p.name}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>📦 Last season inputs</legend>
            {plot.baseline.inputs.map((inp, i) => (
              <div key={i} className="form-row">
                <select value={inp.product_id} onChange={e => updateBaselineInput(i, 'product_id', e.target.value)}>
                  <option value="">— product —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <label>
                  lb <input type="number" min="0" value={inp.amount_lb} onChange={e => updateBaselineInput(i, 'amount_lb', Number(e.target.value))} />
                </label>
                <button onClick={() => removeBaselineInput(i)}>×</button>
              </div>
            ))}
            <button onClick={addBaselineInput}>+ Add input</button>
            <label style={{ marginTop: '0.5rem' }}>
              Pesticide applications
              <input
                type="number"
                min="0"
                value={plot.baseline.pesticide_applications}
                onChange={e => update({ baseline: { ...plot.baseline, pesticide_applications: Number(e.target.value) } })}
              />
            </label>
          </fieldset>
        </div>
      )}
    </div>
  )
}
