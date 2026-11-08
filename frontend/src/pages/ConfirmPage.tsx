import { useCallback } from 'react'
import type { Grower, Plot, ReferenceData } from '../types'
import { postCheck } from '../api'
import GrowerForm from '../components/GrowerForm'
import PlotForm from '../components/PlotForm'

interface Props {
  grower: Grower
  errors: string[]
  referenceData: ReferenceData | null
  loading: boolean
  onConfirm: (grower: Grower) => void
  onBack: () => void
  setGrower: React.Dispatch<React.SetStateAction<Grower | null>>
  setErrors: (e: string[]) => void
}

function emptyPlot(index: number): Plot {
  return {
    id: String.fromCharCode(65 + index),
    name: `Plot ${String.fromCharCode(65 + index)}`,
    area_sqft: 1000,
    soil_texture: 'loam',
    soil_test: { ph: 6.5, p_ppm: 30, k_ppm: 100, organic_matter_pct: 3.0 },
    crop_two_years_ago: null,
    crop_last_year: '',
    crop_planned: '',
    problems: [],
    baseline: { inputs: [], pesticide_applications: 0 },
  }
}

export default function ConfirmPage({ grower, errors, referenceData, loading, onConfirm, onBack, setGrower, setErrors }: Props) {
  const recheck = useCallback(async () => {
    try {
      const result = await postCheck(grower)
      setErrors(result.errors)
    } catch (e) {
      console.error(e)
    }
  }, [grower, setErrors])

  const addPlot = useCallback(() => {
    if (grower.plots.length >= 5) return
    setGrower({ ...grower, plots: [...grower.plots, emptyPlot(grower.plots.length)] })
  }, [grower, setGrower])

  const removePlot = useCallback((index: number) => {
    setGrower({ ...grower, plots: grower.plots.filter((_, i) => i !== index) })
  }, [grower, setGrower])

  const updatePlot = useCallback((index: number, plot: Plot) => {
    setGrower({ ...grower, plots: grower.plots.map((p, i) => i === index ? plot : p) })
  }, [grower, setGrower])

  const displayArea = (sqft: number) => `${sqft}`
  const areaUnit = 'sq ft'

  // Check for null fields that need attention
  const hasNulls = grower.plots.some(p =>
    !p.crop_planned || !p.soil_texture || p.soil_test.ph === 0
  )

  return (
    <div className="confirm-page">
      <div className="confirm-header">
        <button onClick={onBack}>&larr; Back to Intake</button>
        <h2>Review & Confirm Farm Data</h2>
      </div>

      {errors.length > 0 && (
        <div className="error-box">
          <strong>Validation errors:</strong>
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {hasNulls && (
        <div className="warning">
          Some fields are empty or null. Fill them in before generating the plan.
        </div>
      )}

      <GrowerForm
        grower={grower}
        setGrower={setGrower as React.Dispatch<React.SetStateAction<Grower>>}
        crops={referenceData?.crops ?? []}
      />

      <section className="plots-section">
        <h2>Plots</h2>
        {grower.plots.map((plot, i) => (
          <PlotForm
            key={plot.id}
            plot={plot}
            index={i}
            crops={referenceData?.crops ?? []}
            problems={referenceData?.problems ?? []}
            products={referenceData?.products ?? []}
            useAcres={false}
            areaUnit={areaUnit}
            displayArea={displayArea}
            onChange={(p) => updatePlot(i, p)}
            onRemove={() => removePlot(i)}
            canRemove={grower.plots.length > 1}
          />
        ))}
        {grower.plots.length < 5 && (
          <button onClick={addPlot}>+ Add plot</button>
        )}
      </section>

      <div className="confirm-actions">
        <button onClick={recheck}>Re-check Data</button>
        <button
          className="build-btn"
          onClick={() => onConfirm(grower)}
          disabled={loading || errors.length > 0}
        >
          {loading ? 'Building plan...' : 'Generate Plan'}
        </button>
      </div>
    </div>
  )
}
