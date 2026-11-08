import { useState } from 'react'
import type { Plot, CropRef, ProblemRef, ProductRef } from '../types'

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
      <div className="plot-header" onClick={() => setOpen(!open)}>
        <h3>{open ? '▼' : '▶'} {plot.name}</h3>
        {canRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove() }}>Remove</button>
        )}
      </div>

      {open && (
        <div className="plot-fields">
          <div className="form-row">
            <label>
              Name
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
            <label>
              Soil texture
              <select
                value={plot.soil_texture}
                onChange={e => update({ soil_texture: e.target.value as Plot['soil_texture'] })}
              >
                <option value="sandy">Sandy</option>
                <option value="loam">Loam</option>
                <option value="clay">Clay</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Soil test</legend>
            <div className="form-row">
              <label>pH <input type="number" step="0.1" value={plot.soil_test.ph} onChange={e => updateSoil('ph', Number(e.target.value))} /></label>
              <label>P (ppm) <input type="number" value={plot.soil_test.p_ppm} onChange={e => updateSoil('p_ppm', Number(e.target.value))} /></label>
              <label>K (ppm) <input type="number" value={plot.soil_test.k_ppm} onChange={e => updateSoil('k_ppm', Number(e.target.value))} /></label>
              <label>OM % <input type="number" step="0.1" value={plot.soil_test.organic_matter_pct} onChange={e => updateSoil('organic_matter_pct', Number(e.target.value))} /></label>
            </div>
          </fieldset>

          <div className="form-row">
            <label>
              Crop 2 years ago
              <select value={plot.crop_two_years_ago ?? ''} onChange={e => update({ crop_two_years_ago: e.target.value || null })}>
                <option value="">— none —</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Crop last year
              <select value={plot.crop_last_year} onChange={e => update({ crop_last_year: e.target.value })}>
                <option value="">— select —</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Crop planned
              <select value={plot.crop_planned} onChange={e => update({ crop_planned: e.target.value })}>
                <option value="">— select —</option>
                {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Problems</legend>
            <div className="crop-checkboxes">
              {problems.map(p => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={plot.problems.includes(p.id)}
                    onChange={() => toggleProblem(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Last season baseline</legend>
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
            <label>
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
