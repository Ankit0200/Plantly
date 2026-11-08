import { useState, useCallback } from 'react'
import type { Grower, ReferenceData } from '../types'
import { postIntake } from '../api'

interface Props {
  onComplete: (draft: Grower, errors: string[]) => void
  onLoadDemo: () => void
  referenceData: ReferenceData | null
}

function emptyGrower(): Grower {
  return {
    name: '',
    plots: [{
      id: 'A',
      name: 'Plot A',
      area_sqft: 1000,
      soil_texture: 'loam',
      soil_test: { ph: 6.5, p_ppm: 30, k_ppm: 100, organic_matter_pct: 3.0 },
      crop_two_years_ago: null,
      crop_last_year: '',
      crop_planned: '',
      problems: [],
      baseline: { inputs: [], pesticide_applications: 0 },
    }],
    crops_needed: [],
    compost_available_cu_yd: 0,
    compost_price_usd_per_cu_yd: 0,
    price_overrides: {},
  }
}

export default function IntakePage({ onComplete, onLoadDemo }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async () => {
    if (!text && !file) {
      setError('Enter a description or upload a soil report')
      return
    }
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      if (text) formData.append('text', text)
      if (file) formData.append('file', file)
      const result = await postIntake(formData)
      onComplete(result.draft, result.errors)
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } }
      setError(e.body?.error || 'Failed to process input')
    } finally {
      setLoading(false)
    }
  }, [text, file, onComplete])

  const handleManualEntry = useCallback(() => {
    onComplete(emptyGrower(), [])
  }, [onComplete])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return

    if (f.name.endsWith('.json')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          onComplete(data, [])
        } catch {
          setError('Invalid JSON file')
        }
      }
      reader.readAsText(f)
    } else {
      setFile(f)
    }
  }, [onComplete])

  return (
    <div className="intake-page">
      <h2>Start Your Season Plan</h2>
      <p className="intake-subtitle">
        Describe your farm and plots, or upload a soil test report. We'll extract the data for you to review.
      </p>

      <div className="intake-actions">
        <button onClick={onLoadDemo} className="build-btn">Load Demo Farm</button>
        <button onClick={handleManualEntry}>Manual Entry</button>
      </div>

      <div className="intake-divider">
        <span>or let AI extract your data</span>
      </div>

      <div className="intake-form">
        <label>
          Describe your farm
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"I have a quarter-acre plot with loam soil. pH is 6.2, phosphorus 45 ppm, potassium 120 ppm. I grew tomatoes last year and want to plant cabbage this season. I've had some early blight issues..."}
            rows={6}
          />
        </label>

        <div className="intake-upload">
          <label className="file-upload">
            {file ? file.name : 'Upload soil report (PDF, image, or JSON)'}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.json"
              onChange={handleFileUpload}
              hidden
            />
          </label>
          {file && <button onClick={() => setFile(null)}>Clear</button>}
        </div>

        {error && <div className="error-box"><p>{error}</p></div>}

        <button
          className="build-btn"
          onClick={handleSubmit}
          disabled={loading || (!text && !file)}
        >
          {loading ? 'AI is extracting...' : 'Extract Farm Data'}
        </button>
      </div>

      <p className="intake-note">
        Requires ANTHROPIC_API_KEY on the backend. Crop and problem IDs are matched to our database.
      </p>
    </div>
  )
}
